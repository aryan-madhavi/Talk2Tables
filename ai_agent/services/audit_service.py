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
    audit_id:          Optional[str] = None, # Added
    connection_name:   str = "",
) -> str:
    """
    Append a query record to the 'audits' collection.
    """
    final_id = audit_id or str(uuid.uuid4())
    doc = {
        "_id":               str(uuid.uuid4()), # Always unique DB primary key
        "audit_id":          final_id,          # Links to the chat message (a_0001, etc)
        "user_id":           user_id,
        "firebase_uid":      user_id, # Compatibility field
        "connection_id":     connection_id,
        "connection_name":   connection_name,
        "chat_id":           chat_id,
        "sql_query":         sql_query or "",
        "summary":           summary   or "",
        "row_count":         row_count,
        "execution_time_ms": round(execution_time_ms, 1),
        "status":            status,
        "error_message":     error_message,
        "favourited":        False,
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

async def get_query_history(
    user_id:         str,
    limit:           int = 50,
    offset:          int = 0,
    favourites_only: bool = False,
) -> list[dict]:
    """
    Fetch query audit records for a user from MongoDB.
    """
    try:
        db = get_database()
        query = {"user_id": user_id}
        if favourites_only:
            query["favourited"] = True

        cursor = db["audits"].find(query).sort("created_at", -1).skip(offset).limit(limit)
        results = []
        async for doc in cursor:
            # Add some fields for frontend compatibility
            doc["msg_id"] = doc.get("audit_id")
            
            # If title is missing, try to generate one from SQL or summary
            if not doc.get("title"):
                summary = doc.get("summary", "")
                doc["title"] = summary.split(".")[0].strip()[:80] or "Query result"
            
            # Detect query type if missing
            if not doc.get("query_type"):
                from ai_agent.services.chat_service import _detect_query_type
                doc["query_type"] = _detect_query_type(doc.get("sql_query", ""))

            if "_id" in doc: doc.pop("_id")
            results.append(doc)
        return results
    except Exception as exc:
        logger.warning(f"[AuditService] get_query_history failed: {exc}")
        return []

async def get_connection_audits(
    connection_id: str,
    limit:         int = 50,
    offset:        int = 0,
    status:        str | None = None,
    user_id:       str | None = None,
) -> list[dict]:
    """Fetch audit logs for a specific connection across all users."""
    try:
        db = get_database()
        query = {"connection_id": connection_id}
        if status == "success":
            query["status"] = "success"
        elif status == "error":
            query["status"] = "error"
        if user_id:
            query["user_id"] = user_id

        cursor = db["audits"].find(query).sort("created_at", -1).skip(offset).limit(limit)
        results = []
        async for doc in cursor:
            if "_id" in doc: doc.pop("_id")
            results.append(doc)
        return results
    except Exception as exc:
        logger.error(f"[AuditService] get_connection_audits failed: {exc}")
        return []

async def get_connection_stats(connection_id: str, days: int = 30) -> dict:
    """Aggregate statistics for a connection from the audits collection."""
    from datetime import datetime, timezone, timedelta
    from collections import defaultdict
    
    try:
        db = get_database()
        query = {"connection_id": connection_id}
        if days > 0:
            cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
            query["created_at"] = {"$gte": cutoff}

        cursor = db["audits"].find(query)
        
        total = 0
        success = 0
        total_rows = 0
        total_ms = 0.0
        user_counts = defaultdict(int)
        daily = defaultdict(int)

        async for d in cursor:
            total += 1
            if d.get("status") == "success":
                success += 1
            
            total_rows += d.get("row_count", 0) or 0
            total_ms += d.get("execution_time_ms", 0) or 0
            user_counts[d.get("user_id", "unknown")] += 1
            ts = d.get("created_at", "")
            if ts: daily[ts[:10]] += 1

        top_users = sorted(
            [{"firebase_uid": uid, "query_count": cnt} for uid, cnt in user_counts.items()],
            key=lambda x: x["query_count"], reverse=True
        )[:5]

        daily_activity = sorted(
            [{"date": date, "count": cnt} for date, cnt in daily.items()],
            key=lambda x: x["date"]
        )

        return {
            "connection_id": connection_id,
            "period_days": days if days > 0 else None,
            "total_queries": total,
            "successful_queries": success,
            "failed_queries": total - success,
            "success_rate": round(success / total * 100, 1) if total else 0.0,
            "total_rows_fetched": total_rows,
            "avg_rows_per_query": round(total_rows / success, 1) if success else 0.0,
            "avg_execution_time_ms": round(total_ms / total, 1) if total else 0.0,
            "query_type_breakdown": {}, # Placeholder
            "top_users": top_users,
            "daily_activity": daily_activity,
        }
    except Exception as exc:
        logger.error(f"[AuditService] get_connection_stats failed: {exc}")
        return {}
