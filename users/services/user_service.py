# users/services/user_service.py
"""
Business logic for user management.

Cache strategy:
    READ  → check Redis first, fallback to Firestore on miss, populate cache.
    WRITE → write Firestore first, then invalidate relevant cache keys.

Cache keys:
    user:{uid}    — single user dict     TTL: 5 min
    token:{uid}   — auth token cache     invalidated on deactivate / role change / delete
    users:list    — all users list       TTL: 2 min
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import firebase_admin.auth as fb_auth

from auth.core.firebase import get_firestore_client
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
    EXCLUDE: set = set()
    return {k: v for k, v in doc.items() if k not in EXCLUDE}


async def _invalidate_user_cache(uid: str, org_id: str = "") -> None:
    """
    Wipe all cache entries for a user.
    MUST be called after any mutation — role change and deactivate
    are security-critical: stale cache = wrong permissions.

    org_id is used to bust the org-scoped users list cache.
    If not provided, we attempt to read it from the user cache before deleting.
    """
    # Try to recover org_id from the cached user doc before we delete it
    effective_org_id = org_id
    if not effective_org_id:
        cached_user = await redis_get(key_user(uid))
        if cached_user:
            effective_org_id = cached_user.get("org_id", "")

    keys_to_delete = [key_user(uid), key_token(uid)]  # always bust these two
    if effective_org_id:
        keys_to_delete.append(key_users_list(effective_org_id))

    await redis_delete(*keys_to_delete)
    logger.debug(f"[Cache] Invalidated user keys — uid={uid} org={effective_org_id}")


# ── Create ────────────────────────────────────────────────────────────────────

async def create_user(body: CreateUserRequest, created_by_uid: str, org_id: str = "") -> dict:
    """
    Create a new user in Firebase Auth + Firestore.
    Inherits org_id from the creating admin — users are always scoped to an org.
    """
    db = get_firestore_client()

    try:
        fb_user = fb_auth.create_user(
            email=body.email,
            password=body.password,
            display_name=body.display_name or "",
            email_verified=False,
        )
    except fb_auth.EmailAlreadyExistsError:
        raise ValueError(f"Email '{body.email}' is already registered.")

    uid = fb_user.uid
    now = _now_iso()

    doc = {
        "firebase_uid":     uid,
        "email":            body.email,
        "display_name":     body.display_name,
        "photo_url":        None,
        "role":             body.role,
        "is_active":        True,
        "org_id":           org_id,
        "email_verified":   False,
        "sign_in_provider": "password",
        "created_at":       now,
        "last_login_at":    None,
    }

    db.collection(COLLECTION).document(uid).set(doc)
    logger.info(f"[Users] Created | uid={uid} email={body.email} role={body.role} org={org_id} by={created_by_uid}")

    safe = _safe_user(doc)

    # Cache the new user, bust org-scoped list cache
    await redis_set(key_user(uid), safe, TTL_USER)
    await redis_delete(key_users_list(org_id))

    return safe


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_user_by_uid(uid: str) -> Optional[dict]:
    """Flow: Redis → Firestore → populate cache"""
    cached = await redis_get(key_user(uid))
    if cached:
        logger.debug(f"[Cache] HIT user:{uid}")
        return cached

    db  = get_firestore_client()
    doc = db.collection(COLLECTION).document(uid).get()
    if not doc.exists:
        return None

    safe = _safe_user(doc.to_dict())
    await redis_set(key_user(uid), safe, TTL_USER)
    logger.debug(f"[Cache] MISS user:{uid} — cached {TTL_USER}s")
    return safe


async def list_users(org_id: str, active_only: bool = False) -> list[dict]:
    """
    List users belonging to a specific organization.
    Strictly scoped to org_id — never leaks users from other tenants.

    Flow: Redis → Firestore → populate cache.
    Full org list is cached; active filter applied in Python on cache hit.
    """
    from google.cloud.firestore_v1.base_query import FieldFilter

    cached = await redis_get(key_users_list(org_id))
    if cached:
        logger.debug(f"[Cache] HIT users:list:{org_id}")
        return [u for u in cached if u.get("is_active")] if active_only else cached

    db    = get_firestore_client()
    # Always filter by org_id first — tenant boundary enforced at Firestore level
    query = db.collection(COLLECTION).where(filter=FieldFilter("org_id", "==", org_id))

    if active_only:
        query = query.where(filter=FieldFilter("is_active", "==", True))

    docs    = query.stream()
    results = [_safe_user(d.to_dict()) for d in docs]
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    await redis_set(key_users_list(org_id), results, TTL_USERS_LIST)
    logger.debug(f"[Cache] MISS users:list:{org_id} — cached {len(results)} users")
    return results


# ── Update role ───────────────────────────────────────────────────────────────

async def update_user_role(uid: str, new_role: str, changed_by_uid: str) -> Optional[dict]:
    """
    SECURITY: invalidates token cache immediately — the user's next
    request picks up the new role without requiring re-login.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(uid)

    if not ref.get().exists:
        return None

    ref.update({"role": new_role})

    try:
        fb_auth.set_custom_user_claims(uid, {"role": new_role})
    except Exception as e:
        logger.warning(f"[Users] Custom claim sync failed uid={uid}: {e}")

    logger.info(f"[Users] Role updated | uid={uid} new_role={new_role} by={changed_by_uid}")

    safe = _safe_user(ref.get().to_dict())

    # Invalidate first, then re-populate with fresh data
    await _invalidate_user_cache(uid, safe.get("org_id", ""))
    await redis_set(key_user(uid), safe, TTL_USER)

    return safe


