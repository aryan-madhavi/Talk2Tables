# ai_agent/services/audit_service.py
"""
Query Audit Service — append-only writes to MongoDB.

MongoDB Collection: audits

Queries are stored with connection_id so admins can review per-DB activity.

Fields per audit doc:
    audit_id, user_id, connection_id, chat_id,
    sql_query, summary, row_count, execution_time_ms,
    status ("results" | "error"), error_message, created_at

IMPORTANT: Append-only — never update or delete audit records.
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


async def log_query(
    user_id:           str,
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
    Append a query record to the 'audits' collection.

    Non-fatal — any MongoDB error is logged but NOT raised.

    Returns:
        The generated audit_id string, or empty string on failure.
    """
    audit_id = str(uuid.uuid4())
    doc = {
        "audit_id":          audit_id,
        "user_id":           user_id,
        "firebase_uid":      user_id, # Compatibility field
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
        db = get_database()
        if db is None:
            logger.warning("[AuditService] Database not initialized — skipping audit log.")
            return ""
            
        await db["audits"].insert_one(doc)
        
        logger.info(
            f"[AuditService] Logged | audit_id={audit_id} "
            f"status={status} rows={row_count} uid={user_id}"
        )
        return audit_id
    except Exception as exc:
        logger.warning(f"[AuditService] Failed to write audit log (non-fatal): {exc}")
        return ""
