"""
Talk2Tables — LangGraph AI SQL Agent
======================================
The core orchestrator for the Talk2Tables NL2SQL pipeline.

Implemented as a LangGraph StateGraph — a state machine where each node
performs one step of the query lifecycle and edges encode conditional routing.

Node flow:
  load_schema
      │
  generate_sql
      │
  classify_and_validate
      ├── CLARIFY   → return_clarification
      ├── WRITE_OP  → return_preview
      ├── INVALID   → retry_generate (max 2 retries, then error)
      └── SELECT    → execute_query → format_results → END

Author  : Member 1 (Backend Lead)
Project : Talk2Tables — Diploma Final Year Project
"""

from __future__ import annotations

import logging
import time
from typing import Any, Literal, Optional

from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END

from .state import AgentState, ChatMessage, ValidationResult
from .llm_provider import get_llm_provider
from .schema_manager import get_schema_context, get_doc_context, detect_dialect
from .sql_validator import validate_sql
from .prompts import build_system_prompt, build_retry_user_message

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_RETRIES = 2  # Max SQL generation retries on validation failure


# ===========================================================================
# GRAPH NODES
# ===========================================================================

# ---------------------------------------------------------------------------
# Node 1: load_schema
# ---------------------------------------------------------------------------
async def node_load_schema(state: AgentState, config: RunnableConfig) -> AgentState:
    """
    Load the live database schema via SQLAlchemy reflection.
    Also fetches schema doc context from connection_schema_docs table.

    Populates: state.schema_context, state.doc_context, state.db_dialect
    """
    logger.info(f"[node_load_schema] Loading schema for connection_id={state['connection_id']}")

    # ── Detect dialect from connection string ─────────────────────────────
    dialect = detect_dialect(state["db_connection_string"])
    # Allow state to override if explicitly set
    if state.get("db_dialect"):
        dialect = state["db_dialect"]

    # ── Reflect live schema ───────────────────────────────────────────────
    try:
        schema_ctx = get_schema_context(state["db_connection_string"], dialect)
    except RuntimeError as exc:
        logger.error(f"[node_load_schema] Schema load failed: {exc}")
        return {
            **state,
            "db_dialect":    dialect,
            "schema_context": f"ERROR: {exc}",
            "doc_context":    None,
            "error_message":  str(exc),
            "response_type":  "error",
            "final_response": {"error_message": str(exc), "retry_count": 0},
        }

    # ── Fetch schema doc context ──────────────────────────────────────────
    doc_ctx: Optional[str] = None
    # system_db_session is injected via RunnableConfig configurable fields
    system_db_session = config.get("configurable", {}).get("system_db_session")
    if system_db_session:
        try:
            doc_ctx = await get_doc_context(state["connection_id"], system_db_session)
        except Exception as exc:
            logger.warning(f"[node_load_schema] Doc context fetch failed (non-fatal): {exc}")
            doc_ctx = None

    logger.info(
        f"[node_load_schema] Schema loaded: {len(schema_ctx)} chars | "
        f"doc_context={'yes' if doc_ctx else 'no'} | dialect={dialect}"
    )

    return {
        **state,
        "db_dialect":     dialect,
        "schema_context": schema_ctx,
        "doc_context":    doc_ctx,
        "retry_count":    state.get("retry_count", 0),
        "error_message":  None,
    }


