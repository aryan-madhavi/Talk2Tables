"""
Talk2Tables — Schema Manager
=============================
Handles two complementary schema context sources:

  1. Live Schema   — SQLAlchemy reflection; auto-introspects tables, columns,
                     FK relationships, and types from the target database.
                     Supports: MySQL, PostgreSQL, SQLite, SQL Server, Oracle, MariaDB.

  2. Doc Context   — Fetches extracted_text from connection_schema_docs table
                     (user-uploaded PDFs, Word docs, Excel files) and injects
                     it into the AI prompt as business context.

Both sources are cached in-memory (LRU) for fast repeated access.

Author  : Member 1 (Backend Lead)
Project : Talk2Tables — Diploma Final Year Project
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Optional

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# Max characters for schema DDL sent to LLM (~3000 tokens ≈ 12000 chars)
MAX_SCHEMA_CHARS  = 12_000
# Max characters for doc context sent to LLM (~2000 tokens per spec)
MAX_DOC_CONTEXT_CHARS = 8_000


# ---------------------------------------------------------------------------
# Live Schema — SQLAlchemy reflection
# ---------------------------------------------------------------------------

def get_schema_context(connection_string: str, db_dialect: str) -> str:
    """
    Reflect the live database schema and return it as CREATE TABLE-style
    DDL strings suitable for LLM context injection.

    Supports: MySQL 8, PostgreSQL 15, SQLite, SQL Server (mssql), Oracle, MariaDB.

    Args:
        connection_string : SQLAlchemy URL (e.g. mysql+pymysql://user:pw@host/db)
        db_dialect        : Dialect hint for display purposes

    Returns:
        Multi-line DDL string describing all tables, columns, types, PKs, FKs.
        Truncated to MAX_SCHEMA_CHARS if very large schemas are detected.

    Raises:
        RuntimeError on connection failure.
    """
    try:
        engine = _get_engine(connection_string)
        return _reflect_schema(engine, db_dialect)
    except Exception as exc:
        logger.error(f"[SchemaManager] Schema reflection failed: {exc}")
        raise RuntimeError(f"Could not load database schema: {exc}") from exc


def _get_engine(connection_string: str) -> Engine:
    """
    Create or return a cached SQLAlchemy engine.
    Connection pooling is handled automatically by SQLAlchemy.
    """
    # pool_pre_ping=True ensures stale connections are recycled
    return create_engine(connection_string, pool_pre_ping=True, echo=False)


def _reflect_schema(engine: Engine, db_dialect: str) -> str:
    """
    Use SQLAlchemy Inspector to build a human-readable schema description.
    Generates output like:

        TABLE: sensors
          - sensor_id    VARCHAR(50)   PK
          - name         VARCHAR(200)  NOT NULL
          - location_id  INTEGER       FK → locations.location_id
          ...
    """
    inspector = inspect(engine)
    table_names = inspector.get_table_names()

    if not table_names:
        return "No tables found in the connected database."

    schema_parts: list[str] = []

    for table_name in table_names:
        lines = [f"TABLE: {table_name}"]

        # ── Columns ───────────────────────────────────────────────────────
        try:
            pk_columns = set(inspector.get_pk_constraint(table_name).get("constrained_columns", []))
        except Exception:
            pk_columns = set()

        try:
            fk_map: dict[str, str] = {}
            for fk in inspector.get_foreign_keys(table_name):
                for local_col, ref_col in zip(
                    fk["constrained_columns"], fk["referred_columns"]
                ):
                    fk_map[local_col] = f"{fk['referred_table']}.{ref_col}"
        except Exception:
            fk_map = {}

        try:
            columns = inspector.get_columns(table_name)
        except Exception:
            lines.append("  (could not reflect columns)")
            schema_parts.append("\n".join(lines))
            continue

        for col in columns:
            col_name    = col["name"]
            col_type    = str(col.get("type", "UNKNOWN"))
            nullable    = "" if col.get("nullable", True) else "  NOT NULL"
            pk_marker   = "  PK" if col_name in pk_columns else ""
            fk_marker   = f"  FK → {fk_map[col_name]}" if col_name in fk_map else ""
            default     = ""
            if col.get("default") is not None:
                default = f"  DEFAULT {col['default']}"
            lines.append(
                f"  - {col_name:<30} {col_type:<20}{pk_marker}{fk_marker}{nullable}{default}"
            )

        # ── Indexes (abbreviated) ─────────────────────────────────────────
        try:
            indexes = inspector.get_indexes(table_name)
            for idx in indexes[:5]:  # Limit to 5 indexes per table
                idx_cols = ", ".join(idx.get("column_names", []))
                unique   = " UNIQUE" if idx.get("unique") else ""
                lines.append(f"  INDEX{unique}: ({idx_cols})")
        except Exception:
            pass

        schema_parts.append("\n".join(lines))

    full_schema = "\n\n".join(schema_parts)

    # Truncate gracefully if schema is too large for context window
    if len(full_schema) > MAX_SCHEMA_CHARS:
        logger.warning(
            f"[SchemaManager] Schema truncated from {len(full_schema)} to "
            f"{MAX_SCHEMA_CHARS} chars. Consider uploading a schema doc for additional context."
        )
        full_schema = full_schema[:MAX_SCHEMA_CHARS] + "\n\n... [schema truncated — upload a schema doc for full context]"

    logger.info(
        f"[SchemaManager] Reflected {len(table_names)} tables | "
        f"{len(full_schema)} chars | dialect={db_dialect}"
    )
    return full_schema


# ---------------------------------------------------------------------------
# Doc Context — connection_schema_docs table
# ---------------------------------------------------------------------------

async def get_doc_context(
    connection_id: str,
    system_db_session,  # SQLAlchemy async Session for the system DB
) -> Optional[str]:
    """
    Fetch extracted text from all schema docs uploaded for this connection.
    These are stored in the `connection_schema_docs` table by the
    Schema Doc Service (doc_extractor.py) after upload.

    Args:
        connection_id    : The active DB connection's UUID
        system_db_session: SQLAlchemy async Session (injected from FastAPI dependency)

    Returns:
        Concatenated extracted_text from all docs, truncated to MAX_DOC_CONTEXT_CHARS.
        Returns None if no docs are uploaded.
    """
    try:
        result = await system_db_session.execute(
            text(
                """
                SELECT filename, extracted_text
                FROM connection_schema_docs
                WHERE connection_id = :cid
                  AND extraction_status = 'done'
                  AND extracted_text IS NOT NULL
                ORDER BY uploaded_at DESC
                """
            ),
            {"cid": connection_id},
        )
        rows = result.fetchall()
    except Exception as exc:
        logger.warning(f"[SchemaManager] Doc context fetch failed: {exc}")
        return None

    if not rows:
        logger.info(f"[SchemaManager] No schema docs found for connection_id={connection_id}")
        return None

    parts = []
    for row in rows:
        filename      = row[0]
        extracted_text = row[1]
        if extracted_text:
            parts.append(f"--- From: {filename} ---\n{extracted_text.strip()}")

    if not parts:
        return None

    combined = "\n\n".join(parts)

    # Truncate to stay within LLM token budget (~2000 tokens per spec)
    if len(combined) > MAX_DOC_CONTEXT_CHARS:
        logger.warning(
            f"[SchemaManager] Doc context truncated from {len(combined)} to "
            f"{MAX_DOC_CONTEXT_CHARS} chars for connection_id={connection_id}"
        )
        combined = combined[:MAX_DOC_CONTEXT_CHARS] + "\n\n... [doc context truncated]"

    logger.info(
        f"[SchemaManager] Doc context loaded: {len(rows)} doc(s), "
        f"{len(combined)} chars for connection_id={connection_id}"
    )
    return combined


# ---------------------------------------------------------------------------
# Dialect Detection Utility
# ---------------------------------------------------------------------------

_DIALECT_HINTS: dict[str, str] = {
    "mysql":      "mysql",
    "mariadb":    "mariadb",
    "postgresql": "postgresql",
    "postgres":   "postgresql",
    "sqlite":     "sqlite",
    "mssql":      "mssql",
    "oracle":     "oracle",
}


def detect_dialect(connection_string: str) -> str:
    """
    Detect the SQL dialect from a SQLAlchemy connection string.

    Examples:
        mysql+pymysql://...     → mysql
        postgresql+psycopg2://... → postgresql
        sqlite:///./dev.db      → sqlite
        mssql+pyodbc://...      → mssql
        oracle+cx_oracle://...  → oracle

    Returns:
        Dialect string (lowercase). Defaults to 'mysql' if unknown.
    """
    cs_lower = connection_string.lower()
    for prefix, dialect in _DIALECT_HINTS.items():
        if cs_lower.startswith(prefix):
            return dialect
    logger.warning(f"[SchemaManager] Unknown dialect in: {connection_string[:40]}... Defaulting to 'mysql'")
    return "mysql"


# ---------------------------------------------------------------------------
# Utility: Format schema for display in frontend SQL Viewer
# ---------------------------------------------------------------------------

def get_table_list(connection_string: str) -> list[dict]:
    """
    Return a lightweight list of tables and their column counts.
    Used by the frontend schema explorer sidebar.

    Returns:
        [{ "table": "sensors", "columns": 8 }, ...]
    """
    try:
        engine    = _get_engine(connection_string)
        inspector = inspect(engine)
        tables    = []
        for table_name in inspector.get_table_names():
            try:
                cols = inspector.get_columns(table_name)
                tables.append({"table": table_name, "columns": len(cols)})
            except Exception:
                tables.append({"table": table_name, "columns": 0})
        return tables
    except Exception as exc:
        logger.error(f"[SchemaManager] Table list failed: {exc}")
        return []