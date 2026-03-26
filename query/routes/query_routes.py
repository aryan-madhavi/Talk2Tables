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
import logging
import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

from auth.routes.dependencies import require_analyst

limiter = Limiter(key_func=get_remote_address)
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
@limiter.limit("30/minute")
async def query(
    request:      Request,
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

    # ── 1. Resolve or create chat (parallel fetch if chat already exists) ──────
    if body.chat_id:
        # Known chat — fetch chat metadata and history in parallel
        chat_id, chat_history = await asyncio.gather(
            asyncio.to_thread(
                get_or_create_chat,
                firebase_uid  = firebase_uid,
                connection_id = body.connection_id,
                chat_id       = body.chat_id,
                first_message = body.chat_input,
            ),
            asyncio.to_thread(
                get_messages,
                firebase_uid  = firebase_uid,
                connection_id = body.connection_id,
                chat_id       = body.chat_id,
            ),
        )
    else:
        # New chat — create it first, no history to load
        chat_id = await asyncio.to_thread(
            get_or_create_chat,
            firebase_uid  = firebase_uid,
            connection_id = body.connection_id,
            chat_id       = None,
            first_message = body.chat_input,
        )
        chat_history = []

    # ── 2. Run the AI agent ───────────────────────────────────────────────────
    import time as _time
    _t0 = _time.perf_counter()
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
    exec_ms        = round((_time.perf_counter() - _t0) * 1000, 1)

    # ── 3. Persist messages + audit log + cache invalidate (fire-and-forget) ───
    async def _background_save():
        _conn_name = ""
        try:
            from connections.services.connection_service import get_connection_by_id
            _c = await get_connection_by_id(body.connection_id)
            _conn_name = (_c or {}).get("name", "")
        except Exception:
            pass

        try:
            await asyncio.to_thread(
                append_messages,
                firebase_uid       = firebase_uid,
                connection_id      = body.connection_id,
                chat_id            = chat_id,
                user_content       = body.chat_input,
                assistant_response = final_response,
                connection_name    = _conn_name,
            )
        except Exception as exc:
            logger.warning(f"[POST /api/v1/query] append_messages failed (non-fatal): {exc}")

        try:
            await log_query(
                firebase_uid      = firebase_uid,
                connection_id     = body.connection_id,
                chat_id           = chat_id,
                sql_query         = final_response.get("sql_query"),
                summary           = final_response.get("summary"),
                row_count         = final_response.get("numerical_insights", {}).get("total_records", 0),
                execution_time_ms = exec_ms,
                status            = "success" if response_type == "results" else response_type,
                error_message     = final_response.get("error_message"),
            )
        except Exception as exc:
            logger.warning(f"[POST /api/v1/query] log_query failed (non-fatal): {exc}")

        try:
            from core.redis_client import redis_delete
            from core.cache_keys import key_history
            await redis_delete(
                key_history(firebase_uid),
                key_history(firebase_uid, favourites_only=True),
            )
        except Exception:
            pass

    asyncio.ensure_future(_background_save())

    return QueryResponse(
        response_type = response_type,
        chat_id       = chat_id,
        data          = [final_response],
    )


# ── GET /api/v1/schema/{connection_id} ────────────────────────────────────────

@router.get(
    "/schema/{connection_id}",
    response_model=SchemaResponse,
    summary="List tables for schema explorer",
    description=(
        "Returns all tables grouped by schema name. Uses Firestore schema cache (1h TTL). "
        "Safe for users who have never run a query — triggers a live DB fetch + cache write on first call. "
        "Requires an active access grant (or admin/db_manager role)."
    ),
)
async def list_schema(
    connection_id: str,
    current_user:  dict = Depends(require_analyst),
):
    import json as _json
    import asyncio as _asyncio
    firebase_uid = current_user["firebase_uid"]

    # admin/db_manager bypass the grant check — they can see all connections.
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

    try:
        from connections.services.connection_service import get_connection_with_password
        from ai_agent.nodes.entry import _build_connection_string
        from ai_agent.tools.schema_tools import (
            make_schema_tools, _cache_ref, _is_fresh,
            _TABLES_DOC_ID,
        )
        from auth.core.firebase import get_firestore_client

        conn = await get_connection_with_password(connection_id)
        if not conn:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connection not found.")

        conn_str = _build_connection_string(conn)

        def _build_response(raw_tables: list, *, cached: bool, stale: bool, cached_at: str | None) -> SchemaResponse:
            schemas_grouped: dict[str, list[str]] = {}
            flat_tables: list[SchemaTable] = []
            for row in raw_tables:
                s = row.get("table_schema") or "default"
                t = row.get("table_name", "")
                schemas_grouped.setdefault(s, []).append(t)
                flat_tables.append(SchemaTable(table=t, schema_name=s, columns=row.get("column_count", 0)))
            return SchemaResponse(
                connection_id = connection_id,
                schemas       = schemas_grouped,
                tables        = flat_tables,
                table_count   = len(flat_tables),
                cached        = cached,
                stale         = stale,
                cached_at     = cached_at,
            )

        async def _bg_refresh():
            """Background task: re-fetch and overwrite stale cache without blocking response."""
            try:
                tools = make_schema_tools(conn_str, connection_id)
                await _asyncio.to_thread(tools[0].invoke, {})
                logger.info(f"[SchemaCache] Background refresh done | conn={connection_id}")
            except Exception as exc:
                logger.warning(f"[SchemaCache] Background refresh failed (non-fatal): {exc}")

        # ── 1. Check Firestore cache ───────────────────────────────────────
        try:
            db  = get_firestore_client()
            ref = _cache_ref(db, connection_id, _TABLES_DOC_ID)
            doc = ref.get()
            if doc.exists:
                meta       = doc.to_dict()
                raw_tables = meta.get("tables", [])
                cached_at  = meta.get("cached_at")
                if _is_fresh(cached_at or ""):
                    # Fresh cache — return immediately, no DB call needed
                    return _build_response(raw_tables, cached=True, stale=False, cached_at=cached_at)
                elif raw_tables:
                    # Stale cache — return old data instantly + refresh in background
                    _asyncio.create_task(_bg_refresh())
                    return _build_response(raw_tables, cached=True, stale=True, cached_at=cached_at)
        except Exception as exc:
            logger.warning(f"[SchemaCache] Cache read failed (non-fatal): {exc}")

        # ── 2. Cold start — no cache yet, fetch live (blocks max ~10s) ────
        tools     = make_schema_tools(conn_str, connection_id)
        result_raw = await _asyncio.to_thread(tools[0].invoke, {})

        try:
            raw_tables = _json.loads(result_raw)
        except Exception:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=result_raw)

        # Read back cached_at that the tool just wrote
        cached_at = None
        try:
            doc = ref.get()
            if doc.exists:
                cached_at = doc.to_dict().get("cached_at")
        except Exception:
            pass

        return _build_response(raw_tables, cached=False, stale=False, cached_at=cached_at)

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


