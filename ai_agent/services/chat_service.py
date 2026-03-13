# ai_agent/services/chat_service.py
"""
Chat & Workspace Service — manages Firestore sub-collections for per-user conversations.

Firestore path structure:
    users/{uid}/workspaces/{connection_id}                               ← workspace doc
    users/{uid}/workspaces/{connection_id}/chats/{chat_id}              ← chat doc
    users/{uid}/workspaces/{connection_id}/chats/{chat_id}/messages/{msg_id}  ← message doc

Message document IDs are turn-prefixed:
    u_0001  — user message from turn 1
    a_0001  — assistant message from turn 1
    u_0002  — user message from turn 2
    a_0002  — assistant message from turn 2
    ...

Turn counter is stored as `turn_count` on the chat doc and incremented
atomically via a Firestore transaction on every write (+1 per turn).
Ordering is by `seq` integer field (user=odd, assistant=even).

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


def _detect_query_type(sql: str) -> str:
    """Return first keyword of the SQL as the query type (SELECT, INSERT, etc.)."""
    first = (sql or "").strip().upper().split()
    if not first:
        return "UNKNOWN"
    word = first[0]
    # WITH ... SELECT is still a SELECT
    return "SELECT" if word == "WITH" else word if word in {"SELECT", "INSERT", "UPDATE", "DELETE"} else "OTHER"


def _user_msg_id(turn: int) -> str:
    """e.g. turn 1 → 'u_0001', turn 12 → 'u_0012'"""
    return f"u_{turn:04d}"


def _ai_msg_id(turn: int) -> str:
    """e.g. turn 1 → 'a_0001', turn 12 → 'a_0012'"""
    return f"a_{turn:04d}"


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
            "turn_count":    0,
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
    connection_name:    str = "",
) -> None:
    """
    Atomically append a user message and an assistant message to the chat.

    Message IDs are incrementing hex strings: 0001, 0002, 0003, ...
    The current counter is stored as `msg_count` on the chat doc and
    incremented by 2 inside a Firestore transaction.

    assistant_response should be the full final_response dict from the agent:
        {
            title, sql_query, summary, total_records,
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
            snapshot   = chat_ref.get(transaction=transaction)
            prev_turn  = snapshot.to_dict().get("turn_count", 0) if snapshot.exists else 0
            new_turn   = prev_turn + 1
            user_seq   = new_turn * 2 - 1   # 1, 3, 5, ...
            ai_seq     = new_turn * 2        # 2, 4, 6, ...

            # Shared path fields — stored on every message for collection group queries
            _path = {
                "firebase_uid":  firebase_uid,
                "connection_id": connection_id,
                "connection_name": connection_name,
                "chat_id":       chat_id,
            }

            # User message — ID: u_0001, u_0002, ...
            transaction.set(
                msgs_col.document(_user_msg_id(new_turn)),
                {
                    **_path,
                    "seq":        user_seq,
                    "role":       "user",
                    "content":    user_content,
                    "created_at": now,
                },
            )

            # Assistant message — ID: a_0001, a_0002, ...
            sql_q = assistant_response.get("sql_query") or ""
            ai_doc = {
                **_path,
                "seq":                ai_seq,
                "role":               "assistant",
                "title":              assistant_response.get("title", ""),
                "content":            assistant_response.get("summary") or assistant_response.get("error_message", ""),
                "created_at":         now,
                "favourited":         False,
                # ── AI response fields ─────────────────────────────────────
                "sql_query":          sql_q,
                "query_type":         _detect_query_type(sql_q),
                "status":             "error" if assistant_response.get("error_message") else "success",
                "summary":            assistant_response.get("summary", ""),
                "total_records":      assistant_response.get("total_records", 0),
                "numerical_insights": assistant_response.get("numerical_insights", {}),
                "data":               assistant_response.get("data", []),
                "error_message":      assistant_response.get("error_message", None),
            }
            transaction.set(msgs_col.document(_ai_msg_id(new_turn)), ai_doc)

            # Advance the turn counter + touch updated_at on the chat doc
            transaction.update(chat_ref, {"turn_count": new_turn, "updated_at": now})

        txn = db.transaction()
        _write(txn, chat_doc)

        logger.debug(f"[ChatService] Messages appended | chat_id={chat_id}")

    except Exception as exc:
        logger.warning(f"[ChatService] append_messages failed (non-fatal): {exc}")
