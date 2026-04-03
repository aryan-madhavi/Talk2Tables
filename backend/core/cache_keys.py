# core/cache_keys.py
"""
Central registry for ALL Redis cache keys and TTLs.

Naming convention:
    token:{firebase_uid}              → decoded Firebase token dict
    user:{firebase_uid}               → UserOut dict
    users:list                        → list of all users
    connection:{connection_id}        → single ConnectionOut dict
    connections:list                  → list of all connections
    connections:list:active           → list of active-only connections
    access:{firebase_uid}:{conn_id}   → single AccessGrantOut dict
    access:user:{firebase_uid}        → list of all grants for a user
"""
from __future__ import annotations

# ── TTLs (seconds) ────────────────────────────────────────────────────────────

# Token: Firebase tokens are valid for 1 hour — cache just under that
TTL_TOKEN      = 55 * 60        # 55 minutes

# Users: role and is_active rarely change — 5 min is safe
TTL_USER       = 5  * 60        # 5 minutes
TTL_USERS_LIST = 2  * 60        # 2 minutes (list changes more often)

# Connections: rarely change mid-session
TTL_CONNECTION      = 2 * 60    # 2 minutes
TTL_CONNECTIONS_LIST = 2 * 60   # 2 minutes

# Access grants: security-critical — short TTL
TTL_ACCESS_GRANT      = 2 * 60  # 2 minutes
TTL_ACCESS_USER_GRANTS = 2 * 60  # 2 minutes


# ── Key builders ──────────────────────────────────────────────────────────────

def key_token(firebase_uid: str) -> str:
    return f"token:{firebase_uid}"

def key_user(firebase_uid: str) -> str:
    return f"user:{firebase_uid}"

def key_users_list() -> str:
    return "users:list"

def key_connection(connection_id: str) -> str:
    return f"connection:{connection_id}"

def key_connections_list(active_only: bool = False) -> str:
    return "connections:list:active" if active_only else "connections:list"

def key_access_grant(access_id: str) -> str:
    return f"access:grant:{access_id}"

def key_access_user(firebase_uid: str) -> str:
    return f"access:user:{firebase_uid}"

def key_access_pair(firebase_uid: str, connection_id: str) -> str:
    """Used by verify_access() — the hottest cache path."""
    return f"access:{firebase_uid}:{connection_id}"

# Schema cache (mirrors Firestore schema_cache sub-collection)
TTL_SCHEMA = 60 * 60  # 1 hour — same as SCHEMA_CACHE_TTL_SECONDS in schema_tools.py

def key_schema_tables(connection_id: str) -> str:
    return f"schema:{connection_id}:_tables"

def key_schema_table_def(connection_id: str, schema: str, table: str) -> str:
    return f"schema:{connection_id}:{schema}__{table}"

def key_schema_pattern(connection_id: str) -> str:
    """Glob pattern for invalidating all schema keys for a connection."""
    return f"schema:{connection_id}:*"

# Query suggestions (LLM-generated from schema)
TTL_SUGGESTIONS = 24 * 60 * 60  # 24 hours

def key_suggestions(connection_id: str) -> str:
    return f"suggestions:{connection_id}"

# Query history (per user, short TTL — invalidated after every query)
TTL_HISTORY = 2 * 60  # 2 minutes

def key_history(firebase_uid: str, favourites_only: bool = False) -> str:
    suffix = ":favourites" if favourites_only else ""
    return f"history:{firebase_uid}{suffix}"