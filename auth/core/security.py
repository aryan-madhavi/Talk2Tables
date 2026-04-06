# auth/core/security.py
"""
Application-level security layer — sits on top of firebase.py.

Layer map:
  firebase.py     → SDK init, token verify/create, Firestore CRUD (fs_* helpers)
  security.py     → request verification, RBAC helpers, account management (THIS FILE)
  dependencies.py → FastAPI Depends() wrappers for routes

Cache layer (Redis):
  verify_request_token() caches the full user dict under token:{uid} for 55 min.
  On cache hit, Steps 2 + 3 (Firestore user + session checks) are skipped entirely.
  Cache is invalidated by:
    • set_user_active(False)   — deactivated user blocked immediately
    • update_user_role()       — new role enforced on next request
    • delete_user()            — user wiped from cache
  Redis is optional — if REDIS_URL is not set, every request hits Firestore (original behaviour).

Role hierarchy (lowest → highest):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  analyst    (0) — SELECT queries on assigned DBs only                   │
  │  power_user (1) — SELECT + write queries on assigned DBs (if granted)   │
  │  db_manager (2) — manage connections + grants, no user management       │
  │  admin      (3) — full control: users, connections, grants, audit logs  │
  └─────────────────────────────────────────────────────────────────────────┘
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Optional

from passlib.context import CryptContext

from auth.core.firebase import (
    verify_id_token,
    revoke_refresh_tokens,
    fs_get_user,
    fs_get_latest_active_session,
    fs_revoke_all_sessions,
    fs_revoke_session,
)

logger = logging.getLogger(__name__)

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Role hierarchy — index = permission level ─────────────────────────────────
ROLE_HIERARCHY: list[str] = ["analyst", "power_user", "db_manager", "admin"]

ROLE_LEVEL: dict[str, int] = {role: i for i, role in enumerate(ROLE_HIERARCHY)}

VALID_ROLES: set[str] = set(ROLE_HIERARCHY)

ROLE_CAPABILITIES: dict[str, list[str]] = {
    "analyst": [
        "Run SELECT queries on assigned databases",
        "View own query history",
        "Browse assigned DB schemas",
    ],
    "power_user": [
        "Run SELECT + write queries (if granted in access record)",
        "View own query history",
        "Browse assigned DB schemas",
    ],
    "db_manager": [
        "Everything power_user can do",
        "Add and edit database connections",
        "Grant and revoke user access to databases",
        "View all query audit logs",
    ],
    "admin": [
        "Everything db_manager can do",
        "Manage user accounts (activate / deactivate)",
        "Change user roles",
        "Full system configuration",
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# SecurityError
# ─────────────────────────────────────────────────────────────────────────────

class SecurityError(Exception):
    """
    Raised by security.py on any auth/authz failure.
    Caught by dependencies.py and converted to HTTP 401 or 403.

    Codes:
        TOKEN_INVALID    — bad / expired / revoked Firebase token
        USER_NOT_FOUND   — uid not in Firestore
        ACCOUNT_DISABLED — user.is_active == False in Firestore
        SESSION_REVOKED  — no active session doc in Firestore
        FORBIDDEN        — valid user but insufficient RBAC role
    """
    def __init__(self, message: str, code: str = "UNAUTHORIZED"):
        super().__init__(message)
        self.message = message
        self.code    = code

    def to_http_status(self) -> int:
        """401 for all auth failures, 403 for role/permission failures."""
        return 403 if self.code == "FORBIDDEN" else 401

    def __repr__(self) -> str:
        return f"SecurityError(code={self.code!r}, message={self.message!r})"


# ─────────────────────────────────────────────────────────────────────────────
# Redis cache helpers (lazy import — Redis is optional)
# ─────────────────────────────────────────────────────────────────────────────

def _get_sync_redis():
    """Return a synchronous Redis client, or None if Redis is not configured."""
    try:
        import redis as _redis
        from auth.core.config import settings
        if not settings.redis_url:
            return None
        return _redis.from_url(settings.redis_url, decode_responses=False)
    except Exception:
        return None


def _cache_get_sync(key: str):
    """
    Synchronous Redis GET using redis-py sync client.
    Called from verify_request_token() which runs in a thread pool.
    Returns parsed value or None on miss/error.
    """
    try:
        import json as _json
        client = _get_sync_redis()
        if client is None:
            return None
        raw = client.get(key)
        client.close()
        if raw is None:
            return None
        return _json.loads(raw)
    except Exception:
        return None


def _cache_set_sync(key: str, value: dict, ttl: int) -> None:
    """Synchronous Redis SET using redis-py sync client."""
    try:
        import json as _json
        client = _get_sync_redis()
        if client is None:
            return
        client.setex(key, ttl, _json.dumps(value))
        client.close()
    except Exception:
        pass  # Redis failure must never block auth


def _cache_invalidate_sync(*keys: str) -> None:
    """Synchronous Redis DELETE using redis-py sync client."""
    try:
        client = _get_sync_redis()
        if client is None:
            return
        client.delete(*keys)
        client.close()
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Bearer token extraction
# ─────────────────────────────────────────────────────────────────────────────

def extract_bearer_token(authorization_header: Optional[str]) -> Optional[str]:
    """
    Parse "Authorization: Bearer <token>" → return raw token string.
    Returns None if header is missing or malformed.
    """
    if not authorization_header:
        return None
    match = re.match(r"^Bearer\s+(.+)$", authorization_header.strip(), re.IGNORECASE)
    return match.group(1).strip() if match else None


# ─────────────────────────────────────────────────────────────────────────────
# Full request verification  (Firebase token + Firestore user + session)
# ─────────────────────────────────────────────────────────────────────────────

def verify_request_token(
    id_token: str,
    check_revoked: bool = True,
) -> dict:
    """
    Three-step security check for every incoming protected request.

    Step 1  Firebase Admin SDK  (always runs — verifies RS256 signature)
        Firebase's public keys are cached after the first call — ~0ms overhead.

    Step 2  Redis cache check  (NEW)
        If token:{uid} is cached, skip Steps 2+3 Firestore calls entirely.
        Returns the cached user dict immediately.
        Cache TTL: 55 min. Invalidated on role change / deactivate / delete.

    Step 3  Firestore user check  (on cache miss only)
        Confirms the user doc exists and is_active == True.
        Role is always read from Firestore — authoritative over token claims.

    Step 4  Firestore session check  (on cache miss only)
        Confirms at least one non-revoked session exists.

    Note: This function is synchronous (firebase-admin SDK is sync).
    dependencies.py calls it via asyncio.to_thread() to keep the event loop free.

    Returns:
        {
            "firebase_uid": str,
            "email":        str,
            "role":         str,
            "display_name": str,
            "photo_url":    str,
            "is_active":    bool,
            "claims":       dict,
        }

    Raises:
        SecurityError — caught by dependencies.py → HTTP 401/403.
    """
    from core.cache_keys import key_token, TTL_TOKEN

    # ── Step 1: Firebase token verification (always) ──────────────────────
    try:
        claims = verify_id_token(id_token, check_revoked=check_revoked)
    except ValueError as exc:
        raise SecurityError(str(exc), code="TOKEN_INVALID")

    firebase_uid = claims["uid"]

    # ── Step 2: Redis cache check ─────────────────────────────────────────
    cached = _cache_get_sync(key_token(firebase_uid))
    if cached:
        logger.debug(f"[Security] Cache HIT — uid={firebase_uid} role={cached.get('role')}")
        # Re-attach live claims (not stored in cache to keep it small)
        cached["claims"] = claims
        return cached

    # ── Steps 3 & 4: Firestore user + session checks in parallel (cache miss) ─
    logger.debug(f"[Security] Cache MISS — uid={firebase_uid}, checking Firestore")

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=2) as _pool:
        _user_f    = _pool.submit(fs_get_user, firebase_uid)
        _session_f = _pool.submit(fs_get_latest_active_session, firebase_uid)
        user    = _user_f.result()
        session = _session_f.result()

    if user is None:
        raise SecurityError(
            "User not found in system. Please log in again.",
            code="USER_NOT_FOUND",
        )
    if not user.get("is_active", True):
        raise SecurityError(
            "Account deactivated. Contact an administrator.",
            code="ACCOUNT_DISABLED",
        )

    if session is None:
        raise SecurityError(
            "No active session found. Please sign in again.",
            code="SESSION_REVOKED",
        )

    user_dict = {
        "firebase_uid": firebase_uid,
        "email":        user.get("email", claims.get("email", "")),
        "role":         user.get("role", "analyst"),   # Firestore is authoritative
        "display_name": user.get("display_name", ""),
        "photo_url":    user.get("photo_url", ""),
        "is_active":    user.get("is_active", True),
        "org_id":       user.get("org_id"),
    }

    # ── Step 5: Populate cache (without claims — they change per-request) ─
    _cache_set_sync(key_token(firebase_uid), user_dict, TTL_TOKEN)
    logger.debug(f"[Security] Cached token — uid={firebase_uid} ttl={TTL_TOKEN}s")

    # Attach claims to return value (not stored in cache)
    user_dict["claims"] = claims

    logger.debug(f"[Security] Request verified | uid={firebase_uid} role={user_dict['role']}")
    return user_dict


# ─────────────────────────────────────────────────────────────────────────────
# RBAC helpers — unchanged
# ─────────────────────────────────────────────────────────────────────────────

def get_role_level(role: str) -> int:
    return ROLE_LEVEL.get(role, -1)


def is_allowed(user_role: str, *required_roles: str) -> bool:
    return user_role in required_roles


def has_minimum_role(user_role: str, minimum_role: str) -> bool:
    return get_role_level(user_role) >= get_role_level(minimum_role)


def assert_role(user: dict, *allowed_roles: str) -> None:
    if user.get("role") not in allowed_roles:
        raise SecurityError(
            f"Requires role: {' or '.join(allowed_roles)}. "
            f"Your role: {user.get('role', 'unknown')}.",
            code="FORBIDDEN",
        )


def assert_min_role(user: dict, minimum_role: str) -> None:
    if not has_minimum_role(user.get("role", ""), minimum_role):
        raise SecurityError(
            f"Requires '{minimum_role}' or higher. "
            f"Your role: {user.get('role', 'unknown')}.",
            code="FORBIDDEN",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Account management — cache invalidation added to each mutating function
# ─────────────────────────────────────────────────────────────────────────────

def deactivate_account(firebase_uid: str) -> None:
    """
    Deactivate a user account:
      1. Set is_active = False in Firestore
      2. Revoke all active session docs
      3. Revoke Firebase refresh tokens
      4. Invalidate Redis cache — blocked on very next request
    """
    from auth.core.firebase import get_firestore_client
    from auth.core.config import settings
    from core.cache_keys import key_token, key_user, key_users_list

    db  = get_firestore_client()
    ref = db.collection(settings.firestore_users_collection).document(firebase_uid)
    doc = ref.get()
    org_id = ""
    if doc.exists:
        org_id = doc.to_dict().get("org_id", "")
        ref.update({"is_active": False})
        logger.info(f"[Security] Account deactivated | uid={firebase_uid}")

    count = fs_revoke_all_sessions(firebase_uid)
    revoke_refresh_tokens(firebase_uid)
    logger.info(f"[Security] {count} session(s) revoked on deactivation | uid={firebase_uid}")

    # CRITICAL: wipe cache so the deactivated user is blocked immediately
    _cache_invalidate_sync(key_token(firebase_uid), key_user(firebase_uid), key_users_list(org_id))


def reactivate_account(firebase_uid: str) -> None:
    """
    Re-enable a deactivated account.
    Invalidates cache so stale is_active=False is not served.
    """
    from auth.core.firebase import get_firestore_client
    from auth.core.config import settings
    from core.cache_keys import key_token, key_user, key_users_list

    db  = get_firestore_client()
    ref = db.collection(settings.firestore_users_collection).document(firebase_uid)
    doc = ref.get()
    org_id = ""
    if doc.exists:
        org_id = doc.to_dict().get("org_id", "")
        ref.update({"is_active": True})
        logger.info(f"[Security] Account reactivated | uid={firebase_uid}")

    _cache_invalidate_sync(key_token(firebase_uid), key_user(firebase_uid), key_users_list(org_id))


def force_sign_out(firebase_uid: str, session_id: Optional[str] = None) -> None:
    """
    Sign out a user WITHOUT deactivating their account.
    Invalidates token cache — they must sign in again.
    """
    from core.cache_keys import key_token

    if session_id:
        fs_revoke_session(firebase_uid, session_id)
        logger.info(f"[Security] Force sign-out | uid={firebase_uid} session={session_id}")
    else:
        count = fs_revoke_all_sessions(firebase_uid)
        logger.info(f"[Security] Force sign-out all | uid={firebase_uid} count={count}")

    revoke_refresh_tokens(firebase_uid)
    _cache_invalidate_sync(key_token(firebase_uid))


def update_user_role(firebase_uid: str, new_role: str) -> None:
    """
    Update RBAC role in Firestore.
    Invalidates token + user cache — new role enforced on next request.
    """
    if new_role not in VALID_ROLES:
        raise ValueError(
            f"Invalid role '{new_role}'. "
            f"Valid roles: {', '.join(ROLE_HIERARCHY)}"
        )

    from auth.core.firebase import get_firestore_client
    from auth.core.config import settings
    from core.cache_keys import key_token, key_user, key_users_list

    db  = get_firestore_client()
    ref = db.collection(settings.firestore_users_collection).document(firebase_uid)
    doc = ref.get()
    if not doc.exists:
        raise ValueError(f"User not found in Firestore: {firebase_uid}")

    org_id = doc.to_dict().get("org_id", "")
    ref.update({"role": new_role})
    logger.info(f"[Security] Role updated | uid={firebase_uid} → {new_role}")

    # Invalidate — stale role in cache = wrong permissions
    _cache_invalidate_sync(key_token(firebase_uid), key_user(firebase_uid), key_users_list(org_id))


# ─────────────────────────────────────────────────────────────────────────────
# Password utilities — unchanged
# ─────────────────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def is_strong_password(password: str) -> tuple[bool, str]:
    checks = [
        (len(password) >= 8,
         "Must be at least 8 characters."),
        (bool(re.search(r"[A-Z]", password)),
         "Must contain at least one uppercase letter."),
        (bool(re.search(r"[a-z]", password)),
         "Must contain at least one lowercase letter."),
        (bool(re.search(r"\d", password)),
         "Must contain at least one digit."),
        (bool(re.search(r'[!@#$%^&*(),.?":{}|<>_\-]', password)),
         "Must contain at least one special character."),
    ]
    for passed, reason in checks:
        if not passed:
            return False, reason
    return True, ""