# access/services/access_service.py
"""
Business logic for user_db_access collection.

Handles:
  - Creating access grants (user ↔ database)
  - Listing grants by user or by connection
  - Revoking grants (soft delete — is_active=False)
  - Updating permission read ↔ write
  - verify_access() — called by query engine before EVERY query

Firestore collection: user_db_access/{access_id}
Fields per schema doc:
    access_id, firebase_uid, connection_id, granted_by_uid,
    permission, is_active, granted_at, revoked_at, expires_at, note
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from auth.core.firebase import get_firestore_client
from access.routes.schemas import CreateAccessGrantRequest, UpdateAccessGrantRequest

logger = logging.getLogger(__name__)

COLLECTION = "user_db_access"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_expired(grant: dict) -> bool:
    """Return True if the grant has a non-null expires_at that is in the past."""
    expires_at = grant.get("expires_at")
    if not expires_at:
        return False
    try:
        expiry = datetime.fromisoformat(expires_at)
        return datetime.now(timezone.utc) > expiry
    except ValueError:
        return False


# ── Create ────────────────────────────────────────────────────────────────────

async def create_access_grant(
    body: CreateAccessGrantRequest,
    granted_by_uid: str,
) -> dict:
    """
    Grant a user access to a database.
    Raises ValueError if an active grant already exists for this (user, db) pair.
    """
    db        = get_firestore_client()
    access_id = str(uuid.uuid4())
    now       = _now_iso()

    # Check for duplicate active grant
    from google.cloud.firestore_v1.base_query import FieldFilter
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
        f"connection={body.connection_id} permission={body.permission} "
        f"by={granted_by_uid}"
    )
    return doc


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_grant_by_id(access_id: str) -> Optional[dict]:
    """Fetch a single grant. Returns None if not found."""
    db  = get_firestore_client()
    doc = db.collection(COLLECTION).document(access_id).get()
    if not doc.exists:
        return None
    return doc.to_dict()


async def list_grants_by_user(
    firebase_uid: str,
    active_only: bool = True,
) -> list[dict]:
    """
    List all DB access grants for a specific user.
    Used to show which databases a user can query.
    Composite index required: firebase_uid ASC, is_active ASC
    """
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
    return results


async def list_grants_by_connection(
    connection_id: str,
    active_only: bool = True,
) -> list[dict]:
    """
    List all users who have access to a specific database.
    Used in Admin panel → Connections → "Who has access" view.
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

async def update_access_grant(
    access_id: str,
    body: UpdateAccessGrantRequest,
) -> Optional[dict]:
    """
    Update permission (read ↔ write), expiry, or note.
    Returns updated grant dict or None if not found.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(access_id)

    if not ref.get().exists:
        return None

    updates: dict = {}
    if body.permission is not None: updates["permission"] = body.permission
    if body.expires_at is not None: updates["expires_at"] = body.expires_at
    if body.note       is not None: updates["note"]       = body.note

    if updates:
        ref.update(updates)
        logger.info(f"[Access] Updated | id={access_id} fields={list(updates.keys())}")

    return ref.get().to_dict()


# ── Revoke ────────────────────────────────────────────────────────────────────

async def revoke_access_grant(
    access_id: str,
    revoked_by_uid: str,
) -> Optional[dict]:
    """
    Soft-delete — sets is_active=False and records revoked_at timestamp.
    Keeps the document for audit trail.
    Returns updated grant dict or None if not found.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(access_id)

    if not ref.get().exists:
        return None

    ref.update({
        "is_active":  False,
        "revoked_at": _now_iso(),
    })
    logger.info(f"[Access] Revoked | id={access_id} by={revoked_by_uid}")
    return ref.get().to_dict()


# ── Verify access (called by query engine) ────────────────────────────────────

async def verify_access(
    firebase_uid:  str,
    connection_id: str,
    require_write: bool = False,
) -> tuple[bool, str]:
    """
    Check if a user has an active, non-expired grant for a database.
    Called by the query execution engine before EVERY query.

    Returns:
        (True, "ok")                        — access allowed
        (False, "no_grant")                 — no grant exists
        (False, "revoked")                  — grant revoked
        (False, "expired")                  — grant expired
        (False, "write_not_permitted")      — write requested but only read granted
    """
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

    if not grant.get("is_active", False):
        return False, "revoked"

    if _is_expired(grant):
        return False, "expired"

    if require_write and grant.get("permission") != "write":
        return False, "write_not_permitted"

    return True, "ok"