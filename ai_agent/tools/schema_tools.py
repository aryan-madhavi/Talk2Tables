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
from sqlalchemy import create_engine, inspect, text

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

# ── Enum sampling constants ────────────────────────────────────────────────────
# String-like types that may carry categorical / enum values worth sampling.
_ENUM_CANDIDATE_TYPES = frozenset({
    "varchar", "char", "text", "enum", "nvarchar", "nchar",
    "string", "tinytext", "mediumtext", "longtext",
    "character varying", "character",
})
_ENUM_MAX_DISTINCT = 20  # columns with more than this count are treated as free-text

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


# ── Redis helpers (sync wrappers for use inside sync @tool functions) ─────────

def _redis_get_sync(key: str) -> Any | None:
    """Synchronous Redis GET — runs the async helper in a fresh thread."""
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


async def invalidate_schema_cache(connection_id: str):
    """Force clear all caches for a connection (Fire and forget async)."""
    from core.redis_client import redis_delete
    from core.cache_keys import key_schema_tables, key_schema_pattern
    
    async def _clear():
        await redis_delete(key_schema_tables(connection_id))
        # Clear all granular table keys too
        from core.redis_client import redis_client
        if redis_client:
            keys = await redis_client.keys(key_schema_pattern(connection_id))
            if keys: await redis_client.delete(*keys)
        await _mongo_clear(connection_id)
    
    asyncio.create_task(_clear())

async def warm_schema_cache(connection_id: str):
    """Pre-populate the schema cache for a connection (non-fatal if fails)."""
    try:
        from connections.services.connection_service import get_connection_with_password
        from ai_agent.nodes.entry import _build_connection_string
        
        conn = await get_connection_with_password(connection_id)
        if not conn: return
        
        conn_str = _build_connection_string(conn)
        tools = make_schema_tools(conn_str, connection_id)
        
        # Trigger get_schema_list with better error handling
        try:
            result_raw = await tools[0].ainvoke({})
            try:
                tables = json.loads(result_raw)
                # Warm each table definition
                for t in tables:
                    try:
                        await tools[1].ainvoke({"table_name": t["table_name"], "schema_name": t["table_schema"]})
                    except Exception as e:
                        logger.warning(f"Could not warm table {t.get('table_name')}: {e}")
            except json.JSONDecodeError:
                logger.warning("Invalid JSON from schema list")
        except Exception as e:
            logger.warning(f"Schema cache warming failed (non-fatal): {e}")
    except Exception as e:
        # Catch all to prevent background task from crashing
        logger.warning(f"Unexpected error in schema cache warming: {e}")

# ── Enum value sampler ────────────────────────────────────────────────────────

def _sample_enum_values(
    engine,
    dialect: str,
    schema_name: str | None,
    table_name: str,
    column_name: str,
) -> list[str]:
    """
    Run SELECT DISTINCT on *column_name* and return the distinct non-NULL string values.
    """
    try:
        d = dialect.lower()

        # Column identifier quoting
        if d in ("mysql", "mariadb"):
            col_q = f"`{column_name}`"
        elif d == "mssql":
            col_q = f"[{column_name}]"
        else:  # postgresql, oracle
            col_q = f'"{column_name}"'

        # Schema-qualified table reference
        eff_schema = schema_name if schema_name and schema_name != "default" else None
        if eff_schema:
            if d in ("mysql", "mariadb"):
                table_q = f"`{eff_schema}`.`{table_name}`"
            elif d == "mssql":
                table_q = f"[{eff_schema}].[{table_name}]"
            else:
                table_q = f'"{eff_schema}"."{table_name}"'
        else:
            if d in ("mysql", "mariadb"):
                table_q = f"`{table_name}`"
            elif d == "mssql":
                table_q = f"[{table_name}]"
            else:
                table_q = f'"{table_name}"'

        cap = _ENUM_MAX_DISTINCT + 1
        if d == "mssql":
            sql = f"SELECT DISTINCT TOP {cap} {col_q} FROM {table_q} WHERE {col_q} IS NOT NULL ORDER BY {col_q}"
        elif d == "oracle":
            sql = f"SELECT {col_q} FROM (SELECT DISTINCT {col_q} FROM {table_q} WHERE {col_q} IS NOT NULL ORDER BY {col_q}) WHERE ROWNUM <= {cap}"
        else:  # mysql, mariadb, postgresql
            sql = f"SELECT DISTINCT {col_q} FROM {table_q} WHERE {col_q} IS NOT NULL ORDER BY {col_q} LIMIT {cap}"

        with engine.connect() as conn:
            rows = conn.execute(text(sql)).fetchall()

        values = [str(r[0]) for r in rows if r[0] is not None]
        if len(values) > _ENUM_MAX_DISTINCT:
            return []

        return values

    except Exception as exc:
        logger.debug(f"[_sample_enum_values] Skipped {schema_name}.{table_name}.{column_name}: {exc}")
        return []


