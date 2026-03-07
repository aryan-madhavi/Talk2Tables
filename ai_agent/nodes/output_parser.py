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

import json
import logging
import re

from ai_agent.config import agent_config
from ai_agent.state import AgentState

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

        # Ensure numerical_insights has at least total_records
        ni = parsed.get("numerical_insights", {})
        if not isinstance(ni, dict):
            ni = {"total_records": len(parsed.get("data", [])), "aggregations": {}}
        if "total_records" not in ni:
            ni["total_records"] = len(parsed.get("data", []))
        parsed["numerical_insights"] = ni

        # Ensure total_records is also at the top level (frontend expects both)
        parsed["total_records"] = ni["total_records"]

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
