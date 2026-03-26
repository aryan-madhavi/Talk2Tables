# ai_agent/graph.py
"""
Talk2Tables — LangGraph Outer Graph
=====================================
Assembles the three-node outer StateGraph:

    START → entry_node → react_agent_node → output_parser_node → END
                 ↓ error                    ↑ retry (max 3)
                END

The react_agent_node uses langgraph.prebuilt.create_react_agent internally,
which mirrors the n8n AI Agent node behaviour: the LLM autonomously decides
when to call get_schema_list, get_table_definition, and execute_sql.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import create_react_agent

from .config import agent_config
from .state import AgentState
from .nodes import node_entry, node_output_parser
from .prompts import build_system_prompt
from .providers import get_llm
from .tools import get_tools

logger = logging.getLogger(__name__)


# ── Inner ReAct agent cache ────────────────────────────────────────────────────
# create_react_agent(llm, tools) compiles a small StateGraph.  It's cheap but
# still takes ~10-30ms and allocates objects on every call.  Cache keyed by
# (connection_id, user_role) so the same user hitting the same DB reuses the
# compiled agent; the LLM singleton is already shared across all entries.
_react_agent_cache: dict[tuple, Any] = {}


# ── React agent node ───────────────────────────────────────────────────────────

async def node_react_agent(state: AgentState) -> AgentState:
    """
    Run the LangChain ReAct agent with tools bound to the current DB connection.

    The agent:
      1. Calls get_schema_list → learns available tables
      2. Calls get_table_definition(table, schema) → learns column structure
      3. Calls execute_sql(query) → runs the query
      4. Returns a structured JSON string as the final message

    Chat history from Firestore is injected as initial messages to provide
    multi-turn context (mirrors n8n's Simple Memory with sessionId key).
    """
    conn_str  = state["db_connection_string"]
    dialect   = state["db_dialect"]
    user_role = state["user_role"]

    logger.info(
        f"[node_react_agent] Starting | uid={state['firebase_uid']} "
        f"dialect={dialect} retry={state.get('retry_count', 0)}"
    )

    # ── Build tools and compiled inner agent (cached) ────────────────────
    cache_key = (state["connection_id"], user_role)
    try:
        llm           = get_llm()
        system_prompt = build_system_prompt(dialect, user_role)
        if cache_key not in _react_agent_cache:
            tools = get_tools(conn_str, user_role, state["connection_id"])
            _react_agent_cache[cache_key] = create_react_agent(llm, tools)
            logger.debug(f"[node_react_agent] Compiled new inner agent for key={cache_key}")
        else:
            logger.debug(f"[node_react_agent] Reusing cached inner agent for key={cache_key}")
        agent = _react_agent_cache[cache_key]
    except Exception as exc:
        logger.error(f"[node_react_agent] Setup failed: {exc}")
        msg = f"AI agent could not be initialised: {exc}"
        return {**state, "error_message": msg, "response_type": "error",
                "final_response": {"error_message": msg}}

    # ── Build message history ──────────────────────────────────────────────
    max_turns = agent_config.max_history_turns
    history   = state.get("chat_history", [])
    trimmed   = history[-(max_turns * 2):]  # keep last N turns (user+assistant pairs)

    messages: list = [SystemMessage(content=system_prompt)]
    for turn in trimmed:
        role    = turn.get("role", "user")
        content = turn.get("content", "")
        if not content:
            continue
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))

    # Add the current user query
    messages.append(HumanMessage(content=state["natural_language_query"]))

    # If this is a retry, add a nudge to fix the output format
    # If this is a retry, add a nudge to fix the output format
    if state.get("retry_count", 0) > 0:
        messages.append(HumanMessage(
            content=(
                "Your previous response was not formatted correctly. "
                "You have access to tools - use them if needed, then return ONLY "
                "a valid JSON object with keys: sql_query, summary, total_records, "
                "numerical_insights, data. No markdown, no plain text, ONLY JSON."
            )
        ))

    # ── Run react agent ────────────────────────────────────────────────────
    try:
        result = await agent.ainvoke({"messages": messages})

        # The last message in the output is the final AI response
        output_messages = result.get("messages", [])
        last_ai_content = ""
        for msg in reversed(output_messages):
            if hasattr(msg, "content") and isinstance(msg.content, str) and msg.content.strip():
                last_ai_content = msg.content
                break

        logger.info(
            f"[node_react_agent] Agent done | "
            f"output_length={len(last_ai_content)} | "
            f"preview={last_ai_content[:120]!r}"
        )

        return {**state, "agent_output": last_ai_content}

    except Exception as exc:
        logger.error(f"[node_react_agent] Agent failed: {exc}", exc_info=True)
        msg = f"AI agent encountered an error: {exc}"
        return {**state, "error_message": msg, "response_type": "error",
                "final_response": {"error_message": msg}}


# ── Edge routers ───────────────────────────────────────────────────────────────

def route_after_entry(state: AgentState) -> str:
    if state.get("error_message"):
        return END
    return "react_agent"


def route_after_react_agent(state: AgentState) -> str:
    if state.get("error_message"):
        return END
    return "output_parser"


def route_after_output_parser(state: AgentState) -> str:
    if state.get("response_type") == "results":
        return END
    # If output_parser set retry_count but no terminal response_type, retry
    if state.get("retry_count", 0) > 0 and not state.get("final_response"):
        return "react_agent"
    return END


# ── Graph assembly ─────────────────────────────────────────────────────────────

def build_agent_graph():
    """Assemble and compile the outer LangGraph StateGraph."""
    graph = StateGraph(AgentState)

    graph.add_node("entry",         node_entry)
    graph.add_node("react_agent",   node_react_agent)
    graph.add_node("output_parser", node_output_parser)

    graph.add_edge(START, "entry")
    graph.add_conditional_edges("entry",         route_after_entry,         {"react_agent": "react_agent", END: END})
    graph.add_conditional_edges("react_agent",   route_after_react_agent,   {"output_parser": "output_parser", END: END})
    graph.add_conditional_edges("output_parser", route_after_output_parser, {"react_agent": "react_agent", END: END})

    compiled = graph.compile()
    logger.info("[AgentGraph] Talk2Tables outer graph compiled successfully.")
    return compiled


# ── Singleton ──────────────────────────────────────────────────────────────────

_agent_graph = None


def get_agent():
    """Return the compiled singleton agent graph (compiled once at startup)."""
    global _agent_graph
    if _agent_graph is None:
        _agent_graph = build_agent_graph()
    return _agent_graph


# ── Write-intent guard ─────────────────────────────────────────────────────────
# Fast pre-flight check — no LLM calls needed for obvious write requests from
# read-only roles. Saves tokens and prevents cascading rate-limit hits.

_WRITE_INTENT_RE = re.compile(
    r'\b(update|delete|insert|modify|rename|replace|edit|remove|drop)\b'
    r'|\bchange\b.{0,80}\bto\b'
    r'|\badd\b.{0,40}\b(record|row|entry|data|column)\b',
    re.IGNORECASE,
)
_ROLES_ALLOWED_WRITE = {"admin", "power_user", "db_manager"}

_WRITE_BLOCKED_RESPONSE: dict[str, Any] = {
    "title":               "Write access required",
    "sql_query":           "",
    "summary":             (
        "You don't have permission to modify data. "
        "Your role (analyst) only allows SELECT queries. "
        "Please contact your administrator to request write access."
    ),
    "total_records":       0,
    "numerical_insights":  {"total_records": 0, "aggregations": {}},
    "data":                [],
}

# ── In-flight deduplication ────────────────────────────────────────────────────
# Prevents a user from accidentally submitting two concurrent heavy queries
# (e.g., re-clicking Send while waiting) which would double the LLM token spend
# and cascade rate-limit errors.

_in_flight: set[str] = set()   # set of firebase_uid strings


# ── Public entry point ─────────────────────────────────────────────────────────

async def run_agent(
    natural_language_query: str,
    connection_id:          str,
    firebase_uid:           str,
    user_role:              str,
    chat_id:                str,
    chat_history:           list[dict],
) -> dict[str, Any]:
    """
    Main entry point called by the query route handler.

    Args:
        natural_language_query : User's chat message
        connection_id          : Firestore document ID in database_connections
        firebase_uid           : Authenticated user Firebase UID
        user_role              : RBAC role (analyst | power_user | db_manager | admin)
        chat_id                : Firestore chat document ID
        chat_history           : Previous messages loaded from Firestore

    Returns:
        {   
            "response_type":  "results" | "error",
            "final_response": { sql_query, summary, numerical_insights, data }
                              or { error_message }
        }
    """
    # ── Guard 1: write-intent pre-flight for read-only roles ──────────────────
    if user_role not in _ROLES_ALLOWED_WRITE and _WRITE_INTENT_RE.search(natural_language_query):
        logger.info(
            f"[run_agent] Write intent blocked — role={user_role} | "
            f"query={natural_language_query[:80]!r}"
        )
        return {"response_type": "results", "final_response": _WRITE_BLOCKED_RESPONSE}

    # ── Guard 2: in-flight deduplication (per user) ───────────────────────────
    if firebase_uid in _in_flight:
        logger.warning(
            f"[run_agent] Concurrent query rejected — uid={firebase_uid} already has a query in flight"
        )
        return {
            "response_type": "results",
            "final_response": {
                "title":              "Query in progress",
                "sql_query":          "",
                "summary":            "Your previous query is still running. Please wait for it to complete before sending a new one.",
                "total_records":      0,
                "numerical_insights": {"total_records": 0, "aggregations": {}},
                "data":               [],
            },
        }

    _in_flight.add(firebase_uid)
    agent = get_agent()

    initial_state: AgentState = {
        "natural_language_query": natural_language_query,
        "connection_id":          connection_id,
        "firebase_uid":           firebase_uid,
        "user_role":              user_role,
        "chat_id":                chat_id,
        "chat_history":           chat_history,
        # Populated by entry_node
        "db_connection_string":   None,
        "db_dialect":             None,
        "db_type":                None,
        # Agent output
        "agent_output":           None,
        # Response
        "response_type":          None,
        "final_response":         None,
        # Retry
        "retry_count":            0,
        # Error
        "error_message":          None,
    }

    try:
        final_state = await agent.ainvoke(initial_state)
    except Exception as exc:
        logger.error(f"[run_agent] Unhandled error: {exc}", exc_info=True)
        return {
            "response_type":  "error",
            "final_response": {"error_message": f"Internal agent error: {exc}"},
        }
    finally:
        _in_flight.discard(firebase_uid)

    return {
        "response_type":  final_state.get("response_type", "error"),
        "final_response": final_state.get("final_response", {}),
    }


# ── Streaming entry point ──────────────────────────────────────────────────────

async def run_agent_stream(
    natural_language_query: str,
    connection_id:          str,
    firebase_uid:           str,
    user_role:              str,
    chat_id:                str,
    chat_history:           list[dict],
):
    """
    Async generator that yields SSE-formatted strings.
    Emits `event: progress` lines as the agent works, then `event: result` with the final response.
    """
    import json as _json

    # ── Pre-flight: write intent ──────────────────────────────────────────────
    if user_role not in _ROLES_ALLOWED_WRITE and _WRITE_INTENT_RE.search(natural_language_query):
        payload = {"response_type": "results", "final_response": _WRITE_BLOCKED_RESPONSE, "chat_id": chat_id or ""}
        yield f"event: result\ndata: {_json.dumps(payload)}\n\n"
        return

    # ── Pre-flight: in-flight dedup ───────────────────────────────────────────
    if firebase_uid in _in_flight:
        payload = {
            "response_type": "results",
            "final_response": {
                "title": "Query in progress",
                "sql_query": "",
                "summary": "Your previous query is still running. Please wait.",
                "total_records": 0,
                "numerical_insights": {"total_records": 0, "aggregations": {}},
                "data": [],
            },
            "chat_id": chat_id or "",
        }
        yield f"event: result\ndata: {_json.dumps(payload)}\n\n"
        return

    _in_flight.add(firebase_uid)

    initial_state: AgentState = {
        "natural_language_query": natural_language_query,
        "connection_id":          connection_id,
        "firebase_uid":           firebase_uid,
        "user_role":              user_role,
        "chat_id":                chat_id,
        "chat_history":           chat_history,
        "db_connection_string":   None,
        "db_dialect":             None,
        "db_type":                None,
        "agent_output":           None,
        "response_type":          None,
        "final_response":         None,
        "retry_count":            0,
        "error_message":          None,
    }

    agent = get_agent()
    final_result = None
    _progress_sent: set[str] = set()

    def _emit_progress(stage: str, message: str) -> str | None:
        if stage in _progress_sent:
            return None
        _progress_sent.add(stage)
        return f"event: progress\ndata: {_json.dumps({'stage': stage, 'message': message})}\n\n"

    try:
        async for event in agent.astream_events(initial_state, version="v2"):
            kind = event.get("event", "")
            name = event.get("name", "")

            if kind == "on_chain_start" and name == "entry":
                p = _emit_progress("entry", "Connecting to database...")
                if p:
                    yield p

            elif kind == "on_tool_start":
                if name == "get_schema_list":
                    p = _emit_progress("schema", "Loading database schema...")
                    if p:
                        yield p
                elif name == "get_table_definition":
                    p = _emit_progress("inspect", "Inspecting table structure...")
                    if p:
                        yield p
                elif name == "execute_sql":
                    p = _emit_progress("exec", "Executing SQL query...")
                    if p:
                        yield p

            elif kind == "on_chat_model_start":
                p = _emit_progress("llm", "Generating SQL query...")
                if p:
                    yield p

            elif kind == "on_chain_end" and name == "LangGraph":
                output = event.get("data", {}).get("output", {})
                if isinstance(output, dict) and output.get("response_type"):
                    final_result = {
                        "response_type":  output.get("response_type", "error"),
                        "final_response": output.get("final_response", {}),
                    }

        if final_result is None:
            final_result = {"response_type": "error", "final_response": {"error_message": "No response received from agent."}}

    except Exception as exc:
        logger.error(f"[run_agent_stream] Error: {exc}", exc_info=True)
        final_result = {"response_type": "error", "final_response": {"error_message": f"AI agent error: {exc}"}}
    finally:
        _in_flight.discard(firebase_uid)

    yield f"event: result\ndata: {_json.dumps(final_result)}\n\n"
