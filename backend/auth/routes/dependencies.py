# auth/routes/dependencies.py
"""
FastAPI dependencies — Firestore-backed auth + RBAC.

Role hierarchy (lowest → highest):
    analyst    (0) — SELECT queries on assigned DBs only
    power_user (1) — SELECT + write queries on assigned DBs (if granted)
    db_manager (2) — manages connections + grants; cannot manage users/roles
    admin      (3) — full control: users, connections, grants, audit logs

Flow per request:
    1. Extract Bearer token from Authorization header
    2. asyncio.to_thread → verify_request_token() in security.py
         └── Step 1: Firebase token signature verify (always)
         └── Step 2: Redis cache check  → return immediately on HIT
         └── Step 3: Firestore user check (cache miss only)
         └── Step 4: Firestore session check (cache miss only)
    3. Return user dict to route handler

Cache is handled entirely inside security.py — this file stays clean.

Shortcut aliases (import these directly in routes):
    require_admin       — admin only
    require_db_manager  — db_manager or admin
    require_power_user  — power_user, db_manager, or admin
    require_analyst     — any authenticated user (all roles)
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from auth.core.security import (
    SecurityError,
    verify_request_token,
    ROLE_LEVEL,
    VALID_ROLES,
    ROLE_CAPABILITIES,
)

logger  = logging.getLogger(__name__)
_bearer = HTTPBearer(auto_error=False)


# ─────────────────────────────────────────────────────────────────────────────
# Core dependency
# ─────────────────────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> dict:
    """
    Verify Firebase ID token + RBAC user check.

    Runs verify_request_token() in a thread pool via asyncio.to_thread
    because the firebase-admin SDK is synchronous — keeps the event loop free.

    Returns:
        {
            "firebase_uid": str,
            "email":        str,
            "role":         str,   # analyst | power_user | db_manager | admin
            "display_name": str,
            "photo_url":    str,
            "is_active":    bool,
            "claims":       dict,  # raw Firebase token claims
        }
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing auth token. Set Authorization: Bearer <firebase_id_token>",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user = await asyncio.wait_for(
            asyncio.to_thread(
                verify_request_token,
                credentials.credentials,
                True,   # check_revoked=True
            ),
            timeout=10.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service timed out. Please try again.",
        )
    except SecurityError as exc:
        raise HTTPException(
            status_code=exc.to_http_status(),
            detail=exc.message,
            headers={"WWW-Authenticate": "Bearer"} if exc.to_http_status() == 401 else {},
        )

    return user


# ─────────────────────────────────────────────────────────────────────────────
# RBAC dependencies
# ─────────────────────────────────────────────────────────────────────────────

def require_role(*allowed_roles: str):
    """
    Exact whitelist — user's role must be one of the specified roles.

        Depends(require_role("admin"))
        Depends(require_role("admin", "db_manager"))
    """
    async def _check(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Requires: {' or '.join(allowed_roles)}. "
                    f"Your role: {user['role']}."
                ),
            )
        return user
    return _check


def require_min_role(minimum_role: str):
    """
    Hierarchy check — user's level must be >= minimum_role.

        require_min_role("db_manager")  → allows db_manager (2) + admin (3)
        require_min_role("power_user")  → allows power_user (1) + db_manager + admin
        require_min_role("analyst")     → allows everyone (all 4 roles)
    """
    min_level = ROLE_LEVEL.get(minimum_role, 0)

    async def _check(user: dict = Depends(get_current_user)) -> dict:
        if ROLE_LEVEL.get(user["role"], -1) < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"Requires '{minimum_role}' or higher. "
                    f"Your role: {user['role']}."
                ),
            )
        return user
    return _check


# ─────────────────────────────────────────────────────────────────────────────
# Shortcut aliases — import these directly into route files
# ─────────────────────────────────────────────────────────────────────────────
#
#  require_admin       → admin only
#  require_db_manager  → db_manager OR admin
#  require_power_user  → power_user OR db_manager OR admin
#  require_analyst     → all roles (any authenticated user)
#
# Usage in a route:
#   @router.post("/connections")
#   async def create_connection(user: dict = Depends(require_db_manager)):
#       ...
#
#   @router.get("/query")
#   async def run_query(user: dict = Depends(require_analyst)):
#       ...

require_admin      = require_role("admin")          # admin only (exact)
require_db_manager = require_min_role("db_manager") # db_manager + admin
require_power_user = require_min_role("power_user") # power_user + db_manager + admin
require_analyst    = require_min_role("analyst")    # all roles