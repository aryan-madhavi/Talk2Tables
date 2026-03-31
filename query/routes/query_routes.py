# query/routes/query_routes.py
"""
Talk2Tables — Query API Routes (On-Premise)
===========================================
Endpoints:
    POST /api/v1/query              — submit natural language query
    GET  /api/v1/schema/{conn_id}   — list tables for schema explorer sidebar

Auth: JWT Bearer token required on all endpoints.
"""
import logging
import asyncio
import json as _json
import time as _time

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth.routes.dependencies import require_analyst
from ai_agent import run_agent, run_agent_stream
from ai_agent.services.chat_service import get_or_create_chat, get_messages, append_messages
from ai_agent.services.audit_service import log_query
from query.routes.schemas import (
    QueryRequest, 
    QueryResponse, 
    SchemaResponse, 
    SchemaTable, 
    TableSchemaResponse
)

limiter = Limiter(key_func=get_remote_address)
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
)
@limiter.limit("30/minute")
async def query(
    request:      Request,
    body:         QueryRequest,
    current_user: dict = Depends(require_analyst),
):
    user_id   = current_user["uid"]
    user_role = current_user["role"]

    logger.info(
        f"[POST /api/v1/query] uid={user_id} role={user_role} "
        f"connection_id={body.connection_id} | "
        f"query='{body.chat_input[:80]}'"
    )

    # 1. Resolve or create chat
    chat_id = await get_or_create_chat(
        user_id       = user_id,
        connection_id = body.connection_id,
        chat_id       = body.chat_id,
        first_message = body.chat_input,
    )
    
    chat_history = await get_messages(
        user_id       = user_id,
        connection_id = body.connection_id,
        chat_id       = chat_id,
    )

    # 2. Run the AI agent
    _t0 = _time.perf_counter()
    try:
        result = await run_agent(
            natural_language_query = body.chat_input,
            connection_id          = body.connection_id,
            firebase_uid           = user_id, # Keeping key name for AgentState compatibility
            user_role              = user_role,
            chat_id                = chat_id,
            chat_history           = chat_history,
        )
    except Exception as exc:
        logger.error(f"[POST /api/v1/query] Agent error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI agent error: {exc}")

    response_type  = result.get("response_type", "error")
    final_response = result.get("final_response", {})
    exec_ms        = round((_time.perf_counter() - _t0) * 1000, 1)

    # 3. Persist messages + audit log (background)
    async def _background_save():
        _conn_name = ""
        try:
            from connections.services.connection_service import get_connection_by_id
            _c = await get_connection_by_id(body.connection_id)
            _conn_name = (_c or {}).get("name", "")
        except Exception: pass

        try:
            await append_messages(
                user_id            = user_id,
                connection_id      = body.connection_id,
                chat_id            = chat_id,
                user_content       = body.chat_input,
                assistant_response = final_response,
                connection_name    = _conn_name,
            )
        except Exception as exc:
            logger.warning(f"[POST /api/v1/query] append_messages failed: {exc}")

        try:
            await log_query(
                user_id           = user_id,
                connection_id     = body.connection_id,
                chat_id           = chat_id,
                sql_query         = final_response.get("sql_query"),
                summary           = final_response.get("summary"),
                row_count         = final_response.get("total_records", 0),
                execution_time_ms = exec_ms,
                status            = "success" if response_type == "results" else response_type,
                error_message     = final_response.get("error_message"),
            )
        except Exception as exc:
            logger.warning(f"[POST /api/v1/query] log_query failed: {exc}")

        try:
            from core.redis_client import redis_delete
            from core.cache_keys import key_history
            await redis_delete(key_history(user_id), key_history(user_id, favourites_only=True))
        except Exception: pass

    asyncio.ensure_future(_background_save())

    return QueryResponse(
        response_type = response_type,
        chat_id       = chat_id,
        data          = [final_response],
    )


# ── POST /api/v1/query/stream ─────────────────────────────────────────────────

