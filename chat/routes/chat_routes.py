# chat/routes/chat_routes.py
"""
Chat / Workspace browser endpoints.

All data is scoped to the authenticated user's firebase_uid.
Users can only read their own chats — no cross-user access.

Endpoints:
    GET /api/v1/chat/recent
        — Last 5 chats across ALL workspaces (newest first).
          Uses a Firestore collection group query on "chats" filtered by firebase_uid.
          Requires Firestore index: chats (firebase_uid ASC, updated_at DESC).

    GET /api/v1/chat/workspaces
        — List all workspaces (one per DB connection) for the current user.

    GET /api/v1/chat/workspaces/{connection_id}/chats
        — List all chats in a specific workspace.

    GET /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages
        — All messages in a chat, ordered by seq (hex ID order).

    GET /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}
        — Single message with ALL stored fields (sql_query, data, insights, etc.).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

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
        "msg_id":            doc_id,
        "seq":               data.get("seq", 0),
        "role":              data.get("role", ""),
        "content":           data.get("content", ""),
        "sql_query":         data.get("sql_query"),
        "summary":           data.get("summary"),
        "total_records":     data.get("total_records"),
        "numerical_insights": data.get("numerical_insights"),
        "data":              data.get("data"),
        "error_message":     data.get("error_message"),
        "created_at":        data.get("created_at", ""),
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
        db   = _db()
        docs = (
            db.collection_group("chats")
              .where("firebase_uid", "==", uid)
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
                "msg_count":     d.get("msg_count", 0),
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
                msg_count     = d.get("msg_count", 0),
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
    summary="Get all messages in a chat",
    description="Returns messages ordered by seq (ascending). Each message includes all stored fields.",
)
async def get_messages(
    connection_id: str,
    chat_id:       str,
    current_user:  dict = Depends(require_analyst),
):
    uid = current_user["firebase_uid"]
    try:
        db   = _db()
        docs = _messages_col(db, uid, connection_id, chat_id).order_by("seq").stream()
        messages = [_to_message_out(doc.id, doc.to_dict()) for doc in docs]
        return MessagesResponse(
            chat_id       = chat_id,
            connection_id = connection_id,
            messages      = messages,
            total         = len(messages),
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
