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


def _fmt(n: float) -> str:
    """Format a number compactly for display in summaries."""
    if abs(n) >= 1_000_000:
        return f"{n / 1_000_000:.2f}M"
    if abs(n) >= 1_000:
        return f"{n / 1_000:.1f}k"
    if n == int(n):
        return f"{int(n):,}"
    return f"{n:,.2f}"


def _generate_rich_summary(
    data: list[dict],
    insights: dict,
    llm_summary: str,
) -> str:
    """
    Build a data-driven narrative summary from computed insights.
    Falls back to the LLM summary when data is empty or trivial.
    """
    total = insights.get("total_records", 0)
    aggregations = insights.get("aggregations", {})

    if total == 0:
        return llm_summary or "No rows returned."

    parts: list[str] = []

    # ── Row count opener ──────────────────────────────────────────────────
    row_word = "row" if total == 1 else "rows"
    parts.append(f"{total:,} {row_word} returned.")

    # ── Single-row result: just list key=value pairs ──────────────────────
    if total == 1 and data:
        row   = data[0]
        pairs = [f"{k}: {v}" for k, v in row.items() if v is not None][:6]
        if pairs:
            parts.append("  ".join(pairs) + ".")
        return "  ".join(parts)

    # ── Numeric columns ───────────────────────────────────────────────────
    numeric_stats = [
        (col, s) for col, s in aggregations.items() if s.get("type") == "numeric"
    ]
    # Prioritise columns whose name suggests a meaningful metric
    _METRIC_HINTS = {"amount", "total", "count", "revenue", "price", "cost",
                     "salary", "age", "score", "qty", "quantity", "value", "sum"}
    numeric_stats.sort(
        key=lambda cs: 0 if any(h in cs[0].lower() for h in _METRIC_HINTS) else 1
    )

    for col, s in numeric_stats[:2]:          # show at most 2 numeric columns
        mn, mx, avg = s["min"], s["max"], s["avg"]
        sm           = s["sum"]
        label        = col.replace("_", " ").title()

        if mn == mx:
            parts.append(f"{label}: {_fmt(mn)} (all rows equal).")
        else:
            stat_parts = [f"ranges {_fmt(mn)} – {_fmt(mx)}", f"avg {_fmt(avg)}"]
            # Only add sum when it's meaningful (e.g. not for IDs)
            _SUM_HINTS = {"amount", "total", "revenue", "price", "cost", "salary", "qty", "quantity"}
            if any(h in col.lower() for h in _SUM_HINTS):
                stat_parts.append(f"total {_fmt(sm)}")
            parts.append(f"{label} {', '.join(stat_parts)}.")

    # ── Categorical columns ───────────────────────────────────────────────
    cat_stats = [
        (col, s) for col, s in aggregations.items() if s.get("type") == "categorical"
    ]
    for col, s in cat_stats[:2]:              # show at most 2 categorical columns
        unique  = s["unique_count"]
        common  = s.get("most_common", [])
        label   = col.replace("_", " ").title()

        if unique == 1 and common:
            parts.append(f"All {label.lower()}s: {common[0]['value']}.")
        elif unique <= 5 and common:
            breakdown = ", ".join(f"{e['value']} ({e['count']})" for e in common)
            parts.append(f"{label} — {unique} types: {breakdown}.")
        elif common:
            top = common[0]
            parts.append(f"{label}: {unique} unique values. Most common: {top['value']} ({top['count']} rows).")

    return "  ".join(parts)


async def _generate_narrative_insights(
    question: str,
    data: list[dict],
    computed: dict,
) -> dict | None:
    """
    Use the LLM to turn computed stats + original question into 3 plain-English insight cards.
    Returns None on any failure — caller treats it as optional enrichment.
    """
    total = computed.get("total_records", 0)
    if total == 0 or not data:
        return None

    # Build a compact stats summary (top 3 most interesting columns only)
    aggs = computed.get("aggregations", {})
    stat_lines: list[str] = []
    _METRIC_HINTS = {"amount","total","count","revenue","price","cost","salary","age","score","qty","quantity","value","sales"}
    sorted_cols = sorted(
        aggs.items(),
        key=lambda kv: 0 if any(h in kv[0].lower() for h in _METRIC_HINTS) else 1
    )
    for col, s in sorted_cols[:4]:
        label = col.replace("_", " ")
        if s.get("type") == "numeric":
            stat_lines.append(
                f"{label}: min={_fmt(s['min'])}, max={_fmt(s['max'])}, avg={_fmt(s['avg'])}, sum={_fmt(s['sum'])}"
            )
        else:
            top = ", ".join(f"{e['value']} ({e['count']})" for e in s.get("most_common", [])[:3])
            stat_lines.append(f"{label}: {s['unique_count']} unique — top: {top}")

    stats_text = "\n".join(stat_lines) if stat_lines else "No aggregatable columns."

    # Sample rows (first 5, values only — keep prompt short)
    sample_rows = json.dumps(data[:5], default=str)

    prompt = (
        f'A user asked: "{question}"\n'
        f"The database returned {total:,} record{'s' if total != 1 else ''}.\n\n"
        f"Key statistics:\n{stats_text}\n\n"
        f"Sample data ({min(5, total)} rows):\n{sample_rows}\n\n"
        f"You are a senior data analyst presenting to a business stakeholder.\n"
        f"Write three insights using SPECIFIC numbers from the data. Plain English only — no SQL, no column names.\n"
        f"Return ONLY this JSON (no markdown, no explanation):\n"
        f'{{"key_finding":"One sentence directly answering the question.",'
        f'"business_insight":"One sentence on what this means or what action to consider.",'
        f'"analyst_note":"One sentence on a pattern, trend, outlier, or data quality issue."}}'
    )

    try:
        from ai_agent.providers import get_llm
        llm      = get_llm()
        response = await llm.ainvoke(prompt)
        text     = response.content.strip()
        start    = text.find("{")
        end      = text.rfind("}") + 1
        if start == -1 or end == 0:
            return None
        result = json.loads(text[start:end])
        if not isinstance(result, dict):
            return None
        return {
            "key_finding":     str(result.get("key_finding", "")),
            "business_insight": str(result.get("business_insight", "")),
            "analyst_note":    str(result.get("analyst_note", "")),
        }
    except Exception as exc:
        logger.warning(f"[NarrativeInsights] LLM call failed (non-fatal): {exc}")
        return None


