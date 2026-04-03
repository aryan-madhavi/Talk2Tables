# chat/routes/chat_routes.py
"""
Chat / Workspace browser endpoints (MongoDB version).

All data is scoped to the authenticated user's uid.
Users can only read their own chats — no cross-user access.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth.routes.dependencies import require_analyst
from auth.core.mongo import get_database
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


def _to_message_out(doc: dict) -> dict:
    return {
        "msg_id":             str(doc.get("msg_id", doc.get("_id"))),
        "seq":                doc.get("seq", 0),
        "role":               doc.get("role", ""),
        "content":            doc.get("content", ""),
        "title":              doc.get("title"),
        "sql_query":          doc.get("sql_query"),
        "query_type":         doc.get("query_type"),
        "status":             doc.get("status"),
        "summary":            doc.get("summary"),
        "total_records":      doc.get("total_records"),
        "numerical_insights": doc.get("numerical_insights"),
        "data":               doc.get("data"),
        "error_message":      doc.get("error_message"),
        "favourited":         doc.get("favourited", False),
        "created_at":         doc.get("created_at", ""),
    }


# ── GET /api/v1/chat/recent ───────────────────────────────────────────────────

@router.get(
    "/recent",
    summary="Get last 5 recent chats across all workspaces",
)
async def get_recent_chats(
    current_user: dict = Depends(require_analyst),
):
    user_id = current_user["uid"]
    try:
        db = get_database()
        cursor = db["chats"].find({"user_id": user_id}).sort("updated_at", -1).limit(5)
        chats = []
        async for d in cursor:
            chats.append({
                "chat_id":       d.get("chat_id"),
                "title":         d.get("title", ""),
                "connection_id": d.get("connection_id", ""),
                "turn_count":    d.get("turn_count", 0),
                "created_at":    d.get("created_at", ""),
                "updated_at":    d.get("updated_at", ""),
            })
        return {"chats": chats, "total": len(chats)}
    except Exception as exc:
        logger.error(f"[GET /chat/recent] uid={user_id} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── GET /api/v1/chat/workspaces ───────────────────────────────────────────────

@router.get(
    "/workspaces",
    response_model=WorkspaceListResponse,
    summary="List all workspaces for the current user",
)
async def list_workspaces(
    current_user: dict = Depends(require_analyst),
):
    user_id = current_user["uid"]
    try:
        db = get_database()
        cursor = db["workspaces"].find({"user_id": user_id})
        workspaces = []
        async for d in cursor:
            workspaces.append(WorkspaceOut(
                connection_id   = d.get("connection_id"),
                connection_name = d.get("connection_name", ""),
                created_at      = d.get("created_at", ""),
            ))
        
        if not workspaces:
            pipeline = [
                {"$match": {"user_id": user_id}},
                {"$group": {
                    "_id": "$connection_id",
                    "connection_id": {"$first": "$connection_id"},
                    "created_at": {"$min": "$created_at"}
                }}
            ]
            async for d in db["chats"].aggregate(pipeline):
                workspaces.append(WorkspaceOut(
                    connection_id   = d.get("connection_id"),
                    connection_name = "Database", # Default name
                    created_at      = d.get("created_at", ""),
                ))
                
        return WorkspaceListResponse(workspaces=workspaces, total=len(workspaces))
    except Exception as exc:
        logger.error(f"[GET /chat/workspaces] uid={user_id} error: {exc}")
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
    user_id = current_user["uid"]
    try:
        db = get_database()
        cursor = db["chats"].find({
            "user_id": user_id,
            "connection_id": connection_id
        }).sort("updated_at", -1)
        
        chats = []
        async for d in cursor:
            chats.append(ChatOut(
                chat_id       = d.get("chat_id"),
                title         = d.get("title", ""),
                connection_id = d.get("connection_id", connection_id),
                msg_count     = d.get("turn_count", 0),
                created_at    = d.get("created_at", ""),
                updated_at    = d.get("updated_at", ""),
            ))
        return ChatListResponse(connection_id=connection_id, chats=chats, total=len(chats))
    except Exception as exc:
        logger.error(f"[GET /chat/workspaces/{connection_id}/chats] uid={user_id} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── GET /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages ──────

@router.get(
    "/workspaces/{connection_id}/chats/{chat_id}/messages",
    response_model=MessagesResponse,
    summary="Get paginated messages in a chat",
)
async def get_messages(
    connection_id: str,
    chat_id:       str,
    limit:         int      = Query(default=30, ge=1, le=100),
    before_seq:    int|None = Query(default=None, ge=1),
    current_user:  dict     = Depends(require_analyst),
):
    user_id = current_user["uid"]
    try:
        db = get_database()
        query = {"user_id": user_id, "chat_id": chat_id}
        if before_seq is not None:
            query["seq"] = {"$lt": before_seq}
            
        cursor = db["messages"].find(query).sort("seq", -1).limit(limit + 1)
        
        messages = [_to_message_out(d) async for d in cursor]
        
        has_more = len(messages) > limit
        if has_more:
            messages = messages[:limit]
            
        # Reverse back to ascending order (oldest → newest)
        messages.reverse()
        
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
        logger.error(f"[GET messages] chat={chat_id} uid={user_id} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── GET /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id} ──

@router.get(
    "/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}",
    summary="Get a single message with all fields",
)
async def get_message(
    connection_id: str,
    chat_id:       str,
    msg_id:        str,
    current_user:  dict = Depends(require_analyst),
):
    user_id = current_user["uid"]
    try:
        db = get_database()
        # Try both msg_id and internal _id
        doc = await db["messages"].find_one({
            "user_id": user_id,
            "chat_id": chat_id,
            "$or": [{"msg_id": msg_id}, {"_id": msg_id}]
        })
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Message '{msg_id}' not found in chat '{chat_id}'.",
            )
        return _to_message_out(doc)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[GET message/{msg_id}] chat={chat_id} uid={user_id} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── POST /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}/favourite ──

@router.post(
    "/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}/favourite",
    summary="Favourite an AI message",
    status_code=status.HTTP_200_OK,
)
async def favourite_message(
    connection_id: str,
    chat_id:       str,
    msg_id:        str,
    current_user:  dict = Depends(require_analyst),
):
    user_id = current_user["uid"]
    try:
        db = get_database()
        
        # 1. Update in 'messages' collection
        msg_filter = {
            "user_id": user_id,
            "chat_id": chat_id,
            "$or": [{"msg_id": msg_id}, {"_id": msg_id}],
            "role": "assistant"
        }
        msg_doc = await db["messages"].find_one_and_update(
            msg_filter,
            {"$set": {"favourited": True}},
            return_document=True
        )
        
        # 2. Update in 'audits' collection
        # Audits might have msg_id as 'audit_id' or it might be a UUID
        audit_filter = {
            "user_id": user_id,
            "$or": [{"audit_id": msg_id}, {"_id": msg_id}]
        }
        # Only add chat_id to filter if it's provided and looks valid
        if chat_id:
            audit_filter["chat_id"] = chat_id
        
        # If msg_doc was found, also try matching audits by SQL query to be extra safe
        if msg_doc and msg_doc.get("sql_query"):
            audit_filter["$or"].append({"sql_query": msg_doc["sql_query"]})

        audit_result = await db["audits"].update_many(
            audit_filter,
            {"$set": {"favourited": True}}
        )

        if not msg_doc and audit_result.matched_count == 0:
            # Last ditch effort: find any assistant message in this chat with this ID
            exists = await db["messages"].find_one({"user_id": user_id, "chat_id": chat_id, "$or": [{"msg_id": msg_id}, {"_id": msg_id}]})
            if not exists:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Message '{msg_id}' not found.")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only assistant messages can be favourited.")

        try:
            from core.redis_client import redis_delete
            from core.cache_keys import key_history
            import asyncio
            asyncio.ensure_future(redis_delete(key_history(user_id), key_history(user_id, favourites_only=True)))
        except Exception: pass
        
        return {"msg_id": msg_id, "favourited": True}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[POST favourite/{msg_id}] chat={chat_id} uid={user_id} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── DELETE /api/v1/chat/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}/favourite ──

@router.delete(
    "/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}/favourite",
    summary="Remove favourite from an AI message",
    status_code=status.HTTP_200_OK,
)
async def unfavourite_message(
    connection_id: str,
    chat_id:       str,
    msg_id:        str,
    current_user:  dict = Depends(require_analyst),
):
    user_id = current_user["uid"]
    try:
        db = get_database()
        
        # 1. Update messages
        msg_filter = {
            "user_id": user_id,
            "chat_id": chat_id,
            "$or": [{"msg_id": msg_id}, {"_id": msg_id}]
        }
        msg_doc = await db["messages"].find_one_and_update(msg_filter, {"$set": {"favourited": False}})
        
        # 2. Update audits
        audit_filter = {
            "user_id": user_id,
            "chat_id": chat_id,
            "$or": [{"audit_id": msg_id}, {"_id": msg_id}]
        }
        if msg_doc and msg_doc.get("sql_query"):
            audit_filter["$or"].append({"sql_query": msg_doc["sql_query"]})

        await db["audits"].update_many(audit_filter, {"$set": {"favourited": False}})

        try:
            from core.redis_client import redis_delete
            from core.cache_keys import key_history
            import asyncio
            asyncio.ensure_future(redis_delete(key_history(user_id), key_history(user_id, favourites_only=True)))
        except Exception: pass
        
        return {"msg_id": msg_id, "favourited": False}
    except Exception as exc:
        logger.error(f"[DELETE favourite/{msg_id}] chat={chat_id} uid={user_id} error: {exc}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