# ---------------------------------------------------------------------------
# Node 2: generate_sql
# ---------------------------------------------------------------------------
async def node_generate_sql(state: AgentState) -> AgentState:
    """
    Call the active LLM provider to generate SQL from the natural language query.
    On retries, injects error context to guide the LLM toward a correct response.

    Populates: state.generated_sql, state.llm_provider_used
    """
    retry_count = state.get("retry_count", 0)
    logger.info(
        f"[node_generate_sql] Generating SQL | "
        f"retry={retry_count} | user='{state['user_id']}'"
    )

    # ── Build system prompt ───────────────────────────────────────────────
    system_prompt = build_system_prompt(
        db_dialect     = state.get("db_dialect", "mysql"),
        schema_context = state.get("schema_context", ""),
        doc_context    = state.get("doc_context"),
    )

    # ── Determine user message (handle retry context) ─────────────────────
    if retry_count > 0 and state.get("retry_error_context") and state.get("generated_sql"):
        user_message = build_retry_user_message(
            original_query = state["natural_language_query"],
            failed_sql     = state["generated_sql"],
            error_reason   = state["retry_error_context"],
        )
    else:
        user_message = state["natural_language_query"]

    # ── Get LLM provider (with cascading fallback) ────────────────────────
    try:
        provider = get_llm_provider()
    except RuntimeError as exc:
        logger.error(f"[node_generate_sql] No LLM provider available: {exc}")
        return {
            **state,
            "error_message":  str(exc),
            "response_type":  "error",
            "final_response": {"error_message": str(exc), "retry_count": retry_count},
        }

    # ── Call LLM ──────────────────────────────────────────────────────────
    try:
        generated_sql, provider_name = provider.generate_sql(
            system_prompt = system_prompt,
            user_query    = user_message,
            chat_history  = state.get("chat_history", []),
        )
    except Exception as exc:
        logger.error(f"[node_generate_sql] LLM call failed: {exc}")
        return {
            **state,
            "error_message":  f"AI generation failed: {exc}",
            "response_type":  "error",
            "final_response": {
                "error_message": f"AI provider error: {exc}",
                "retry_count":   retry_count,
            },
        }

    logger.info(
        f"[node_generate_sql] SQL generated by {provider_name}: "
        f"{generated_sql[:120]!r}{'...' if len(generated_sql) > 120 else ''}"
    )

    return {
        **state,
        "generated_sql":      generated_sql,
        "llm_provider_used":  provider_name,
        "error_message":      None,
    }


# ---------------------------------------------------------------------------
# Node 3: classify_and_validate
# ---------------------------------------------------------------------------
async def node_classify_and_validate(state: AgentState) -> AgentState:
    """
    Run the multi-stage SQL safety & validation pipeline.
    Sets state.validation_result for the router to branch on.

    Handles:
      - CLARIFY: directives
      - WRITE_OP: directives
      - Injection guard
      - DDL block
      - RBAC enforcement
      - Row limit enforcement
    """
    generated_sql = state.get("generated_sql", "")
    user_role     = state.get("user_role", "viewer")
    db_dialect    = state.get("db_dialect", "mysql")

    logger.info(f"[node_validate] Validating SQL | role={user_role} | dialect={db_dialect}")

    result, clarification_question = validate_sql(
        raw_sql    = generated_sql,
        user_role  = user_role,
        db_dialect = db_dialect,
    )

    return {
        **state,
        "validation_result":      result,
        "clarification_question": clarification_question,
    }


