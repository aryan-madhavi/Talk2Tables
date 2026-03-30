# ai_agent/config.py
"""
Agent-level configuration loaded from environment variables.
All fields have safe defaults so the agent runs without a full .env in dev.
"""
from __future__ import annotations

import os


class AgentConfig:
    """Lightweight config — reads from os.environ directly to avoid import cycles."""

    # LLM cascade: try preferred provider, fall back down the chain
    llm_provider: str           = os.environ.get("LLM_PROVIDER", "gemini").lower()

    # LangGraph retry limit when output_parser fails to parse JSON
    max_retries: int            = int(os.environ.get("AGENT_MAX_RETRIES", "3"))

    # How many previous conversation turns to include in the LLM context
    max_history_turns: int      = int(os.environ.get("MAX_HISTORY_TURNS", "6"))

    # Hard row cap on SELECT results (enforced inside execute_sql tool)
    max_query_rows: int         = int(os.environ.get("MAX_QUERY_ROWS", "10000"))

    # Max chars of schema DDL injected into the system prompt (~3000 tokens)
    max_schema_chars: int       = int(os.environ.get("MAX_SCHEMA_CHARS", "12000"))


# Singleton — import and read attributes directly
agent_config = AgentConfig()
