# ai_agent/nodes/output_parser.py
"""
Output parser node — final node in the outer graph.

Parses the raw JSON string from the ReAct agent's last message into the
structured final_response dict. Retries up to agent_config.max_retries times
if parsing fails (mirrors n8n's retryOnFail + maxTries behaviour).

Expected agent output format (from prompts.py):
{
  "title": "...",
  "sql_query": "SELECT ...",
  "summary": "...",
  "total_records": N,
  "data": [...]
}
numerical_insights and narrative_insights are populated by Phase 2 (parallel Gemini calls in graph.py).
"""
from __future__ import annotations

import asyncio
import datetime
import decimal
import json
import logging
import re

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
) -> dict | None:
    """
    Use the LLM to turn raw data + original question into 3 plain-English insight cards.
    Returns None on any failure — caller treats it as optional enrichment.
    """
    total = len(data)
    if total == 0 or not data:
        return None

    sample_rows = json.dumps(data[:5], default=str)

    prompt = (
        f'A user asked: "{question}"\n'
        f"The database returned {total:,} record{'s' if total != 1 else ''}.\n\n"
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
            "key_finding":      str(result.get("key_finding", "")),
            "business_insight": str(result.get("business_insight", "")),
            "analyst_note":     str(result.get("analyst_note", "")),
        }
    except Exception as exc:
        logger.warning(f"[NarrativeInsights] Gemini call failed (non-fatal): {exc}")
        return None


async def _generate_numerical_insights(question: str, data: list[dict]) -> dict:
    """
    Gemini-powered numerical stats — returns the NumericalInsights schema consumed by the frontend.
    Falls back to pure-Python computation if Gemini fails.
    """
    if not data:
        return {"total_records": 0, "aggregations": {}}

    total   = len(data)
    columns = list(data[0].keys())
    sample  = json.dumps(data[:30], default=str)

    prompt = (
        f'Question: "{question}"\n'
        f"Total rows: {total:,}. Columns: {', '.join(columns)}\n"
        f"Sample data ({min(30, total)} rows):\n{sample}\n\n"
        "Analyze EVERY column and return ONLY valid JSON (no markdown, no explanation):\n"
        '{"total_records": <exact int>, "aggregations": {\n'
        '  "<col>": {"type": "numeric", "min": <n>, "max": <n>, "avg": <n>, "sum": <n>, "null_count": <n>}\n'
        "  OR\n"
        '  "<col>": {"type": "categorical", "unique_count": <n>, "null_count": <n>, '
        '"most_common": [{"value": "<v>", "count": <n>}, ...]}\n'
        "}}\n"
        "Rules:\n"
        "- 'categorical': IDs, codes, names, emails, dates, years, status fields, booleans, phone numbers\n"
        "- 'numeric': true continuous measures only — amounts, prices, ages, scores, quantities\n"
        "- most_common: top 3 values only\n"
        "- Estimate stats from the sample; use the exact total_records value provided above"
    )

    try:
        from ai_agent.providers import get_llm
        llm      = get_llm()
        response = await llm.ainvoke(prompt)
        text     = response.content.strip()
        start    = text.find("{"); end = text.rfind("}") + 1
        if start == -1 or end == 0:
            raise ValueError("no JSON object found")
        result = json.loads(text[start:end])
        if "total_records" not in result or "aggregations" not in result:
            raise ValueError("missing required keys")
        result["total_records"] = total  # always use exact count
        logger.info(f"[NumericalInsights] Gemini OK | cols={len(result['aggregations'])}")
        return result
    except Exception as exc:
        logger.warning(f"[NumericalInsights] Gemini failed: {exc}")
        return {"total_records": total, "aggregations": {}}


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
    import re
    
    # Mask password for logs
    masked_url = re.sub(r":([^@/]+)@", ":****@", connection_string)
    logger.info(f"[FetchData] Executing on {masked_url} | SQL: {sql}")
    
    _ct    = {"connect_args": {"connect_timeout": 10}}
    engine = create_engine(connection_string, pool_pre_ping=True, echo=False, **_ct)
    try:
        # Use .begin() to ensure a transaction is started and COMMITTED
        with engine.begin() as cx:
            result  = cx.execute(sa_text(sql))
            # For SELECT/SHOW, fetch rows. For INSERT/UPDATE, result.returns_rows is False.
            if result.returns_rows:
                columns = list(result.keys())
                rows    = result.fetchmany(_MAX_ROWS)
                res = [{col: _serialize(val) for col, val in zip(columns, row)} for row in rows]
            else:
                res = [] # Write operation succeeded
            
        logger.info(f"[FetchData] Success | Rows: {len(res)}")
        return res
    except Exception as exc:
        logger.error(f"[FetchData] Failed: {exc}")
        raise # Raise so node_output_parser can catch it and retry
    finally:
        engine.dispose()

logger = logging.getLogger(__name__)

_REQUIRED_KEYS = {"sql_query", "summary", "data"}


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
        
        # ── Detect Hallucinations (Special check for 3B models) ───────────
        hallucination_patterns = [r"column\d", r"value\d", r"random_value", r"your_table"]
        if any(re.search(p, cleaned, re.IGNORECASE) for p in hallucination_patterns):
            raise ValueError("Placeholder detected (e.g. 'column1'). You MUST use get_table_definition to find ACTUAL column names before writing SQL.")

        parsed   = json.loads(cleaned)
        
        if isinstance(parsed, list):
            parsed = {
                "sql_query": "",
                "summary":   "",
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
        
        # If model provided sql but no data (or placeholder data), try to fetch it
        # CRITICAL: For WRITE operations, we ALWAYS fetch (execute) to ensure the 
        # database change actually happens, even if the LLM provided a "fake" data array.
        sql_upper = sql.upper()
        is_write  = any(sql_upper.startswith(w) for w in ["INSERT", "UPDATE", "DELETE", "REPLACE", "CREATE", "DROP", "ALTER"])
        
        has_real_data = isinstance(parsed.get("data"), list) and len(parsed["data"]) > 0 and not any("<" in str(v) for v in parsed["data"][0].values() if isinstance(v, str))
        
        # Force execution if it's a write OR if there is no real data
        if sql and conn_str and (is_write or not has_real_data):
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
                    logger.info(f"[node_output_parser] Data executed/fetched | rows={len(full_data)}")
                parsed["data"] = full_data
            except Exception as exc:
                logger.warning(f"[node_output_parser] Database execution failed: {exc}")
                # Raise to trigger a retry so the AI can fix the SQL
                raise ValueError(f"Database Error: {exc}. Ensure your SQL is correct for the current database and use get_schema_list.")
        
        if has_real_data and not parsed.get("data"):
             # Edge case: LLM provided real-looking preview but we want the full set if available
             pass

        # Phase 2 (graph.py) fills numerical_insights + narrative_insights via parallel LLM calls
        data = parsed.get("data")
        if not isinstance(data, list):
            data = []
            parsed["data"] = []
            
        total = len(data)
        parsed["total_records"]      = total
        parsed["numerical_insights"] = None
        parsed["narrative_insights"] = None

        # Auto-generate title if LLM omitted it
        if not parsed.get("title"):
            parsed["title"] = parsed["summary"].split(".")[0].strip()[:80] or "Query result"

        logger.info(
            f"[node_output_parser] Parse OK | "
            f"rows={total} | "
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
