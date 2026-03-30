# ai_agent/providers/base.py
"""Abstract base for all LLM providers."""
from __future__ import annotations

from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Returns a LangChain BaseChatModel ready for use with create_react_agent."""

    @abstractmethod
    def get_model(self):
        """Return an instantiated LangChain BaseChatModel."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name for logging."""
