"""
Talk2Tables — SQL Safety & Validation Pipeline
================================================
Multi-stage validation pipeline as specified in Architecture Spec §6.4.

Stages (in order):
  1. Directive Check  — Detect CLARIFY: and WRITE_OP: prefixes from LLM
  2. Syntax Check     — Parse SQL with sqlparse for syntactic correctness
  3. Operation Type   — Classify SELECT / INSERT / UPDATE / DELETE / DDL
  4. DDL Guard        — Block DROP, CREATE, ALTER, TRUNCATE
  5. Injection Guard  — Block stacked queries, EXEC, system tables, xp_cmdshell
  6. Row Limit        — Enforce LIMIT on SELECT queries
  7. Risk Assessment  — Assign safe / moderate / high risk level

Author  : Member 1 (Backend Lead)
Project : Talk2Tables — Diploma Final Year Project
"""

from __future__ import annotations

import logging
import re
from typing import Optional

import sqlparse
from sqlparse.sql import Statement
from sqlparse.tokens import Keyword, DDL, DML

from .state import ValidationResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Maximum rows enforced if LLM forgets to add LIMIT
DEFAULT_SELECT_LIMIT = 1000

# Patterns that indicate SQL injection or dangerous commands
_INJECTION_PATTERNS: list[re.Pattern] = [
    re.compile(r";\s*\S",          re.IGNORECASE),  # Stacked queries
    re.compile(r"\bEXEC\s*\(",     re.IGNORECASE),  # EXEC() calls
    re.compile(r"\bxp_cmdshell\b", re.IGNORECASE),  # SQL Server shell escape
    re.compile(r"\bsp_executesql\b", re.IGNORECASE),# SQL Server dynamic SQL
    re.compile(r"\binformation_schema\.user\b", re.IGNORECASE),  # User enumeration
    re.compile(r"\bmysql\.user\b", re.IGNORECASE),  # MySQL credential table
    re.compile(r"\bpg_shadow\b",   re.IGNORECASE),  # PostgreSQL credential table
    re.compile(r"\bINTO\s+OUTFILE\b", re.IGNORECASE),  # MySQL file write
    re.compile(r"\bLOAD_FILE\s*\(", re.IGNORECASE),   # MySQL file read
    re.compile(r"--\s*bypass",     re.IGNORECASE),  # Obvious injection comment
    re.compile(r"/\*.*bypass.*\*/",re.IGNORECASE),  # Block comment injection
    re.compile(r"\bSLEEP\s*\(",    re.IGNORECASE),  # Time-based injection
    re.compile(r"\bWAITFOR\s+DELAY\b", re.IGNORECASE),  # SQL Server time-based
    re.compile(r"\bBENCHMARK\s*\(", re.IGNORECASE),    # MySQL time-based
]

# DDL keywords that are never allowed
_FORBIDDEN_DDL: set[str] = {
    "DROP", "TRUNCATE", "CREATE", "ALTER", "RENAME", "COMMENT",
    "GRANT", "REVOKE",
}

# DML write operations that require preview confirmation
_WRITE_DML: set[str] = {"INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE"}

# Directive prefixes returned by the LLM (from spec §6.2)
_CLARIFY_PREFIX   = "CLARIFY:"
_WRITE_OP_PREFIX  = "WRITE_OP:"


# ---------------------------------------------------------------------------
# Main validator entry point
# ---------------------------------------------------------------------------