# ---------------------------------------------------------------------------
# Node 4a: execute_query
# ---------------------------------------------------------------------------
async def node_execute_query(state: AgentState, config: RunnableConfig) -> AgentState:
    """
    Execute the validated SELECT query against the target database.
    Uses SQLAlchemy with connection pooling; enforces 10,000 row cap.

    Populates: state.query_results, state.column_metadata, state.execution_time_ms
    """
    sql       = state["validation_result"]["sanitized_sql"]
    conn_str  = state["db_connection_string"]

    logger.info(f"[node_execute_query] Executing SELECT | user={state['user_id']}")

    try:
        from sqlalchemy import create_engine, text as sa_text
        engine = create_engine(conn_str, pool_pre_ping=True, echo=False)

        t_start = time.perf_counter()
        with engine.connect() as conn:
            result  = conn.execute(sa_text(sql))
            columns = list(result.keys())
            rows    = result.fetchmany(10_000)  # Hard cap per spec
        elapsed_ms = (time.perf_counter() - t_start) * 1000

        # Serialize rows to list of dicts (handle non-serializable types)
        serialized_rows = [
            {col: _serialize_value(val) for col, val in zip(columns, row)}
            for row in rows
        ]

        col_metadata = [{"name": col, "type": "string"} for col in columns]
        # Attempt to enrich column types from validation result
        # (type info already reflected in schema, frontend will handle display)

        logger.info(
            f"[node_execute_query] Query OK: {len(serialized_rows)} rows | "
            f"{elapsed_ms:.0f}ms"
        )

        return {
            **state,
            "query_results":    serialized_rows,
            "column_metadata":  col_metadata,
            "execution_time_ms": elapsed_ms,
            "error_message":    None,
        }

    except Exception as exc:
        logger.error(f"[node_execute_query] Query execution failed: {exc}")
        return {
            **state,
            "error_message":  f"Query execution error: {exc}",
            "response_type":  "error",
            "final_response": {
                "error_message":  str(exc),
                "generated_sql":  sql,
                "retry_count":    state.get("retry_count", 0),
            },
        }


# ---------------------------------------------------------------------------
# Node 4b: format_results
# ---------------------------------------------------------------------------
async def node_format_results(state: AgentState) -> AgentState:
    """
    Build the final structured response for SELECT query results.
    Adds an AI-generated summary of the results (single-sentence).
    """
    rows          = state.get("query_results", [])
    columns       = state.get("column_metadata", [])
    sql           = state["validation_result"]["sanitized_sql"]
    elapsed_ms    = state.get("execution_time_ms", 0)
    provider_name = state.get("llm_provider_used", "unknown")

    # ── Build human summary ───────────────────────────────────────────────
    row_count   = len(rows)
    table_count = sql.upper().count(" JOIN ") + 1
    summary = _generate_result_summary(
        row_count     = row_count,
        query         = state["natural_language_query"],
        columns       = [c["name"] for c in columns],
    )

    final_response = {
        "sql":            sql,
        "results":        rows,
        "columns":        columns,
        "summary":        summary,
        "row_count":      row_count,
        "execution_time": f"{elapsed_ms:.0f}ms",
        "llm_provider":   provider_name,
        "is_truncated":   row_count >= 10_000,
    }

    # ── Append assistant turn to conversation history ─────────────────────
    updated_history = list(state.get("chat_history", []))
    updated_history.append(ChatMessage(role="user",      content=state["natural_language_query"]))
    updated_history.append(ChatMessage(role="assistant", content=f"[SQL] {sql}"))

    logger.info(f"[node_format_results] Response built | {row_count} rows")

    return {
        **state,
        "response_type":  "results",
        "final_response": final_response,
        "chat_history":   updated_history,
    }


# ---------------------------------------------------------------------------
# Node 5: return_preview  (write operations)
# ---------------------------------------------------------------------------
async def node_return_preview(state: AgentState) -> AgentState:
    """
    Build a WRITE_OP preview response.
    The frontend displays the SQL in a warning box with Confirm/Cancel buttons.
    The actual execution happens via a separate /api/query/execute endpoint.
    """
    sql       = state["validation_result"]["sanitized_sql"]
    op_type   = state["validation_result"]["operation_type"]
    risk      = state["validation_result"]["risk_level"]

    # Estimate affected rows with a COUNT query (best-effort, non-blocking)
    affected_estimate = _estimate_affected_rows(
        sql        = sql,
        conn_str   = state["db_connection_string"],
        op_type    = op_type,
    )

    risk_messages = {
        "high":     "⚠️  HIGH RISK: This operation may affect many rows or is missing a WHERE clause. Review carefully before confirming.",
        "moderate": "⚠️  CAUTION: This write operation will modify data. Please review the SQL before confirming.",
    }

    final_response = {
        "sql":             sql,
        "operation_type":  op_type,
        "affected_rows":   affected_estimate,
        "risk_level":      risk,
        "warning_message": risk_messages.get(risk, "Please confirm this write operation."),
        "llm_provider":    state.get("llm_provider_used", "unknown"),
        "requires_confirmation": True,
    }

    logger.info(f"[node_return_preview] Write preview: op={op_type}, risk={risk}")

    return {
        **state,
        "response_type":  "preview",
        "final_response": final_response,
        "affected_rows":  affected_estimate,
    }


