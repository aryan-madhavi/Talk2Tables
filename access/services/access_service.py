# access/services/access_service.py
"""
Business logic for user_db_access collection using MongoDB.

Cache strategy:
    READ  → check Redis first, fallback to MongoDB on miss.
    WRITE → write MongoDB first, then invalidate relevant cache keys.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from auth.core.mongo import get_database
from access.routes.schemas import CreateAccessGrantRequest, UpdateAccessGrantRequest
from core.redis_client import redis_get, redis_set, redis_delete
from core.cache_keys import (
    key_access_pair, key_access_user, key_access_grant,
    TTL_ACCESS_GRANT, TTL_ACCESS_USER_GRANTS,
)

logger = logging.getLogger(__name__)

COLLECTION = "user_db_access"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_expired(grant: dict) -> bool:
    expires_at = grant.get("expires_at")
    if not expires_at:
        return False
    try:
        expiry = datetime.fromisoformat(expires_at)
        return datetime.now(timezone.utc) > expiry
    except ValueError:
        return False


async def _invalidate_access_cache(user_id: str, connection_id: str) -> None:
    """
    Invalidate all cache entries for a (user, connection) pair.
    """
    await redis_delete(
        key_access_pair(user_id, connection_id),
        key_access_user(user_id),
    )
    logger.debug(f"[Cache] Invalidated access keys — user_id={user_id} conn={connection_id}")


# ── Create ────────────────────────────────────────────────────────────────────

async def create_access_grant(body: CreateAccessGrantRequest, granted_by_uid: str) -> dict:
    """
    Grant a user access to a database in MongoDB.
    """
    db        = get_database()
    access_id = str(uuid.uuid4())
    now       = _now_iso()

    # Check for existing active grant
    existing = await db[COLLECTION].find_one({
        "user_id":       body.firebase_uid, # Using body field name but storing as user_id
        "connection_id": body.connection_id,
        "is_active":     True
    })
    
    if existing:
        raise ValueError(
            f"User '{body.firebase_uid}' already has an active grant "
            f"for connection '{body.connection_id}'."
        )

    doc = {
        "_id":            access_id,
        "access_id":      access_id,
        "user_id":        body.firebase_uid,
        "firebase_uid":   body.firebase_uid, # Compatibility
        "connection_id":  body.connection_id,
        "granted_by_uid": granted_by_uid,
        "permission":     body.permission,
        "is_active":      True,
        "granted_at":     now,
        "revoked_at":     None,
        "expires_at":     body.expires_at,
        "note":           body.note,
    }

    await db[COLLECTION].insert_one(doc)
    logger.info(
        f"[Access] Granted | uid={body.firebase_uid} "
        f"connection={body.connection_id} permission={body.permission} by={granted_by_uid}"
    )

    # Invalidate list + pair caches
    await _invalidate_access_cache(body.firebase_uid, body.connection_id)

    return doc


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_grant_by_id(access_id: str) -> Optional[dict]:
    """Fetch single grant from MongoDB."""
    cached = await redis_get(key_access_grant(access_id))
    if cached:
        logger.debug(f"[Cache] HIT access:grant:{access_id}")
        return cached

    db  = get_database()
    doc = await db[COLLECTION].find_one({"_id": access_id})
    if not doc:
        return None

    await redis_set(key_access_grant(access_id), doc, TTL_ACCESS_GRANT)
    return doc


async def list_grants_by_user(user_id: str, active_only: bool = True) -> list[dict]:
    """
    List all DB grants for a user from MongoDB.
    """
    cache_key = key_access_user(user_id)

    cached = await redis_get(cache_key)
    if cached:
        logger.debug(f"[Cache] HIT access:user:{user_id}")
        return [g for g in cached if g.get("is_active")] if active_only else cached

    db    = get_database()
    query = {"user_id": user_id}
    if active_only:
        query["is_active"] = True

    cursor = db[COLLECTION].find(query).sort("granted_at", -1)
    results = [d async for d in cursor]

    await redis_set(cache_key, results, TTL_ACCESS_USER_GRANTS)
    logger.debug(f"[Cache] MISS access:user:{user_id} — cached {len(results)} grants")

    return results


async def list_grants_by_connection(connection_id: str, active_only: bool = True) -> list[dict]:
    """
    List all users who have access to a specific database from MongoDB.
    """
    db    = get_database()
    query = {"connection_id": connection_id}
    if active_only:
        query["is_active"] = True

    cursor = db[COLLECTION].find(query).sort("granted_at", -1)
    results = [d async for d in cursor]
    return results


# ── Update ────────────────────────────────────────────────────────────────────

async def update_access_grant(access_id: str, body: UpdateAccessGrantRequest) -> Optional[dict]:
    """
    Update permission, expiry, or note in MongoDB.
    """
    db  = get_database()
    
    updates: dict = {}
    if body.permission is not None: updates["permission"] = body.permission
    if body.expires_at is not None: updates["expires_at"] = body.expires_at
    if body.note       is not None: updates["note"]       = body.note

    if updates:
        result = await db[COLLECTION].find_one_and_update(
            {"_id": access_id},
            {"$set": updates},
            return_document=True
        )
        if not result:
            return None
        logger.info(f"[Access] Updated | id={access_id} fields={list(updates.keys())}")
        data = result
    else:
        data = await db[COLLECTION].find_one({"_id": access_id})
        if not data:
            return None

    # Invalidate
    await _invalidate_access_cache(data["user_id"], data["connection_id"])
    await redis_delete(key_access_grant(access_id))

    return data


# ── Revoke ────────────────────────────────────────────────────────────────────

async def revoke_access_grant(access_id: str, revoked_by_uid: str) -> Optional[dict]:
    """
    Soft-delete in MongoDB.
    """
    db  = get_database()
    
    result = await db[COLLECTION].find_one_and_update(
        {"_id": access_id},
        {"$set": {"is_active": False, "revoked_at": _now_iso()}},
        return_document=True
    )

    if not result:
        return None

    logger.info(f"[Access] Revoked | id={access_id} by={revoked_by_uid}")

    # CRITICAL: invalidate immediately
    await _invalidate_access_cache(result["user_id"], result["connection_id"])
    await redis_delete(key_access_grant(access_id))

    return result


# ── Verify access — called by query engine before EVERY query ─────────────────

async def verify_access(
    user_id:       str,
    connection_id: str,
    require_write: bool = False,
) -> tuple[bool, str]:
    """
    Check if a user has an active, non-expired grant for a database in MongoDB.
    """
    cache_key = key_access_pair(user_id, connection_id)

    # ── Cache check ───────────────────────────────────────────────────────
    cached = await redis_get(cache_key)
    if cached:
        logger.debug(f"[Cache] HIT verify_access uid={user_id} conn={connection_id}")
        grant = cached

        if not grant.get("is_active", False):
            return False, "revoked"
        if _is_expired(grant):
            return False, "expired"
        if require_write and grant.get("permission") != "write":
            return False, "write_not_permitted"
        return True, "ok"

    # ── MongoDB fallback ────────────────────────────────────────────────
    logger.debug(f"[Cache] MISS verify_access uid={user_id} conn={connection_id}")

    db = get_database()
    grant = await db[COLLECTION].find_one({
        "user_id":       user_id,
        "connection_id": connection_id,
        "is_active":     True
    })

    if grant is None:
        return False, "no_grant"

    # Cache the grant
    await redis_set(cache_key, grant, TTL_ACCESS_GRANT)

    if _is_expired(grant):
        return False, "expired"
    if require_write and grant.get("permission") != "write":
        return False, "write_not_permitted"

    return True, "ok"
