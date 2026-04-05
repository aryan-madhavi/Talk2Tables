# chat/routes/chat_routes.py
"""
Chat / Workspace browser endpoints.

All data is scoped to the authenticated user's firebase_uid.
Users can only read their own chats — no cross-user access.

Endpoints:
    GET    /api/v1/chat/recent
    GET    /api/v1/chat/workspaces
    GET    /api/v1/chat/workspaces/{connection_id}/chats
    GET    /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages
    GET    /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}
    POST   /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}/favourite
    DELETE /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}/favourite
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.routes.dependencies import require_analyst
from chat.routes.schemas import (
    WorkspaceOut, WorkspaceListResponse,
    ChatOut, ChatListResponse,
    MessageOut, MessagesResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/chat",
    tags=["Chat & Workspaces"],
)


def _db():
    from auth.core.firebase import get_firestore_client
    return get_firestore_client()


def _workspace_col(db, uid: str):
    return db.collection("users").document(uid).collection("workspaces")


def _chat_col(db, uid: str, connection_id: str):
    return _workspace_col(db, uid).document(connection_id).collection("chats")


def _messages_col(db, uid: str, connection_id: str, chat_id: str):
    return _chat_col(db, uid, connection_id).document(chat_id).collection("messages")


def _to_message_out(doc_id: str, data: dict) -> dict:
    return {
        "msg_id":             doc_id,
        "seq":                data.get("seq", 0),
        "role":               data.get("role", ""),
        "content":            data.get("content", ""),
        "title":              data.get("title"),
        "sql_query":          data.get("sql_query"),
        "query_type":         data.get("query_type"),
        "status":             data.get("status"),
        "summary":            data.get("summary"),
        "total_records":      data.get("total_records"),
        "numerical_insights": data.get("numerical_insights"),
        "narrative_insights": data.get("narrative_insights"),
        "data":               data.get("data"),
        "error_message":      data.get("error_message"),
        "favourited":         data.get("favourited", False),
        "created_at":         data.get("created_at", ""),
    }


# ── GET /api/v1/chat/recent ───────────────────────────────────────────────────

@router.get(
    "/recent",
    summary="Get last 5 recent chats across all workspaces",
    description=(
        "Returns the 5 most recently updated chats for the current user, "
        "regardless of which DB they belong to. "
        "Requires a Firestore composite index on the 'chats' collection group: "
        "firebase_uid ASC + updated_at DESC."
    ),
)
async def get_recent_chats(
    current_user: dict = Depends(require_analyst),
):
    uid = current_user["firebase_uid"]
    try:
        from google.cloud.firestore_v1 import Query
        from google.cloud.firestore_v1.base_query import FieldFilter
        db   = _db()
        docs = (
            db.collection_group("chats")
              .where(filter=FieldFilter("firebase_uid", "==", uid))
              .order_by("updated_at", direction=Query.DESCENDING)
              .limit(5)
              .stream()
        )
        chats = []
        for doc in docs:
            d = doc.to_dict()
            chats.append({
                "chat_id":       d.get("chat_id", doc.id),
                "title":         d.get("title", ""),
                "connection_id": d.get("connection_id", ""),
                "turn_count":    d.get("turn_count", 0),
                "created_at":    d.get("created_at", ""),
                "updated_at":    d.get("updated_at", ""),
            })
        return {"chats": chats, "total": len(chats)}
    except Exception as exc:
        logger.error(f"[GET /chat/recent] uid={uid} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── GET /api/v1/chat/workspaces ───────────────────────────────────────────────

@router.get(
    "/workspaces",
    response_model=WorkspaceListResponse,
    summary="List all workspaces for the current user",
    description="Each workspace corresponds to one database connection the user has queried.",
)
async def list_workspaces(
    current_user: dict = Depends(require_analyst),
):
    uid = current_user["firebase_uid"]
    try:
        db   = _db()
        docs = _workspace_col(db, uid).stream()
        workspaces = []
        for doc in docs:
            d = doc.to_dict()
            workspaces.append(WorkspaceOut(
                connection_id   = d.get("connection_id", doc.id),
                connection_name = d.get("connection_name", ""),
                created_at      = d.get("created_at", ""),
            ))
        return WorkspaceListResponse(workspaces=workspaces, total=len(workspaces))
    except Exception as exc:
        logger.error(f"[GET /chat/workspaces] uid={uid} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── GET /api/v1/chat/workspaces/{connection_id}/chats ─────────────────────────

@router.get(
    "/workspaces/{connection_id}/chats",
    response_model=ChatListResponse,
    summary="List all chats in a workspace",
)
async def list_chats(
    connection_id: str,
    current_user:  dict = Depends(require_analyst),
):
    uid = current_user["firebase_uid"]
    try:
        from google.cloud.firestore_v1 import Query
        db   = _db()
        docs = (
            _chat_col(db, uid, connection_id)
              .order_by("updated_at", direction=Query.DESCENDING)
              .stream()
        )
        chats = []
        for doc in docs:
            d = doc.to_dict()
            chats.append(ChatOut(
                chat_id       = d.get("chat_id", doc.id),
                title         = d.get("title", ""),
                connection_id = d.get("connection_id", connection_id),
                msg_count     = d.get("turn_count", 0),
                created_at    = d.get("created_at", ""),
                updated_at    = d.get("updated_at", ""),
            ))
        return ChatListResponse(connection_id=connection_id, chats=chats, total=len(chats))
    except Exception as exc:
        logger.error(f"[GET /chat/workspaces/{connection_id}/chats] uid={uid} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── GET /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages ──────

@router.get(
    "/workspaces/{connection_id}/chats/{chat_id}/messages",
    response_model=MessagesResponse,
    summary="Get paginated messages in a chat",
    description=(
        "Returns messages ordered by seq (ascending). "
        "Use ?limit=30 to control page size and ?before_seq=N to load earlier pages. "
        "Pass next_before_seq from the previous response as before_seq to paginate backwards."
    ),
)
async def get_messages(
    connection_id: str,
    chat_id:       str,
    limit:         int      = Query(default=30, ge=1, le=100),
    before_seq:    int|None = Query(default=None, ge=1),
    current_user:  dict     = Depends(require_analyst),
):
    uid = current_user["firebase_uid"]
    try:
        from google.cloud.firestore_v1 import Query as FsQuery
        from google.cloud.firestore_v1.base_query import FieldFilter
        db = _db()

        q = _messages_col(db, uid, connection_id, chat_id)

        if before_seq is not None:
            q = q.where(filter=FieldFilter("seq", "<", before_seq))

        # Fetch descending (limit+1 to detect has_more), then reverse to ascending
        docs = list(
            q.order_by("seq", direction=FsQuery.DESCENDING)
             .limit(limit + 1)
             .stream()
        )

        has_more  = len(docs) > limit
        page_docs = docs[:limit]
        page_docs.reverse()   # oldest → newest for the frontend

        messages        = [_to_message_out(doc.id, doc.to_dict()) for doc in page_docs]
        next_before_seq = messages[0]["seq"] if has_more and messages else None

        return MessagesResponse(
            chat_id         = chat_id,
            connection_id   = connection_id,
            messages        = messages,
            total           = len(messages),
            has_more        = has_more,
            next_before_seq = next_before_seq,
        )
    except Exception as exc:
        logger.error(f"[GET messages] chat={chat_id} uid={uid} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── GET /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id} ──

@router.get(
    "/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}",
    summary="Get a single message with all fields",
    description=(
        "Returns the full message document including sql_query, data, "
        "numerical_insights, total_records, summary, and error_message. "
        "msg_id is the hex sequence ID: 0001, 0002, etc."
    ),
)
async def get_message(
    connection_id: str,
    chat_id:       str,
    msg_id:        str,
    current_user:  dict = Depends(require_analyst),
):
    uid = current_user["firebase_uid"]
    try:
        db  = _db()
        doc = _messages_col(db, uid, connection_id, chat_id).document(msg_id).get()
        if not doc.exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Message '{msg_id}' not found in chat '{chat_id}'.",
            )
        return _to_message_out(doc.id, doc.to_dict())
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[GET message/{msg_id}] chat={chat_id} uid={uid} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── POST /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}/favourite ──

@router.post(
    "/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}/favourite",
    summary="Favourite an AI message",
    description="Mark an assistant message as favourited. Only assistant (a_XXXX) messages can be favourited.",
    status_code=status.HTTP_200_OK,
)
async def favourite_message(
    connection_id: str,
    chat_id:       str,
    msg_id:        str,
    current_user:  dict = Depends(require_analyst),
):
    uid = current_user["firebase_uid"]
    try:
        db  = _db()
        ref = _messages_col(db, uid, connection_id, chat_id).document(msg_id)
        doc = ref.get()
        if not doc.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Message '{msg_id}' not found.")
        if doc.to_dict().get("role") != "assistant":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only assistant messages can be favourited.")
        ref.update({"favourited": True})
        try:
            from core.redis_client import redis_delete
            from core.cache_keys import key_history
            import asyncio
            asyncio.ensure_future(redis_delete(key_history(uid), key_history(uid, favourites_only=True)))
        except Exception:
            pass
        return {"msg_id": msg_id, "favourited": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[POST favourite/{msg_id}] chat={chat_id} uid={uid} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── DELETE /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}/favourite ──

@router.delete(
    "/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}/favourite",
    summary="Remove favourite from an AI message",
    description="Unmark an assistant message as favourited.",
    status_code=status.HTTP_200_OK,
)
async def unfavourite_message(
    connection_id: str,
    chat_id:       str,
    msg_id:        str,
    current_user:  dict = Depends(require_analyst),
):
    uid = current_user["firebase_uid"]
    try:
        db  = _db()
        ref = _messages_col(db, uid, connection_id, chat_id).document(msg_id)
        doc = ref.get()
        if not doc.exists:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Message '{msg_id}' not found.")
        ref.update({"favourited": False})
        try:
            from core.redis_client import redis_delete
            from core.cache_keys import key_history
            import asyncio
            asyncio.ensure_future(redis_delete(key_history(uid), key_history(uid, favourites_only=True)))
        except Exception:
            pass
        return {"msg_id": msg_id, "favourited": False}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[DELETE favourite/{msg_id}] chat={chat_id} uid={uid} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