@router.post("/query/stream")
@limiter.limit("30/minute")
async def query_stream(
    request:      Request,
    body:         QueryRequest,
    current_user: dict = Depends(require_analyst),
):
    user_id   = current_user["uid"]
    user_role = current_user["role"]

    chat_id = await get_or_create_chat(
        user_id       = user_id,
        connection_id = body.connection_id,
        chat_id       = body.chat_id,
        first_message = body.chat_input,
    )
    chat_history = await get_messages(
        user_id       = user_id,
        connection_id = body.connection_id,
        chat_id       = chat_id,
    )

    async def _event_generator():
        _t0 = _time.perf_counter()
        final_response = {}
        response_type  = "error"
        try:
            async for sse_line in run_agent_stream(
                natural_language_query = body.chat_input,
                connection_id          = body.connection_id,
                firebase_uid           = user_id,
                user_role              = user_role,
                chat_id                = chat_id,
                chat_history           = chat_history,
            ):
                if sse_line.startswith("event: result\n"):
                    data_part = sse_line.split("data: ", 1)[1].rstrip()
                    parsed = _json.loads(data_part)
                    response_type  = parsed.get("response_type", "error")
                    final_response = parsed.get("final_response", {})
                    yield f"event: result\ndata: {_json.dumps({'response_type': response_type, 'chat_id': chat_id, 'data': [final_response]})}\n\n"
                elif sse_line.startswith("event: insights\n"):
                    data_part = sse_line.split("data: ", 1)[1].rstrip()
                    insights_data = _json.loads(data_part)
                    final_response.update(insights_data)
                    yield sse_line
                else:
                    yield sse_line
        except Exception as exc:
            logger.error(f"[query_stream] Error: {exc}")
            yield f"event: error\ndata: {_json.dumps({'message': str(exc)})}\n\n"
        finally:
            exec_ms = round((_time.perf_counter() - _t0) * 1000, 1)
            async def _bg():
                try:
                    await append_messages(user_id, body.connection_id, chat_id, body.chat_input, final_response)
                    await log_query(user_id, body.connection_id, chat_id, final_response.get("sql_query"), final_response.get("summary"), final_response.get("total_records", 0), exec_ms, status="success" if response_type == "results" else response_type)
                except Exception: pass
            asyncio.ensure_future(_bg())

    return StreamingResponse(_event_generator(), media_type="text/event-stream")


# ── GET /api/v1/query/history ──────────────────────────────────────────────────

@router.get("/query/history")
async def query_history(
    limit:           int = Query(20, ge=1, le=100),
    offset:          int = Query(0, ge=0),
    favourites_only: bool = Query(False, alias="favourites_only"),
    current_user:    dict = Depends(require_analyst),
):
    from ai_agent.services.audit_service import get_query_history
    
    user_id = current_user["uid"]
    history = await get_query_history(
        user_id         = user_id,
        limit           = limit,
        offset          = offset,
        favourites_only = favourites_only,
    )
    
    return {
        "history": history,
        "total":   len(history),
        "limit":   limit,
        "offset":  offset
    }


# ── GET /api/v1/schema/{connection_id} ────────────────────────────────────────

