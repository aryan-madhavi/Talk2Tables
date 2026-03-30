# ai_agent/services/chat_service.py
"""
Chat & Workspace Service — manages MongoDB collections for per-user conversations.

MongoDB Collections:
    chats    - Metadata about a conversation (title, connection_id, user_id, turn_count)
    messages - All messages across all chats, linked by chat_id and user_id

Message Ordering:
    Messages are ordered by 'seq' (integer).
    Turn counter is stored as `turn_count` on the chat doc.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from auth.core.mongo import get_database

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _detect_query_type(sql: str) -> str:
    """Return first keyword of the SQL as the query type (SELECT, INSERT, etc.)."""
    first = (sql or "").strip().upper().split()
    if not first:
        return "UNKNOWN"
    word = first[0]
    return "SELECT" if word == "WITH" else word if word in {"SELECT", "INSERT", "UPDATE", "DELETE"} else "OTHER"


def _user_msg_id(turn: int) -> str:
    return f"u_{turn:04d}"


def _ai_msg_id(turn: int) -> str:
    return f"a_{turn:04d}"


# ── Chat ──────────────────────────────────────────────────────────────────────

async def create_chat(
    user_id:       str,
    connection_id: str,
    first_message: str,
) -> str:
    """Create a new chat document in MongoDB and return its chat_id."""
    chat_id = str(uuid.uuid4())
    title   = first_message[:60].strip()
    now     = _now_iso()

    try:
        db = get_database()
        await db["chats"].insert_one({
            "chat_id":       chat_id,
            "user_id":       user_id,
            "firebase_uid":  user_id,   # Compatibility
            "connection_id": connection_id,
            "title":         title,
            "turn_count":    0,
            "created_at":    now,
            "updated_at":    now,
        })
        logger.info(f"[ChatService] Chat created chat_id={chat_id} user_id={user_id}")
    except Exception as exc:
        logger.warning(f"[ChatService] create_chat failed: {exc}")

    return chat_id


async def get_or_create_chat(
    user_id:       str,
    connection_id: str,
    chat_id:       Optional[str],
    first_message: str,
) -> str:
    """Return existing chat_id if provided, otherwise create a new chat."""
    if chat_id:
        return chat_id
    return await create_chat(user_id, connection_id, first_message)


# ── Messages ──────────────────────────────────────────────────────────────────

async def get_messages(
    user_id:       str,
    connection_id: str,
    chat_id:       str,
    limit:         int = 12,
) -> list[dict]:
    """Fetch the most recent messages for the agent's chat history from MongoDB."""
    try:
        db = get_database()
        cursor = db["messages"].find(
            {"chat_id": chat_id, "user_id": user_id},
            limit=limit,
            sort=[("seq", 1)]
        )
        messages = []
        async for doc in cursor:
            if doc.get("role") in ("user", "assistant") and doc.get("content"):
                messages.append({"role": doc["role"], "content": doc["content"]})
        return messages
    except Exception as exc:
        logger.warning(f"[ChatService] get_messages failed: {exc}")
        return []


async def append_messages(
    user_id:            str,
    connection_id:      str,
    chat_id:            str,
    user_content:       str,
    assistant_response: dict,
    connection_name:    str = "",
) -> None:
    """Atomically append messages and update turn counter in MongoDB."""
    now = _now_iso()

    try:
        db = get_database()
        
        # In MongoDB, we use find_one_and_update to increment the counter atomically
        chat = await db["chats"].find_one_and_update(
            {"chat_id": chat_id, "user_id": user_id},
            {"$inc": {"turn_count": 1}, "$set": {"updated_at": now}},
            return_document=True
        )
        
        if not chat:
            logger.warning(f"[ChatService] Chat {chat_id} not found for user {user_id}")
            return

        new_turn = chat["turn_count"]
        user_seq = new_turn * 2 - 1
        ai_seq   = new_turn * 2

        path_fields = {
            "user_id":       user_id,
            "firebase_uid":  user_id, # Compatibility
            "connection_id": connection_id,
            "connection_name": connection_name,
            "chat_id":       chat_id,
            "created_at":    now,
        }

        sql_q = assistant_response.get("sql_query") or ""
        
        messages = [
            {
                **path_fields,
                "msg_id":  _user_msg_id(new_turn),
                "seq":     user_seq,
                "role":    "user",
                "content": user_content,
            },
            {
                **path_fields,
                "msg_id":             _ai_msg_id(new_turn),
                "seq":                ai_seq,
                "role":               "assistant",
                "title":              assistant_response.get("title", ""),
                "content":            assistant_response.get("summary") or assistant_response.get("error_message", ""),
                "favourited":         False,
                "sql_query":          sql_q,
                "query_type":         _detect_query_type(sql_q),
                "status":             "error" if assistant_response.get("error_message") else "success",
                "summary":            assistant_response.get("summary", ""),
                "total_records":      assistant_response.get("total_records", 0),
                "numerical_insights": assistant_response.get("numerical_insights") or {},
                "narrative_insights": assistant_response.get("narrative_insights") or None,
                "data":               assistant_response.get("data", []),
                "error_message":      assistant_response.get("error_message", None),
            }
        ]

        await db["messages"].insert_many(messages)
        logger.debug(f"[ChatService] Messages appended | chat_id={chat_id}")

    except Exception as exc:
        logger.warning(f"[ChatService] append_messages failed: {exc}")
