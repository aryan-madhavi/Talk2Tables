# auth/core/firebase.py
"""
Firebase Service Account — sole token authority AND Firestore client.

Why Service Account?
────────────────────
The firebase-credentials.json IS your Service Account.  It contains:
  • private_key   — used by create_custom_token() to RSA-sign custom tokens
  • client_email  — the service account identity Firebase trusts
  • project_id    — scopes the Admin SDK to your project

Without the Service Account (credentials file), you CANNOT:
  ✗ create_custom_token()   — needs private key to sign
  ✗ verify_id_token()       — needs project binding to validate audience
  ✗ revoke_refresh_tokens() — needs admin privilege
  ✗ read/write Firestore    — needs service account identity

Token flow (pure Firebase Service Account, no custom JWT):
──────────────────────────────────────────────────────────
1. Client  →  Firebase Auth SDK  →  signInWithEmailAndPassword()
              Firebase returns a Firebase ID Token  (RS256, signed by Firebase)

2. Client  →  POST /api/v1/auth/login  { firebase_id_token: "..." }

3. Server  →  firebase_auth.verify_id_token(id_token)
              Admin SDK validates signature using Firebase's public keys.
              Returns decoded claims (uid, email, email_verified, …)

4. Server  →  firebase_auth.create_custom_token(uid, additional_claims)
              Service Account PRIVATE KEY signs a new custom token.
              We embed { role, db_user_id } in additional_claims.
              ← This step REQUIRES the Service Account credentials file.

5. Client  →  firebase.auth().signInWithCustomToken(custom_token)
              Exchanges custom token for a fresh Firebase ID token.
              The new ID token carries our role claim inside it.

6. Subsequent API calls:
   Client  →  Authorization: Bearer <fresh_firebase_id_token>
   Server  →  verify_id_token()  →  uid + role from claims
              + Firestore lookup for is_active, authoritative role

Firestore collections (managed by this service):
  users/{firebase_uid}
      email, display_name, photo_url, role, is_active,
      created_at, last_login_at, sign_in_provider

  users/{firebase_uid}/sessions/{session_id}
      device_info, ip_address, is_revoked,
      created_at, last_seen_at, expires_at
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Optional

import firebase_admin
from firebase_admin import auth as firebase_auth, credentials, firestore

from auth.core.config import settings

logger = logging.getLogger(__name__)


# ── SDK + Firestore initialisation ────────────────────────────────────────────

@lru_cache()
def get_firebase_app() -> firebase_admin.App:
    """
    Initialise Firebase Admin SDK exactly once per process using the
    Service Account credentials.  lru_cache = singleton.

    Requires `FIREBASE_CREDENTIALS_JSON` env var — the full service-account
    JSON as a single-line string (set in Railway / Docker / local .env).

    The Service Account credentials give us:
      • Token signing authority  (create_custom_token)
      • Token verification       (verify_id_token)
      • Firestore read/write     (get_firestore_client)
      • Firebase Auth admin ops  (revoke_refresh_tokens, get_user, etc.)
    """
    if firebase_admin._apps:
        return firebase_admin.get_app()

    if not settings.firebase_credentials_json:
        raise RuntimeError(
            "FIREBASE_CREDENTIALS_JSON is not set. "
            "Paste the full service-account JSON as a single-line string in your environment variables."
        )
    cred_dict = json.loads(settings.firebase_credentials_json)
    cred = credentials.Certificate(cred_dict)
    
    project_id = settings.firebase_project_id or cred_dict.get("project_id")
    logger.info(f"[Firebase] Admin SDK: credentials loaded. Project ID: {project_id}")

    init_opts = {"projectId": project_id}
    # Auto-derive Storage bucket from project ID (standard Firebase convention)
    if project_id:
        init_opts["storageBucket"] = f"{project_id}.firebasestorage.app"

    app = firebase_admin.initialize_app(cred, init_opts)
    logger.info(f"[Firebase] Admin SDK + Service Account ready | project={project_id}")
    return app


def get_firestore_client():
    """
    Return the Firestore client bound to our Firebase project.
    Initialises the Admin SDK if not already done.

    The client is authenticated as the Service Account — it has full
    read/write access to all Firestore collections (bypasses security rules).

    Usage:
        db = get_firestore_client()
        doc = db.collection("users").document(uid).get()
    """
    get_firebase_app()
    return firestore.client()


# ── Token verification ────────────────────────────────────────────────────────

def verify_id_token(id_token: str, check_revoked: bool = True) -> dict:
    """
    Verify a Firebase ID token sent by the client.

    The Admin SDK fetches Firebase's public keys on first call and caches them,
    so subsequent calls are effectively 0ms network overhead.

    Args:
        id_token:      Firebase ID token from Authorization: Bearer header.
        check_revoked: If True, immediately rejects tokens whose refresh tokens
                       were revoked via revoke_refresh_tokens().
                       Set False only for /token-active polling to separate
                       "expired" from "revoked" errors.

    Returns:
        Decoded claims dict including:
            uid              — stable Firebase user ID
            email            — user email
            email_verified   — bool
            name             — display name (if set)
            picture          — avatar URL (if set)
            role             — our RBAC role (if token came from custom token exchange)
            firebase.sign_in_provider — "password" | "google.com" | etc.

    Raises:
        ValueError with a human-readable message on any failure.
    """
    get_firebase_app()
    try:
        decoded = firebase_auth.verify_id_token(id_token, check_revoked=check_revoked)
        logger.debug(f"[Firebase] Token verified | uid={decoded.get('uid')}")
        return decoded
    except firebase_auth.RevokedIdTokenError:
        raise ValueError("Firebase session revoked. Please sign in again.")
    except firebase_auth.ExpiredIdTokenError:
        raise ValueError("Firebase token expired. Please sign in again.")
    except firebase_auth.InvalidIdTokenError as exc:
        raise ValueError(f"Invalid Firebase token: {exc}")
    except firebase_auth.UserDisabledError:
        raise ValueError("Firebase account disabled.")
    except Exception as exc:
        raise ValueError(f"Token verification failed: {exc}")


# ── Custom token creation ─────────────────────────────────────────────────────

def create_custom_token(uid: str, additional_claims: Optional[dict] = None) -> str:
    """
    Create a Firebase custom token signed by the Service Account private key.

    THIS IS WHY WE NEED THE SERVICE ACCOUNT:
    The private_key in firebase-credentials.json is used here to RSA-sign
    a JWT that Firebase's token exchange endpoint will accept.  Without the
    Service Account you cannot create custom tokens at all.

    Client flow after receiving this token:
        const { user } = await signInWithCustomToken(auth, custom_token)
        const freshIdToken = await user.getIdToken()
        // freshIdToken now contains our role claim — use for all API calls

    Args:
        uid:               Firebase user UID.
        additional_claims: Extra claims embedded in the token.
                           We use {"role": "analyst", "db_user_id": "..."}.
                           Max 1000 bytes total.

    Returns:
        Custom token string (decoded from bytes for JSON serialisation).
    """
    get_firebase_app()
    try:
        token_bytes = firebase_auth.create_custom_token(
            uid,
            developer_claims=additional_claims or {},
        )
        custom_token = token_bytes.decode("utf-8") if isinstance(token_bytes, bytes) else token_bytes
        logger.info(f"[Firebase] Custom token created | uid={uid} claims={additional_claims}")
        return custom_token
    except Exception as exc:
        raise ValueError(f"Custom token creation failed: {exc}")


# ── Token revocation ──────────────────────────────────────────────────────────

def revoke_refresh_tokens(uid: str) -> None:
    """
    Revoke all Firebase refresh tokens for this user (Service Account privilege).

    Effect:
      - Existing ID tokens stay technically valid for up to 1 hour
        BUT verify_id_token(check_revoked=True) will reject them immediately.
      - User must sign in again to obtain new tokens.

    Called on: logout, logout-all, account deactivation, password reset.
    """
    get_firebase_app()
    try:
        firebase_auth.revoke_refresh_tokens(uid)
        logger.info(f"[Firebase] Refresh tokens revoked | uid={uid}")
    except Exception as exc:
        logger.warning(f"[Firebase] Token revocation warning (non-fatal): {exc}")


# ── Firebase Auth user fetch ──────────────────────────────────────────────────

def get_firebase_user(uid: str) -> dict:
    """
    Fetch Firebase Auth user record by UID (Service Account privilege).
    Used to sync profile data that isn't in the ID token claims.
    """
    get_firebase_app()
    try:
        user = firebase_auth.get_user(uid)
        return {
            "uid":            user.uid,
            "email":          user.email,
            "display_name":   user.display_name,
            "photo_url":      user.photo_url,
            "email_verified": user.email_verified,
            "disabled":       user.disabled,
            "provider_data": [
                {"provider_id": p.provider_id, "email": p.email}
                for p in (user.provider_data or [])
            ],
        }
    except firebase_auth.UserNotFoundError:
        raise ValueError(f"Firebase user not found: {uid}")
    except Exception as exc:
        raise ValueError(f"Firebase user fetch failed: {exc}")


# ── Firestore helpers — users collection ─────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def fs_get_user(firebase_uid: str) -> Optional[dict]:
    """
    Fetch a user document from Firestore.
    Returns the document data dict or None if not found.
    """
    db = get_firestore_client()
    doc = db.collection(settings.firestore_users_collection).document(firebase_uid).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["id"] = doc.id   # document ID = firebase_uid
    return data


def fs_upsert_user(
    firebase_uid: str,
    email: str,
    display_name: str,
    photo_url: str,
    email_verified: bool,
    sign_in_provider: str,
) -> dict:
    """
    Create or update a user document in Firestore.
    Role is NEVER changed here — only set to 'analyst' on first creation.
    Returns the final user document dict.
    """
    db  = get_firestore_client()
    ref = db.collection(settings.firestore_users_collection).document(firebase_uid)
    doc = ref.get()

    now = _now_iso()

    if not doc.exists:
        # First login — create document with default role
        # Auto-create an organization since they signed up via SSO directly
        org_id = str(uuid.uuid4())
        db.collection("organizations").document(org_id).set({
            "org_id": org_id,
            "name": f"{display_name or email.split('@')[0]}'s Organization",
            "created_by": firebase_uid,
            "created_at": now
        })
        user_data = {
            "firebase_uid":     firebase_uid,
            "email":            email,
            "display_name":     display_name or email.split("@")[0],
            "photo_url":        photo_url or "",
            "email_verified":   email_verified,
            "sign_in_provider": sign_in_provider,
            "role":             "analyst",  # default RBAC role — change via admin panel
            "is_active":        True,
            "org_id":           org_id,
            "created_at":       now,
            "last_login_at":    now,
        }
        ref.set(user_data)
        logger.info(f"[Firestore] New user created | uid={firebase_uid} email={email}")
    else:
        # Repeat login — sync mutable profile fields, never touch role
        ref.update({
            "email":          email,
            "display_name":   display_name or doc.to_dict().get("display_name", ""),
            "photo_url":      photo_url    or doc.to_dict().get("photo_url", ""),
            "email_verified": email_verified,
            "last_login_at":  now,
        })
        user_data = ref.get().to_dict()
        logger.debug(f"[Firestore] User profile synced | uid={firebase_uid}")

    user_data["id"] = firebase_uid
    return user_data


# ── Firestore helpers — sessions sub-collection ───────────────────────────────

def fs_create_session(
    firebase_uid: str,
    device_info:  str,
    ip_address:   str,
    expires_at:   datetime,
) -> dict:
    """
    Create a new session document under users/{uid}/sessions/{session_id}.
    Returns the session dict including the generated session_id.
    """
    db  = get_firestore_client()
    session_id = str(uuid.uuid4())
    now = _now_iso()

    session_data = {
        "session_id":   session_id,
        "firebase_uid": firebase_uid,
        "device_info":  device_info[:512],
        "ip_address":   ip_address[:45],
        "is_revoked":   False,
        "created_at":   now,
        "last_seen_at": now,
        "expires_at":   expires_at.isoformat(),
    }

    (
        db.collection(settings.firestore_users_collection)
          .document(firebase_uid)
          .collection(settings.firestore_sessions_collection)
          .document(session_id)
          .set(session_data)
    )
    logger.info(f"[Firestore] Session created | uid={firebase_uid} session={session_id}")
    return session_data


def fs_get_active_sessions(firebase_uid: str) -> list[dict]:
    """
    Return all non-revoked sessions for this user, sorted newest first.

    NOTE: We filter only on is_revoked (single-field, no composite index needed)
    and sort in Python. Firestore requires a composite index if you both
    .where() on one field and .order_by() on a different field — avoiding
    that requirement keeps setup zero-config.
    """
    db = get_firestore_client()
    docs = (
        db.collection(settings.firestore_users_collection)
          .document(firebase_uid)
          .collection(settings.firestore_sessions_collection)
          .where(filter=firestore.FieldFilter("is_revoked", "==", False))
          .stream()
    )
    now = _now_iso()
    sessions = [
        d.to_dict() for d in docs
        # Drop expired sessions in Python — avoids a Firestore composite index
        if d.to_dict().get("expires_at", "9999") > now
    ]
    # Sort newest first in Python — no composite index required
    sessions.sort(key=lambda s: s.get("created_at", ""), reverse=True)
    return sessions


def fs_get_latest_active_session(firebase_uid: str) -> Optional[dict]:
    """Return the most recent non-revoked session, or None."""
    sessions = fs_get_active_sessions(firebase_uid)
    return sessions[0] if sessions else None


def fs_touch_session(firebase_uid: str, session_id: str) -> None:
    """Update last_seen_at on a session (heartbeat / token-active check)."""
    db = get_firestore_client()
    (
        db.collection(settings.firestore_users_collection)
          .document(firebase_uid)
          .collection(settings.firestore_sessions_collection)
          .document(session_id)
          .update({"last_seen_at": _now_iso()})
    )


def fs_revoke_session(firebase_uid: str, session_id: str) -> bool:
    """
    Mark a specific session as revoked.
    Returns True if the document existed, False if not found.
    """
    db  = get_firestore_client()
    ref = (
        db.collection(settings.firestore_users_collection)
          .document(firebase_uid)
          .collection(settings.firestore_sessions_collection)
          .document(session_id)
    )
    doc = ref.get()
    if not doc.exists:
        return False
    ref.update({"is_revoked": True})
    logger.info(f"[Firestore] Session revoked | uid={firebase_uid} session={session_id}")
    return True


def fs_update_user_display_name(firebase_uid: str, display_name: str) -> dict:
    """
    Update display_name in the Firestore user doc and sync to Firebase Auth.
    Returns the updated user document dict.
    """
    db  = get_firestore_client()
    ref = db.collection(settings.firestore_users_collection).document(firebase_uid)
    ref.update({"display_name": display_name, "updated_at": _now_iso()})

    # Best-effort sync to Firebase Auth profile (non-fatal if it fails)
    try:
        firebase_auth.update_user(firebase_uid, display_name=display_name)
    except Exception as exc:
        logger.warning(f"[Firebase] display_name sync to Auth warning (non-fatal): {exc}")

    data = ref.get().to_dict()
    data["id"] = firebase_uid
    logger.info(f"[Firestore] display_name updated | uid={firebase_uid}")
    return data


def fs_revoke_all_sessions(firebase_uid: str) -> int:
    """
    Mark ALL active sessions as revoked.
    Returns the count of sessions revoked.
    """
    db       = get_firestore_client()
    sessions = fs_get_active_sessions(firebase_uid)
    base_ref = (
        db.collection(settings.firestore_users_collection)
          .document(firebase_uid)
          .collection(settings.firestore_sessions_collection)
    )
    batch = db.batch()
    for s in sessions:
        ref = base_ref.document(s["session_id"])
        batch.update(ref, {"is_revoked": True})
    batch.commit()
    logger.info(f"[Firestore] All sessions revoked | uid={firebase_uid} count={len(sessions)}")
    return len(sessions)

def fs_create_organization(created_by_uid: str, name: str) -> dict:
    """Creates a new Organization document."""
    db = get_firestore_client()
    org_id = str(uuid.uuid4())
    org_data = {
        "org_id": org_id,
        "name": name,
        "created_by": created_by_uid,
        "created_at": _now_iso()
    }
    db.collection("organizations").document(org_id).set(org_data)
    logger.info(f"[Firestore] Organization created | org_id={org_id} name='{name}'")
    return org_data

def fs_create_admin_user(
    firebase_uid:     str,
    email:            str,
    display_name:     str,
    photo_url:        str,
    email_verified:   bool,
    sign_in_provider: str,
    org_id:           str,
) -> dict:
    """
    Create a brand-new Firestore user document with role = "admin".
    Called exclusively from the /signup endpoint.
    If the document already exists, we ensure it has the admin role.
    """
    db  = get_firestore_client()
    ref = db.collection(settings.firestore_users_collection).document(firebase_uid)
    doc = ref.get()

    now = _now_iso()
    user_data = {
        "firebase_uid":     firebase_uid,
        "email":            email,
        "display_name":     display_name or email.split("@")[0],
        "photo_url":        photo_url or None,
        "email_verified":   email_verified,
        "sign_in_provider": sign_in_provider,
        "role":             "admin",   # ← always admin for /signup
        "is_active":        True,
        "org_id":           org_id,
        "last_login_at":    now,
    }

    if not doc.exists:
        user_data["created_at"] = now
        ref.set(user_data)
        logger.info(f"[Firestore] Admin user created | uid={firebase_uid} email={email}")
    else:
        # User already exists in Firestore (perhaps created by a trigger or previous /login).
        # We allow this and promote them to admin role as requested by /signup.
        ref.update({
            "role":          "admin",
            "last_login_at": now,
            "updated_at":    now,
        })
        user_data = ref.get().to_dict()
        logger.info(f"[Firestore] Existing user promoted to admin | uid={firebase_uid} email={email}")

    user_data["id"] = firebase_uid
    return user_data

