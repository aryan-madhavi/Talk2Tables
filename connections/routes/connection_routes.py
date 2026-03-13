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

from fastapi import APIRouter, Depends, HTTPException, status

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

logger = logging.getLogger(__name__)

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
    status_filter: str | None     = None,   # ?status=success or ?status=error
    uid:           str | None     = None,   # ?uid=<firebase_uid> filter by user
    current_user:  dict           = Depends(require_db_manager),
):
    try:
        from auth.core.firebase import get_firestore_client
        from google.cloud.firestore_v1 import Query
        db = get_firestore_client()

        q = (
            db.collection("database_connections")
              .document(connection_id)
              .collection("audits")
              .order_by("created_at", direction=Query.DESCENDING)
        )
        if status_filter in ("success", "error"):
            q = q.where("status", "==", status_filter)
        if uid:
            q = q.where("firebase_uid", "==", uid)

        docs   = q.limit(limit + offset).stream()
        audits = []
        for i, doc in enumerate(docs):
            if i < offset:
                continue
            d = doc.to_dict()
            audits.append({
                "audit_id":          d.get("audit_id", doc.id),
                "firebase_uid":      d.get("firebase_uid", ""),
                "chat_id":           d.get("chat_id", ""),
                "sql_query":         d.get("sql_query", ""),
                "summary":           d.get("summary", ""),
                "row_count":         d.get("row_count", 0),
                "execution_time_ms": d.get("execution_time_ms", 0),
                "status":            d.get("status", ""),
                "error_message":     d.get("error_message"),
                "created_at":        d.get("created_at", ""),
            })

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
    from auth.core.firebase import get_firestore_client
    from google.cloud.firestore_v1 import Query
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict

    try:
        db = get_firestore_client()
        q  = (
            db.collection("database_connections")
              .document(connection_id)
              .collection("audits")
              .order_by("created_at", direction=Query.DESCENDING)
        )
        if days and days > 0:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            q = q.where("created_at", ">=", cutoff)

        docs = list(q.stream())

        # ── Aggregate ──────────────────────────────────────────────────────
        total        = len(docs)
        success      = 0
        failed       = 0
        total_rows   = 0
        total_ms     = 0.0
        type_counts  = defaultdict(int)   # SELECT / INSERT / UPDATE / DELETE
        user_counts  = defaultdict(int)   # firebase_uid → count
        daily        = defaultdict(int)   # "YYYY-MM-DD" → count

        for doc in docs:
            d      = doc.to_dict()
            status = d.get("status", "")

            if status in ("results", "success"):
                success += 1
            else:
                failed += 1

            total_rows += d.get("row_count", 0) or 0
            total_ms   += d.get("execution_time_ms", 0) or 0

            sql   = (d.get("sql_query") or "").strip().upper()
            first = sql.split()[0] if sql.split() else "UNKNOWN"
            qtype = "SELECT" if first in ("SELECT", "WITH") else first if first in ("INSERT", "UPDATE", "DELETE") else "OTHER"
            type_counts[qtype] += 1

            user_counts[d.get("firebase_uid", "unknown")] += 1

            ts = d.get("created_at", "")
            if ts:
                daily[ts[:10]] += 1  # "YYYY-MM-DD"

        # Top 5 users by query count
        top_users = sorted(
            [{"firebase_uid": uid, "query_count": cnt} for uid, cnt in user_counts.items()],
            key=lambda x: x["query_count"],
            reverse=True,
        )[:5]

        # Daily activity sorted ascending (for chart rendering)
        daily_activity = sorted(
            [{"date": date, "count": cnt} for date, cnt in daily.items()],
            key=lambda x: x["date"],
        )

        return {
            "connection_id":        connection_id,
            "period_days":          days if days > 0 else None,
            "total_queries":        total,
            "successful_queries":   success,
            "failed_queries":       failed,
            "success_rate":         round(success / total * 100, 1) if total else 0.0,
            "total_rows_fetched":   total_rows,
            "avg_rows_per_query":   round(total_rows / success, 1) if success else 0.0,
            "avg_execution_time_ms": round(total_ms / total, 1) if total else 0.0,
            "query_type_breakdown": dict(type_counts),
            "top_users":            top_users,
            "daily_activity":       daily_activity,
        }

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
async def refresh_schema_cache_route(
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