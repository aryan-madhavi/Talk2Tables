# ai_agent/state.py
"""
Talk2Tables — Agent State Definition
=====================================
Shared state TypedDict passed between all nodes in the LangGraph outer graph.

The outer graph has three nodes:
    entry_node → react_agent_node → output_parser_node

The inner react_agent (langgraph.prebuilt.create_react_agent) manages its own
messages list internally. The outer state only captures inputs/outputs.
"""
from __future__ import annotations

from typing import Any, Literal, Optional
from typing_extensions import TypedDict


class ChatMessage(TypedDict):
    """Single conversation turn, compatible with LangChain message format."""
    role: Literal["user", "assistant", "system"]
    content: str


class AgentState(TypedDict):
    """Outer graph state. Passed between entry → react_agent → output_parser nodes."""

    # ── Input (supplied by route handler) ─────────────────────────────────
    natural_language_query: str
    """The user's chat message."""

    connection_id: str
    """Firestore document ID in database_connections/{id}. Credentials fetched server-side."""

    firebase_uid: str
    """Authenticated user's Firebase UID — used for access grant verification and audit."""

    user_role: str
    """RBAC role: analyst | power_user | db_manager | admin."""

    chat_id: str
    """Firestore chat document ID under users/{uid}/workspaces/{conn_id}/chats/{id}."""

    # ── Populated by entry_node ────────────────────────────────────────────
    db_connection_string: Optional[str]
    """SQLAlchemy URL built from decrypted Firestore credentials."""

    db_dialect: Optional[str]
    """Detected dialect: mysql | postgresql | mssql | oracle | mariadb."""

    db_type: Optional[str]
    """Raw db_type field from Firestore document (e.g. 'mysql', 'postgres')."""

    # ── Conversation history ───────────────────────────────────────────────
    chat_history: list[ChatMessage]
    """Previous turns loaded from Firestore messages sub-collection.
    Injected into react_agent as initial messages for multi-turn context."""

    # ── Output from react_agent_node ──────────────────────────────────────
    agent_output: Optional[str]
    """Raw string from the final AI message. Expected to be a JSON object."""

    # ── Parsed final response ─────────────────────────────────────────────
    response_type: Optional[Literal["results", "error"]]

    final_response: Optional[dict[str, Any]]
    """Structured response returned to the route handler.
    On success:  { sql_query, summary, numerical_insights, data }
    On error:    { error_message }
    """

    # ── Retry tracking ─────────────────────────────────────────────────────
    retry_count: int
    """Number of output_parser retries attempted. Capped at agent_config.max_retries."""

    # ── Internal error flag ────────────────────────────────────────────────
    error_message: Optional[str]
    """Set by any node on unrecoverable failure. Routes to END immediately."""
