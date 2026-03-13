# ai_agent/nodes/output_parser.py
"""
Output parser node — final node in the outer graph.

Parses the raw JSON string from the ReAct agent's last message into the
structured final_response dict. Retries up to agent_config.max_retries times
if parsing fails (mirrors n8n's retryOnFail + maxTries behaviour).

Expected agent output format (from prompts.py):
{
  "sql_query": "SELECT ...",
  "summary": "...",
  "numerical_insights": { "total_records": N, "aggregations": {} },
  "data": [...]
}
"""
from __future__ import annotations

import asyncio
import datetime
import decimal
import json
import logging
import re
from typing import Any

from ai_agent.config import agent_config
from ai_agent.state import AgentState

_MAX_ROWS = 10_000


def _serialize(value: Any) -> Any:
    if isinstance(value, (datetime.date, datetime.datetime)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _fetch_full_data(connection_string: str, sql: str) -> list[dict]:
    """Re-execute SQL synchronously; called via run_in_executor."""
    from sqlalchemy import create_engine, text as sa_text
    _ct    = {} if connection_string.lower().startswith("sqlite") else {"connect_args": {"connect_timeout": 10}}
    engine = create_engine(connection_string, pool_pre_ping=True, echo=False, **_ct)
    try:
        with engine.connect() as cx:
            result  = cx.execute(sa_text(sql))
            columns = list(result.keys())
            rows    = result.fetchmany(_MAX_ROWS)
        return [{col: _serialize(val) for col, val in zip(columns, row)} for row in rows]
    finally:
        engine.dispose()

logger = logging.getLogger(__name__)

_REQUIRED_KEYS = {"sql_query", "summary", "numerical_insights", "data"}


def _extract_json(text: str) -> str:
    """
    Strip markdown code fences if the LLM wrapped the JSON anyway,
    then return the cleaned string for json.loads().
    """
    text = text.strip()
    # Remove ```json ... ``` or ``` ... ```
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if match:
        return match.group(1).strip()
    # Try to find a bare JSON object if surrounded by prose
    match = re.search(r"(\{[\s\S]+\}|\[[\s\S]+\])", text) 
    if match:
        return match.group(0)
    return text


async def node_output_parser(state: AgentState) -> AgentState:
    """
    Parse the agent's raw output string into a structured final_response.

    On parse failure:
        - If retry_count < max_retries: increment retry_count → graph loops back to react_agent
        - If retry_count >= max_retries: return error response
    """
    raw = state.get("agent_output", "") or ""

    logger.info(
        f"[node_output_parser] Parsing output | retry={state.get('retry_count', 0)} | "
        f"length={len(raw)}"
    )

    # ── Attempt to parse ──────────────────────────────────────────────────
    try:
        cleaned  = _extract_json(raw)
        parsed   = json.loads(cleaned)
        
        if isinstance(parsed, list):
            parsed = {
                "sql_query": "",
                "summary": f"{len(parsed)} rows returned.",
                "numerical_insights": {"total_records": len(parsed), "aggregations": {}},
                "data": parsed,
            }
        # Validate required keys
        missing = _REQUIRED_KEYS - set(parsed.keys())
        if missing:
            raise ValueError(f"Missing required fields: {missing}")

        # Re-execute SQL for full data — the tool only sent a 5-row preview to
        # the LLM to avoid token limit errors. We now fetch the complete result set.
        sql      = (parsed.get("sql_query") or "").strip()
        conn_str = state.get("db_connection_string")
        if sql and conn_str and sql.upper().split()[0] in {"SELECT", "WITH"}:
            try:
                full_data = await asyncio.get_event_loop().run_in_executor(
                    None, _fetch_full_data, conn_str, sql
                )
                parsed["data"] = full_data
                logger.info(f"[node_output_parser] Full data fetched | rows={len(full_data)}")
            except Exception as exc:
                logger.warning(f"[node_output_parser] Full data re-fetch failed: {exc}")
                # Fall back to whatever preview the LLM put in data

        # Always derive total_records from the actual data array length.
        actual_count = len(parsed.get("data", []))
        ni = parsed.get("numerical_insights", {})
        if not isinstance(ni, dict):
            ni = {"aggregations": {}}
        ni["total_records"] = actual_count
        parsed["numerical_insights"] = ni
        parsed["total_records"] = actual_count

        # Auto-generate title if LLM omitted it
        if not parsed.get("title"):
            summary = parsed.get("summary", "")
            parsed["title"] = summary.split(".")[0].strip()[:80] or "Query result"

        logger.info(
            f"[node_output_parser] Parse OK | "
            f"rows={ni.get('total_records', '?')} | "
            f"sql={parsed.get('sql_query', '')[:80]!r}"
        )

        return {
            **state,
            "response_type":  "results",
            "final_response": parsed,
            "error_message":  None,
        }

    except Exception as exc:
        retry_count = state.get("retry_count", 0)
        logger.warning(
            f"[node_output_parser] Parse failed (attempt {retry_count + 1}): {exc} | "
            f"raw={raw[:200]!r}"
        )

        if retry_count < agent_config.max_retries:
            # Signal graph to retry the react_agent node
            return {
                **state,
                "retry_count":  retry_count + 1,
                "agent_output": None,  # Clear so react_agent generates fresh output
            }

        # Max retries exceeded — return error
        error_msg = (
            f"The AI returned an invalid response after {agent_config.max_retries} attempts. "
            f"Please try rephrasing your query."
        )
        logger.error(f"[node_output_parser] Max retries exceeded. Last parse error: {exc}")
        return {
            **state,
            "response_type":  "error",
            "final_response": {"error_message": error_msg},
            "error_message":  error_msg,
        }
