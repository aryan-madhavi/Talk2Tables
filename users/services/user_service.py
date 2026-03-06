# users/services/user_service.py
"""
Business logic for user management.

Handles:
  - Creating users in Firebase Auth + Firestore users collection
  - Listing / fetching users from Firestore
  - Updating role, is_active, display_name
  - Deactivating / reactivating users (soft delete)
  - Hard deleting users from Firebase Auth + Firestore (admin only)

Firestore collection: users/{firebase_uid}
Fields per schema doc:
    firebase_uid, email, display_name, photo_url, role,
    is_active, email_verified, sign_in_provider,
    created_at, last_login_at
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

import firebase_admin.auth as fb_auth

from auth.core.firebase import get_firestore_client
from users.routes.schemas import CreateUserRequest, UpdateUserRequest

logger = logging.getLogger(__name__)

COLLECTION = "users"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_user(doc: dict) -> dict:
    """Strip any internal-only fields before returning to caller."""
    EXCLUDE = set()   # nothing to strip for users — all fields are safe
    return {k: v for k, v in doc.items() if k not in EXCLUDE}


# ── Create ────────────────────────────────────────────────────────────────────

async def create_user(
    body: CreateUserRequest,
    created_by_uid: str,
) -> dict:
    """
    1. Create user in Firebase Auth (email + password).
    2. Write user profile doc to Firestore users/{uid}.
    Returns safe user dict.
    Raises ValueError if email already exists.
    """
    db = get_firestore_client()

    # Step 1 — Firebase Auth
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

    # Step 2 — Firestore profile doc
    doc = {
        "firebase_uid":    uid,
        "email":           body.email,
        "display_name":    body.display_name,
        "photo_url":       None,
        "role":            body.role,
        "is_active":       True,
        "email_verified":  False,
        "sign_in_provider": "password",
        "created_at":      now,
        "last_login_at":   None,
    }

    db.collection(COLLECTION).document(uid).set(doc)
    logger.info(
        f"[Users] Created | uid={uid} email={body.email} "
        f"role={body.role} by={created_by_uid}"
    )

    return _safe_user(doc)


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_user_by_uid(uid: str) -> Optional[dict]:
    """Fetch a single user doc. Returns None if not found."""
    db  = get_firestore_client()
    doc = db.collection(COLLECTION).document(uid).get()
    if not doc.exists:
        return None
    return _safe_user(doc.to_dict())


async def list_users(active_only: bool = False) -> list[dict]:
    """
    List all users. Optionally filter to active only.
    Sorted by created_at descending.
    """
    db    = get_firestore_client()
    query = db.collection(COLLECTION)

    if active_only:
        from google.cloud.firestore_v1.base_query import FieldFilter
        query = query.where(filter=FieldFilter("is_active", "==", True))

    docs    = query.stream()
    results = [_safe_user(d.to_dict()) for d in docs]
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results


# ── Update role ───────────────────────────────────────────────────────────────

async def update_user_role(uid: str, new_role: str, changed_by_uid: str) -> Optional[dict]:
    """
    Change a user's RBAC role. Admin only.
    Also updates the Firebase custom claim so the new role
    is reflected in ID tokens after next refresh.
    Returns updated user dict or None if not found.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(uid)

    if not ref.get().exists:
        return None

    # Update Firestore
    ref.update({"role": new_role})

    # Update Firebase custom claims so token reflects new role
    try:
        fb_auth.set_custom_user_claims(uid, {"role": new_role})
    except Exception as e:
        logger.warning(f"[Users] Failed to set custom claim for uid={uid}: {e}")

    logger.info(f"[Users] Role updated | uid={uid} new_role={new_role} by={changed_by_uid}")
    return _safe_user(ref.get().to_dict())


# ── Update profile ─────────────────────────────────────────────────────────────

async def update_user(uid: str, body: UpdateUserRequest) -> Optional[dict]:
    """
    Partial update — display_name and/or is_active.
    Returns updated user dict or None if not found.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(uid)

    if not ref.get().exists:
        return None

    updates: dict = {}
    if body.display_name is not None:
        updates["display_name"] = body.display_name
        # Sync to Firebase Auth profile too
        try:
            fb_auth.update_user(uid, display_name=body.display_name)
        except Exception as e:
            logger.warning(f"[Users] Failed to sync display_name to Firebase Auth: {e}")

    if body.is_active is not None:
        updates["is_active"] = body.is_active

    if updates:
        ref.update(updates)
        logger.info(f"[Users] Updated | uid={uid} fields={list(updates.keys())}")

    return _safe_user(ref.get().to_dict())


# ── Activate / Deactivate ─────────────────────────────────────────────────────

async def set_user_active(uid: str, is_active: bool, changed_by_uid: str) -> Optional[dict]:
    """
    Enable or disable a user account.
    Disabled users receive 403 on all authenticated endpoints.
    Also disables the account in Firebase Auth.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(uid)

    if not ref.get().exists:
        return None

    # Firestore
    ref.update({"is_active": is_active})

    # Firebase Auth — disabled users cannot get new ID tokens
    try:
        fb_auth.update_user(uid, disabled=not is_active)
    except Exception as e:
        logger.warning(f"[Users] Failed to sync disabled state to Firebase Auth: {e}")

    action = "Activated" if is_active else "Deactivated"
    logger.info(f"[Users] {action} | uid={uid} by={changed_by_uid}")
    return _safe_user(ref.get().to_dict())


# ── Delete ────────────────────────────────────────────────────────────────────

async def delete_user(uid: str, deleted_by_uid: str) -> bool:
    """
    Hard delete — removes from Firebase Auth AND Firestore.
    Admin only. Prefer deactivate to preserve audit history.
    Returns True if deleted, False if not found.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(uid)

    if not ref.get().exists:
        return False

    # Delete Firestore doc first
    ref.delete()

    # Then Firebase Auth
    try:
        fb_auth.delete_user(uid)
    except Exception as e:
        logger.warning(f"[Users] Firebase Auth delete failed for uid={uid}: {e}")

    logger.info(f"[Users] Hard deleted | uid={uid} by={deleted_by_uid}")
    return True