# connections/services/connection_service.py
"""
Business logic for database connection management.

Cache strategy:
    READ  → check Redis first, fallback to Firestore on miss, then populate cache.
    WRITE → write to Firestore first, then invalidate relevant cache keys.

Cache keys used:
    connection:{id}          — single connection dict   TTL: 2 min
    connections:list         — all connections list      TTL: 2 min
    connections:list:active  — active-only list          TTL: 2 min
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from auth.core.firebase import get_firestore_client
from connections.core.encryption import encrypt_password, decrypt_password
from connections.routes.schemas import CreateConnectionRequest, UpdateConnectionRequest
from core.redis_client import redis_get, redis_set, redis_delete
from core.cache_keys import (
    key_connection, key_connections_list,
    TTL_CONNECTION, TTL_CONNECTIONS_LIST,
)

logger = logging.getLogger(__name__)

COLLECTION = "database_connections"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_connection(doc: dict) -> dict:
    """Strip password_enc before returning to any caller."""
    return {k: v for k, v in doc.items() if k != "password_enc"}


async def _invalidate_connection_cache(connection_id: str) -> None:
    """
    Invalidate all cache entries related to a connection.
    Called after any write (create, update, delete, activate, deactivate).
    """
    await redis_delete(
        key_connection(connection_id),
        key_connections_list(active_only=False),
        key_connections_list(active_only=True),
    )
    logger.debug(f"[Cache] Invalidated connection keys — id={connection_id}")


# ── Create ────────────────────────────────────────────────────────────────────

async def create_connection(
    body: CreateConnectionRequest,
    created_by_uid: str,
) -> dict:
    """
    Encrypt password and write a new connection to Firestore.
    Invalidates the connections list cache.
    Returns safe connection dict (no password_enc).
    """
    db            = get_firestore_client()
    connection_id = str(uuid.uuid4())
    now           = _now_iso()

    doc = {
        "connection_id":  connection_id,
        "name":           body.name,
        "db_type":        body.db_type,
        "host":           body.host,
        "port":           body.port,
        "database_name":  body.database_name,
        "username":       body.username,
        "password_enc":   encrypt_password(body.password),
        "ssl_enabled":    body.ssl_enabled,
        "is_active":      True,
        "description":    body.description,
        "created_by_uid": created_by_uid,
        "created_at":     now,
        "updated_at":     now,
        "last_tested_at": None,
        "last_tested_ok": None,
    }

    db.collection(COLLECTION).document(connection_id).set(doc)
    logger.info(f"[Connections] Created | id={connection_id} name={body.name} by={created_by_uid}")

    safe = _safe_connection(doc)

    # Cache the new connection, invalidate list caches
    await redis_set(key_connection(connection_id), safe, TTL_CONNECTION)
    await redis_delete(
        key_connections_list(active_only=False),
        key_connections_list(active_only=True),
    )

    return safe


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_connection_by_id(connection_id: str) -> Optional[dict]:
    """
    Fetch a single connection (safe — no password_enc).

    Flow: Redis → Firestore → cache result
    """
    # 1. Cache check
    cached = await redis_get(key_connection(connection_id))
    if cached:
        logger.debug(f"[Cache] HIT connection:{connection_id}")
        return cached

    # 2. Firestore fallback
    db  = get_firestore_client()
    doc = db.collection(COLLECTION).document(connection_id).get()
    if not doc.exists:
        return None

    safe = _safe_connection(doc.to_dict())

    # 3. Populate cache
    await redis_set(key_connection(connection_id), safe, TTL_CONNECTION)
    logger.debug(f"[Cache] MISS connection:{connection_id} — cached for {TTL_CONNECTION}s")

    return safe


async def get_connection_with_password(connection_id: str) -> Optional[dict]:
    """
    Fetch connection INCLUDING decrypted password.
    ONLY for internal use (query execution engine).
    NEVER returned in any API response.
    NOT cached — passwords must never go into Redis.
    """
    db  = get_firestore_client()
    doc = db.collection(COLLECTION).document(connection_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["password"] = decrypt_password(data["password_enc"])
    return data


async def list_connections(active_only: bool = False) -> list[dict]:
    """
    List all connections. Optionally filter to active only.

    Flow: Redis → Firestore → cache result
    """
    cache_key = key_connections_list(active_only)

    # 1. Cache check
    cached = await redis_get(cache_key)
    if cached:
        logger.debug(f"[Cache] HIT {cache_key}")
        return cached

    # 2. Firestore fallback
    db    = get_firestore_client()
    query = db.collection(COLLECTION)

    if active_only:
        from google.cloud.firestore_v1.base_query import FieldFilter
        query = query.where(filter=FieldFilter("is_active", "==", True))

    docs    = query.stream()
    results = [_safe_connection(d.to_dict()) for d in docs]
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    # 3. Populate cache
    await redis_set(cache_key, results, TTL_CONNECTIONS_LIST)
    logger.debug(f"[Cache] MISS {cache_key} — cached {len(results)} connections")

    return results


# ── Update ────────────────────────────────────────────────────────────────────

async def update_connection(
    connection_id: str,
    body: UpdateConnectionRequest,
) -> Optional[dict]:
    """
    Partial update. Invalidates single + list caches after write.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(connection_id)

    if not ref.get().exists:
        return None

    updates: dict = {"updated_at": _now_iso()}

    if body.name          is not None: updates["name"]          = body.name
    if body.host          is not None: updates["host"]          = body.host.strip().lower()
    if body.port          is not None: updates["port"]          = body.port
    if body.database_name is not None: updates["database_name"] = body.database_name
    if body.username      is not None: updates["username"]      = body.username
    if body.ssl_enabled   is not None: updates["ssl_enabled"]   = body.ssl_enabled
    if body.description   is not None: updates["description"]   = body.description
    if body.is_active     is not None: updates["is_active"]     = body.is_active
    if body.password      is not None:
        updates["password_enc"] = encrypt_password(body.password)
        logger.info(f"[Connections] Password rotated | id={connection_id}")

    ref.update(updates)
    logger.info(f"[Connections] Updated | id={connection_id} fields={list(updates.keys())}")

    updated = _safe_connection(ref.get().to_dict())

    # Invalidate — data changed
    await _invalidate_connection_cache(connection_id)
    # Re-populate single key with fresh data
    await redis_set(key_connection(connection_id), updated, TTL_CONNECTION)

    return updated


