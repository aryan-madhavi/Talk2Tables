# connections/routes/connection_routes.py
"""
Database Connection endpoints.

All routes require at minimum db_manager role (admin + db_manager).
DELETE requires admin only.

Endpoints:
    POST   /api/v1/connections            — create connection
    GET    /api/v1/connections            — list all connections
    GET    /api/v1/connections/{id}       — get single connection
    PATCH  /api/v1/connections/{id}       — update connection
    DELETE /api/v1/connections/{id}       — hard delete (admin only)
    PATCH  /api/v1/connections/{id}/activate    — enable connection
    PATCH  /api/v1/connections/{id}/deactivate  — disable connection
    POST   /api/v1/connections/{id}/test           — live connectivity test
    GET    /api/v1/connections/{id}/audits         — list query audit logs for a connection
    GET    /api/v1/connections/{id}/stats          — usage statistics (query counts, success rate, top users, daily chart)
    POST   /api/v1/connections/{id}/schema/refresh — force-invalidate schema cache
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth.routes.dependencies import require_db_manager, require_admin
from connections.routes.schemas import (
    CreateConnectionRequest,
    UpdateConnectionRequest,
    ConnectionOut,
    ConnectionListResponse,
    MessageResponse,
    TestConnectionResponse,
)
from connections.services.connection_service import (
    create_connection,
    get_connection_by_id,
    list_connections,
    update_connection,
    delete_connection,
    set_connection_active,
    test_connection,
)

logger  = logging.getLogger(__name__)
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(
    prefix="/api/v1/connections",
    tags=["Database Connections"],
)


# ── POST /api/v1/connections ──────────────────────────────────────────────────

@router.post(
    "",
    response_model=ConnectionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new database connection",
    description=(
        "Register a new database connection. "
        "The password is encrypted with AES-256-GCM before storage. "
        "Requires db_manager or admin role."
    ),
)
async def create_connection_route(
    body: CreateConnectionRequest,
    current_user: dict = Depends(require_db_manager),
):
    logger.info(
        f"[POST /connections] name={body.name} db_type={body.db_type} "
        f"by={current_user['firebase_uid']}"
    )
    connection = await create_connection(body, created_by_uid=current_user["firebase_uid"])
    return connection


# ── GET /api/v1/connections ───────────────────────────────────────────────────

@router.get(
    "",
    response_model=ConnectionListResponse,
    summary="List all database connections",
    description=(
        "Returns all connections (active + inactive). "
        "Password is never included in any response. "
        "Requires db_manager or admin role."
    ),
)
async def list_connections_route(
    active_only: bool = False,
    current_user: dict = Depends(require_db_manager),
):
    connections = await list_connections(active_only=active_only)
    return ConnectionListResponse(connections=connections, total=len(connections))


# ── GET /api/v1/connections/{id} ──────────────────────────────────────────────

@router.get(
    "/{connection_id}",
    response_model=ConnectionOut,
    summary="Get a single database connection",
)
async def get_connection_route(
    connection_id: str,
    current_user: dict = Depends(require_db_manager),
):
    connection = await get_connection_by_id(connection_id)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connection '{connection_id}' not found.",
        )
    return connection


# ── PATCH /api/v1/connections/{id} ────────────────────────────────────────────

@router.patch(
    "/{connection_id}",
    response_model=ConnectionOut,
    summary="Update a database connection",
    description=(
        "Partial update — only provided fields are changed. "
        "If password is provided it is re-encrypted automatically."
    ),
)
async def update_connection_route(
    connection_id: str,
    body: UpdateConnectionRequest,
    current_user: dict = Depends(require_db_manager),
):
    logger.info(f"[PATCH /connections/{connection_id}] by={current_user['firebase_uid']}")
    connection = await update_connection(connection_id, body)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connection '{connection_id}' not found.",
        )
    return connection


# ── DELETE /api/v1/connections/{id} ───────────────────────────────────────────

@router.delete(
    "/{connection_id}",
    response_model=MessageResponse,
    summary="Hard-delete a connection (admin only)",
    description=(
        "Permanently deletes the connection document. "
        "Consider using /deactivate instead to preserve audit history. "
        "Admin only."
    ),
)
async def delete_connection_route(
    connection_id: str,
    current_user: dict = Depends(require_admin),
):
    logger.info(f"[DELETE /connections/{connection_id}] by={current_user['firebase_uid']}")
    deleted = await delete_connection(connection_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connection '{connection_id}' not found.",
        )
    return MessageResponse(message=f"Connection '{connection_id}' permanently deleted.")


# ── POST /api/v1/connections/{id}/test ───────────────────────────────────────

@router.post(
    "/{connection_id}/test",
    response_model=TestConnectionResponse,
    summary="Test a live database connection",
    description=(
        "Attempts to open a real connection to the target database. "
        "Updates last_tested_at and last_tested_ok on the connection document. "
        "Returns ok=true/false regardless — does NOT raise HTTP 4xx on DB failure. "
        "Requires db_manager or admin role."
    ),
)
async def test_connection_route(
    connection_id: str,
    current_user: dict = Depends(require_db_manager),
):
    logger.info(f"[POST /connections/{connection_id}/test] by={current_user['firebase_uid']}")
    result = await test_connection(connection_id)
    if result["message"] == f"Connection '{connection_id}' not found.":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=result["message"],
        )
    return result


# ── GET /api/v1/connections/{id}/audits ──────────────────────────────────────

@router.get(
    "/{connection_id}/audits",
    summary="List query audit logs for a connection",
    description=(
        "Returns audit records for this connection (newest first). "
        "Optional filters: status (success|error), uid (filter by specific user). "
        "Requires db_manager or admin role."
    ),
)
async def list_audits_route(
    connection_id: str,
    limit:         int            = 50,
    offset:        int            = 0,
    status:        str | None     = None,   # ?status=success or ?status=error
    uid:           str | None     = None,   # ?uid=<firebase_uid> filter by user
    current_user:  dict           = Depends(require_db_manager),
):
    try:
        from ai_agent.services.audit_service import get_connection_audits
        audits = await get_connection_audits(
            connection_id=connection_id,
            limit=limit,
            offset=offset,
            status=status,
            user_id=uid
        )

        return {
            "connection_id": connection_id,
            "audits":        audits,
            "total":         len(audits),
            "limit":         limit,
            "offset":        offset,
        }
    except Exception as exc:
        logger.error(f"[GET /connections/{connection_id}/audits] Failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── GET /api/v1/connections/{id}/stats ───────────────────────────────────────

@router.get(
    "/{connection_id}/stats",
    summary="Usage statistics for a database connection",
    description=(
        "Aggregates audit logs to produce query counts, success rate, row totals, "
        "execution time averages, query type breakdown, top users, and daily activity. "
        "Use ?days=7|30|90|0 to control the lookback window (0 = all time). "
        "Requires db_manager or admin role."
    ),
)
async def connection_stats_route(
    connection_id: str,
    days:          int  = 30,   # 0 = all time
    current_user:  dict = Depends(require_db_manager),
):
    try:
        from ai_agent.services.audit_service import get_connection_stats
        return await get_connection_stats(connection_id, days)
    except Exception as exc:
        logger.error(f"[GET /connections/{connection_id}/stats] Failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── POST /api/v1/connections/{id}/schema/refresh ──────────────────────────────

@router.post(
    "/{connection_id}/schema/refresh",
    response_model=MessageResponse,
    summary="Force-invalidate the schema cache for a connection",
    description=(
        "Deletes all cached schema documents under this connection. "
        "The next query will re-fetch the schema from the live database and re-cache it. "
        "Use this after DDL changes (new tables, renamed columns, etc). "
        "Requires db_manager or admin role."
    ),
)
@limiter.limit("10/minute")
async def refresh_schema_cache_route(
    request: Request,
    connection_id: str,
    current_user: dict = Depends(require_db_manager),
):
    logger.info(f"[POST /connections/{connection_id}/schema/refresh] by={current_user['firebase_uid']}")
    from ai_agent.tools.schema_tools import invalidate_schema_cache
    invalidate_schema_cache(connection_id)
    return MessageResponse(message=f"Schema cache cleared for connection '{connection_id}'.")


# ── PATCH /api/v1/connections/{id}/activate ───────────────────────────────────

@router.patch(
    "/{connection_id}/activate",
    response_model=ConnectionOut,
    summary="Enable a disabled connection",
)
async def activate_connection_route(
    connection_id: str,
    current_user: dict = Depends(require_db_manager),
):
    connection = await set_connection_active(connection_id, is_active=True)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connection '{connection_id}' not found.",
        )
    return connection


# ── PATCH /api/v1/connections/{id}/deactivate ─────────────────────────────────

@router.patch(
    "/{connection_id}/deactivate",
    response_model=ConnectionOut,
    summary="Disable a connection without deleting it",
    description="Users with access to this DB will get 403 until it is re-activated.",
)
async def deactivate_connection_route(
    connection_id: str,
    current_user: dict = Depends(require_db_manager),
):
    connection = await set_connection_active(connection_id, is_active=False)
    if not connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connection '{connection_id}' not found.",
        )
    return connection