# ---------------------------------------------------------------------------
# Node 6: return_clarification
# ---------------------------------------------------------------------------
async def node_return_clarification(state: AgentState) -> AgentState:
    """
    Return the LLM's clarification question to the user.
    The frontend displays this as a chat bubble with a text input.
    """
    question = state.get("clarification_question", "Could you provide more details?")

    logger.info(f"[node_return_clarification] Asking: {question!r}")

    # Append to history so context is preserved for next turn
    updated_history = list(state.get("chat_history", []))
    updated_history.append(ChatMessage(role="user",      content=state["natural_language_query"]))
    updated_history.append(ChatMessage(role="assistant", content=f"CLARIFY: {question}"))

    return {
        **state,
        "response_type":  "clarification",
        "final_response": {"question": question},
        "chat_history":   updated_history,
    }


# ---------------------------------------------------------------------------
# Node 7: retry_generate
# ---------------------------------------------------------------------------
async def node_retry_generate(state: AgentState) -> AgentState:
    """
    Increment retry counter and feed validation error back as context.
    The graph routes back to generate_sql for another attempt.
    """
    new_retry_count = state.get("retry_count", 0) + 1
    error_reason    = state["validation_result"]["error"]

    logger.warning(
        f"[node_retry_generate] Retry #{new_retry_count} | reason: {error_reason}"
    )

    return {
        **state,
        "retry_count":        new_retry_count,
        "retry_error_context": error_reason,
    }


# ===========================================================================
# EDGE ROUTERS (conditional branching)
# ===========================================================================

def route_after_schema_load(state: AgentState) -> str:
    """After load_schema: go to generate_sql unless a critical error occurred."""
    if state.get("response_type") == "error":
        return END
    return "generate_sql"


def route_after_generate(state: AgentState) -> str:
    """After generate_sql: go to validate unless LLM provider failed."""
    if state.get("response_type") == "error":
        return END
    return "classify_and_validate"


def route_after_validation(state: AgentState) -> str:
    """
    Core routing decision after validation:
      - CLARIFY   → return_clarification
      - WRITE_OP  → return_preview
      - INVALID   → retry (up to MAX_RETRIES) → then error
      - SELECT    → execute_query
      - error     → END
    """
    if state.get("response_type") == "error":
        return END

    result: ValidationResult = state.get("validation_result", {})

    op_type  = result.get("operation_type", "UNKNOWN")
    is_valid = result.get("is_valid", False)

    if op_type == "CLARIFY":
        return "return_clarification"

    if op_type == "WRITE_OP":
        return "return_preview"

    if not is_valid:
        retry_count = state.get("retry_count", 0)
        if retry_count < MAX_RETRIES:
            return "retry_generate"
        else:
            # Max retries exceeded — return error
            logger.error(
                f"[Router] Max retries ({MAX_RETRIES}) exceeded. "
                f"Last error: {result.get('error')}"
            )
            return END  # Final response was set in validate node

    # Valid SELECT (or INSERT/UPDATE/DELETE that somehow slipped past — shouldn't happen)
    return "execute_query"


def route_after_retry(state: AgentState) -> str:
    """After retry_generate: always go back to generate_sql."""
    return "generate_sql"


def route_after_execute(state: AgentState) -> str:
    """After execute_query: go to format_results unless execution error."""
    if state.get("response_type") == "error":
        return END
    return "format_results"


