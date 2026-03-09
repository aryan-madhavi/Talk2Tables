# ai_agent/services/chat_service.py
"""
Chat & Workspace Service — manages Firestore sub-collections for per-user conversations.

Firestore path structure:
    users/{uid}/workspaces/{connection_id}                               ← workspace doc
    users/{uid}/workspaces/{connection_id}/chats/{chat_id}              ← chat doc
    users/{uid}/workspaces/{connection_id}/chats/{chat_id}/messages/{seq_hex}  ← message doc

Message document IDs are zero-padded hex integers: 0001, 0002, 0003, ...
This allows natural lexicographic ordering without a separate timestamp index.

Message counter is stored as `msg_count` on the chat doc and incremented
atomically via a Firestore transaction on every write (+2 per turn).

Rules:
  - Messages are APPEND-ONLY — never call .update() or .delete() on message docs
  - Workspace doc is created if it doesn't exist (upsert on first query)
  - Chat title is auto-generated from the first user message (first 60 chars)
  - Assistant messages store all AI response fields as flat Firestore fields
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hex_id(seq: int) -> str:
    """Convert integer sequence number to zero-padded 4-char hex string.
    e.g. 1 → '0001', 255 → '00ff', 65536 → '10000'
    """
    return f"{seq:04x}"


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
    """Create the workspace document if it doesn't exist."""
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
    """Create a new chat document and return its chat_id."""
    chat_id = str(uuid.uuid4())
    title   = first_message[:60].strip()
    now     = _now_iso()

    try:
        from auth.core.firebase import get_firestore_client
        db = get_firestore_client()
        _chat_ref(db, firebase_uid, connection_id, chat_id).set({
            "chat_id":       chat_id,
            "firebase_uid":  firebase_uid,   # stored for collection group queries
            "connection_id": connection_id,  # stored for collection group queries
            "title":         title,
            "msg_count":     0,
            "created_at":    now,
            "updated_at":    now,
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
    """Return existing chat_id if provided, otherwise create a new chat."""
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
    Fetch the most recent messages for the agent's chat history.
    Orders by `seq` (integer) — documents are hex IDs that sort lexicographically,
    but seq ordering is explicit and collision-free.

    Returns:
        List of { role, content } dicts for the agent's HumanMessage / AIMessage injection.
    """
    try:
        from auth.core.firebase import get_firestore_client
        db   = get_firestore_client()
        docs = (
            _messages_col(db, firebase_uid, connection_id, chat_id)
            .order_by("seq")
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
    firebase_uid:       str,
    connection_id:      str,
    chat_id:            str,
    user_content:       str,
    assistant_response: dict,
) -> None:
    """
    Atomically append a user message and an assistant message to the chat.

    Message IDs are incrementing hex strings: 0001, 0002, 0003, ...
    The current counter is stored as `msg_count` on the chat doc and
    incremented by 2 inside a Firestore transaction.

    assistant_response should be the full final_response dict from the agent:
        {
            sql_query, summary, total_records,
            numerical_insights, data,         ← on success
            error_message                      ← on error
        }
    All fields are stored as flat Firestore fields on the assistant message doc.
    """
    now = _now_iso()

    try:
        from auth.core.firebase import get_firestore_client
        from google.cloud.firestore_v1 import transactional as fs_transactional

        db        = get_firestore_client()
        chat_doc  = _chat_ref(db, firebase_uid, connection_id, chat_id)
        msgs_col  = _messages_col(db, firebase_uid, connection_id, chat_id)

        # ── Atomic counter increment via transaction ────────────────────────
        @fs_transactional
        def _write(transaction, chat_ref):
            snapshot     = chat_ref.get(transaction=transaction)
            current_seq  = snapshot.to_dict().get("msg_count", 0) if snapshot.exists else 0
            user_seq     = current_seq + 1
            ai_seq       = current_seq + 2

            # User message
            transaction.set(
                msgs_col.document(_hex_id(user_seq)),
                {
                    "seq":        user_seq,
                    "role":       "user",
                    "content":    user_content,
                    "created_at": now,
                },
            )

            # Assistant message — store every AI field as a flat Firestore field
            ai_doc = {
                "seq":               ai_seq,
                "role":              "assistant",
                "content":           assistant_response.get("summary") or assistant_response.get("error_message", ""),
                "created_at":        now,
                # ── AI response fields ─────────────────────────────────────
                "sql_query":         assistant_response.get("sql_query", ""),
                "summary":           assistant_response.get("summary", ""),
                "total_records":     assistant_response.get("total_records", 0),
                "numerical_insights": assistant_response.get("numerical_insights", {}),
                "data":              assistant_response.get("data", []),
                "error_message":     assistant_response.get("error_message", None),
            }
            transaction.set(msgs_col.document(_hex_id(ai_seq)), ai_doc)

            # Advance the counter + touch updated_at on the chat doc
            transaction.update(chat_ref, {"msg_count": ai_seq, "updated_at": now})

        txn = db.transaction()
        _write(txn, chat_doc)

        logger.debug(f"[ChatService] Messages appended | chat_id={chat_id}")

    except Exception as exc:
        logger.warning(f"[ChatService] append_messages failed (non-fatal): {exc}")
