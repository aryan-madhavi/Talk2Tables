# ai_agent/tools/query_tools.py
"""
LangChain tool for SQL execution with safety guards.

Combines the SQL injection/DDL safety pipeline from the original sql_validator.py
with the actual SQLAlchemy execution — mirroring n8n's EXEC_SqlQuery tool.

The execute_sql tool:
  1. Runs injection pattern checks
  2. Blocks DDL operations
  3. Enforces RBAC (analyst cannot run write operations)
  4. Adds LIMIT if SELECT has none
  5. Executes via SQLAlchemy
  6. Returns JSON-serializable rows
"""
from __future__ import annotations

import datetime
import decimal
import json
import hashlib
import logging
import re
import threading
import time
from typing import Any

from langchain_core.tools import tool

logger = logging.getLogger(__name__)

# ── Per-request full-result cache (avoids re-execution in output_parser) ─────
# Key: md5(connection_string + sql), Value: full serialized rows list.
# Entries are popped on first read so memory doesn't grow unbounded.
_full_result_cache: dict[str, list[dict]] = {}
_full_result_lock  = threading.Lock()

# ── Safety constants (from original sql_validator.py) ─────────────────────────

_MAX_ROWS = 10_000
_PREVIEW_ROWS = 3  # rows sent back to LLM to keep context small

_INJECTION_PATTERNS: list[re.Pattern] = [
    re.compile(r";\s*\S",              re.IGNORECASE),
    re.compile(r"\bEXEC\s*\(",         re.IGNORECASE),
    re.compile(r"\bxp_cmdshell\b",     re.IGNORECASE),
    re.compile(r"\bsp_executesql\b",   re.IGNORECASE),
    re.compile(r"\binformation_schema\.user\b", re.IGNORECASE),
    re.compile(r"\bmysql\.user\b",     re.IGNORECASE),
    re.compile(r"\bpg_shadow\b",       re.IGNORECASE),
    re.compile(r"\bINTO\s+OUTFILE\b",  re.IGNORECASE),
    re.compile(r"\bLOAD_FILE\s*\(",    re.IGNORECASE),
    re.compile(r"--\s*bypass",         re.IGNORECASE),
    re.compile(r"/\*.*bypass.*\*/",    re.IGNORECASE),
    re.compile(r"\bSLEEP\s*\(",        re.IGNORECASE),
    re.compile(r"\bpg_sleep\s*\(",     re.IGNORECASE),   # PostgreSQL time-delay
    re.compile(r"\bWAITFOR\s+DELAY\b", re.IGNORECASE),
    re.compile(r"\bBENCHMARK\s*\(",    re.IGNORECASE),
]

_FORBIDDEN_DDL: set[str] = {
    "DROP", "TRUNCATE", "CREATE", "ALTER", "RENAME", "COMMENT", "GRANT", "REVOKE",
}

_WRITE_DML: set[str] = {"INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE"}

_ROLES_ALLOWED_WRITE: set[str] = {"admin", "power_user", "db_manager"}


def _check_injection(sql: str) -> str | None:
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(sql):
            return f"Matched dangerous pattern: {pattern.pattern!r}"
    return None


def _get_first_keyword(sql: str) -> str:
    first_word = sql.strip().split()[0].upper() if sql.strip() else ""
    return first_word


def _has_limit(sql: str) -> bool:
    sql_upper = sql.upper()
    return bool(
        re.search(r"\bLIMIT\s+\d+",    sql_upper) or
        re.search(r"\bFETCH\s+FIRST\b", sql_upper) or
        re.search(r"\bTOP\s+\d+",      sql_upper) or
        re.search(r"\bROWNUM\s*<=?\s*\d+", sql_upper)
    )


