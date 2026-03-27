# ai_agent/tools/schema_tools.py
"""
LangChain tools for schema inspection with two-tier cache:
  1. Redis   (~1ms)   — TTL 1h, invalidated on schema refresh
  2. Firestore (~80ms) — source of truth, persists across restarts

Firestore cache paths (under each connection doc):
    database_connections/{connection_id}/schema_cache/_tables
        → { tables: [...], cached_at: ISO }
    database_connections/{connection_id}/schema_cache/{schema}__{table}
        → { columns: [...], cached_at: ISO }

Cache TTL: SCHEMA_CACHE_TTL_SECONDS (default 3600 = 1 hour).
On cache miss the tool fetches from the live DB and writes back to both caches.
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

_CONNECTIONS_COL         = "database_connections"
_CACHE_COL               = "schema_cache"
_TABLES_DOC_ID           = "_tables"
SCHEMA_CACHE_TTL_SECONDS = 3600  # 1 hour

_SYSTEM_SCHEMAS = {
    "information_schema", "pg_catalog",       # PostgreSQL
    "mysql", "performance_schema", "sys",      # MySQL
    "SYSTEM", "SYS", "DBSNMP",                # Oracle
    # Supabase internal schemas
    "auth", "storage", "realtime", "extensions",
    "graphql", "graphql_public", "net",
    "pgsodium", "pgsodium_masks",
    "supabase_functions", "supabase_migrations",
    "vault", "_realtime", "pgbouncer",
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

# ── SQLAlchemy engine pool ────────────────────────────────────────────────────
# Creating a new engine (and TCP connection) per tool call was the biggest
# latency driver after the LLM.  Keep one engine per connection string so the
# underlying connection pool is reused across tool calls and agent retries.
_engine_cache: dict[str, Any] = {}


def detect_dialect(connection_string: str) -> str:
    """Detect SQL dialect from SQLAlchemy connection URL."""
    cs = connection_string.lower()
    for prefix, dialect in _DIALECT_HINTS.items():
        if cs.startswith(prefix):
            return dialect
    logger.warning("[SchemaTools] Unknown dialect. Defaulting to 'mysql'.")
    return "mysql"


def _get_engine(connection_string: str):
    """Return a cached SQLAlchemy engine, creating it on first use."""
    if connection_string in _engine_cache:
        return _engine_cache[connection_string]
    kwargs: dict = {"pool_pre_ping": True, "echo": False, "pool_recycle": 3600}
    if not connection_string.lower().startswith("sqlite"):
        kwargs["connect_args"] = {"connect_timeout": 10}
    engine = create_engine(connection_string, **kwargs)
    _engine_cache[connection_string] = engine
    logger.debug(f"[SchemaTools] New engine cached (total={len(_engine_cache)})")
    return engine


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
    Delete all schema cache entries for a connection (Redis + Firestore).
    Called by POST /api/v1/connections/{id}/schema/refresh.
    Non-fatal.
    """
    # Redis invalidation (sync-friendly — fire and forget via asyncio)
    try:
        import asyncio
        from core.redis_client import redis_delete_pattern
        from core.cache_keys import key_schema_pattern
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.ensure_future(redis_delete_pattern(key_schema_pattern(connection_id)))
            else:
                loop.run_until_complete(redis_delete_pattern(key_schema_pattern(connection_id)))
        except Exception as exc:
            logger.warning(f"[SchemaCache] Redis invalidation failed (non-fatal): {exc}")
    except ImportError:
        pass

    # Firestore invalidation
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
        logger.warning(f"[SchemaCache] invalidate_schema_cache Firestore failed (non-fatal): {exc}")


# ── Redis helpers (sync wrappers for use inside sync @tool functions) ─────────

def _redis_get_sync(key: str) -> Any | None:
    """Synchronous Redis GET — runs the async helper in a fresh thread to avoid
    'This event loop is already running' when called from within FastAPI/LangGraph."""
    try:
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        from core.redis_client import redis_get
        with ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, redis_get(key)).result(timeout=4)
    except Exception:
        return None


