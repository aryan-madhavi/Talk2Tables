# auth/core/security.py
"""
Application-level security layer — sits on top of firebase.py.

Layer map:
  firebase.py   → SDK init, token verify/create, Firestore CRUD (fs_* helpers)
  security.py   → request verification, RBAC helpers, account management (THIS FILE)
  dependencies.py → FastAPI Depends() wrappers for routes

Role hierarchy (lowest → highest):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  analyst    (0) — SELECT queries on assigned DBs only                   │
  │  power_user (1) — SELECT + write queries on assigned DBs (if granted)   │
  │  db_manager (2) — manage connections + grants, no user management       │
  │  admin      (3) — full control: users, connections, grants, audit logs  │
  └─────────────────────────────────────────────────────────────────────────┘

Default role on first login: "analyst"
Role changes take effect on the user's NEXT request — no re-login needed.
All user/session state lives in Firestore — no PostgreSQL here.
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
# Bearer token extraction
# ─────────────────────────────────────────────────────────────────────────────

def extract_bearer_token(authorization_header: Optional[str]) -> Optional[str]:
    """
    Parse "Authorization: Bearer <token>" → return raw token string.
    Returns None if header is missing or malformed.

    Useful for WebSocket handshakes or any code outside FastAPI's
    HTTPBearer dependency injection.
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

    Step 1  Firebase Admin SDK
        Verifies token RS256 signature, expiry, and project audience.
        Firebase's public keys are cached after the first call — ~0ms overhead.

    Step 2  Firestore user check
        Confirms the user doc exists and is_active == True.
        Role is always read from Firestore here — authoritative over token claims.
        This means a role change takes effect on the user's very next request
        without requiring re-login.

    Step 3  Firestore session check
        Confirms at least one non-revoked session doc exists for this UID.
        logout() sets is_revoked = True in Firestore, caught here immediately.

    Note: This function is synchronous because the firebase-admin Firestore SDK
    is sync. Call it via  asyncio.to_thread(verify_request_token, token)  from
    async FastAPI routes. dependencies.py handles this automatically.

    Args:
        id_token:      Raw Firebase ID token from Authorization: Bearer header.
        check_revoked: Pass False only for /token-active polling so you can
                       separate "our session revoked" from "Firebase revoked".

    Returns:
        {
            "firebase_uid": str,
            "email":        str,
            "role":         str,   # "analyst" | "power_user" | "db_manager" | "admin"
            "display_name": str,
            "photo_url":    str,
            "is_active":    bool,
            "claims":       dict,  # raw decoded Firebase claims (for audit/debug)
        }

    Raises:
        SecurityError — caught by dependencies.py → HTTP 401/403.
    """
    # ── Step 1: Firebase token verification ───────────────────────────────
    try:
        claims = verify_id_token(id_token, check_revoked=check_revoked)
    except ValueError as exc:
        raise SecurityError(str(exc), code="TOKEN_INVALID")

    firebase_uid = claims["uid"]

    # ── Step 2: Firestore user check ──────────────────────────────────────
    user = fs_get_user(firebase_uid)

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

    # ── Step 3: Active session check ──────────────────────────────────────
    session = fs_get_latest_active_session(firebase_uid)
    if session is None:
        raise SecurityError(
            "No active session found. Please sign in again.",
            code="SESSION_REVOKED",
        )

    logger.debug(f"[Security] Request verified | uid={firebase_uid} role={user.get('role')}")

    return {
        "firebase_uid": firebase_uid,
        "email":        user.get("email", claims.get("email", "")),
        "role":         user.get("role", "analyst"),   # Firestore is authoritative
        "display_name": user.get("display_name", ""),
        "photo_url":    user.get("photo_url", ""),
        "is_active":    user.get("is_active", True),
        "claims":       claims,
    }


# ─────────────────────────────────────────────────────────────────────────────
# RBAC helpers
# ─────────────────────────────────────────────────────────────────────────────

def get_role_level(role: str) -> int:
    """
    Numeric permission level for a role. Unknown roles return -1.

        get_role_level("analyst")    → 0
        get_role_level("power_user") → 1
        get_role_level("db_manager") → 2
        get_role_level("admin")      → 3
        get_role_level("??")         → -1
    """
    return ROLE_LEVEL.get(role, -1)


def is_allowed(user_role: str, *required_roles: str) -> bool:
    """
    True if user_role is exactly in the required_roles set (whitelist check).
    Use inside service functions for conditional logic without raising.

        is_allowed("admin", "admin", "db_manager")  → True
        is_allowed("analyst", "admin", "db_manager")  → False
    """
    return user_role in required_roles


def has_minimum_role(user_role: str, minimum_role: str) -> bool:
    """
    True if user_role meets or exceeds minimum_role in the hierarchy.

        has_minimum_role("admin",      "db_manager") → True   (3 >= 2)
        has_minimum_role("db_manager", "db_manager") → True   (2 >= 2)
        has_minimum_role("power_user", "db_manager") → False  (1 < 2)
        has_minimum_role("analyst",    "analyst")    → True   (0 >= 0)
    """
    return get_role_level(user_role) >= get_role_level(minimum_role)


def assert_role(user: dict, *allowed_roles: str) -> None:
    """
    Raise SecurityError(FORBIDDEN) if user's role is not in allowed_roles.

    Use inside service functions for programmatic RBAC — not in routes
    (use require_role / require_min_role dependencies there instead).

        assert_role(user, "admin")
        assert_role(user, "admin", "db_manager")
    """
    if user.get("role") not in allowed_roles:
        raise SecurityError(
            f"Requires role: {' or '.join(allowed_roles)}. "
            f"Your role: {user.get('role', 'unknown')}.",
            code="FORBIDDEN",
        )


def assert_min_role(user: dict, minimum_role: str) -> None:
    """
    Raise SecurityError(FORBIDDEN) if user's role is below minimum_role.

    Use inside service functions.

        assert_min_role(user, "db_manager")  # allows db_manager + admin
        assert_min_role(user, "power_user")  # allows power_user + db_manager + admin
    """
    if not has_minimum_role(user.get("role", ""), minimum_role):
        raise SecurityError(
            f"Requires '{minimum_role}' or higher. "
            f"Your role: {user.get('role', 'unknown')}.",
            code="FORBIDDEN",
        )


# ─────────────────────────────────────────────────────────────────────────────
# Account management  (Firestore + Firebase token revocation)
# ─────────────────────────────────────────────────────────────────────────────

def deactivate_account(firebase_uid: str) -> None:
    """
    Deactivate a user account:
      1. Set is_active = False in Firestore users/{uid}
      2. Revoke all active Firestore session docs
      3. Revoke Firebase refresh tokens (signs them out of the Firebase SDK too)

    After this, every request from this user hits ACCOUNT_DISABLED in
    verify_request_token() — even with a technically valid Firebase token.

    Admin-only. Call from admin routes only.
    """
    from auth.core.firebase import get_firestore_client
    from auth.core.config import settings

    db  = get_firestore_client()
    ref = db.collection(settings.firestore_users_collection).document(firebase_uid)
    if ref.get().exists:
        ref.update({"is_active": False})
        logger.info(f"[Security] Account deactivated | uid={firebase_uid}")

    count = fs_revoke_all_sessions(firebase_uid)
    revoke_refresh_tokens(firebase_uid)
    logger.info(f"[Security] {count} session(s) revoked on deactivation | uid={firebase_uid}")


def reactivate_account(firebase_uid: str) -> None:
    """
    Re-enable a deactivated account.
    User must sign in again to get a fresh session after reactivation.
    """
    from auth.core.firebase import get_firestore_client
    from auth.core.config import settings

    db  = get_firestore_client()
    ref = db.collection(settings.firestore_users_collection).document(firebase_uid)
    if ref.get().exists:
        ref.update({"is_active": True})
        logger.info(f"[Security] Account reactivated | uid={firebase_uid}")


def force_sign_out(firebase_uid: str, session_id: Optional[str] = None) -> None:
    """
    Immediately sign out a user WITHOUT deactivating their account.
    They can sign in again normally to get a new session.

    Args:
        firebase_uid: UID of the target user.
        session_id:   Specific session to revoke. Pass None to revoke all.

    Use cases: admin action, suspected credential compromise, device lost.
    """
    if session_id:
        fs_revoke_session(firebase_uid, session_id)
        logger.info(f"[Security] Force sign-out | uid={firebase_uid} session={session_id}")
    else:
        count = fs_revoke_all_sessions(firebase_uid)
        logger.info(f"[Security] Force sign-out all | uid={firebase_uid} count={count}")

    revoke_refresh_tokens(firebase_uid)


def update_user_role(firebase_uid: str, new_role: str) -> None:
    """
    Update a user's RBAC role in Firestore. Admin-only operation.

    Valid roles: "analyst" | "power_user" | "db_manager" | "admin"

    The change takes effect on the user's NEXT API request — no re-login needed
    because we always read role from Firestore, not from the token claim.

    Raises:
        ValueError if new_role is not a valid role string.
        ValueError if the user doesn't exist in Firestore.
    """
    if new_role not in VALID_ROLES:
        raise ValueError(
            f"Invalid role '{new_role}'. "
            f"Valid roles: {', '.join(ROLE_HIERARCHY)}"
        )

    from auth.core.firebase import get_firestore_client
    from auth.core.config import settings

    db  = get_firestore_client()
    ref = db.collection(settings.firestore_users_collection).document(firebase_uid)
    if not ref.get().exists:
        raise ValueError(f"User not found in Firestore: {firebase_uid}")

    ref.update({"role": new_role})
    logger.info(f"[Security] Role updated | uid={firebase_uid} → {new_role}")


# ─────────────────────────────────────────────────────────────────────────────
# Password utilities  (bcrypt — for any local accounts not going through Firebase)
# ─────────────────────────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Hash a plaintext password with bcrypt."""
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash."""
    return _pwd_context.verify(plain, hashed)


def is_strong_password(password: str) -> tuple[bool, str]:
    """
    Basic strength check for local account creation.
    Rules: ≥8 chars, uppercase, lowercase, digit, special character.

    Returns:
        (True,  "")           — acceptable
        (False, reason_str)   — too weak, reason explains which rule failed
    """
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