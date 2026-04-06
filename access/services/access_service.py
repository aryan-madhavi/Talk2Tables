# access/services/access_service.py
"""
Business logic for user_db_access collection.

Cache strategy:
    READ  → check Redis first, fallback to Firestore on miss.
    WRITE → write Firestore first, then invalidate relevant cache keys.

Cache keys:
    access:{uid}:{conn_id}   — verify_access() result (hottest path)  TTL: 2 min
    access:user:{uid}        — all grants for a user                  TTL: 2 min

Firestore collection: user_db_access/{access_id}
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from auth.core.firebase import get_firestore_client
from access.routes.schemas import CreateAccessGrantRequest, UpdateAccessGrantRequest
from core.redis_client import redis_get, redis_set, redis_delete, redis_delete_pattern
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


async def _invalidate_access_cache(firebase_uid: str, connection_id: str) -> None:
    """
    Invalidate all cache entries for a (user, connection) pair.
    Called after any grant mutation — revoke especially is security-critical.
    """
    await redis_delete(
        key_access_pair(firebase_uid, connection_id),
        key_access_user(firebase_uid),
    )
    logger.debug(f"[Cache] Invalidated access keys — uid={firebase_uid} conn={connection_id}")


# ── Create ────────────────────────────────────────────────────────────────────

async def create_access_grant(body: CreateAccessGrantRequest, granted_by_uid: str, org_id: str = "") -> dict:
    """
    Grant a user access to a database.
    Validates org membership: target user and target connection must both belong to org_id.
    Raises ValueError if an active grant already exists for (user, db).
    Invalidates the user's grant list cache after write.
    """
    db        = get_firestore_client()
    access_id = str(uuid.uuid4())
    now       = _now_iso()

    from google.cloud.firestore_v1.base_query import FieldFilter

    # ── Org boundary validation ──────────────────────────────────────────────
    if org_id:
        # Validate the target user belongs to this org
        target_user_doc = db.collection("users").document(body.firebase_uid).get()
        if not target_user_doc.exists or target_user_doc.to_dict().get("org_id") != org_id:
            raise ValueError(
                f"User '{body.firebase_uid}' does not belong to your organization."
            )
        # Validate the target connection belongs to this org
        target_conn_doc = db.collection("database_connections").document(body.connection_id).get()
        if not target_conn_doc.exists or target_conn_doc.to_dict().get("org_id") != org_id:
            raise ValueError(
                f"Connection '{body.connection_id}' does not belong to your organization."
            )

    existing = (
        db.collection(COLLECTION)
        .where(filter=FieldFilter("firebase_uid",  "==", body.firebase_uid))
        .where(filter=FieldFilter("connection_id", "==", body.connection_id))
        .where(filter=FieldFilter("is_active",     "==", True))
        .limit(1)
        .stream()
    )
    if any(True for _ in existing):
        raise ValueError(
            f"User '{body.firebase_uid}' already has an active grant "
            f"for connection '{body.connection_id}'."
        )

    doc = {
        "access_id":      access_id,
        "firebase_uid":   body.firebase_uid,
        "connection_id":  body.connection_id,
        "granted_by_uid": granted_by_uid,
        "permission":     body.permission,
        "is_active":      True,
        "granted_at":     now,
        "revoked_at":     None,
        "expires_at":     body.expires_at,
        "note":           body.note,
    }

    db.collection(COLLECTION).document(access_id).set(doc)
    logger.info(
        f"[Access] Granted | uid={body.firebase_uid} "
        f"connection={body.connection_id} permission={body.permission} by={granted_by_uid}"
    )

    # Invalidate list + pair caches — new grant exists
    await _invalidate_access_cache(body.firebase_uid, body.connection_id)

    return doc


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_grant_by_id(access_id: str) -> Optional[dict]:
    """Fetch single grant. Cached by access_id. Flow: Redis → Firestore."""
    cached = await redis_get(key_access_grant(access_id))
    if cached:
        logger.debug(f"[Cache] HIT access:grant:{access_id}")
        return cached

    db  = get_firestore_client()
    doc = db.collection(COLLECTION).document(access_id).get()
    if not doc.exists:
        return None

    data = doc.to_dict()
    await redis_set(key_access_grant(access_id), data, TTL_ACCESS_GRANT)
    return data


async def list_grants_by_user(firebase_uid: str, active_only: bool = True) -> list[dict]:
    """
    List all DB grants for a user.
    Flow: Redis → Firestore → populate cache.
    Full list cached; active filter applied in Python on cache hit.
    Composite index required: firebase_uid ASC, is_active ASC
    """
    cache_key = key_access_user(firebase_uid)

    cached = await redis_get(cache_key)
    if cached:
        logger.debug(f"[Cache] HIT access:user:{firebase_uid}")
        return [g for g in cached if g.get("is_active")] if active_only else cached

    from google.cloud.firestore_v1.base_query import FieldFilter
    db    = get_firestore_client()
    query = db.collection(COLLECTION).where(
        filter=FieldFilter("firebase_uid", "==", firebase_uid)
    )
    if active_only:
        query = query.where(filter=FieldFilter("is_active", "==", True))

    docs    = query.stream()
    results = [d.to_dict() for d in docs]
    results.sort(key=lambda x: x.get("granted_at", ""), reverse=True)

    await redis_set(cache_key, results, TTL_ACCESS_USER_GRANTS)
    logger.debug(f"[Cache] MISS access:user:{firebase_uid} — cached {len(results)} grants")

    return results


async def list_grants_by_connection(connection_id: str, active_only: bool = True) -> list[dict]:
    """
    List all users who have access to a specific database.
    Not cached — admin-only view, low traffic.
    Composite index required: connection_id ASC, is_active ASC
    """
    from google.cloud.firestore_v1.base_query import FieldFilter
    db    = get_firestore_client()
    query = db.collection(COLLECTION).where(
        filter=FieldFilter("connection_id", "==", connection_id)
    )
    if active_only:
        query = query.where(filter=FieldFilter("is_active", "==", True))

    docs    = query.stream()
    results = [d.to_dict() for d in docs]
    results.sort(key=lambda x: x.get("granted_at", ""), reverse=True)
    return results


# ── Update ────────────────────────────────────────────────────────────────────

async def update_access_grant(access_id: str, body: UpdateAccessGrantRequest) -> Optional[dict]:
    """
    Update permission, expiry, or note.
    Invalidates pair + user list caches after write.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(access_id)

    existing = ref.get()
    if not existing.exists:
        return None

    updates: dict = {}
    if body.permission is not None: updates["permission"] = body.permission
    if body.expires_at is not None: updates["expires_at"] = body.expires_at
    if body.note       is not None: updates["note"]       = body.note

    if updates:
        ref.update(updates)
        logger.info(f"[Access] Updated | id={access_id} fields={list(updates.keys())}")

    data = ref.get().to_dict()

    # Invalidate — permission or expiry changed
    await _invalidate_access_cache(data["firebase_uid"], data["connection_id"])
    await redis_delete(key_access_grant(access_id))

    return data


