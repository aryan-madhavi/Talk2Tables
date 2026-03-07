# ai_agent/services/audit_service.py
"""
Query Audit Service — append-only writes to Firestore query_audit collection.

Firestore path: query_audit/{audit_id}

Fields written per query:
    audit_id, firebase_uid, connection_id, chat_id,
    sql_query, summary, row_count, execution_time_ms,
    status ("success" | "error"), error_message, created_at

IMPORTANT: This collection is append-only — never call .update() or .delete()
on audit documents (per Firestore schema spec).
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def log_query(
    firebase_uid:      str,
    connection_id:     str,
    chat_id:           str,
    sql_query:         Optional[str],
    summary:           Optional[str],
    row_count:         int,
    execution_time_ms: float,
    status:            str = "success",
    error_message:     Optional[str] = None,
) -> str:
    """
    Append a query record to Firestore query_audit collection.

    This is non-fatal — any Firestore error is logged but NOT raised,
    so a failed audit write never breaks the user's query response.

    Returns:
        The generated audit_id string, or empty string on failure.
    """
    audit_id = str(uuid.uuid4())
    doc = {
        "audit_id":          audit_id,
        "firebase_uid":      firebase_uid,
        "connection_id":     connection_id,
        "chat_id":           chat_id,
        "sql_query":         sql_query or "",
        "summary":           summary   or "",
        "row_count":         row_count,
        "execution_time_ms": round(execution_time_ms, 1),
        "status":            status,
        "error_message":     error_message,
        "created_at":        _now_iso(),
    }

    try:
        from auth.core.firebase import get_firestore_client
        db = get_firestore_client()
        db.collection("query_audit").document(audit_id).set(doc)
        logger.info(
            f"[AuditService] Logged | audit_id={audit_id} "
            f"status={status} rows={row_count} uid={firebase_uid}"
        )
        return audit_id
    except Exception as exc:
        logger.warning(f"[AuditService] Failed to write audit log (non-fatal): {exc}")
        return ""