# ── Business doc enrichment helpers ────────────────────────────────────────────

def _enrich_schema_list(tables: list, connection_id: str) -> str:
    """Merge business doc descriptions into schema list results. Non-fatal."""
    try:
        from connections.services.doc_service import get_summary_index_sync
        index = get_summary_index_sync(connection_id)
        if index:
            for entry in tables:
                key = f"{entry.get('table_schema', 'default')}__{entry.get('table_name', '')}"
                if key in index:
                    entry["description"] = index[key]
    except Exception:
        pass
    return json.dumps(tables)


def _enrich_table_def(columns: list, connection_id: str, schema_name: str, table_name: str) -> str:
    """Merge business doc context into table definition results. Non-fatal."""
    response = columns
    try:
        from connections.services.doc_service import get_table_summary_sync
        summary = get_table_summary_sync(connection_id, schema_name or 'default', table_name)
        if summary:
            col_descs = summary.get("column_descriptions", {})
            for entry in columns:
                desc = col_descs.get(entry.get("column_name", ""))
                if desc:
                    entry["business_description"] = desc
            response = {
                "business_context": summary.get("business_context", ""),
                "columns": columns,
            }
    except Exception:
        pass
    return json.dumps(response, indent=2)


# ── Tool factory ───────────────────────────────────────────────────────────────

