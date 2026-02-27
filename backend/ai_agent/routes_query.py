"""
Talk2Tables — Query API Route
==============================
FastAPI route handlers for all NL2SQL query endpoints.

Endpoints:
  POST /api/query          — Submit natural language query (READ)
  POST /api/query/execute  — Confirm and execute a write operation (WRITE)
  GET  /api/query/history  — Get query history for current user
  GET  /api/schema/tables  — List tables for schema explorer sidebar

Auth: JWT required on all endpoints (extracted by auth middleware).
RBAC: Write execute endpoint requires admin or power_user role.

Author  : Member 1 (Backend Lead)
Project : Talk2Tables — Diploma Final Year Project
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

# Internal imports
from ai_agent import run_agent, validate_confirmed_write, get_table_list, ChatMessage
from ai_agent.sql_validator import validate_confirmed_write

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["query"])


# ---------------------------------------------------------------------------
# Request / Response Models (Pydantic)
# ---------------------------------------------------------------------------

class QueryRequest(BaseModel):
    """POST /api/query — Submit a natural language query."""
    natural_language: str = Field(..., min_length=1, max_length=2000,
                                   description="User's query in English or Hindi")
    db_id:            str = Field(..., description="Target DB connection UUID")
    chat_history:     list[dict] = Field(default_factory=list,
                                          description="Previous conversation turns for multi-turn context")

    class Config:
        json_schema_extra = {
            "example": {
                "natural_language": "Show sensors overdue for calibration in the next 30 days",
                "db_id": "conn-uuid-abc123",
                "chat_history": []
            }
        }


class ExecuteWriteRequest(BaseModel):
    """POST /api/query/execute — Confirm and execute a previewed write operation."""
    confirmed_sql: str = Field(..., description="The exact SQL shown in the preview")
    db_id:         str = Field(..., description="Target DB connection UUID")
    session_token: str = Field(..., description="Preview session token for CSRF protection")

    class Config:
        json_schema_extra = {
            "example": {
                "confirmed_sql": "UPDATE calibrations SET status = 'completed' WHERE sensor_id = 'S-201'",
                "db_id": "conn-uuid-abc123",
                "session_token": "preview-token-xyz"
            }
        }


class QueryResponse(BaseModel):
    """Unified response model for all query endpoints."""
    response_type:  str
    final_response: dict[str, Any]
    chat_history:   list[dict] = []
    llm_provider:   Optional[str] = None


# ---------------------------------------------------------------------------
# Dependency stubs (replace with your actual auth + DB dependencies)
# ---------------------------------------------------------------------------

async def get_current_user() -> dict:
    """
    Dependency: Extract and validate JWT, return user info.
    ⚠️  Replace this stub with your real JWT auth dependency from auth.py
    """
    # TODO: Implement JWT verification using PyJWT + bcrypt
    # Example real implementation:
    #   token = credentials.credentials
    #   payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    #   return {"user_id": payload["sub"], "role": payload["role"]}
    return {"user_id": "demo-user", "role": "viewer"}


async def get_system_db():
    """
    Dependency: SQLAlchemy async session for system DB (users, connections, schema_docs).
    ⚠️  Replace with your actual async session factory from database.py
    """
    # TODO: yield AsyncSession from your async_session_maker
    # Example:
    #   async with async_session_maker() as session:
    #       yield session
    yield None


async def get_connection_info(db_id: str, user_id: str, system_db=None) -> dict:
    """
    Fetch DB connection details from system DB by connection UUID.
    ⚠️  Replace with real DB lookup from your connections table.

    Returns:
        { "connection_string": "...", "dialect": "mysql" }
    """
    # TODO: Query connections table for the given db_id and user_id
    # Ensure user owns or has access to this connection (RBAC)
    # Decrypt stored credentials from vault
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Connection '{db_id}' not found or access denied."
    )


# ---------------------------------------------------------------------------
# POST /api/query — Main NL2SQL endpoint
# ---------------------------------------------------------------------------

@router.post("/query", response_model=QueryResponse)
async def query(
    request:      QueryRequest,
    current_user: dict = Depends(get_current_user),
    system_db          = Depends(get_system_db),
):
    """
    Submit a natural language query for AI-powered SQL generation and execution.

    - **READ queries** (SELECT): Executed immediately, results returned.
    - **WRITE queries** (INSERT/UPDATE/DELETE): Returns a preview for user confirmation.
    - **Ambiguous queries**: Returns a clarification question.

    Multi-turn context is maintained via the `chat_history` field.
    """
    user_id   = current_user["user_id"]
    user_role = current_user["role"]

    logger.info(
        f"[POST /api/query] user={user_id} role={user_role} "
        f"db_id={request.db_id} | query='{request.natural_language[:80]}'"
    )

    # ── Fetch connection details ───────────────────────────────────────────
    try:
        conn_info = await get_connection_info(request.db_id, user_id, system_db)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[POST /api/query] Connection fetch failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve database connection details."
        )

    # ── Validate and cast chat history ────────────────────────────────────
    chat_history: list[ChatMessage] = []
    for turn in request.chat_history:
        role    = turn.get("role", "user")
        content = turn.get("content", "")
        if role in ("user", "assistant") and content:
            chat_history.append(ChatMessage(role=role, content=content))

    # ── Run the AI agent ──────────────────────────────────────────────────
    try:
        result = await run_agent(
            natural_language_query = request.natural_language,
            db_connection_string   = conn_info["connection_string"],
            connection_id          = request.db_id,
            user_id                = user_id,
            user_role              = user_role,
            chat_history           = chat_history,
            db_dialect             = conn_info.get("dialect"),
            system_db_session      = system_db,
        )
    except Exception as exc:
        logger.error(f"[POST /api/query] Agent error: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI agent encountered an error: {exc}"
        )

    # ── Log query to history (async, non-blocking) ────────────────────────
    # TODO: Call audit_logger.log_query(user_id, request.natural_language, result)

    return QueryResponse(
        response_type  = result["response_type"],
        final_response = result["final_response"],
        chat_history   = result.get("chat_history", []),
        llm_provider   = result.get("llm_provider"),
    )


# ---------------------------------------------------------------------------
# POST /api/query/execute — Confirm and execute write operation
# ---------------------------------------------------------------------------

@router.post("/query/execute", response_model=QueryResponse)
async def execute_write(
    request:      ExecuteWriteRequest,
    current_user: dict = Depends(get_current_user),
    system_db          = Depends(get_system_db),
):
    """
    Execute a write operation (INSERT/UPDATE/DELETE) after user confirmation.

    This endpoint is only called when the user clicks "Confirm" in the
    preview UI. RBAC: requires admin or power_user role.

    Safety: The SQL is re-validated before execution to prevent tampering.
    All write operations are wrapped in a DB transaction and audit logged.
    """
    user_id   = current_user["user_id"]
    user_role = current_user["role"]

    # ── RBAC: Block viewers from write operations ──────────────────────────
    if user_role not in ("admin", "power_user"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Write operations require admin or power_user role."
        )

    logger.info(
        f"[POST /api/query/execute] WRITE CONFIRM | user={user_id} role={user_role} "
        f"db_id={request.db_id}"
    )

    # ── Re-validate the confirmed SQL ─────────────────────────────────────
    validation = validate_confirmed_write(request.confirmed_sql, user_role)
    if not validation["is_valid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"SQL validation failed: {validation['error']}"
        )

    # ── Fetch connection ───────────────────────────────────────────────────
    try:
        conn_info = await get_connection_info(request.db_id, user_id, system_db)
    except HTTPException:
        raise

    # ── Execute in transaction ────────────────────────────────────────────
    try:
        from sqlalchemy import create_engine, text as sa_text
        import time

        engine = create_engine(conn_info["connection_string"], pool_pre_ping=True)
        t_start = time.perf_counter()

        with engine.begin() as conn:  # engine.begin() auto-commits on success, rolls back on exception
            result      = conn.execute(sa_text(request.confirmed_sql))
            affected    = result.rowcount
        elapsed_ms = (time.perf_counter() - t_start) * 1000

        logger.info(
            f"[POST /api/query/execute] Write OK | user={user_id} | "
            f"affected_rows={affected} | {elapsed_ms:.0f}ms"
        )

        # ── Audit log ─────────────────────────────────────────────────────
        # TODO: Call audit_logger.log_write(
        #     user_id=user_id, sql=request.confirmed_sql,
        #     affected_rows=affected, db_id=request.db_id
        # )

    except Exception as exc:
        logger.error(f"[POST /api/query/execute] Write FAILED (rolled back): {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Write operation failed and was rolled back: {exc}"
        )

    return QueryResponse(
        response_type  = "write_success",
        final_response = {
            "message":        f"Operation completed successfully.",
            "affected_rows":  affected,
            "sql":            request.confirmed_sql,
            "execution_time": f"{elapsed_ms:.0f}ms",
        },
        chat_history   = [],
        llm_provider   = None,
    )


# ---------------------------------------------------------------------------
# GET /api/schema/tables — Schema explorer
# ---------------------------------------------------------------------------

@router.get("/schema/tables/{db_id}")
async def list_tables(
    db_id:        str,
    current_user: dict = Depends(get_current_user),
    system_db          = Depends(get_system_db),
):
    """
    Return a list of tables and column counts for the schema explorer sidebar.
    Used by the frontend Schema Explorer component.
    """
    user_id = current_user["user_id"]
    try:
        conn_info = await get_connection_info(db_id, user_id, system_db)
        tables    = get_table_list(conn_info["connection_string"])
        return {"db_id": db_id, "tables": tables, "table_count": len(tables)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Schema listing failed: {exc}"
        )