def _serialize_value(value: Any) -> Any:
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def make_query_tools(connection_string: str, user_role: str) -> list:
    """
    Return [execute_sql] LangChain tool bound to the given connection and user role.

    Args:
        connection_string: SQLAlchemy URL for the target database.
        user_role:         RBAC role — analyst | power_user | db_manager | admin
    """

    @tool
    def execute_sql(sql_query: str) -> str:
        """
        Execute a SQL query against the connected database.
        Only SELECT queries are executed immediately.
        INSERT/UPDATE/DELETE require the user's role to be power_user, db_manager, or admin.
        Always prefix table names with their schema (e.g. public.users, mydb.orders).

        Args:
            sql_query: The SQL statement to execute.

        Returns:
            JSON string with keys: rows (list of dicts), row_count (int), execution_time_ms (float).
            Returns an error description string if the query is rejected or fails.
        """
        sql = sql_query.strip()

        # ── 1. Injection guard ─────────────────────────────────────────────
        injection_error = _check_injection(sql)
        if injection_error:
            logger.warning(f"[execute_sql] Injection blocked: {injection_error}")
            return f"SECURITY ERROR: Query blocked — {injection_error}"

        # ── 2. DDL guard ───────────────────────────────────────────────────
        first_kw = _get_first_keyword(sql)
        if first_kw in _FORBIDDEN_DDL:
            logger.warning(f"[execute_sql] DDL blocked: {first_kw}")
            return f"ERROR: DDL operations ({first_kw}) are not permitted."

        # ── 3. RBAC check for write operations ────────────────────────────
        is_write = first_kw in _WRITE_DML
        if is_write and user_role not in _ROLES_ALLOWED_WRITE:
            logger.warning(f"[execute_sql] Write blocked for role={user_role}")
            return (
                f"ERROR: Your role '{user_role}' does not have permission to run "
                f"write operations. Contact your administrator."
            )

        # ── 4. Auto-add LIMIT to SELECT if missing ────────────────────────
        if first_kw == "SELECT" and not _has_limit(sql):
            sql = f"{sql.rstrip(';')} LIMIT 1000"
            logger.info("[execute_sql] Auto-applied LIMIT 1000")

        # ── 5. Execute ─────────────────────────────────────────────────────
        try:
            from sqlalchemy import create_engine, text as sa_text

            _ct     = {"connect_args": {"connect_timeout": 10}}
            engine  = create_engine(connection_string, pool_pre_ping=True, echo=False, **_ct)
            t_start = time.perf_counter()

            if is_write:
                with engine.begin() as conn:
                    result      = conn.execute(sa_text(sql))
                    affected    = result.rowcount
                elapsed_ms = (time.perf_counter() - t_start) * 1000
                logger.info(f"[execute_sql] Write OK | affected={affected} | {elapsed_ms:.0f}ms")
                return json.dumps({
                    "rows":             [],
                    "row_count":        affected,
                    "execution_time_ms": round(elapsed_ms, 1),
                    "affected_rows":    affected,
                })
            else:
                with engine.connect() as conn:
                    result  = conn.execute(sa_text(sql))
                    columns = list(result.keys())
                    rows    = result.fetchmany(_MAX_ROWS)
                elapsed_ms = (time.perf_counter() - t_start) * 1000

                serialized = [
                    {col: _serialize_value(val) for col, val in zip(columns, row)}
                    for row in rows
                ]

                total = len(serialized)
                preview = serialized[:_PREVIEW_ROWS]
                logger.info(f"[execute_sql] Query OK | {total} rows | {elapsed_ms:.0f}ms")
                # Cache the full result so output_parser can skip re-execution.
                _cache_key = hashlib.md5(f"{connection_string}:{sql}".encode()).hexdigest()
                with _full_result_lock:
                    _full_result_cache[_cache_key] = serialized
                # Only send a small preview to the LLM to avoid token limit errors.
                return json.dumps({
                    "rows":              preview,
                    "row_count":         total,
                    "execution_time_ms": round(elapsed_ms, 1),
                    "is_truncated":      total >= _MAX_ROWS,
                    "preview_note":      f"Preview: {len(preview)} of {total} rows shown. Full data included in final response.",
                })

        except Exception as exc:
            logger.error(f"[execute_sql] Execution failed: {exc}")
            return f"ERROR executing query: {exc}"

    return [execute_sql]
