# query/routes/query_routes.py
"""
Talk2Tables — Query API Routes
================================
Endpoints:
    POST /api/v1/query              — submit natural language query
    GET  /api/v1/schema/{conn_id}   — list tables for schema explorer sidebar

Auth: Firebase Bearer token required on all endpoints.
RBAC: All authenticated users can query; write ops enforced inside execute_sql tool.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from auth.routes.dependencies import require_analyst
from ai_agent import run_agent
from ai_agent.services.chat_service import get_or_create_chat, get_messages, append_messages
from ai_agent.services.audit_service import log_query
from query.routes.schemas import QueryRequest, QueryResponse, SchemaResponse, SchemaTable

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1",
    tags=["Query"],
)


# ── POST /api/v1/query ────────────────────────────────────────────────────────

@router.post(
    "/query",
    response_model=QueryResponse,
    summary="Submit a natural language query",
    description=(
        "Convert a natural language query to SQL, execute it against the specified "
        "database connection, and return structured results. "
        "Credentials are fetched from Firestore — never pass them in the request. "
        "Requires an active access grant for the connection."
    ),
)
async def query(
    body:         QueryRequest,
    current_user: dict = Depends(require_analyst),
):
    firebase_uid = current_user["firebase_uid"]
    user_role    = current_user["role"]

    logger.info(
        f"[POST /api/v1/query] uid={firebase_uid} role={user_role} "
        f"connection_id={body.connection_id} | "
        f"query='{body.chat_input[:80]}'"
    )

    # ── 1. Resolve or create chat ─────────────────────────────────────────
    chat_id = get_or_create_chat(
        firebase_uid  = firebase_uid,
        connection_id = body.connection_id,
        chat_id       = body.chat_id,
        first_message = body.chat_input,
    )

    # ── 2. Load conversation history from Firestore ───────────────────────
    chat_history = get_messages(
        firebase_uid  = firebase_uid,
        connection_id = body.connection_id,
        chat_id       = chat_id,
    )

    # ── 3. Run the AI agent ───────────────────────────────────────────────
    try:
        result = await run_agent(
            natural_language_query = body.chat_input,
            connection_id          = body.connection_id,
            firebase_uid           = firebase_uid,
            user_role              = user_role,
            chat_id                = chat_id,
            chat_history           = chat_history,
        )
    except Exception as exc:
        logger.error(f"[POST /api/v1/query] Agent error: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI agent error: {exc}",
        )

    response_type  = result.get("response_type", "error")
    final_response = result.get("final_response", {})

    # ── 4. Save messages to Firestore chat sub-collection ─────────────────
    append_messages(
        firebase_uid        = firebase_uid,
        connection_id       = body.connection_id,
        chat_id             = chat_id,
        user_content        = body.chat_input,
        assistant_response  = final_response,
    )

    # ── 5. Write audit log ────────────────────────────────────────────────
    await log_query(
        firebase_uid      = firebase_uid,
        connection_id     = body.connection_id,
        chat_id           = chat_id,
        sql_query         = final_response.get("sql_query"),
        summary           = final_response.get("summary"),
        row_count         = final_response.get("numerical_insights", {}).get("total_records", 0),
        execution_time_ms = 0,  # execution time tracked inside execute_sql tool
        status            = response_type,
        error_message     = final_response.get("error_message"),
    )

    return QueryResponse(
        response_type = response_type,
        chat_id       = chat_id,
        data          = [final_response],   # frontend expects array: response.data[0]
    )


# ── GET /api/v1/schema/{connection_id} ────────────────────────────────────────

@router.get(
    "/schema/{connection_id}",
    response_model=SchemaResponse,
    summary="List tables for schema explorer",
    description="Returns all tables and column counts for the schema explorer sidebar.",
)
async def list_schema(
    connection_id: str,
    current_user:  dict = Depends(require_analyst),
):
    firebase_uid = current_user["firebase_uid"]

    # Verify access before exposing schema info.
    # admin and db_manager bypass the grant check — they can see all connections.
    _BYPASS_ROLES = {"admin", "db_manager"}
    if current_user["role"] not in _BYPASS_ROLES:
        try:
            from access.services.access_service import verify_access
            allowed, reason = await verify_access(firebase_uid, connection_id)
            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied: {reason}",
                )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    # Fetch connection and reflect schema
    try:
        from connections.services.connection_service import get_connection_with_password
        from ai_agent.tools.schema_tools import detect_dialect, _get_engine
        from sqlalchemy import inspect as sa_inspect

        conn = await get_connection_with_password(connection_id)
        if not conn:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found.")

        from ai_agent.nodes.entry import _build_connection_string
        conn_str  = _build_connection_string(conn)
        engine    = _get_engine(conn_str)
        inspector = sa_inspect(engine)

        tables = []
        for tbl in inspector.get_table_names():
            try:
                col_count = len(inspector.get_columns(tbl))
            except Exception:
                col_count = 0
            tables.append(SchemaTable(table=tbl, columns=col_count))

        return SchemaResponse(
            connection_id = connection_id,
            tables        = tables,
            table_count   = len(tables),
        )

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[GET /api/v1/schema/{connection_id}] Failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Schema listing failed: {exc}",
        )


# ── GET /api/v1/schema/{connection_id}/{schema_name}/{table_name} ─────────────

@router.get(
    "/schema/{connection_id}/{schema_name}/{table_name}",
    summary="Get column definitions for a specific table",
    description=(
        "Returns columns, data types, nullable, defaults, and FK relationships "
        "for the given table. Uses Firestore schema cache (1h TTL). "
        "Requires an active access grant (or admin/db_manager role)."
    ),
)
async def get_table_schema(
    connection_id: str,
    schema_name:   str,
    table_name:    str,
    current_user:  dict = Depends(require_analyst),
):
    firebase_uid = current_user["firebase_uid"]

    _BYPASS_ROLES = {"admin", "db_manager"}
    if current_user["role"] not in _BYPASS_ROLES:
        try:
            from access.services.access_service import verify_access
            allowed, reason = await verify_access(firebase_uid, connection_id)
            if not allowed:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Access denied: {reason}")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))

    try:
        from connections.services.connection_service import get_connection_with_password
        from ai_agent.nodes.entry import _build_connection_string
        from ai_agent.tools.schema_tools import make_schema_tools

        conn = await get_connection_with_password(connection_id)
        if not conn:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found.")

        conn_str = _build_connection_string(conn)
        tools    = make_schema_tools(conn_str, connection_id)

        # get_table_definition is the second tool
        get_table_definition = tools[1]
        result = get_table_definition.invoke({"table_name": table_name, "schema_name": schema_name})

        import json
        try:
            columns = json.loads(result)
        except Exception:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result)

        return {
            "connection_id": connection_id,
            "schema":        schema_name,
            "table":         table_name,
            "columns":       columns,
            "column_count":  len(columns),
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[GET /schema/{connection_id}/{schema_name}/{table_name}] Failed: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
