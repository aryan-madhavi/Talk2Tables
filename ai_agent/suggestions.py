# ai_agent/suggestions.py
"""
Generate natural-language query suggestions for a database connection.

Cache strategy:
    suggestions:{connection_id}  — TTL 24 h (Redis)
    Falls back to generating fresh suggestions via LLM on miss.

Schema is read from the existing two-tier schema cache (Redis → Firestore)
so the LLM call is the only new I/O on a cold start.
"""
from __future__ import annotations

import json
import logging

from ai_agent.providers import get_llm
from auth.core.mongo import get_database
from core.redis_client import redis_get, redis_set
from core.cache_keys import key_schema_tables, key_suggestions, TTL_SUGGESTIONS

logger = logging.getLogger(__name__)

COLLECTION     = "schema_cache"
_TABLES_DOC_ID = "_tables"


async def _get_table_names(connection_id: str) -> list[str]:
    """Return flat list of 'schema.table' strings from Redis → MongoDB."""
    # 1. Redis
    cached = await redis_get(key_schema_tables(connection_id))
    if cached:
        tables = cached if isinstance(cached, list) else json.loads(cached)
        return [f"{t.get('table_schema')}.{t.get('table_name')}" for t in tables]

    # 2. MongoDB
    try:
        db = get_database()
        doc = await db[COLLECTION].find_one({"connection_id": connection_id, "doc_id": _TABLES_DOC_ID})
        if doc:
            tables = doc.get("tables", [])
            return [f"{t.get('table_schema')}.{t.get('table_name')}" for t in tables]
    except Exception as exc:
        logger.warning(f"[Suggestions] MongoDB schema read failed: {exc}")

    return []


async def get_suggestions(connection_id: str, count: int = 6) -> list[str]:
    """
    Return `count` natural-language query suggestions for the given connection.

    Flow:
      1. Return cached suggestions from Redis (TTL 24 h).
      2. On miss: read table list from schema cache, call LLM, cache result.
      3. On any failure: return empty list (caller shows fallback UI).
    """
    cache_key = key_suggestions(connection_id)

    # 1. Cache hit
    cached = await redis_get(cache_key)
    if cached:
        result = cached if isinstance(cached, list) else json.loads(cached)
        logger.debug(f"[Suggestions] Cache hit connection_id={connection_id}")
        return result

    # 2. Get schema
    table_names = await _get_table_names(connection_id)
    if not table_names:
        logger.warning(f"[Suggestions] No schema found for connection_id={connection_id}")
        return []

    # 3. Build prompt — cap at 60 tables to keep prompt short
    tables_str = "\n".join(f"  - {t}" for t in table_names[:60])
    prompt = (
        f"You are a data analyst assistant. Given the following database tables, "
        f"suggest exactly {count} useful natural-language questions a user might ask.\n\n"
        f"Tables:\n{tables_str}\n\n"
        f"Rules:\n"
        f"- Each question must be concise (under 12 words)\n"
        f"- Make questions specific to the actual table names shown\n"
        f"- Cover varied query types: counts, filters, trends, aggregations, top-N\n"
        f"- Return ONLY a JSON array of {count} strings, no explanation, no markdown\n\n"
        f'Example: ["Show all active orders", "Count users by country", "Top 5 products by revenue"]'
    )

    # 4. Call LLM
    try:
        llm      = get_llm()
        response = await llm.ainvoke(prompt)
        text     = response.content.strip()

        # Extract JSON array robustly (LLM may add markdown fences)
        start = text.find("[")
        end   = text.rfind("]") + 1
        if start == -1 or end == 0:
            raise ValueError(f"No JSON array in LLM response: {text[:200]}")

        suggestions = json.loads(text[start:end])
        if not isinstance(suggestions, list):
            raise ValueError("LLM response is not a JSON array")
        suggestions = [str(s) for s in suggestions[:count]]

    except Exception as exc:
        logger.error(f"[Suggestions] LLM call failed: {exc}")
        return []

    # 5. Cache for 24 h
    await redis_set(cache_key, suggestions, TTL_SUGGESTIONS)
    logger.info(f"[Suggestions] Generated {len(suggestions)} suggestions for connection_id={connection_id}")
    return suggestions
