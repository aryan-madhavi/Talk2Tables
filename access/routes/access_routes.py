# access/routes/access_routes.py
"""
User DB Access Grant endpoints.

Endpoints:
  POST   /api/v1/access-grants                          — create grant (db_manager+)
  GET    /api/v1/access-grants?uid=                     — grants for a user (db_manager+)
  GET    /api/v1/access-grants?connection_id=           — grants for a DB  (db_manager+)
  GET    /api/v1/access-grants/{id}                     — single grant     (db_manager+)
  PATCH  /api/v1/access-grants/{id}                     — update permission/expiry (db_manager+)
  PATCH  /api/v1/access-grants/{id}/revoke              — revoke grant     (db_manager+)
  GET    /api/v1/access-grants/my/connections           — DBs I can access + connection details (analyst+)
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.routes.dependencies import require_analyst, require_db_manager
from access.routes.schemas import (
    CreateAccessGrantRequest,
    UpdateAccessGrantRequest,
    AccessGrantOut,
    AccessGrantListResponse,
    MessageResponse,
)
from access.services.access_service import (
    create_access_grant,
    get_grant_by_id,
    list_grants_by_user,
    list_grants_by_connection,
    update_access_grant,
    revoke_access_grant,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/access-grants",
    tags=["DB Access Grants"],
)


# ── GET /api/v1/access-grants/my/connections ─────────────────────────────────

@router.get(
    "/my/connections",
    summary="List databases I have access to",
    description=(
        "Returns all active access grants for the current user, enriched with "
        "connection details (name, host, db_type, etc.). "
        "Password is never included. Available to any authenticated user."
    ),
)
async def my_connections_route(
    current_user: dict = Depends(require_analyst),
):
    uid    = current_user["firebase_uid"]
    org_id = current_user["org_id"]
    grants = await list_grants_by_user(uid, active_only=True)
    if not grants:
        return {"connections": [], "total": 0}

    from connections.services.connection_service import get_connection_by_id
    results = []
    for grant in grants:
        # Scope connection lookup to the user's org — prevents leaking cross-org conn details
        conn = await get_connection_by_id(grant["connection_id"], org_id=org_id)
        if not conn:
            continue  # skip grants whose connections are outside this org (stale data guard)
        results.append({
            "grant": {
                "access_id":  grant.get("access_id"),
                "permission": grant.get("permission"),
                "granted_at": grant.get("granted_at"),
                "expires_at": grant.get("expires_at"),
            },
            "connection": conn,  # safe — no password_enc
        })

    return {"connections": results, "total": len(results)}


# ── POST /api/v1/access-grants ────────────────────────────────────────────────

@router.post(
    "",
    response_model=AccessGrantOut,
    status_code=status.HTTP_201_CREATED,
    summary="Grant a user access to a database",
    description=(
        "Creates a user_db_access document linking a user to a database. "
        "Both the target user and target connection must belong to the same organization. "
        "Raises 409 if an active grant already exists for this (user, db) pair. "
        "Requires db_manager or admin role."
    ),
)
async def create_grant_route(
    body: CreateAccessGrantRequest,
    current_user: dict = Depends(require_db_manager),
):
    logger.info(
        f"[POST /access-grants] uid={body.firebase_uid} "
        f"connection={body.connection_id} permission={body.permission} "
        f"by={current_user['firebase_uid']} org={current_user['org_id']}"
    )
    try:
        grant = await create_access_grant(
            body,
            granted_by_uid=current_user["firebase_uid"],
            org_id=current_user["org_id"],
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return grant


# ── GET /api/v1/access-grants ─────────────────────────────────────────────────

@router.get(
    "",
    response_model=AccessGrantListResponse,
    summary="List access grants",
    description=(
        "Filter by ?uid=<firebase_uid> to get all DBs a user can access. "
        "Filter by ?connection_id=<id> to get all users on a DB. "
        "At least one filter is required."
    ),
)
async def list_grants_route(
    uid:           Optional[str] = Query(default=None, description="Filter by user UID"),
    connection_id: Optional[str] = Query(default=None, description="Filter by connection ID"),
    active_only:   bool          = Query(default=True),
    current_user:  dict          = Depends(require_db_manager),
):
    if not uid and not connection_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide at least one filter: ?uid= or ?connection_id=",
        )

    if uid:
        grants = await list_grants_by_user(uid, active_only=active_only)
    else:
        grants = await list_grants_by_connection(connection_id, active_only=active_only)

    return AccessGrantListResponse(grants=grants, total=len(grants))


# ── GET /api/v1/access-grants/{id} ───────────────────────────────────────────

@router.get(
    "/{access_id}",
    response_model=AccessGrantOut,
    summary="Get a single access grant",
)
async def get_grant_route(
    access_id:    str,
    current_user: dict = Depends(require_db_manager),
):
    grant = await get_grant_by_id(access_id)
    if not grant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Grant '{access_id}' not found.",
        )
    return grant


# ── PATCH /api/v1/access-grants/{id} ─────────────────────────────────────────

@router.patch(
    "/{access_id}",
    response_model=AccessGrantOut,
    summary="Update permission or expiry of a grant",
    description="Change permission read ↔ write, expiry date, or note.",
)
async def update_grant_route(
    access_id:    str,
    body:         UpdateAccessGrantRequest,
    current_user: dict = Depends(require_db_manager),
):
    logger.info(f"[PATCH /access-grants/{access_id}] by={current_user['firebase_uid']}")
    grant = await update_access_grant(access_id, body)
    if not grant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Grant '{access_id}' not found.",
        )
    return grant


# ── PATCH /api/v1/access-grants/{id}/revoke ──────────────────────────────────

@router.patch(
    "/{access_id}/revoke",
    response_model=AccessGrantOut,
    summary="Revoke a user's access to a database",
    description=(
        "Soft delete — sets is_active=False and records revoked_at. "
        "Document is kept for audit trail. User immediately loses query access."
    ),
)
async def revoke_grant_route(
    access_id:    str,
    current_user: dict = Depends(require_db_manager),
):
    logger.info(
        f"[PATCH /access-grants/{access_id}/revoke] "
        f"by={current_user['firebase_uid']}"
    )
    grant = await revoke_access_grant(
        access_id, revoked_by_uid=current_user["firebase_uid"]
    )
    if not grant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Grant '{access_id}' not found.",
        )
    return grant