# ── Update profile ────────────────────────────────────────────────────────────

async def update_user(uid: str, body: UpdateUserRequest) -> Optional[dict]:
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(uid)

    if not ref.get().exists:
        return None

    updates: dict = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name
        try:
            fb_auth.update_user(uid, display_name=body.display_name)
        except Exception as e:
            logger.warning(f"[Users] display_name Firebase sync failed uid={uid}: {e}")

    if body.is_active is not None:
        updates["is_active"] = body.is_active

    if updates:
        ref.update(updates)
        logger.info(f"[Users] Updated | uid={uid} fields={list(updates.keys())}")

    safe = _safe_user(ref.get().to_dict())

    await _invalidate_user_cache(uid, safe.get("org_id", ""))
    await redis_set(key_user(uid), safe, TTL_USER)

    return safe


# ── Activate / Deactivate ─────────────────────────────────────────────────────

async def set_user_active(uid: str, is_active: bool, changed_by_uid: str) -> Optional[dict]:
    """
    SECURITY: invalidates token cache — a deactivated user is blocked
    immediately on their next request without waiting for token expiry.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(uid)

    if not ref.get().exists:
        return None

    ref.update({"is_active": is_active})

    try:
        fb_auth.update_user(uid, disabled=not is_active)
    except Exception as e:
        logger.warning(f"[Users] Firebase disabled sync failed uid={uid}: {e}")

    action = "Activated" if is_active else "Deactivated"
    logger.info(f"[Users] {action} | uid={uid} by={changed_by_uid}")

    safe = _safe_user(ref.get().to_dict())

    # CRITICAL: bust token cache — deactivated user must be blocked NOW
    await _invalidate_user_cache(uid, safe.get("org_id", ""))
    await redis_set(key_user(uid), safe, TTL_USER)

    return safe


# ── Delete ────────────────────────────────────────────────────────────────────

async def delete_user(uid: str, deleted_by_uid: str) -> bool:
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(uid)

    snap = ref.get()
    if not snap.exists:
        return False

    doc = snap.to_dict()
    org_id = doc.get("org_id", "") if doc else ""

    ref.delete()

    try:
        fb_auth.delete_user(uid)
    except Exception as e:
        logger.warning(f"[Users] Firebase Auth delete failed uid={uid}: {e}")

    logger.info(f"[Users] Hard deleted | uid={uid} by={deleted_by_uid}")

    # Wipe all traces
    await _invalidate_user_cache(uid, org_id)

    return True