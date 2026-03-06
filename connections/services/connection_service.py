# connections/services/connection_service.py
"""
Business logic for database connection management.

All Firestore operations for the 'database_connections' collection live here.
The route layer calls these functions — it never touches Firestore directly.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from auth.core.firebase import get_firestore_client
from connections.core.encryption import encrypt_password, decrypt_password
from connections.routes.schemas import CreateConnectionRequest, UpdateConnectionRequest

logger = logging.getLogger(__name__)

COLLECTION = "database_connections"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_connection(doc: dict) -> dict:
    """Strip password_enc before returning to any caller."""
    return {k: v for k, v in doc.items() if k != "password_enc"}


# ── Create ────────────────────────────────────────────────────────────────────

async def create_connection(
    body: CreateConnectionRequest,
    created_by_uid: str,
) -> dict:
    """
    Encrypt the password and write a new connection document to Firestore.
    Returns the safe connection dict (no password_enc).
    """
    db            = get_firestore_client()
    connection_id = str(uuid.uuid4())
    now           = _now_iso()

    doc = {
        "connection_id":  connection_id,
        "name":           body.name,
        "db_type":        body.db_type,
        "host":           body.host,
        "port":           body.port,
        "database_name":  body.database_name,
        "username":       body.username,
        "password_enc":   encrypt_password(body.password),  # never stored raw
        "ssl_enabled":    body.ssl_enabled,
        "is_active":      True,
        "description":    body.description,
        "created_by_uid": created_by_uid,
        "created_at":     now,
        "updated_at":     now,
        "last_tested_at": None,
        "last_tested_ok": None,
    }

    db.collection(COLLECTION).document(connection_id).set(doc)
    logger.info(f"[Connections] Created | id={connection_id} name={body.name} by={created_by_uid}")

    return _safe_connection(doc)


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_connection_by_id(connection_id: str) -> Optional[dict]:
    """
    Fetch a single connection. Returns safe dict (no password_enc) or None.
    """
    db  = get_firestore_client()
    doc = db.collection(COLLECTION).document(connection_id).get()
    if not doc.exists:
        return None
    return _safe_connection(doc.to_dict())


async def get_connection_with_password(connection_id: str) -> Optional[dict]:
    """
    Fetch connection including decrypted password.
    ONLY for internal use (test connection, query execution).
    NEVER return this to any API response.
    """
    db  = get_firestore_client()
    doc = db.collection(COLLECTION).document(connection_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["password"] = decrypt_password(data["password_enc"])
    return data


async def list_connections(active_only: bool = False) -> list[dict]:
    """
    List all connections. Optionally filter to active only.
    Always returns safe dicts (no password_enc).
    """
    db    = get_firestore_client()
    query = db.collection(COLLECTION)

    if active_only:
        from google.cloud.firestore_v1.base_query import FieldFilter
        query = query.where(filter=FieldFilter("is_active", "==", True))

    docs = query.stream()
    results = [_safe_connection(d.to_dict()) for d in docs]

    # Sort by created_at descending in Python (no composite index needed)
    results.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return results


# ── Update ────────────────────────────────────────────────────────────────────

async def update_connection(
    connection_id: str,
    body: UpdateConnectionRequest,
) -> Optional[dict]:
    """
    Partial update — only fields provided in body are changed.
    Re-encrypts password if a new one is provided.
    Returns updated safe dict or None if not found.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(connection_id)

    if not ref.get().exists:
        return None

    updates: dict = {"updated_at": _now_iso()}

    if body.name          is not None: updates["name"]          = body.name
    if body.host          is not None: updates["host"]          = body.host.strip().lower()
    if body.port          is not None: updates["port"]          = body.port
    if body.database_name is not None: updates["database_name"] = body.database_name
    if body.username      is not None: updates["username"]      = body.username
    if body.ssl_enabled   is not None: updates["ssl_enabled"]   = body.ssl_enabled
    if body.description   is not None: updates["description"]   = body.description
    if body.is_active     is not None: updates["is_active"]     = body.is_active
    if body.password      is not None:
        updates["password_enc"] = encrypt_password(body.password)
        logger.info(f"[Connections] Password rotated | id={connection_id}")

    ref.update(updates)
    logger.info(f"[Connections] Updated | id={connection_id} fields={list(updates.keys())}")

    updated = ref.get().to_dict()
    return _safe_connection(updated)


# ── Delete ────────────────────────────────────────────────────────────────────

async def delete_connection(connection_id: str) -> bool:
    """
    Hard-delete a connection document.
    Admin only — also consider deactivating (is_active=False) instead.
    Returns True if deleted, False if not found.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(connection_id)

    if not ref.get().exists:
        return False

    ref.delete()
    logger.info(f"[Connections] Deleted | id={connection_id}")
    return True


# ── Activate / Deactivate ─────────────────────────────────────────────────────

async def set_connection_active(connection_id: str, is_active: bool) -> Optional[dict]:
    """
    Enable or disable a connection without deleting it.
    Preferred over hard-delete in most cases.
    """
    db  = get_firestore_client()
    ref = db.collection(COLLECTION).document(connection_id)

    if not ref.get().exists:
        return None

    ref.update({"is_active": is_active, "updated_at": _now_iso()})
    action = "Activated" if is_active else "Deactivated"
    logger.info(f"[Connections] {action} | id={connection_id}")

    return _safe_connection(ref.get().to_dict())