"""
Talk2Tables — AI SQL Agent Package
====================================
Public API exports for the ai_agent module.

Usage (from FastAPI route):
    from ai_agent import run_agent

    result = await run_agent(
        natural_language_query = "Show sensors overdue for calibration",
        db_connection_string   = "mysql+pymysql://user:pass@host/db",
        connection_id          = "conn-uuid-123",
        user_id                = "user-42",
        user_role              = "viewer",
        chat_history           = [],
        system_db_session      = db,  # FastAPI dependency-injected session
    )

Author  : Member 1 (Backend Lead)
Project : Talk2Tables — Diploma Final Year Project
"""

from .graph import run_agent, get_agent
from .state import AgentState, ChatMessage, ValidationResult
from .llm_provider import get_llm_provider, LLMProvider
from .schema_manager import get_schema_context, get_doc_context, detect_dialect, get_table_list
from .sql_validator import validate_sql, validate_confirmed_write
from .prompts import build_system_prompt

__all__ = [
    # Main entry point
    "run_agent",
    "get_agent",
    # State types
    "AgentState",
    "ChatMessage",
    "ValidationResult",
    # LLM providers
    "get_llm_provider",
    "LLMProvider",
    # Schema utilities
    "get_schema_context",
    "get_doc_context",
    "detect_dialect",
    "get_table_list",
    # SQL validation
    "validate_sql",
    "validate_confirmed_write",
    # Prompts
    "build_system_prompt",
]