# ===========================================================================
# GRAPH ASSEMBLY
# ===========================================================================

def build_agent_graph() -> Any:
    """
    Assemble and compile the LangGraph StateGraph for the Talk2Tables SQL agent.

    Returns:
        Compiled LangGraph app — call with .ainvoke(state) from FastAPI routes.
    """
    graph = StateGraph(AgentState)

    # ── Register nodes ────────────────────────────────────────────────────
    graph.add_node("load_schema",           node_load_schema)
    graph.add_node("generate_sql",          node_generate_sql)
    graph.add_node("classify_and_validate", node_classify_and_validate)
    graph.add_node("execute_query",         node_execute_query)
    graph.add_node("format_results",        node_format_results)
    graph.add_node("return_preview",        node_return_preview)
    graph.add_node("return_clarification",  node_return_clarification)
    graph.add_node("retry_generate",        node_retry_generate)

    # ── Entry point ───────────────────────────────────────────────────────
    graph.add_edge(START, "load_schema")

    # ── Conditional edges ─────────────────────────────────────────────────
    graph.add_conditional_edges("load_schema",           route_after_schema_load, {
        "generate_sql": "generate_sql",
        END:             END,
    })
    graph.add_conditional_edges("generate_sql",          route_after_generate, {
        "classify_and_validate": "classify_and_validate",
        END:                      END,
    })
    graph.add_conditional_edges("classify_and_validate", route_after_validation, {
        "execute_query":          "execute_query",
        "return_preview":         "return_preview",
        "return_clarification":   "return_clarification",
        "retry_generate":         "retry_generate",
        END:                       END,
    })
    graph.add_conditional_edges("retry_generate",        route_after_retry, {
        "generate_sql": "generate_sql",
    })
    graph.add_conditional_edges("execute_query",         route_after_execute, {
        "format_results": "format_results",
        END:               END,
    })

    # ── Terminal edges ────────────────────────────────────────────────────
    graph.add_edge("format_results",       END)
    graph.add_edge("return_preview",       END)
    graph.add_edge("return_clarification", END)

    # ── Compile ───────────────────────────────────────────────────────────
    compiled = graph.compile()
    logger.info("[AgentGraph] Talk2Tables SQL Agent graph compiled successfully.")
    return compiled


# ---------------------------------------------------------------------------
# Public API — called from FastAPI routes
# ---------------------------------------------------------------------------

# Singleton — compiled once at startup
_agent_graph = None


def get_agent() -> Any:
    """Return the compiled singleton agent graph."""
    global _agent_graph
    if _agent_graph is None:
        _agent_graph = build_agent_graph()
    return _agent_graph


