# auth/routes/dependencies.py
"""
FastAPI dependencies — Firestore-backed auth + RBAC.

Role hierarchy (highest to lowest):
    admin       — full control: users, connections, grants, audit logs
    db_manager  — manages DB connections and access grants; cannot manage users/roles
    power_user  — queries assigned DBs (SELECT + write if granted in user_db_access)
    analyst     — queries assigned DBs (SELECT only, read permission)

get_current_user()    — verifies token, fetches authoritative role from Firestore
require_role(*roles)  — exact role match (whitelist)
require_min_role(r)   — role >= minimum in hierarchy (inclusive upward)
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth.core.firebase import verify_id_token
from auth.services.auth_service import get_user_by_firebase_uid

logger  = logging.getLogger(__name__)
_bearer = HTTPBearer(auto_error=False)

# ── Role hierarchy ─────────────────────────────────────────────────────────────
ROLE_LEVEL: dict[str, int] = {
    "analyst":    0,
    "power_user": 1,
    "db_manager": 2,
    "admin":      3,
}

VALID_ROLES = set(ROLE_LEVEL.keys())

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
        "Manage user accounts (activate/deactivate)",
        "Change user roles",
        "Full system configuration",
    ],
}


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """
    Verify Firebase ID token and return authoritative user from Firestore.

    Returns dict with keys: firebase_uid, email, role, display_name, photo_url, is_active
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing auth token. Set Authorization: Bearer <firebase_id_token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = verify_id_token(credentials.credentials, check_revoked=True)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": "Bearer"},
        )

    firebase_uid = claims["uid"]

    user = await get_user_by_firebase_uid(firebase_uid)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found.")
    if not user.get("is_active", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account deactivated.")

    return {
        "firebase_uid": firebase_uid,
        "email":        user["email"],
        "role":         user["role"],
        "display_name": user.get("display_name"),
        "photo_url":    user.get("photo_url"),
        "is_active":    user.get("is_active", True),
    }


def require_role(*allowed_roles: str):
    """Exact whitelist — user must be one of the specified roles."""
    async def _check(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires: {' or '.join(allowed_roles)}. Your role: {user['role']}",
            )
        return user
    return _check


def require_min_role(minimum_role: str):
    """
    Hierarchy check — user level must be >= minimum.
    require_min_role("db_manager") allows db_manager + admin.
    require_min_role("analyst")    allows everyone.
    """
    min_level = ROLE_LEVEL.get(minimum_role, 0)

    async def _check(user: dict = Depends(get_current_user)) -> dict:
        if ROLE_LEVEL.get(user["role"], -1) < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires '{minimum_role}' or higher. Your role: {user['role']}",
            )
        return user
    return _check


# ── Shortcut aliases ──────────────────────────────────────────────────────────
require_admin      = require_role("admin")                # admin only
require_db_manager = require_min_role("db_manager")       # db_manager + admin
require_power_user = require_min_role("power_user")       # power_user + db_manager + admin
require_analyst    = require_min_role("analyst")          # all roles