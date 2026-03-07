# ai_agent/services/chat_service.py
"""
Chat & Workspace Service — manages Firestore sub-collections for per-user conversations.

Firestore path structure (from schema doc):
    users/{uid}/workspaces/{connection_id}                        ← workspace doc
    users/{uid}/workspaces/{connection_id}/chats/{chat_id}        ← chat doc
    users/{uid}/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}  ← message doc

Rules:
  - Messages are APPEND-ONLY — never call .update() or .delete() on message docs
  - Workspace doc is created if it doesn't exist (upsert on first query)
  - Chat title is auto-generated from the first user message
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _workspace_ref(db, firebase_uid: str, connection_id: str):
    return (
        db.collection("users")
          .document(firebase_uid)
          .collection("workspaces")
          .document(connection_id)
    )


def _chat_ref(db, firebase_uid: str, connection_id: str, chat_id: str):
    return (
        _workspace_ref(db, firebase_uid, connection_id)
        .collection("chats")
        .document(chat_id)
    )


def _messages_col(db, firebase_uid: str, connection_id: str, chat_id: str):
    return _chat_ref(db, firebase_uid, connection_id, chat_id).collection("messages")


# ── Workspace ─────────────────────────────────────────────────────────────────

def ensure_workspace(firebase_uid: str, connection_id: str, connection_name: str = "") -> None:
    """
    Create the workspace document if it doesn't exist.
    Called when an access grant is issued, or lazily on first query.
    """
    try:
        from auth.core.firebase import get_firestore_client
        db  = get_firestore_client()
        ref = _workspace_ref(db, firebase_uid, connection_id)
        doc = ref.get()
        if not doc.exists:
            ref.set({
                "connection_id":   connection_id,
                "connection_name": connection_name,
                "created_at":      _now_iso(),
            })
            logger.info(f"[ChatService] Workspace created uid={firebase_uid} conn={connection_id}")
    except Exception as exc:
        logger.warning(f"[ChatService] ensure_workspace failed (non-fatal): {exc}")


# ── Chat ──────────────────────────────────────────────────────────────────────

def create_chat(
    firebase_uid:  str,
    connection_id: str,
    first_message: str,
) -> str:
    """
    Create a new chat document and return its chat_id.
    Title is derived from the first user message (first 60 chars).
    """
    chat_id = str(uuid.uuid4())
    title   = first_message[:60].strip()
    now     = _now_iso()

    try:
        from auth.core.firebase import get_firestore_client
        db = get_firestore_client()
        _chat_ref(db, firebase_uid, connection_id, chat_id).set({
            "chat_id":      chat_id,
            "title":        title,
            "created_at":   now,
            "updated_at":   now,
        })
        logger.info(f"[ChatService] Chat created chat_id={chat_id} uid={firebase_uid}")
    except Exception as exc:
        logger.warning(f"[ChatService] create_chat failed (non-fatal): {exc}")

    return chat_id


def get_or_create_chat(
    firebase_uid:  str,
    connection_id: str,
    chat_id:       Optional[str],
    first_message: str,
) -> str:
    """
    Return the existing chat_id if provided, otherwise create a new chat.
    Also ensures the workspace document exists.
    """
    ensure_workspace(firebase_uid, connection_id)
    if chat_id:
        return chat_id
    return create_chat(firebase_uid, connection_id, first_message)


# ── Messages ──────────────────────────────────────────────────────────────────

def get_messages(
    firebase_uid:  str,
    connection_id: str,
    chat_id:       str,
    limit:         int = 12,  # last 6 turns = 12 messages
) -> list[dict]:
    """
    Fetch the most recent messages from a chat (newest last, oldest first in return).
    Used to build the chat_history for the agent.

    Returns:
        List of { role: "user" | "assistant", content: str } dicts.
    """
    try:
        from auth.core.firebase import get_firestore_client
        db   = get_firestore_client()
        docs = (
            _messages_col(db, firebase_uid, connection_id, chat_id)
            .order_by("created_at")
            .limit_to_last(limit)
            .get()
        )
        messages = []
        for doc in docs:
            data = doc.to_dict()
            if data.get("role") in ("user", "assistant") and data.get("content"):
                messages.append({"role": data["role"], "content": data["content"]})
        return messages
    except Exception as exc:
        logger.warning(f"[ChatService] get_messages failed (non-fatal): {exc}")
        return []


def append_messages(
    firebase_uid:   str,
    connection_id:  str,
    chat_id:        str,
    user_content:   str,
    assistant_content: str,
) -> None:
    """
    Append a user message and an assistant message to the chat.
    Messages are append-only — never updated or deleted.
    Also touches the chat's updated_at timestamp.
    """
    now = _now_iso()

    try:
        from auth.core.firebase import get_firestore_client
        db      = get_firestore_client()
        col     = _messages_col(db, firebase_uid, connection_id, chat_id)
        batch   = db.batch()

        # User message
        user_ref = col.document(str(uuid.uuid4()))
        batch.set(user_ref, {
            "role":       "user",
            "content":    user_content,
            "created_at": now,
        })

        # Assistant message
        ai_ref = col.document(str(uuid.uuid4()))
        batch.set(ai_ref, {
            "role":       "assistant",
            "content":    assistant_content,
            "created_at": now,
        })

        # Update chat's updated_at
        chat_doc = _chat_ref(db, firebase_uid, connection_id, chat_id)
        batch.update(chat_doc, {"updated_at": now})

        batch.commit()
        logger.debug(f"[ChatService] Messages appended chat_id={chat_id}")

    except Exception as exc:
        logger.warning(f"[ChatService] append_messages failed (non-fatal): {exc}")