@router.get("/schema/{connection_id}", response_model=SchemaResponse)
async def list_schema(
    connection_id: str,
    current_user:  dict = Depends(require_analyst),
):
    user_id = current_user["uid"]
    if current_user["role"] not in {"admin", "db_manager"}:
        from access.services.access_service import verify_access
        allowed, reason = await verify_access(user_id, connection_id)
        if not allowed: raise HTTPException(status_code=403, detail=reason)

    try:
        from connections.services.connection_service import get_connection_with_password
        from ai_agent.nodes.entry import _build_connection_string
        from ai_agent.tools.schema_tools import make_schema_tools, _mongo_get, _is_fresh, _TABLES_DOC_ID

        conn = await get_connection_with_password(connection_id)
        if not conn: raise HTTPException(status_code=404, detail="Connection not found")
        
        conn_str = _build_connection_string(conn)
        
        # 1. Check MongoDB cache
        doc = await _mongo_get(connection_id, _TABLES_DOC_ID)
        if doc and _is_fresh(doc.get("cached_at", "")):
            raw_tables = doc["tables"]
            schemas_grouped = {}
            flat_tables = []
            for row in raw_tables:
                s = row.get("table_schema") or "default"
                t = row.get("table_name", "")
                schemas_grouped.setdefault(s, []).append(t)
                flat_tables.append(SchemaTable(table=t, schema_name=s, columns=row.get("column_count", 0)))
            return SchemaResponse(connection_id=connection_id, schemas=schemas_grouped, tables=flat_tables, table_count=len(flat_tables), cached=True, stale=False, cached_at=doc.get("cached_at"))

        # 2. Cold start
        tools = make_schema_tools(conn_str, connection_id)
        result_raw = await tools[0].ainvoke({})
        raw_tables = _json.loads(result_raw)
        
        schemas_grouped = {}
        flat_tables = []
        for row in raw_tables:
            s = row.get("table_schema") or "default"
            t = row.get("table_name", "")
            schemas_grouped.setdefault(s, []).append(t)
            flat_tables.append(SchemaTable(table=t, schema_name=s, columns=row.get("column_count", 0)))
            
        return SchemaResponse(connection_id=connection_id, schemas=schemas_grouped, tables=flat_tables, table_count=len(flat_tables), cached=False, stale=False)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/schema/{connection_id}/{schema_name}/{table_name}", response_model=TableSchemaResponse)
async def get_table_schema(
    connection_id: str,
    schema_name:   str,
    table_name:    str,
    current_user:  dict = Depends(require_analyst),
):
    from connections.services.connection_service import get_connection_with_password
    from ai_agent.nodes.entry import _build_connection_string
    from ai_agent.tools.schema_tools import make_schema_tools, _mongo_get, _is_fresh, _table_doc_id

    conn = await get_connection_with_password(connection_id)
    if not conn: raise HTTPException(status_code=404, detail="Connection not found")
    
    # 1. Check MongoDB cache
    doc_id = _table_doc_id(schema_name, table_name)
    doc = await _mongo_get(connection_id, doc_id)
    if doc and _is_fresh(doc.get("cached_at", "")):
        return TableSchemaResponse(
            connection_id=connection_id,
            schema=schema_name,
            table=table_name,
            columns=doc["columns"],
            cached=True,
            cached_at=doc.get("cached_at")
        )

    # 2. Live fetch
    conn_str = _build_connection_string(conn)
    tools = make_schema_tools(conn_str, connection_id)
    # tools[1] is get_table_definition
    result_raw = await tools[1].ainvoke({"table_name": table_name, "schema_name": schema_name})
    
    if result_raw.startswith("Error"):
        raise HTTPException(status_code=500, detail=result_raw)
        
    columns = _json.loads(result_raw)
    return TableSchemaResponse(
        connection_id=connection_id,
        schema=schema_name,
        table=table_name,
        columns=columns,
        cached=False
    )


@router.get("/query/suggestions")
async def get_query_suggestions(
    connection_id: str = Query(...),
    current_user:  dict = Depends(require_analyst),
):
    from ai_agent.suggestions import get_suggestions
    suggestions = await get_suggestions(connection_id)
    return {"suggestions": suggestions}


class InsightsRequest(BaseModel):
    question: str
    data:     list[dict]

@router.post("/query/insights")
async def generate_insights_route(
    body:         InsightsRequest,
    current_user: dict = Depends(require_analyst),
):
    from ai_agent.nodes.output_parser import _generate_numerical_insights, _generate_narrative_insights
    
    numerical, narrative = await asyncio.gather(
        _generate_numerical_insights(body.question, body.data),
        _generate_narrative_insights(body.question, body.data),
    )
    
    return {
        "numerical_insights": numerical,
        "narrative_insights": narrative
    }