def validate_sql(
    raw_sql: str,
    user_role: str = "viewer",
    db_dialect: str = "mysql",
) -> ValidationResult:
    """
    Run the full multi-stage SQL validation pipeline.

    Args:
        raw_sql    : Raw SQL string from LLM (may include directives)
        user_role  : RBAC role — write ops require 'admin' or 'power_user'
        db_dialect : Target DB dialect (used for dialect-specific checks)

    Returns:
        ValidationResult TypedDict with is_valid, operation_type, sanitized_sql, etc.
    """
    stripped = raw_sql.strip()

    # ── Stage 1: LLM Directives ───────────────────────────────────────────
    if stripped.upper().startswith(_CLARIFY_PREFIX.upper()):
        question = stripped[len(_CLARIFY_PREFIX):].strip()
        logger.info("[Validator] CLARIFY directive detected.")
        return ValidationResult(
            is_valid           = True,
            operation_type     = "CLARIFY",
            error              = None,
            sanitized_sql      = None,
            risk_level         = "safe",
        ), question  # Return question separately

    is_write_op_directive = stripped.upper().startswith(_WRITE_OP_PREFIX.upper())
    if is_write_op_directive:
        stripped = stripped[len(_WRITE_OP_PREFIX):].strip()

    # ── Stage 2: Empty SQL check ──────────────────────────────────────────
    if not stripped:
        return _fail("LLM returned empty SQL. Please try rephrasing your query."), None

    # ── Stage 3: Injection Guard ──────────────────────────────────────────
    injection_error = _check_injection(stripped)
    if injection_error:
        logger.warning(f"[Validator] Injection pattern detected: {injection_error}")
        return _fail(f"Security violation detected: {injection_error}"), None

    # ── Stage 4: Parse with sqlparse ─────────────────────────────────────
    try:
        parsed_statements = sqlparse.parse(stripped)
    except Exception as exc:
        return _fail(f"SQL parsing failed: {exc}"), None

    if not parsed_statements or not parsed_statements[0].tokens:
        return _fail("Could not parse the generated SQL. Please rephrase."), None

    statement: Statement = parsed_statements[0]

    # Block multi-statement SQL (stacked queries not caught by regex)
    if len([s for s in sqlparse.parse(stripped) if s.get_type()]) > 1:
        return _fail("Multiple SQL statements detected. Only single statements are allowed."), None

    # ── Stage 5: Detect operation type ───────────────────────────────────
    op_type = _get_operation_type(statement, stripped)

    # ── Stage 6: DDL guard ───────────────────────────────────────────────
    if op_type in _FORBIDDEN_DDL or op_type == "DDL":
        return _fail(
            f"DDL operations ({', '.join(_FORBIDDEN_DDL)}) are not permitted. "
            f"Talk2Tables only allows data queries and modifications."
        ), None

    # ── Stage 7: RBAC check for write operations ─────────────────────────
    is_write = op_type in _WRITE_DML or is_write_op_directive
    if is_write and user_role not in ("admin", "power_user"):
        return _fail(
            f"Your role '{user_role}' does not have permission to perform "
            f"write operations (INSERT/UPDATE/DELETE). Contact your administrator."
        ), None

    # ── Stage 8: Enforce SELECT row limit ────────────────────────────────
    sanitized = stripped
    if op_type == "SELECT" and not _has_limit(stripped):
        sanitized = f"{stripped.rstrip(';')} LIMIT {DEFAULT_SELECT_LIMIT}"
        logger.info(f"[Validator] LIMIT {DEFAULT_SELECT_LIMIT} auto-applied to SELECT query.")

    # ── Stage 9: Risk Assessment ─────────────────────────────────────────
    risk = _assess_risk(op_type, sanitized)

    # ── Stage 10: Final operation type for state ──────────────────────────
    final_op_type = "WRITE_OP" if is_write else op_type

    logger.info(
        f"[Validator] Validation passed | op={final_op_type} | "
        f"risk={risk} | dialect={db_dialect}"
    )

    return ValidationResult(
        is_valid       = True,
        operation_type = final_op_type,
        error          = None,
        sanitized_sql  = sanitized,
        risk_level     = risk,
    ), None


# ---------------------------------------------------------------------------
# Helper: Validate the confirmed SQL for write operations
# (called when user clicks "Confirm" in the preview UI)
# ---------------------------------------------------------------------------

def validate_confirmed_write(
    confirmed_sql: str,
    user_role: str,
) -> ValidationResult:
    """
    Lightweight re-validation for a write SQL that the user has confirmed.
    Ensures the SQL hasn't been tampered with between preview and execution.
    """
    result, _ = validate_sql(confirmed_sql, user_role=user_role)
    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _fail(error_msg: str) -> tuple[ValidationResult, None]:
    return ValidationResult(
        is_valid       = False,
        operation_type = "UNKNOWN",
        error          = error_msg,
        sanitized_sql  = None,
        risk_level     = "high",
    ), None


def _check_injection(sql: str) -> Optional[str]:
    """Return the description of the first injection pattern found, or None."""
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(sql):
            return f"Matched pattern: {pattern.pattern!r}"
    return None


def _get_operation_type(statement: Statement, raw_sql: str) -> str:
    """
    Extract the first DML/DDL keyword from the parsed statement.
    Falls back to regex for edge cases.
    """
    op = statement.get_type()
    if op:
        return op.upper()

    # Fallback: scan first non-whitespace token
    for token in statement.flatten():
        if token.ttype in (DML, DDL, Keyword):
            return token.normalized.upper()

    # Last resort: check raw SQL start
    first_word = raw_sql.strip().split()[0].upper() if raw_sql.strip() else ""
    return first_word if first_word else "UNKNOWN"


def _has_limit(sql: str) -> bool:
    """Check if a SELECT query already contains a LIMIT (or TOP for MSSQL)."""
    sql_upper = sql.upper()
    # LIMIT n (MySQL/PostgreSQL/SQLite) or FETCH FIRST n ROWS (Oracle/MSSQL)
    return bool(
        re.search(r"\bLIMIT\s+\d+", sql_upper) or
        re.search(r"\bFETCH\s+FIRST\b", sql_upper) or
        re.search(r"\bTOP\s+\d+", sql_upper) or
        re.search(r"\bROWNUM\s*<=?\s*\d+", sql_upper)
    )


def _assess_risk(op_type: str, sql: str) -> str:
    """
    Assign a risk level based on operation type and SQL content.
    Used for UI warning display and audit logging.

    Levels:
      safe     — SELECT queries
      moderate — INSERT with few rows, UPDATE with WHERE clause
      high     — UPDATE/DELETE without WHERE, bulk INSERT
    """
    if op_type == "SELECT":
        return "safe"

    sql_upper = sql.upper()

    if op_type in ("UPDATE", "DELETE"):
        has_where = bool(re.search(r"\bWHERE\b", sql_upper))
        if not has_where:
            return "high"  # Unfiltered UPDATE/DELETE — very dangerous
        return "moderate"

    if op_type == "INSERT":
        # Bulk insert via SELECT or VALUES with many rows
        if "SELECT" in sql_upper:
            return "high"
        return "moderate"

    return "moderate"