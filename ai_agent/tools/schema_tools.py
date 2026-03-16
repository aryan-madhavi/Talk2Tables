# ai_agent/tools/schema_tools.py
"""
LangChain tools for schema inspection with Firestore cache.

Firestore cache paths (under each connection doc):
    database_connections/{connection_id}/schema_cache/_tables
        → { tables: [...], cached_at: ISO }
    database_connections/{connection_id}/schema_cache/{schema}__{table}
        → { columns: [...], cached_at: ISO }

Cache TTL: SCHEMA_CACHE_TTL_SECONDS (default 3600 = 1 hour).
On cache miss the tool fetches from the live DB and writes back to Firestore.
Cache can be force-invalidated via POST /api/v1/connections/{id}/schema/refresh.

Tools:
    get_schema_list       — list all {table_schema, table_name} in the database
    get_table_definition  — columns, types, nullable, defaults, FK relationships
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from langchain_core.tools import tool
from sqlalchemy import create_engine, inspect

logger = logging.getLogger(__name__)

_CONNECTIONS_COL       = "database_connections"
_CACHE_COL             = "schema_cache"
_TABLES_DOC_ID         = "_tables"
SCHEMA_CACHE_TTL_SECONDS = 3600  # 1 hour

_SYSTEM_SCHEMAS = {
    "information_schema", "pg_catalog",       # PostgreSQL
    "mysql", "performance_schema", "sys",      # MySQL
    "SYSTEM", "SYS", "DBSNMP",                # Oracle
}

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
    """Detect SQL dialect from SQLAlchemy connection URL."""
    cs = connection_string.lower()
    for prefix, dialect in _DIALECT_HINTS.items():
        if cs.startswith(prefix):
            return dialect
    logger.warning("[SchemaTools] Unknown dialect. Defaulting to 'mysql'.")
    return "mysql"


def _get_engine(connection_string: str):
    kwargs: dict = {"pool_pre_ping": True, "echo": False}
    if not connection_string.lower().startswith("sqlite"):
        kwargs["connect_args"] = {"connect_timeout": 10}
    return create_engine(connection_string, **kwargs)


def _cache_ref(db, connection_id: str, doc_id: str):
    return (
        db.collection(_CONNECTIONS_COL)
          .document(connection_id)
          .collection(_CACHE_COL)
          .document(doc_id)
    )


def _is_fresh(cached_at_iso: str) -> bool:
    """Return True if the cache entry is younger than SCHEMA_CACHE_TTL_SECONDS."""
    try:
        cached_at = datetime.fromisoformat(cached_at_iso)
        if cached_at.tzinfo is None:
            cached_at = cached_at.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - cached_at < timedelta(seconds=SCHEMA_CACHE_TTL_SECONDS)
    except Exception:
        return False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _table_doc_id(schema: str, table: str) -> str:
    """Firestore doc ID for a table definition — uses __ as separator."""
    return f"{schema}__{table}"


# ── Cache invalidation (called by the refresh API endpoint) ───────────────────

def invalidate_schema_cache(connection_id: str) -> None:
    """
    Delete all schema_cache documents for a connection.
    Called by POST /api/v1/connections/{id}/schema/refresh.
    Non-fatal.
    """
    try:
        from auth.core.firebase import get_firestore_client
        db   = get_firestore_client()
        col  = (
            db.collection(_CONNECTIONS_COL)
              .document(connection_id)
              .collection(_CACHE_COL)
        )
        docs = col.stream()
        for doc in docs:
            doc.reference.delete()
        logger.info(f"[SchemaCache] Invalidated all cache for connection_id={connection_id}")
    except Exception as exc:
        logger.warning(f"[SchemaCache] invalidate_schema_cache failed (non-fatal): {exc}")


# ── Tool factory ───────────────────────────────────────────────────────────────

def make_schema_tools(connection_string: str, connection_id: str) -> list:
    """
    Return [get_schema_list, get_table_definition] LangChain tools.
    Both tools are cache-aware — they read from Firestore first and only
    hit the live DB on cache miss or stale cache (older than TTL).

    Args:
        connection_string: SQLAlchemy URL for the target database.
        connection_id:     Firestore document ID in database_connections — used for cache path.
    """

    @tool
    def get_schema_list() -> str:
        """
        Get the list of all tables and their schemas in the connected database.
        Call this FIRST before constructing any SQL query.
        Returns a JSON array of objects with keys: table_schema, table_name.
        """
        # ── 1. Try Firestore cache ─────────────────────────────────────────
        try:
            from auth.core.firebase import get_firestore_client
            db  = get_firestore_client()
            ref = _cache_ref(db, connection_id, _TABLES_DOC_ID)
            doc = ref.get()
            if doc.exists:
                data = doc.to_dict()
                if _is_fresh(data.get("cached_at", "")):
                    logger.info(f"[SchemaCache] HIT tables | conn={connection_id}")
                    return json.dumps(data["tables"], indent=2)
                logger.info(f"[SchemaCache] STALE tables | conn={connection_id}")
        except Exception as exc:
            logger.warning(f"[SchemaCache] Cache read failed (non-fatal): {exc}")

        # ── 2. Live DB fetch ───────────────────────────────────────────────
        try:
            engine    = _get_engine(connection_string)
            inspector = inspect(engine)

            results = []
            try:
                schema_names = inspector.get_schema_names()
                user_schemas = [s for s in schema_names if s not in _SYSTEM_SCHEMAS]
            except Exception:
                user_schemas = [None]

            for schema in user_schemas:
                try:
                    schema_tables = inspector.get_table_names(schema=schema)
                except Exception:
                    schema_tables = inspector.get_table_names()
                schema_arg = schema if schema and schema != "default" else None
                for tbl in schema_tables:
                    try:
                        col_count = len(inspector.get_columns(tbl, schema=schema_arg))
                    except Exception:
                        col_count = 0
                    results.append({
                        "table_schema":  schema or "default",
                        "table_name":    tbl,
                        "column_count":  col_count,
                    })

            engine.dispose()

            if not results:
                return "No tables found in the connected database."

            # ── 3. Write to Firestore cache ────────────────────────────────
            try:
                ref.set({"tables": results, "cached_at": _now_iso()})
                logger.info(f"[SchemaCache] MISS tables — cached {len(results)} tables | conn={connection_id}")
            except Exception as exc:
                logger.warning(f"[SchemaCache] Cache write failed (non-fatal): {exc}")

            return json.dumps(results, indent=2)

        except Exception as exc:
            logger.error(f"[get_schema_list] Failed: {exc}")
            return f"Error listing tables: {exc}"

    @tool
    def get_table_definition(table_name: str, schema_name: str) -> str:
        """
        Get the full column definitions for a specific table, including data types,
        nullable flags, default values, and foreign key relationships.
        Call this before querying any table to know its exact columns.

        Args:
            table_name:  Name of the table to inspect.
            schema_name: Schema the table belongs to (e.g. 'public', 'mydb').
        """
        doc_id = _table_doc_id(schema_name or "default", table_name)

        # ── 1. Try Firestore cache ─────────────────────────────────────────
        try:
            from auth.core.firebase import get_firestore_client
            db  = get_firestore_client()
            ref = _cache_ref(db, connection_id, doc_id)
            doc = ref.get()
            if doc.exists:
                data = doc.to_dict()
                if _is_fresh(data.get("cached_at", "")):
                    logger.info(f"[SchemaCache] HIT {schema_name}.{table_name} | conn={connection_id}")
                    return json.dumps(data["columns"], indent=2)
                logger.info(f"[SchemaCache] STALE {schema_name}.{table_name}")
        except Exception as exc:
            logger.warning(f"[SchemaCache] Cache read failed (non-fatal): {exc}")

        # ── 2. Live DB fetch ───────────────────────────────────────────────
        try:
            engine     = _get_engine(connection_string)
            inspector  = inspect(engine)
            schema_arg = schema_name if schema_name and schema_name != "default" else None

            try:
                columns = inspector.get_columns(table_name, schema=schema_arg)
            except Exception as exc:
                return f"Error fetching columns for {schema_name}.{table_name}: {exc}"

            try:
                pk_cols = set(inspector.get_pk_constraint(table_name, schema=schema_arg).get("constrained_columns", []))
            except Exception:
                pk_cols = set()

            try:
                fk_map: dict[str, str] = {}
                for fk in inspector.get_foreign_keys(table_name, schema=schema_arg):
                    for local_col, ref_col in zip(fk["constrained_columns"], fk["referred_columns"]):
                        ref_schema = fk.get("referred_schema") or schema_arg or ""
                        fk_map[local_col] = f"{ref_schema}.{fk['referred_table']}.{ref_col}"
            except Exception:
                fk_map = {}

            engine.dispose()

            result_rows = []
            for col in columns:
                col_name = col["name"]
                result_rows.append({
                    "column_name":      col_name,
                    "data_type":        str(col.get("type", "UNKNOWN")),
                    "is_nullable":      "YES" if col.get("nullable", True) else "NO",
                    "column_default":   str(col.get("default", "")) if col.get("default") is not None else None,
                    "constraint_type":  "PRIMARY KEY" if col_name in pk_cols else None,
                    "referenced_table": fk_map.get(col_name),
                })

            if not result_rows:
                return f"No columns found for table {schema_name}.{table_name}"

            # ── 3. Write to Firestore cache ────────────────────────────────
            try:
                ref.set({"columns": result_rows, "cached_at": _now_iso()})
                logger.info(f"[SchemaCache] MISS {schema_name}.{table_name} — cached | conn={connection_id}")
            except Exception as exc:
                logger.warning(f"[SchemaCache] Cache write failed (non-fatal): {exc}")

            return json.dumps(result_rows, indent=2)

        except Exception as exc:
            logger.error(f"[get_table_definition] Failed for {schema_name}.{table_name}: {exc}")
            return f"Error fetching table definition: {exc}"

    return [get_schema_list, get_table_definition]