def _compute_insights(data: list[dict]) -> dict:
    """
    Compute rich column-level statistics programmatically from the result data.
    Far more reliable than asking the LLM to do it.
    """
    if not data:
        return {"total_records": 0, "aggregations": {}}

    from collections import Counter

    total      = len(data)
    columns    = list(data[0].keys())
    aggregations: dict[str, Any] = {}

    for col in columns:
        values   = [row.get(col) for row in data]
        non_null = [v for v in values if v is not None and v != ""]
        null_count = total - len(non_null)

        # Try to parse as numeric (handle ints, floats, Decimal-as-string)
        numeric_vals: list[float] = []
        for v in non_null:
            try:
                numeric_vals.append(float(v))
            except (TypeError, ValueError):
                pass

        if numeric_vals and len(numeric_vals) >= len(non_null) * 0.8:
            total_sum = sum(numeric_vals)
            aggregations[col] = {
                "type":       "numeric",
                "min":        round(min(numeric_vals), 4),
                "max":        round(max(numeric_vals), 4),
                "avg":        round(total_sum / len(numeric_vals), 4),
                "sum":        round(total_sum, 4),
                "null_count": null_count,
            }
        else:
            str_vals   = [str(v) for v in non_null]
            counts     = Counter(str_vals)
            most_common = [{"value": v, "count": c} for v, c in counts.most_common(3)]
            aggregations[col] = {
                "type":         "categorical",
                "unique_count": len(counts),
                "null_count":   null_count,
                "most_common":  most_common,
            }

    return {"total_records": total, "aggregations": aggregations}


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
                "summary":   "",   # will be overwritten by _generate_rich_summary below
                "numerical_insights": {},
                "data": parsed,
            }
        # Validate required keys
        missing = _REQUIRED_KEYS - set(parsed.keys())
        if missing:
            raise ValueError(f"Missing required fields: {missing}")

        # Get full data — prefer the cache written by execute_sql tool to avoid
        # a second DB round-trip. Fall back to re-execution on cache miss.
        sql      = (parsed.get("sql_query") or "").strip()
        conn_str = state.get("db_connection_string")
        if sql and conn_str and sql.upper().split()[0] in {"SELECT", "WITH"}:
            try:
                import hashlib as _hashlib
                from ai_agent.tools.query_tools import _full_result_cache, _full_result_lock
                _cache_key = _hashlib.md5(f"{conn_str}:{sql}".encode()).hexdigest()
                with _full_result_lock:
                    _cached = _full_result_cache.pop(_cache_key, None)
                if _cached is not None:
                    full_data = _cached
                    logger.info(f"[node_output_parser] Full data from cache | rows={len(full_data)}")
                else:
                    full_data = await asyncio.to_thread(_fetch_full_data, conn_str, sql)
                    logger.info(f"[node_output_parser] Full data re-fetched | rows={len(full_data)}")
                parsed["data"] = full_data
            except Exception as exc:
                logger.warning(f"[node_output_parser] Full data fetch failed: {exc}")
                # Fall back to whatever preview the LLM put in data

        # Compute rich insights programmatically — much more reliable than LLM-generated ones
        insights = _compute_insights(parsed.get("data", []))
        parsed["numerical_insights"] = insights
        parsed["total_records"]      = insights["total_records"]

        # Replace LLM summary with a data-driven narrative
        parsed["summary"] = _generate_rich_summary(
            parsed.get("data", []),
            insights,
            parsed.get("summary", ""),
        )

        # Narrative insights deferred — use POST /query/insights endpoint on demand
        parsed["narrative_insights"] = None

        # Auto-generate title if LLM omitted it
        if not parsed.get("title"):
            parsed["title"] = parsed["summary"].split(".")[0].strip()[:80] or "Query result"

        logger.info(
            f"[node_output_parser] Parse OK | "
            f"rows={insights['total_records']} | "
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
