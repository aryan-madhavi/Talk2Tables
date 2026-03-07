# ai_agent/providers/__init__.py
"""
LLM Provider factory with automatic cascading fallback.

Priority order: openrouter → groq → gemini → ollama
Override with LLM_PROVIDER env var.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from .base import LLMProvider
from .openrouter import OpenRouterProvider
from .groq import GroqProvider
from .gemini import GeminiProvider
from .ollama import OllamaProvider

logger = logging.getLogger(__name__)

_PRIORITY = ["openrouter", "groq", "gemini", "ollama"]

_PROVIDER_MAP: dict[str, type[LLMProvider]] = {
    "openrouter": OpenRouterProvider,
    "groq":       GroqProvider,
    "gemini":     GeminiProvider,
    "ollama":     OllamaProvider,
}


def get_llm(preferred: Optional[str] = None):
    """
    Instantiate the best available LLM provider and return its LangChain ChatModel.

    Args:
        preferred: Provider key override. Falls back to LLM_PROVIDER env var,
                   then the priority chain.

    Returns:
        An instantiated LangChain BaseChatModel.

    Raises:
        RuntimeError if no provider can be instantiated.
    """
    env_pref = preferred or os.environ.get("LLM_PROVIDER", "").lower().strip()

    priority = (
        [env_pref] + [p for p in _PRIORITY if p != env_pref]
        if env_pref in _PROVIDER_MAP
        else _PRIORITY
    )

    last_error: Optional[Exception] = None
    for key in priority:
        cls = _PROVIDER_MAP.get(key)
        if cls is None:
            continue
        try:
            provider = cls()
            model    = provider.get_model()
            logger.info(f"[LLMFactory] Using provider: {provider.name}")
            return model
        except Exception as exc:
            logger.warning(f"[LLMFactory] Provider '{key}' unavailable: {exc}")
            last_error = exc

    raise RuntimeError(
        f"No LLM provider could be instantiated. "
        f"Set at least one of: OPENROUTER_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL. "
        f"Last error: {last_error}"
    )


__all__ = ["get_llm", "LLMProvider"]
