# users/services/user_service.py
"""
Business logic for user management using MongoDB.

Cache strategy:
    READ  → check Redis first, fallback to MongoDB on miss, populate cache.
    WRITE → write MongoDB first, then invalidate relevant cache keys.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from auth.core.mongo import get_database
from auth.core.security import get_password_hash
from users.routes.schemas import CreateUserRequest, UpdateUserRequest
from core.redis_client import redis_get, redis_set, redis_delete
from core.cache_keys import (
    key_user, key_users_list, key_token,
    TTL_USER, TTL_USERS_LIST,
)

logger = logging.getLogger(__name__)

COLLECTION = "users"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_user(doc: dict) -> dict:
    if not doc: return {}
    if "_id" in doc: doc["id"] = str(doc.pop("_id"))
    EXCLUDE: set = {"password_hash"}
    return {k: v for k, v in doc.items() if k not in EXCLUDE}


async def _invalidate_user_cache(user_id: str) -> None:
    """
    Wipe all cache entries for a user.
    """
    await redis_delete(
        key_user(user_id),
        key_token(user_id),
        key_users_list(),
    )
    logger.debug(f"[Cache] Invalidated user keys — user_id={user_id}")


# ── Create ────────────────────────────────────────────────────────────────────

async def create_user(body: CreateUserRequest, created_by_uid: str) -> dict:
    db = get_database()

    # Check for existing email
    existing = await db[COLLECTION].find_one({"email": body.email})
    if existing:
        raise ValueError(f"Email '{body.email}' is already registered.")

    user_id = str(uuid.uuid4())
    now     = _now_iso()

    doc = {
        "_id":              user_id,
        "firebase_uid":     user_id, # Compatibility
        "email":            body.email,
        "password_hash":    get_password_hash(body.password),
        "display_name":     body.display_name,
        "photo_url":        None,
        "role":             body.role,
        "is_active":        True,
        "email_verified":   False,
        "sign_in_provider": "password",
        "created_at":       now,
        "last_login_at":    None,
    }

    await db[COLLECTION].insert_one(doc)
    logger.info(f"[Users] Created | user_id={user_id} email={body.email} role={body.role} by={created_by_uid}")

    safe = _safe_user(doc)

    # Cache the new user, bust list cache
    await redis_set(key_user(user_id), safe, TTL_USER)
    await redis_delete(key_users_list())

    return safe


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_user_by_uid(user_id: str) -> Optional[dict]:
    """Flow: Redis → MongoDB → populate cache"""
    cached = await redis_get(key_user(user_id))
    if cached:
        logger.debug(f"[Cache] HIT user:{user_id}")
        return cached

    db  = get_database()
    doc = await db[COLLECTION].find_one({"_id": user_id})
    if not doc:
        return None

    safe = _safe_user(doc)
    await redis_set(key_user(user_id), safe, TTL_USER)
    logger.debug(f"[Cache] MISS user:{user_id} — cached {TTL_USER}s")
    return safe


async def list_users(active_only: bool = False) -> list[dict]:
    """
    Flow: Redis → MongoDB → populate cache.
    """
    cached = await redis_get(key_users_list())
    if cached:
        logger.debug("[Cache] HIT users:list")
        return [u for u in cached if u.get("is_active")] if active_only else cached

    db    = get_database()
    query = {}
    if active_only:
        query["is_active"] = True

    cursor  = db[COLLECTION].find(query).sort("created_at", -1)
    results = [_safe_user(d) async for d in cursor]

    await redis_set(key_users_list(), results, TTL_USERS_LIST)
    logger.debug(f"[Cache] MISS users:list — cached {len(results)} users")
    return results


# ── Update role ───────────────────────────────────────────────────────────────

async def update_user_role(user_id: str, new_role: str, changed_by_uid: str) -> Optional[dict]:
    """
    SECURITY: invalidates token cache immediately.
    """
    db  = get_database()
    
    result = await db[COLLECTION].find_one_and_update(
        {"_id": user_id},
        {"$set": {"role": new_role}},
        return_document=True
    )

    if not result:
        return None

    logger.info(f"[Users] Role updated | user_id={user_id} new_role={new_role} by={changed_by_uid}")

    safe = _safe_user(result)

    # Invalidate first, then re-populate with fresh data
    await _invalidate_user_cache(user_id)
    await redis_set(key_user(user_id), safe, TTL_USER)

    return safe


# ── Update profile ────────────────────────────────────────────────────────────

async def update_user(user_id: str, body: UpdateUserRequest) -> Optional[dict]:
    db  = get_database()
    
    updates: dict = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name

    if body.is_active is not None:
        updates["is_active"] = body.is_active

    if updates:
        result = await db[COLLECTION].find_one_and_update(
            {"_id": user_id},
            {"$set": updates},
            return_document=True
        )
        if not result:
            return None
        logger.info(f"[Users] Updated | user_id={user_id} fields={list(updates.keys())}")
        safe = _safe_user(result)
    else:
        doc = await db[COLLECTION].find_one({"_id": user_id})
        if not doc:
            return None
        safe = _safe_user(doc)

    await _invalidate_user_cache(user_id)
    await redis_set(key_user(user_id), safe, TTL_USER)

    return safe


# ── Activate / Deactivate ─────────────────────────────────────────────────────

async def set_user_active(user_id: str, is_active: bool, changed_by_uid: str) -> Optional[dict]:
    """
    SECURITY: invalidates token cache.
    """
    db  = get_database()
    
    result = await db[COLLECTION].find_one_and_update(
        {"_id": user_id},
        {"$set": {"is_active": is_active}},
        return_document=True
    )

    if not result:
        return None

    action = "Activated" if is_active else "Deactivated"
    logger.info(f"[Users] {action} | user_id={user_id} by={changed_by_uid}")

    safe = _safe_user(result)

    # CRITICAL: bust token cache
    await _invalidate_user_cache(user_id)
    await redis_set(key_user(user_id), safe, TTL_USER)

    return safe


# ── Delete ────────────────────────────────────────────────────────────────────

async def delete_user(user_id: str, deleted_by_uid: str) -> bool:
    db  = get_database()
    
    result = await db[COLLECTION].delete_one({"_id": user_id})

    if result.deleted_count == 0:
        return False

    logger.info(f"[Users] Hard deleted | user_id={user_id} by={deleted_by_uid}")

    # Wipe all traces
    await _invalidate_user_cache(user_id)

    return True
