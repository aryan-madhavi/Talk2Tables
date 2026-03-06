# auth/routes/dependencies.py
"""
FastAPI dependencies — no DB session needed, Firestore is accessed directly.

Client sends:   Authorization: Bearer <firebase_id_token>

get_current_user():
  1. Verifies the Firebase ID token via Admin SDK (Service Account)
  2. Fetches user from Firestore (authoritative role + is_active)
  3. Returns user dict for the route handler

require_role(*roles):
  Wraps get_current_user() and enforces RBAC.

Usage:
    from auth.routes.dependencies import get_current_user, require_role

    @router.get("/protected")
    async def route(user: dict = Depends(get_current_user)):
        print(user["firebase_uid"], user["role"])

    @router.post("/admin-only")
    async def route(user: dict = Depends(require_role("admin"))):
        ...
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


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """
    Verify the Firebase ID token in the Authorization header.

    Token verified by Firebase Admin SDK (Service Account).
    Role read from Firestore — always up-to-date even if the token was
    issued before a role change.

    Returns:
        {
            "firebase_uid": str,
            "email":        str,
            "role":         str,   # from Firestore (authoritative)
            "display_name": str | None,
            "photo_url":    str | None,
            "is_active":    bool,
        }
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

    # Authoritative user data from Firestore
    user = await get_user_by_firebase_uid(firebase_uid)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found. Please log in again.",
        )
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account deactivated. Contact an administrator.",
        )

    return {
        "firebase_uid": firebase_uid,
        "email":        user["email"],
        "role":         user["role"],       # always from Firestore
        "display_name": user.get("display_name"),
        "photo_url":    user.get("photo_url"),
        "is_active":    user.get("is_active", True),
    }


def require_role(*allowed_roles: str):
    """
    Returns a dependency that enforces RBAC.

        Depends(require_role("admin"))
        Depends(require_role("admin", "power_user"))
    """
    async def _check(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires: {' or '.join(allowed_roles)}. Your role: {user['role']}",
            )
        return user
    return _check


# Shortcut aliases
require_admin      = require_role("admin")
require_power_user = require_role("admin", "power_user")