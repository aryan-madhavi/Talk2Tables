# connections/services/__init__.py
"""
Service layer for the connections module.

All Firestore operations for 'database_connections' collection.
Import these functions in routes — never access Firestore directly from routes.

Exposes:
    create_connection           — Encrypt password + write new doc to Firestore
    get_connection_by_id        — Fetch single connection (safe, no password)
    get_connection_with_password — Fetch connection WITH decrypted password (internal use ONLY)
    list_connections            — List all connections, optionally filter active only
    update_connection           — Partial update; re-encrypts password if provided
    delete_connection           — Hard delete (admin only; prefer deactivate)
    set_connection_active       — Enable / disable a connection
"""
from .connection_service import (
    create_connection,
    get_connection_by_id,
    get_connection_with_password,
    list_connections,
    update_connection,
    delete_connection,
    set_connection_active,
)

__all__ = [
    "create_connection",
    "get_connection_by_id",
    "get_connection_with_password",
    "list_connections",
    "update_connection",
    "delete_connection",
    "set_connection_active",
]