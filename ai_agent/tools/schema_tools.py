# ai_agent/tools/schema_tools.py
"""
LangChain tools for schema inspection with two-tier cache:
  1. Redis   (~1ms)   — TTL 1h, invalidated on schema refresh
  2. MongoDB (~5ms)   — source of truth, persists across restarts

MongoDB cache Collection: schema_cache

Cache TTL: SCHEMA_CACHE_TTL_SECONDS (default 3600 = 1 hour).
"""
from __future__ import annotations

import json
import logging
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Any

from langchain_core.tools import tool
from sqlalchemy import create_engine, inspect

from auth.core.mongo import get_database

logger = logging.getLogger(__name__)

COLLECTION               = "schema_cache"
_TABLES_DOC_ID           = "_tables"
SCHEMA_CACHE_TTL_SECONDS = 3600  # 1 hour

_SYSTEM_SCHEMAS = {
    "information_schema", "pg_catalog", "mysql", "performance_schema", "sys",
    "SYSTEM", "SYS", "DBSNMP", "auth", "storage", "realtime", "extensions",
    "graphql", "graphql_public", "net", "pgsodium", "pgsodium_masks",
    "supabase_functions", "supabase_migrations", "vault", "_realtime", "pgbouncer",
}

_DIALECT_HINTS: dict[str, str] = {
    "mysql": "mysql", "mariadb": "mariadb", "postgresql": "postgresql",
    "postgres": "postgresql", "mssql": "mssql", "oracle": "oracle",
}

_engine_cache: dict[str, Any] = {}

def detect_dialect(connection_string: str) -> str:
    cs = connection_string.lower()
    for prefix, dialect in _DIALECT_HINTS.items():
        if cs.startswith(prefix):
            return dialect
    return "mysql"

def _get_engine(connection_string: str):
    if connection_string in _engine_cache:
        return _engine_cache[connection_string]
    engine = create_engine(connection_string, pool_pre_ping=True, pool_recycle=3600)
    _engine_cache[connection_string] = engine
    return engine

def _is_fresh(cached_at_iso: str) -> bool:
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
    return f"{schema}__{table}"

# ── Sync Helpers for LangChain Tools ──────────────────────────────────────────

def _run_async(coro):
    """Helper to run async code in a sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    if loop.is_running():
        # This is the tricky part in FastAPI. We use a ThreadPool to run the coro.
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result(timeout=10)
    else:
        return loop.run_until_complete(coro)

# ── Cache Logic ───────────────────────────────────────────────────────────────

async def _mongo_get(connection_id: str, doc_id: str):
    db = get_database()
    if db is None: return None
    return await db[COLLECTION].find_one({"connection_id": connection_id, "doc_id": doc_id})

async def _mongo_set(connection_id: str, doc_id: str, data: dict):
    db = get_database()
    if db is None: return
    await db[COLLECTION].replace_one(
        {"connection_id": connection_id, "doc_id": doc_id},
        {"connection_id": connection_id, "doc_id": doc_id, **data, "cached_at": _now_iso()},
        upsert=True
    )

async def _mongo_clear(connection_id: str):
    db = get_database()
    if db is None: return
    await db[COLLECTION].delete_many({"connection_id": connection_id})

# ── Tool factory ───────────────────────────────────────────────────────────────

def make_schema_tools(connection_string: str, connection_id: str) -> list:

    @tool
    def get_schema_list() -> str:
        """Get the list of all tables and their schemas in the connected database."""
        from core.cache_keys import key_schema_tables, TTL_SCHEMA
        from core.redis_client import redis_get, redis_set

        redis_key = key_schema_tables(connection_id)

        # 1. Redis
        cached = _run_async(redis_get(redis_key))
        if cached: return json.dumps(cached)

        # 2. MongoDB
        doc = _run_async(_mongo_get(connection_id, _TABLES_DOC_ID))
        if doc and _is_fresh(doc.get("cached_at", "")):
            tables = doc["tables"]
            _run_async(redis_set(redis_key, tables, TTL_SCHEMA))
            return json.dumps(tables)

        # 3. Live DB
        try:
            engine = _get_engine(connection_string)
            inspector = inspect(engine)
            results = []
            user_schemas = [s for s in inspector.get_schema_names() if s not in _SYSTEM_SCHEMAS] or [None]
            
            for s in user_schemas:
                for t in inspector.get_table_names(schema=s):
                    results.append({"table_schema": s or "default", "table_name": t, "column_count": 0})
            
            results.sort(key=lambda r: (r["table_schema"], r["table_name"]))
            
            # 4. Cache
            _run_async(redis_set(redis_key, results, TTL_SCHEMA))
            _run_async(_mongo_set(connection_id, _TABLES_DOC_ID, {"tables": results}))
            
            return json.dumps(results)
        except Exception as exc:
            return f"Error: {exc}"

    @tool
    def get_table_definition(table_name: str, schema_name: str) -> str:
        """Get the full column definitions for a specific table."""
        from core.cache_keys import key_schema_table_def, TTL_SCHEMA
        from core.redis_client import redis_get, redis_set

        redis_key = key_schema_table_def(connection_id, schema_name or "default", table_name)
        doc_id    = _table_doc_id(schema_name or "default", table_name)

        # 1. Redis
        cached = _run_async(redis_get(redis_key))
        if cached: return json.dumps(cached)

        # 2. MongoDB
        doc = _run_async(_mongo_get(connection_id, doc_id))
        if doc and _is_fresh(doc.get("cached_at", "")):
            cols = doc["columns"]
            _run_async(redis_set(redis_key, cols, TTL_SCHEMA))
            return json.dumps(cols)

        # 3. Live DB
        try:
            engine = _get_engine(connection_string)
            inspector = inspect(engine)
            s_arg = schema_name if schema_name and schema_name != "default" else None
            
            columns = inspector.get_columns(table_name, schema=s_arg)
            pk_cols = set(inspector.get_pk_constraint(table_name, schema=s_arg).get("constrained_columns", []))
            
            result_rows = []
            for col in columns:
                entry = {
                    "column_name": col["name"],
                    "data_type":   str(col.get("type", "UNKNOWN")),
                    "nullable":    col.get("nullable", True),
                }
                if col["name"] in pk_cols: entry["primary_key"] = True
                result_rows.append(entry)

            # 4. Cache
            _run_async(redis_set(redis_key, result_rows, TTL_SCHEMA))
            _run_async(_mongo_set(connection_id, doc_id, {"columns": result_rows}))
            
            return json.dumps(result_rows, indent=2)
        except Exception as exc:
            return f"Error: {exc}"

    return [get_schema_list, get_table_definition]
