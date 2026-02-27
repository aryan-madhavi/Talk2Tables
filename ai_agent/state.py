"""
Talk2Tables — AI SQL Agent State Definition
============================================
Defines the AgentState TypedDict used across all LangGraph nodes.
Every node reads from and writes to this shared state object.

Author  : Member 1 (Backend Lead)
Project : Talk2Tables — Diploma Final Year Project
"""

from __future__ import annotations

from typing import Any, Literal, Optional
from typing_extensions import TypedDict


# ---------------------------------------------------------------------------
# Message format for multi-turn conversation memory
# ---------------------------------------------------------------------------
class ChatMessage(TypedDict):
    """A single turn in the conversation history."""
    role: Literal["user", "assistant", "system"]
    content: str


# ---------------------------------------------------------------------------
# Validation result returned by the SQL validator node
# ---------------------------------------------------------------------------
class ValidationResult(TypedDict):
    """Structured result from the SQL validation pipeline."""
    is_valid: bool
    operation_type: Literal["SELECT", "INSERT", "UPDATE", "DELETE", "WRITE_OP", "CLARIFY", "UNKNOWN"]
    error: Optional[str]           # Human-readable reason if invalid
    sanitized_sql: Optional[str]   # Cleaned SQL (stripped of trailing semicolons etc.)
    risk_level: Literal["safe", "moderate", "high"]


# ---------------------------------------------------------------------------
# Core agent state — passed between every LangGraph node
# ---------------------------------------------------------------------------
class AgentState(TypedDict):
    """
    Central state object for the Talk2Tables LangGraph SQL agent.

    Lifecycle:
        START → load_schema → generate_sql → classify_and_validate
                → [execute_query | return_preview | return_clarification | retry_generate]
                → format_results → END
    """

    # ── Input ──────────────────────────────────────────────────────────────
    natural_language_query: str
    """The raw natural language query submitted by the user."""

    db_connection_string: str
    """SQLAlchemy-compatible connection URL for the TARGET database."""

    db_dialect: Literal["mysql", "postgresql", "sqlite", "mssql", "oracle", "mariadb"]
    """Detected or configured database dialect; injected into the system prompt."""

    user_id: str
    """Authenticated user ID for audit logging and RBAC enforcement."""

    user_role: Literal["admin", "power_user", "viewer"]
    """RBAC role extracted from JWT; controls write operation access."""

    connection_id: str
    """ID of the DB connection record; used to fetch schema docs context."""

    # ── Conversation Memory ────────────────────────────────────────────────
    chat_history: list[ChatMessage]
    """
    Full multi-turn conversation history for this session.
    Injected into the LLM prompt to maintain context across queries.
    Max last N turns are used (configured via MAX_HISTORY_TURNS env var).
    """

    # ── Schema Context (populated by load_schema node) ────────────────────
    schema_context: Optional[str]
    """Live DB schema as CREATE TABLE DDL strings from SQLAlchemy reflection."""

    doc_context: Optional[str]
    """Extracted text from user-uploaded schema docs (PDFs, Word, Excel).
    Fetched from connection_schema_docs table; max ~2000 tokens."""

    # ── LLM Output (populated by generate_sql node) ───────────────────────
    generated_sql: Optional[str]
    """Raw SQL string returned by the LLM provider."""

    llm_provider_used: Optional[str]
    """Name of the LLM provider that generated the SQL (for response metadata)."""

    clarification_question: Optional[str]
    """If the LLM returns CLARIFY:, this holds the question to ask the user."""

    # ── Validation (populated by classify_and_validate node) ──────────────
    validation_result: Optional[ValidationResult]
    """Full structured output from the SQL safety & validation pipeline."""

    retry_count: int
    """Number of SQL generation retries attempted. Max = 2 (per spec)."""

    retry_error_context: Optional[str]
    """Error message from failed validation, passed back to LLM on retry."""

    # ── Execution Output (populated by execute_query / format_results) ────
    query_results: Optional[list[dict[str, Any]]]
    """List of row dicts returned by query execution. Max 10,000 rows."""

    column_metadata: Optional[list[dict[str, str]]]
    """Column names and types for frontend table rendering."""

    execution_time_ms: Optional[float]
    """Query wall-clock execution time in milliseconds."""

    affected_rows: Optional[int]
    """For write ops preview: estimated affected row count."""

    # ── Final Response (populated by format_results / return_* nodes) ─────
    response_type: Optional[Literal[
        "results",       # Successful SELECT → results table
        "preview",       # Write op → SQL preview awaiting confirmation
        "clarification", # LLM needs more info from user
        "error",         # Unrecoverable error
    ]]

    final_response: Optional[dict[str, Any]]
    """
    Structured response dict returned to the FastAPI route.
    Shape varies by response_type:
      results      → { sql, results, columns, summary, execution_time, llm_provider }
      preview      → { sql, affected_rows, operation_type, warning_message }
      clarification→ { question }
      error        → { error_message, retry_count }
    """

    # ── Internal routing flags ─────────────────────────────────────────────
    error_message: Optional[str]
    """Internal error accumulator; set by any node on failure."""