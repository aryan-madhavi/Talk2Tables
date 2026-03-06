# auth/services/auth_service.py
"""
Auth business logic — Firebase Service Account + Firestore, no PostgreSQL.

All user and session data lives in Firestore:
  users/{firebase_uid}                 — profile + role + is_active
  users/{firebase_uid}/sessions/{id}   — per-login session metadata

Token authority:
  • verify_id_token()      — Firebase Admin SDK validates RS256 signature
  • create_custom_token()  — Service Account private key signs the token
  • revoke_refresh_tokens() — Service Account admin op

No SQLAlchemy, no asyncpg, no migrations.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from auth.core.config import settings
from auth.core.firebase import (
    verify_id_token,
    create_custom_token,
    revoke_refresh_tokens,
    fs_get_user,
    fs_upsert_user,
    fs_create_session,
    fs_get_latest_active_session,
    fs_get_active_sessions,
    fs_touch_session,
    fs_revoke_session,
    fs_revoke_all_sessions,
)

logger = logging.getLogger(__name__)


# ── Login ─────────────────────────────────────────────────────────────────────

async def login(
    id_token:    str,
    device_info: Optional[str] = None,
    ip_address:  Optional[str] = None,
) -> dict:
    """
    Verify Firebase ID token → upsert user in Firestore →
    create Service-Account-signed custom token → persist session.

    Steps:
      1. verify_id_token()     — Admin SDK validates the client's token
      2. fs_upsert_user()      — create/sync user doc in Firestore
      3. create_custom_token() — Service Account signs a token with role claim
      4. fs_create_session()   — persist session metadata in Firestore
      5. return custom_token + user + session_id

    Returns:
        {
            "custom_token": str,    # client calls signInWithCustomToken(token)
            "session_id":   str,    # Firestore session document ID
            "user":         dict,   # user profile from Firestore
        }
    """
    # ── Step 1: Verify the Firebase ID token ──────────────────────────────
    try:
        claims = verify_id_token(id_token, check_revoked=True)
    except ValueError as exc:
        raise ValueError(str(exc))

    firebase_uid     = claims["uid"]
    email            = claims.get("email", "")
    display_name     = claims.get("name") or claims.get("display_name", "")
    photo_url        = claims.get("picture", "")
    email_verified   = claims.get("email_verified", False)
    sign_in_provider = claims.get("firebase", {}).get("sign_in_provider", "unknown")

    token_exp  = claims.get("exp")
    expires_at = (
        datetime.fromtimestamp(token_exp, tz=timezone.utc)
        if token_exp
        else datetime.now(timezone.utc) + timedelta(seconds=settings.session_expiry_seconds)
    )

    logger.info(f"[AuthService] Login | uid={firebase_uid} email={email} provider={sign_in_provider}")

    # ── Step 2: Upsert user in Firestore ──────────────────────────────────
    user = fs_upsert_user(
        firebase_uid     = firebase_uid,
        email            = email,
        display_name     = display_name,
        photo_url        = photo_url,
        email_verified   = email_verified,
        sign_in_provider = sign_in_provider,
    )

    if not user.get("is_active", True):
        raise ValueError("Account deactivated. Contact an administrator.")

    # ── Step 3: Create custom token — signed by Service Account ───────────
    # Role + db_user_id travel inside every subsequent Firebase ID token
    custom_token = create_custom_token(
        uid               = firebase_uid,
        additional_claims = {
            "role":       user["role"],
            "db_user_id": firebase_uid,   # Firestore doc ID = firebase_uid
        },
    )

    # ── Step 4: Persist session in Firestore ──────────────────────────────
    session = fs_create_session(
        firebase_uid = firebase_uid,
        device_info  = device_info or "",
        ip_address   = ip_address  or "",
        expires_at   = expires_at,
    )

    logger.info(
        f"[AuthService] Login OK | uid={firebase_uid} "
        f"role={user['role']} session={session['session_id']}"
    )
    return {
        "custom_token": custom_token,
        "session_id":   session["session_id"],
        "user":         user,
    }


# ── Token active check ────────────────────────────────────────────────────────

async def check_token_active(id_token: str) -> dict:
    """
    Check whether a Firebase ID token is valid AND our Firestore session
    is not revoked.

    check_revoked=False so we can distinguish "expired" from "revoked".

    Returns:
        { active, uid, email, role, db_user_id, expires_at, session_id, reason? }
    """
    try:
        claims = verify_id_token(id_token, check_revoked=False)
    except ValueError as exc:
        return {"active": False, "reason": str(exc)}

    firebase_uid = claims["uid"]
    email        = claims.get("email", "")
    token_exp    = claims.get("exp", 0)
    expires_at   = datetime.fromtimestamp(token_exp, tz=timezone.utc)

    if expires_at < datetime.now(timezone.utc):
        return {
            "active":     False,
            "uid":        firebase_uid,
            "email":      email,
            "expires_at": expires_at.isoformat(),
            "reason":     "Token expired.",
        }

    # Fetch user from Firestore
    user = fs_get_user(firebase_uid)
    if not user:
        return {"active": False, "uid": firebase_uid, "reason": "User not found in Firestore."}
    if not user.get("is_active", True):
        return {"active": False, "uid": firebase_uid, "reason": "Account deactivated."}

    # Check for active session in Firestore
    session = fs_get_latest_active_session(firebase_uid)
    if not session:
        return {
            "active": False,
            "uid":    firebase_uid,
            "email":  email,
            "reason": "No active session. Please log in again.",
        }

    # Touch last_seen_at
    fs_touch_session(firebase_uid, session["session_id"])

    return {
        "active":      True,
        "uid":         firebase_uid,
        "email":       email,
        "role":        user["role"],   # authoritative from Firestore
        "db_user_id":  firebase_uid,
        "expires_at":  expires_at.isoformat(),
        "session_id":  session["session_id"],
    }


# ── Logout ────────────────────────────────────────────────────────────────────

async def logout(
    firebase_uid: str,
    session_id:   Optional[str],
) -> None:
    """
    Revoke a specific Firestore session (or all if session_id is None),
    then revoke Firebase refresh tokens so the Firebase SDK is signed out too.
    """
    if session_id:
        fs_revoke_session(firebase_uid, session_id)
    else:
        fs_revoke_all_sessions(firebase_uid)

    revoke_refresh_tokens(firebase_uid)


async def logout_all(firebase_uid: str) -> int:
    """Revoke all Firestore sessions + Firebase tokens. Returns revoked count."""
    count = fs_revoke_all_sessions(firebase_uid)
    revoke_refresh_tokens(firebase_uid)
    logger.info(f"[AuthService] Logout-all | uid={firebase_uid} revoked={count}")
    return count


# ── User lookup (used by dependencies.py) ────────────────────────────────────

async def get_user_by_firebase_uid(firebase_uid: str) -> Optional[dict]:
    """Fetch user dict from Firestore. Returns None if not found."""
    return fs_get_user(firebase_uid)


async def get_all_sessions(firebase_uid: str) -> list[dict]:
    """Return all active (non-revoked) sessions for a user."""
    return fs_get_active_sessions(firebase_uid)