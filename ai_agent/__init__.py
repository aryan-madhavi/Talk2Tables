# ai_agent/__init__.py
"""
Talk2Tables — AI SQL Agent Package
=====================================
Public API for the ai_agent module.

Primary entry point:
    from ai_agent import run_agent

    result = await run_agent(
        natural_language_query = "Show all sensors overdue for calibration",
        connection_id          = "uuid-from-firestore",
        firebase_uid           = "firebase-uid",
        user_role              = "analyst",
        chat_id                = "chat-uuid",
        chat_history           = [],   # loaded from Firestore by route handler
    )
"""
from .graph import run_agent, get_agent
from .state import AgentState, ChatMessage

__all__ = [
    "run_agent",
    "get_agent",
    "AgentState",
    "ChatMessage",
]