def _redis_set_sync(key: str, value: Any, ttl: int) -> None:
    try:
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        from core.redis_client import redis_set
        with ThreadPoolExecutor(max_workers=1) as pool:
            pool.submit(asyncio.run, redis_set(key, value, ttl)).result(timeout=4)
    except Exception:
        pass


# ── Tool factory ───────────────────────────────────────────────────────────────

def make_schema_tools(connection_string: str, connection_id: str) -> list:
    """
    Return [get_schema_list, get_table_definition] LangChain tools.

    Cache priority (fastest first):
      1. Redis   — ~1ms, populated on first miss
      2. Firestore — ~80ms, source of truth across restarts
      3. Live DB — on full cache miss; writes back to both caches

    Args:
        connection_string: SQLAlchemy URL for the target database.
        connection_id:     Firestore document ID in database_connections.
    """

    @tool
    def get_schema_list() -> str:
        """
        Get the list of all tables and their schemas in the connected database.
        Call this FIRST before constructing any SQL query.
        Returns a JSON array of objects with keys: table_schema, table_name.
        """
        from core.cache_keys import key_schema_tables, TTL_SCHEMA

        redis_key = key_schema_tables(connection_id)

        # ── 1. Redis cache ─────────────────────────────────────────────────
        cached = _redis_get_sync(redis_key)
        if cached is not None:
            logger.info(f"[SchemaCache] Redis HIT tables | conn={connection_id}")
            return json.dumps(cached, indent=2)

        # ── 2. Firestore cache ─────────────────────────────────────────────
        try:
            from auth.core.firebase import get_firestore_client
            db  = get_firestore_client()
            ref = _cache_ref(db, connection_id, _TABLES_DOC_ID)
            doc = ref.get()
            if doc.exists:
                data = doc.to_dict()
                if _is_fresh(data.get("cached_at", "")):
                    tables = data["tables"]
                    logger.info(f"[SchemaCache] Firestore HIT tables | conn={connection_id}")
                    _redis_set_sync(redis_key, tables, TTL_SCHEMA)
                    return json.dumps(tables, indent=2)
                logger.info(f"[SchemaCache] STALE tables | conn={connection_id}")
        except Exception as exc:
            logger.warning(f"[SchemaCache] Firestore read failed (non-fatal): {exc}")
            ref = None  # type: ignore

        # ── 3. Live DB fetch ───────────────────────────────────────────────
        try:
            engine    = _get_engine(connection_string)
            inspector = inspect(engine)

            results = []
            try:
                schema_names = inspector.get_schema_names()
                user_schemas = [s for s in schema_names if s not in _SYSTEM_SCHEMAS]
            except Exception:
                user_schemas = [None]

            from concurrent.futures import ThreadPoolExecutor, as_completed

            all_table_specs = []
            for schema in user_schemas:
                try:
                    schema_tables = inspector.get_table_names(schema=schema)
                except Exception:
                    schema_tables = inspector.get_table_names()
                for tbl in schema_tables:
                    all_table_specs.append((schema, tbl))

            def _get_col_count(schema_tbl):
                s, t = schema_tbl
                try:
                    return s, t, len(inspector.get_columns(t, schema=s))
                except Exception:
                    return s, t, 0

            if all_table_specs:
                max_workers = min(10, len(all_table_specs))
                with ThreadPoolExecutor(max_workers=max_workers) as pool:
                    futures = {pool.submit(_get_col_count, spec): spec for spec in all_table_specs}
                    for future in as_completed(futures):
                        s, t, col_count = future.result()
                        results.append({
                            "table_schema": s or "default",
                            "table_name":   t,
                            "column_count": col_count,
                        })
                # Sort for consistent ordering
                results.sort(key=lambda r: (r["table_schema"], r["table_name"]))

            if not results:
                return "No tables found in the connected database."

            # ── 4. Write to Redis + Firestore ──────────────────────────────
            _redis_set_sync(redis_key, results, TTL_SCHEMA)
            try:
                ref.set({"tables": results, "cached_at": _now_iso()})
                logger.info(f"[SchemaCache] MISS tables — cached {len(results)} | conn={connection_id}")
            except Exception as exc:
                logger.warning(f"[SchemaCache] Firestore write failed (non-fatal): {exc}")

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
        from core.cache_keys import key_schema_table_def, TTL_SCHEMA

        redis_key = key_schema_table_def(connection_id, schema_name or "default", table_name)
        doc_id    = _table_doc_id(schema_name or "default", table_name)

        # ── 1. Redis cache ─────────────────────────────────────────────────
        cached = _redis_get_sync(redis_key)
        if cached is not None:
            logger.info(f"[SchemaCache] Redis HIT {schema_name}.{table_name} | conn={connection_id}")
            return json.dumps(cached, indent=2)

        # ── 2. Firestore cache ─────────────────────────────────────────────
        try:
            from auth.core.firebase import get_firestore_client
            db  = get_firestore_client()
            ref = _cache_ref(db, connection_id, doc_id)
            doc = ref.get()
            if doc.exists:
                data = doc.to_dict()
                if _is_fresh(data.get("cached_at", "")):
                    columns = data["columns"]
                    logger.info(f"[SchemaCache] Firestore HIT {schema_name}.{table_name} | conn={connection_id}")
                    _redis_set_sync(redis_key, columns, TTL_SCHEMA)
                    return json.dumps(columns, indent=2)
                logger.info(f"[SchemaCache] STALE {schema_name}.{table_name}")
        except Exception as exc:
            logger.warning(f"[SchemaCache] Firestore read failed (non-fatal): {exc}")
            ref = None  # type: ignore

        # ── 3. Live DB fetch ───────────────────────────────────────────────
        try:
            engine     = _get_engine(connection_string)
            inspector  = inspect(engine)
            schema_arg = schema_name if schema_name and schema_name != "default" else None

            from concurrent.futures import ThreadPoolExecutor

            def _fetch_columns():
                return inspector.get_columns(table_name, schema=schema_arg)

            def _fetch_pk():
                try:
                    return set(inspector.get_pk_constraint(table_name, schema=schema_arg).get("constrained_columns", []))
                except Exception:
                    return set()

            def _fetch_fks():
                fk_map: dict[str, str] = {}
                try:
                    for fk in inspector.get_foreign_keys(table_name, schema=schema_arg):
                        for local_col, ref_col in zip(fk["constrained_columns"], fk["referred_columns"]):
                            ref_schema = fk.get("referred_schema") or schema_arg or ""
                            fk_map[local_col] = f"{ref_schema}.{fk['referred_table']}.{ref_col}"
                except Exception:
                    pass
                return fk_map

            try:
                with ThreadPoolExecutor(max_workers=3) as pool:
                    col_future = pool.submit(_fetch_columns)
                    pk_future  = pool.submit(_fetch_pk)
                    fk_future  = pool.submit(_fetch_fks)
                    try:
                        columns = col_future.result()
                    except Exception as exc:
                        return f"Error fetching columns for {schema_name}.{table_name}: {exc}"
                    pk_cols = pk_future.result()
                    fk_map  = fk_future.result()
            except Exception as exc:
                return f"Error fetching table definition: {exc}"

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

            # ── 4. Write to Redis + Firestore ──────────────────────────────
            _redis_set_sync(redis_key, result_rows, TTL_SCHEMA)
            try:
                ref.set({"columns": result_rows, "cached_at": _now_iso()})
                logger.info(f"[SchemaCache] MISS {schema_name}.{table_name} — cached | conn={connection_id}")
            except Exception as exc:
                logger.warning(f"[SchemaCache] Firestore write failed (non-fatal): {exc}")

            return json.dumps(result_rows, indent=2)

        except Exception as exc:
            logger.error(f"[get_table_definition] Failed for {schema_name}.{table_name}: {exc}")
            return f"Error fetching table definition: {exc}"

    return [get_schema_list, get_table_definition]