def make_schema_tools(connection_string: str, connection_id: str) -> list:

    @tool
    async def get_schema_list() -> str:
        """Get the list of all tables and their schemas in the connected database."""
        from core.cache_keys import key_schema_tables, TTL_SCHEMA
        from core.redis_client import redis_get, redis_set

        redis_key = key_schema_tables(connection_id)

        # 1. Redis
        cached = await redis_get(redis_key)
        if cached:
            logger.info(f"[SchemaCache] Redis HIT tables | conn={connection_id}")
            return _enrich_schema_list(cached, connection_id)

        # 2. MongoDB
        doc = await _mongo_get(connection_id, _TABLES_DOC_ID)
        if doc and _is_fresh(doc.get("cached_at", "")):
            tables = doc["tables"]
            logger.info(f"[SchemaCache] MongoDB HIT tables | conn={connection_id}")
            await redis_set(redis_key, tables, TTL_SCHEMA)
            return _enrich_schema_list(tables, connection_id)

        # 3. Live DB
        try:
            logger.info(f"[SchemaTools] Fetching tables for connection_id={connection_id}")
            
            def _fetch():
                engine = _get_engine(connection_string)
                inspector = inspect(engine)
                results = []
                
                try:
                    raw_schemas = inspector.get_schema_names()
                except Exception:
                    raw_schemas = []
                
                user_schemas = [s for s in raw_schemas if s not in _SYSTEM_SCHEMAS]
                
                if not user_schemas:
                    for t in inspector.get_table_names():
                        results.append({"table_schema": "default", "table_name": t, "column_count": 0})
                else:
                    for s in user_schemas:
                        for t in inspector.get_table_names(schema=s):
                            results.append({"table_schema": s, "table_name": t, "column_count": 0})
                return results

            results = await asyncio.get_event_loop().run_in_executor(None, _fetch)
            results.sort(key=lambda r: (r["table_schema"], r["table_name"]))
            
            # 4. Cache
            await redis_set(redis_key, results, TTL_SCHEMA)
            await _mongo_set(connection_id, _TABLES_DOC_ID, {"tables": results})
            
            return _enrich_schema_list(results, connection_id)
        except Exception as exc:
            logger.error(f"[SchemaTools] get_schema_list failed: {exc}")
            return f"Error: {exc}"

    @tool
    async def get_table_definition(table_name: str, schema_name: str) -> str:
        """
        Get the full column definitions for a specific table.
        Args:
            table_name: Name of the table to inspect.
            schema_name: Schema the table belongs to.
        """
        from core.cache_keys import key_schema_table_def, TTL_SCHEMA
        from core.redis_client import redis_get, redis_set

        redis_key = key_schema_table_def(connection_id, schema_name or "default", table_name)
        doc_id    = _table_doc_id(schema_name or "default", table_name)

        # 1. Redis
        cached = await redis_get(redis_key)
        if cached:
            logger.info(f"[SchemaCache] Redis HIT {schema_name}.{table_name} | conn={connection_id}")
            return _enrich_table_def(cached, connection_id, schema_name, table_name)

        # 2. MongoDB
        doc = await _mongo_get(connection_id, doc_id)
        if doc and _is_fresh(doc.get("cached_at", "")):
            cols = doc["columns"]
            logger.info(f"[SchemaCache] MongoDB HIT {schema_name}.{table_name} | conn={connection_id}")
            await redis_set(redis_key, cols, TTL_SCHEMA)
            return _enrich_table_def(cols, connection_id, schema_name, table_name)

        # 3. Live DB
        try:
            def _fetch():
                engine = _get_engine(connection_string)
                inspector = inspect(engine)
                s_arg = schema_name if schema_name and schema_name != "default" else None
                
                columns = inspector.get_columns(table_name, schema=s_arg)
                pk_constraint = inspector.get_pk_constraint(table_name, schema=s_arg)
                pk_cols = set(pk_constraint.get("constrained_columns", []))
                
                # Get unique constraints
                unique_cols = set()
                try:
                    for uc in inspector.get_unique_constraints(table_name, schema=s_arg):
                        for c in uc.get("column_names", []):
                            unique_cols.add(c)
                except: pass

                fk_map: dict[str, str] = {}
                try:
                    for fk in inspector.get_foreign_keys(table_name, schema=s_arg):
                        for local_col, ref_col in zip(fk["constrained_columns"], fk["referred_columns"]):
                            ref_schema = fk.get("referred_schema") or s_arg or ""
                            fk_map[local_col] = f"{ref_schema}.{fk['referred_table']}.{ref_col}"
                except Exception:
                    pass

                result_rows = []
                for col in columns:
                    col_name = col["name"]
                    entry = {
                        "column_name": col_name,
                        "data_type":   str(col.get("type", "UNKNOWN")),
                        "nullable":    col.get("nullable", True),
                    }
                    if col_name in pk_cols: 
                        entry["primary_key"] = True
                        entry["is_primary_key"] = True # For frontend
                    if col_name in unique_cols:
                        entry["unique"] = True
                        entry["is_unique"] = True # For frontend
                    if col.get("default") is not None: entry["default"] = str(col["default"])
                    if col_name in fk_map: entry["references"] = fk_map[col_name]
                    result_rows.append(entry)
                return result_rows, engine

            result_rows, engine = await asyncio.get_event_loop().run_in_executor(None, _fetch)

            if not result_rows:
                return f"No columns found for table {schema_name}.{table_name}"

            # 4. Enum Sampling
            _dialect = detect_dialect(connection_string)
            schema_arg = schema_name if schema_name and schema_name != "default" else None
            for _entry in result_rows:
                _col_type  = _entry.get("data_type", "").lower()
                _is_string = any(t in _col_type for t in _ENUM_CANDIDATE_TYPES)
                _is_pk     = _entry.get("primary_key", False)
                _is_fk     = "references" in _entry
                if not _is_string or _is_pk or _is_fk:
                    continue
                _vals = _sample_enum_values(engine, _dialect, schema_arg, table_name, _entry["column_name"])
                if _vals:
                    _entry["sample_values"] = _vals

            # 5. Cache
            await redis_set(redis_key, result_rows, TTL_SCHEMA)
            await _mongo_set(connection_id, doc_id, {"columns": result_rows})
            
            return _enrich_table_def(result_rows, connection_id, schema_name, table_name)
        except Exception as exc:
            logger.error(f"[SchemaTools] get_table_definition failed: {exc}")
            return f"Error: {exc}"

    return [get_schema_list, get_table_definition]