# ── Revoke ────────────────────────────────────────────────────────────────────

async def revoke_access_grant(access_id: str, revoked_by_uid: str) -> Optional[dict]:
    """
    Soft-delete — sets is_active=False, records revoked_at.
    SECURITY: cache is invalidated immediately so the user is blocked
    on their very next query attempt — no TTL delay.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(access_id)

    existing = ref.get()
    if not existing.exists:
        return None

    # Read uid + conn_id BEFORE updating (needed for cache invalidation)
    old_data = existing.to_dict()

    ref.update({
        "is_active":  False,
        "revoked_at": _now_iso(),
    })
    logger.info(f"[Access] Revoked | id={access_id} by={revoked_by_uid}")

    data = ref.get().to_dict()

    # CRITICAL: invalidate immediately — revoked user must be blocked NOW
    await _invalidate_access_cache(old_data["firebase_uid"], old_data["connection_id"])
    await redis_delete(key_access_grant(access_id))

    return data


# ── Verify access — called by query engine before EVERY query ─────────────────

async def verify_access(
    firebase_uid:  str,
    connection_id: str,
    require_write: bool = False,
) -> tuple[bool, str]:
    """
    Check if a user has an active, non-expired grant for a database.
    This is the HOTTEST code path — called before every single query.

    Cache: result cached under access:{uid}:{conn_id} for 2 min.
    Revoke invalidates this key immediately (see revoke_access_grant).

    Returns:
        (True,  "ok")                   — access allowed
        (False, "no_grant")             — no grant exists
        (False, "revoked")              — grant is inactive
        (False, "expired")              — grant has passed expiry date
        (False, "write_not_permitted")  — write needed but only read granted
    """
    cache_key = key_access_pair(firebase_uid, connection_id)

    # ── Cache check ───────────────────────────────────────────────────────
    cached = await redis_get(cache_key)
    if cached:
        logger.debug(f"[Cache] HIT verify_access uid={firebase_uid} conn={connection_id}")
        grant = cached

        if not grant.get("is_active", False):
            return False, "revoked"
        if _is_expired(grant):
            return False, "expired"
        if require_write and grant.get("permission") != "write":
            return False, "write_not_permitted"
        return True, "ok"

    # ── Firestore fallback ────────────────────────────────────────────────
    logger.debug(f"[Cache] MISS verify_access uid={firebase_uid} conn={connection_id}")

    from google.cloud.firestore_v1.base_query import FieldFilter
    db = get_firestore_client()

    results = (
        db.collection(COLLECTION)
        .where(filter=FieldFilter("firebase_uid",  "==", firebase_uid))
        .where(filter=FieldFilter("connection_id", "==", connection_id))
        .limit(1)
        .stream()
    )

    grant_doc = next(results, None)

    if grant_doc is None:
        return False, "no_grant"

    grant = grant_doc.to_dict()

    # Cache the grant (even if revoked/expired — so repeat calls are fast)
    await redis_set(cache_key, grant, TTL_ACCESS_GRANT)

    if not grant.get("is_active", False):
        return False, "revoked"
    if _is_expired(grant):
        return False, "expired"
    if require_write and grant.get("permission") != "write":
        return False, "write_not_permitted"

    return True, "ok"