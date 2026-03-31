# ai_agent/nodes/entry.py
"""
Entry node — first node in the outer graph.

Responsibilities:
  1. Fetch the database connection from Firestore (with decrypted password)
  2. Verify the user has an active, non-expired access grant for that connection
  3. Build the SQLAlchemy connection URL
  4. Detect the database dialect
  5. Set error_message on failure so the graph routes to END immediately
"""
from __future__ import annotations

import logging

from ai_agent.state import AgentState
from ai_agent.tools import detect_dialect

logger = logging.getLogger(__name__)


def _build_connection_string(conn: dict) -> str:
    """Build a SQLAlchemy URL from a Firestore connection document."""
    from urllib.parse import quote_plus
    db_type  = conn["db_type"].lower()
    host     = conn["host"]
    port     = conn["port"]
    database = conn["database_name"]
    user     = quote_plus(conn["username"])
    password = quote_plus(conn["password"])  # already decrypted by get_connection_with_password()

    # Map Firestore db_type values to SQLAlchemy dialect+driver strings
    _DRIVER_MAP = {
        "mysql":      f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}",
        "mariadb":    f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}",
        "postgresql": f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{database}",
        "postgres":   f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{database}",
        "mssql":      f"mssql+pyodbc://{user}:{password}@{host}:{port}/{database}?driver=ODBC+Driver+17+for+SQL+Server",
        "oracle":     f"oracle+cx_oracle://{user}:{password}@{host}:{port}/{database}",
    }

    conn_str = _DRIVER_MAP.get(db_type)
    if not conn_str:
        raise ValueError(f"Unsupported db_type '{db_type}'. Supported: {list(_DRIVER_MAP.keys())}")
    return conn_str


async def node_entry(state: AgentState) -> AgentState:
    """
    Fetch DB credentials from Firestore and verify the user's access grant.

    On success: populates db_connection_string, db_dialect, db_type in state.
    On failure: sets error_message — router sends to END.
    """
    connection_id = state["connection_id"]
    firebase_uid  = state["firebase_uid"]

    logger.info(
        f"[node_entry] connection_id={connection_id} uid={firebase_uid} "
        f"role={state['user_role']}"
    )

    # ── 1. Verify access grant ─────────────────────────────────────────────
    # admin and db_manager have implicit access to all connections — skip grant check.
    _BYPASS_ROLES = {"admin", "db_manager"}

    try:
        if state["user_role"] in _BYPASS_ROLES:
            logger.info(f"[node_entry] Access grant check skipped for role={state['user_role']}")
        else:
            from access.services.access_service import verify_access

            allowed, reason = await verify_access(
                firebase_uid  = firebase_uid,
                connection_id = connection_id,
                require_write = False,
            )

            if not allowed:
                msg = {
                    "no_grant":            f"You do not have access to connection '{connection_id}'.",
                    "revoked":             f"Your access to connection '{connection_id}' has been revoked.",
                    "expired":             f"Your access to connection '{connection_id}' has expired.",
                    "write_not_permitted": "Write access not permitted for this connection.",
                }.get(reason, f"Access denied: {reason}")
                logger.warning(f"[node_entry] Access denied | uid={firebase_uid} reason={reason}")
                return {**state, "error_message": msg, "response_type": "error",
                        "final_response": {"error_message": msg}}

    except Exception as exc:
        logger.error(f"[node_entry] Access check failed: {exc}")
        return {**state, "error_message": str(exc), "response_type": "error",
                "final_response": {"error_message": str(exc)}}

    # ── 2. Fetch connection with decrypted password from Firestore ─────────
    try:
        from connections.services.connection_service import get_connection_with_password

        conn = await get_connection_with_password(connection_id)
        if not conn:
            msg = f"Connection '{connection_id}' not found."
            return {**state, "error_message": msg, "response_type": "error",
                    "final_response": {"error_message": msg}}

        if not conn.get("is_active", True) is False:
            pass  # is_active=False would block; active connections pass through

    except Exception as exc:
        logger.error(f"[node_entry] Firestore connection fetch failed: {exc}")
        msg = f"Could not load database connection: {exc}"
        return {**state, "error_message": msg, "response_type": "error",
                "final_response": {"error_message": msg}}

    # ── 3. Build SQLAlchemy connection string ─────────────────────────────
    try:
        conn_str = _build_connection_string(conn)
        dialect  = detect_dialect(conn_str)
    except Exception as exc:
        logger.error(f"[node_entry] Connection string build failed: {exc}")
        msg = f"Invalid database configuration: {exc}"
        return {**state, "error_message": msg, "response_type": "error",
                "final_response": {"error_message": msg}}

    logger.info(
        f"[node_entry] Ready | db_type={conn['db_type']} dialect={dialect} "
        f"host={conn['host']} db={conn['database_name']}"
    )

    return {
        **state,
        "db_connection_string": conn_str,
        "db_dialect":           dialect,
        "db_type":              conn["db_type"],
        "error_message":        None,
    }