# ── GET /api/v1/query/suggestions ────────────────────────────────────────────

@router.get(
    "/query/suggestions",
    summary="Get AI-generated query suggestions for a connection",
    description=(
        "Returns up to 6 natural-language query suggestions derived from the "
        "connection's schema using the configured LLM. Results are cached in "
        "Redis for 24 hours — the LLM is only called on the first request per "
        "connection (or after the cache expires). "
        "Requires an active access grant (or admin/db_manager role)."
    ),
)
async def get_query_suggestions(
    connection_id: str,
    current_user:  dict = Depends(require_analyst),
):
    firebase_uid = current_user["firebase_uid"]

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

    try:
        from ai_agent.suggestions import get_suggestions
        suggestions = await get_suggestions(connection_id)
        return {"suggestions": suggestions, "connection_id": connection_id}
    except Exception as exc:
        logger.error(f"[GET /query/suggestions] conn={connection_id} uid={firebase_uid} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── POST /api/v1/query/insights ───────────────────────────────────────────────

class InsightsRequest(BaseModel):
    data:     list[dict]
    question: str = ""

@router.post(
    "/query/insights",
    summary="Generate narrative insights for a result set",
    description=(
        "Computes programmatic column statistics and generates three plain-English "
        "insight cards (key finding, business insight, analyst note) using the LLM. "
        "Use when insights were not generated during the original query execution."
    ),
)
@limiter.limit("20/minute")
async def generate_insights(
    request:      Request,
    body:         InsightsRequest,
    current_user: dict = Depends(require_analyst),
):
    if not body.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="data must not be empty.")
    try:
        from ai_agent.nodes.output_parser import _compute_insights, _generate_narrative_insights
        computed  = _compute_insights(body.data)
        narrative = await _generate_narrative_insights(body.question, body.data, computed)
        return {
            "numerical_insights": computed,
            "narrative_insights": narrative,
        }
    except Exception as exc:
        logger.error(f"[POST /query/insights] uid={current_user['firebase_uid']} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── GET /api/v1/query/history ─────────────────────────────────────────────────

@router.get(
    "/query/history",
    summary="Get query history for the current user",
    description=(
        "Returns a paginated list of AI assistant messages across all chats and workspaces. "
        "Each item shows title, sql_query, timestamp, database, query_type, status, and favourited flag. "
        "Requires Firestore composite index on 'messages' collection group: "
        "firebase_uid ASC + role ASC + created_at DESC."
    ),
)
async def get_query_history(
    limit:        int  = 50,
    offset:       int  = 0,
    favourites_only: bool = False,
    current_user: dict = Depends(require_analyst),
):
    from google.cloud.firestore_v1 import Query as FSQuery
    from auth.core.firebase import get_firestore_client

    from google.cloud.firestore_v1.base_query import FieldFilter

    uid = current_user["firebase_uid"]

    # Cache only first-page requests (offset=0) — non-default pagination skips cache
    from core.redis_client import redis_get, redis_set
    from core.cache_keys import key_history, TTL_HISTORY
    use_cache = offset == 0
    cache_key = key_history(uid, favourites_only) if use_cache else None

    if use_cache:
        cached = await redis_get(cache_key)
        if cached:
            # Respect the requested limit even on cache hit
            items = cached if isinstance(cached, list) else []
            return {"history": items[:limit], "total": len(items[:limit]), "limit": limit, "offset": 0}

    try:
        db = get_firestore_client()
        q  = (
            db.collection_group("messages")
              .where(filter=FieldFilter("firebase_uid", "==", uid))
              .where(filter=FieldFilter("role", "==", "assistant"))
              .order_by("created_at", direction=FSQuery.DESCENDING)
        )
        if favourites_only:
            q = q.where(filter=FieldFilter("favourited", "==", True))

        docs = q.limit(limit + offset).stream()

        items = []
        for i, doc in enumerate(docs):
            if i < offset:
                continue
            d = doc.to_dict()
            items.append({
                "msg_id":          doc.id,
                "chat_id":         d.get("chat_id", ""),
                "connection_id":   d.get("connection_id", ""),
                "connection_name": d.get("connection_name", ""),
                "title":           d.get("title", ""),
                "sql_query":       d.get("sql_query", ""),
                "query_type":      d.get("query_type", "UNKNOWN"),
                "status":          d.get("status", "success"),
                "total_records":   d.get("total_records", 0),
                "favourited":      d.get("favourited", False),
                "created_at":      d.get("created_at", ""),
            })

        if use_cache and items:
            await redis_set(cache_key, items, TTL_HISTORY)

        return {"history": items, "total": len(items), "limit": limit, "offset": offset}

    except Exception as exc:
        logger.error(f"[GET /query/history] uid={uid} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── GET /api/v1/query/audits ──────────────────────────────────────────────────

@router.get(
    "/query/audits",
    summary="Get audit logs (own logs; admin/db_manager can view any user)",
    description=(
        "Returns audit records across all connections. "
        "Regular users see only their own logs. "
        "Admin and db_manager can pass ?uid=<firebase_uid> to view any user's logs. "
        "Optional filters: connection_id, status (success|error). "
        "Requires Firestore composite index on 'audits' collection group: "
        "firebase_uid ASC + created_at DESC."
    ),
)
async def get_audit_logs(
    limit:         int        = 50,
    offset:        int        = 0,
    uid:           str | None = None,                               # admin/db_manager only
    connection_id: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),  # ?status=success|error
    current_user:  dict       = Depends(require_analyst),
):
    from google.cloud.firestore_v1 import Query as FSQuery
    from auth.core.firebase import get_firestore_client
    from google.cloud.firestore_v1.base_query import FieldFilter

    _ELEVATED = {"admin", "db_manager"}
    caller_uid  = current_user["firebase_uid"]
    caller_role = current_user["role"]

    # If ?uid= provided, only admin/db_manager may use it
    if uid and uid != caller_uid:
        if caller_role not in _ELEVATED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admin or db_manager can view another user's audit logs.",
            )
        target_uid = uid
    else:
        target_uid = caller_uid

    try:
        db = get_firestore_client()
        q  = (
            db.collection_group("audits")
              .where(filter=FieldFilter("firebase_uid", "==", target_uid))
              .order_by("created_at", direction=FSQuery.DESCENDING)
        )
        if connection_id:
            q = q.where(filter=FieldFilter("connection_id", "==", connection_id))
        if status_filter == "success":
            q = q.where(filter=FieldFilter("status", "in", ["success", "results"]))
        elif status_filter == "error":
            q = q.where(filter=FieldFilter("status", "==", "error"))

        docs   = q.limit(limit + offset).stream()
        audits = []
        for i, doc in enumerate(docs):
            if i < offset:
                continue
            d = doc.to_dict()
            audits.append({
                "audit_id":          d.get("audit_id", doc.id),
                "firebase_uid":      d.get("firebase_uid", ""),
                "connection_id":     d.get("connection_id", ""),
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
            "audits":     audits,
            "total":      len(audits),
            "limit":      limit,
            "offset":     offset,
            "viewed_uid": target_uid,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[GET /query/audits] caller={caller_uid} target={target_uid} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