async def run_agent(
    natural_language_query: str,
    db_connection_string:   str,
    connection_id:          str,
    user_id:                str,
    user_role:              str,
    chat_history:           list[ChatMessage],
    db_dialect:             Optional[str] = None,
    system_db_session       = None,
) -> dict[str, Any]:
    """
    Main entry point: run the full NL2SQL agent pipeline.

    Called by the FastAPI route handler (api/routes/query.py).

    Args:
        natural_language_query : User's query text (English or Hindi)
        db_connection_string   : SQLAlchemy URL for target database
        connection_id          : UUID of the DB connection record
        user_id                : Authenticated user ID
        user_role              : RBAC role (admin / power_user / viewer)
        chat_history           : Previous conversation turns for multi-turn context
        db_dialect             : Optional dialect override; auto-detected if None
        system_db_session      : SQLAlchemy async session for system DB (for doc context)

    Returns:
        final_response dict with keys depending on response_type:
          results       → sql, results, columns, summary, row_count, execution_time, llm_provider
          preview       → sql, operation_type, affected_rows, risk_level, warning_message
          clarification → question
          error         → error_message, retry_count
    """
    agent = get_agent()

    initial_state: AgentState = {
        # Input
        "natural_language_query": natural_language_query,
        "db_connection_string":   db_connection_string,
        "db_dialect":             db_dialect or "",
        "user_id":                user_id,
        "user_role":              user_role,
        "connection_id":          connection_id,
        # Memory
        "chat_history":           chat_history,
        # Schema (populated by load_schema node)
        "schema_context":         None,
        "doc_context":            None,
        # LLM output
        "generated_sql":          None,
        "llm_provider_used":      None,
        "clarification_question": None,
        # Validation
        "validation_result":      None,
        "retry_count":            0,
        "retry_error_context":    None,
        # Execution
        "query_results":          None,
        "column_metadata":        None,
        "execution_time_ms":      None,
        "affected_rows":          None,
        # Response
        "response_type":          None,
        "final_response":         None,
        "error_message":          None,
    }

    config = RunnableConfig(
        configurable={"system_db_session": system_db_session}
    )

    try:
        final_state = await agent.ainvoke(initial_state, config=config)
    except Exception as exc:
        logger.error(f"[run_agent] Unhandled agent error: {exc}", exc_info=True)
        return {
            "response_type":  "error",
            "final_response": {
                "error_message": f"Internal agent error: {exc}",
                "retry_count":   0,
            },
        }

    return {
        "response_type":    final_state.get("response_type", "error"),
        "final_response":   final_state.get("final_response", {}),
        "chat_history":     final_state.get("chat_history", chat_history),
        "llm_provider":     final_state.get("llm_provider_used"),
    }


# ===========================================================================
# Internal utilities
# ===========================================================================

def _serialize_value(value: Any) -> Any:
    """Convert non-JSON-serializable types from DB rows to safe Python types."""
    import datetime, decimal
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _generate_result_summary(
    row_count: int,
    query: str,
    columns: list[str],
) -> str:
    """
    Generate a simple human-readable summary of the query results.
    This is a deterministic template; the LLM is not called again to save latency.
    """
    if row_count == 0:
        return "No records found matching your query."
    if row_count >= 10_000:
        return (
            f"Found 10,000+ records (display capped). "
            f"Consider adding filters to narrow results."
        )
    col_preview = ", ".join(columns[:4])
    suffix      = f" and {len(columns) - 4} more columns" if len(columns) > 4 else ""
    return (
        f"Found {row_count:,} record{'s' if row_count != 1 else ''} "
        f"with columns: {col_preview}{suffix}."
    )


def _estimate_affected_rows(
    sql: str,
    conn_str: str,
    op_type: str,
) -> int:
    """
    Estimate rows affected by a write operation by constructing a COUNT query.
    Returns 0 if estimation fails (non-critical — preview still shown).
    """
    import re
    from sqlalchemy import create_engine, text as sa_text

    try:
        # Extract WHERE clause for estimation
        where_match = re.search(r"\bWHERE\b(.+?)(?:\bORDER BY\b|\bLIMIT\b|$)",
                                sql, re.IGNORECASE | re.DOTALL)
        if not where_match:
            return -1  # -1 signals "all rows" to frontend (high risk indicator)

        # Extract table name for UPDATE / DELETE
        if op_type in ("UPDATE", "DELETE"):
            table_match = re.search(
                r"(?:UPDATE|DELETE\s+FROM)\s+(\w+)", sql, re.IGNORECASE
            )
            if not table_match:
                return 0
            table_name = table_match.group(1)
            where_clause = where_match.group(1).strip()
            count_sql = f"SELECT COUNT(*) FROM {table_name} WHERE {where_clause}"
        else:
            return 0

        engine = create_engine(conn_str, pool_pre_ping=True)
        with engine.connect() as conn:
            result = conn.execute(sa_text(count_sql))
            count  = result.scalar()
            return int(count) if count is not None else 0

    except Exception as exc:
        logger.warning(f"[_estimate_affected_rows] Estimation failed: {exc}")
        return 0