# access/services/__init__.py
from .access_service import (
    create_access_grant,
    get_grant_by_id,
    list_grants_by_user,
    list_grants_by_connection,
    update_access_grant,
    revoke_access_grant,
    verify_access,
)

__all__ = [
    "create_access_grant",
    "get_grant_by_id",
    "list_grants_by_user",
    "list_grants_by_connection",
    "update_access_grant",
    "revoke_access_grant",
    "verify_access",       # ← used by query engine on every query
]