# ── Delete ────────────────────────────────────────────────────────────────────

async def delete_connection(connection_id: str) -> bool:
    """
    Hard-delete. Invalidates all related cache keys.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(connection_id)

    if not ref.get().exists:
        return False

    ref.delete()
    logger.info(f"[Connections] Deleted | id={connection_id}")

    await _invalidate_connection_cache(connection_id)

    return True


# ── Test Connection ───────────────────────────────────────────────────────────

def _build_connection_url(conn: dict) -> str:
    """Build a SQLAlchemy URL from a connection doc (with decrypted password)."""
    db_type  = conn["db_type"].lower()
    host     = conn["host"]
    port     = conn["port"]
    database = conn["database_name"]
    user     = conn["username"]
    password = conn["password"]

    _DRIVER_MAP = {
        "mysql":      f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}",
        "mariadb":    f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}",
        "postgresql": f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{database}",
        "postgres":   f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{database}",
        "mssql":      f"mssql+pyodbc://{user}:{password}@{host}:{port}/{database}?driver=ODBC+Driver+17+for+SQL+Server",
        "oracle":     f"oracle+oracledb://{user}:{password}@{host}:{port}/{database}",
    }
    url = _DRIVER_MAP.get(db_type)
    if not url:
        raise ValueError(f"Unsupported db_type '{db_type}'.")
    return url


async def test_connection(connection_id: str) -> dict:
    """
    Try to open a live connection to the target database.
    Updates last_tested_at and last_tested_ok in Firestore regardless of outcome.
    Returns { ok: bool, message: str }.
    NOT cached — always live test.
    """
    import asyncio
    from datetime import datetime, timezone
    from sqlalchemy import create_engine, text

    now = datetime.now(timezone.utc).isoformat()

    conn = await get_connection_with_password(connection_id)
    if not conn:
        return {"ok": False, "message": f"Connection '{connection_id}' not found."}

    try:
        url = _build_connection_url(conn)
    except ValueError as exc:
        return {"ok": False, "message": str(exc)}

    ok      = False
    message = ""
    try:
        # Run blocking SQLAlchemy call in a thread so we don't block the event loop
        def _ping():
            engine = create_engine(url, connect_args={"connect_timeout": 10}, pool_pre_ping=True)
            with engine.connect() as cx:
                cx.execute(text("SELECT 1"))
            engine.dispose()

        await asyncio.get_event_loop().run_in_executor(None, _ping)
        ok      = True
        message = "Connection successful."
        logger.info(f"[Connections] Test OK | id={connection_id}")
    except Exception as exc:
        message = str(exc).split("\n")[0]  # first line only — avoid giant stacktraces
        logger.warning(f"[Connections] Test FAILED | id={connection_id} | {message}")

    # Persist result
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(connection_id)
    ref.update({"last_tested_at": now, "last_tested_ok": ok, "updated_at": now})
    await _invalidate_connection_cache(connection_id)

    return {"ok": ok, "message": message}


# ── Activate / Deactivate ─────────────────────────────────────────────────────

async def set_connection_active(connection_id: str, is_active: bool) -> Optional[dict]:
    """
    Enable or disable a connection. Invalidates all related cache keys.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(connection_id)

    if not ref.get().exists:
        return None

    ref.update({"is_active": is_active, "updated_at": _now_iso()})
    action = "Activated" if is_active else "Deactivated"
    logger.info(f"[Connections] {action} | id={connection_id}")

    updated = _safe_connection(ref.get().to_dict())

    # Invalidate — is_active changed so both list variants are stale
    await _invalidate_connection_cache(connection_id)
    await redis_set(key_connection(connection_id), updated, TTL_CONNECTION)

    return updated