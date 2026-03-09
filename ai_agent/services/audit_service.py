# ai_agent/services/audit_service.py
"""
Query Audit Service — append-only writes to Firestore.

Firestore path: database_connections/{connection_id}/audits/{audit_id}

Queries are scoped under their connection so admins can review per-DB activity.

Fields per audit doc:
    audit_id, firebase_uid, connection_id, chat_id,
    sql_query, summary, row_count, execution_time_ms,
    status ("results" | "error"), error_message, created_at

IMPORTANT: Append-only — never call .update() or .delete() on audit documents.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_CONNECTIONS_COL = "database_connections"


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
    status:            str = "results",
    error_message:     Optional[str] = None,
) -> str:
    """
    Append a query record under database_connections/{connection_id}/audits/{audit_id}.

    Non-fatal — any Firestore error is logged but NOT raised.

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
        (
            db.collection(_CONNECTIONS_COL)
              .document(connection_id)
              .collection("audits")
              .document(audit_id)
              .set(doc)
        )
        logger.info(
            f"[AuditService] Logged | audit_id={audit_id} "
            f"status={status} rows={row_count} uid={firebase_uid}"
        )
        return audit_id
    except Exception as exc:
        logger.warning(f"[AuditService] Failed to write audit log (non-fatal): {exc}")
        return ""
