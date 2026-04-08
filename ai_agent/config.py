# ai_agent/config.py
"""
Agent-level configuration loaded from environment variables.
All fields have safe defaults so the agent runs without a full .env in dev.
"""
from __future__ import annotations

import os


class AgentConfig:
    """Lightweight config — reads from os.environ directly via properties."""
    
    @property
    def llm_provider(self) -> str:
        return os.environ.get("LLM_PROVIDER", "gemini").lower()

    @property
    def max_retries(self) -> int:
        return int(os.environ.get("AGENT_MAX_RETRIES", "3"))

    @property
    def max_history_turns(self) -> int:
        return int(os.environ.get("MAX_HISTORY_TURNS", "6"))

    @property
    def max_query_rows(self) -> int:
        return int(os.environ.get("MAX_QUERY_ROWS", "10000"))

    @property
    def max_schema_chars(self) -> int:
        return int(os.environ.get("MAX_SCHEMA_CHARS", "12000"))

# Singleton — import and read attributes directly
agent_config = AgentConfig()
