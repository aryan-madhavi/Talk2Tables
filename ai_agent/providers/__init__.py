# ai_agent/providers/__init__.py
"""
LLM Provider factory with automatic cascading fallback.

Priority order: groq → gemini → ollama
Override with LLM_PROVIDER env var.
"""
from __future__ import annotations

import logging
import os
from typing import Optional, Any

from langchain_core.callbacks import AsyncCallbackHandler

from .base import LLMProvider
from .groq import GroqProvider
from .gemini import GeminiProvider
from .ollama import OllamaProvider

logger = logging.getLogger(__name__)

class LLMDebugLogHandler(AsyncCallbackHandler):
    """Callback to print the exact messages being passed to the LLM at every step."""
    async def on_chat_model_start(self, serialized: dict, messages: list, **kwargs: Any) -> None:
        logger.info("\n" + "=" * 80)
        logger.info("[DEBUG LOG] ====== EXACT MESSAGES PASSED TO LLM MODEL ======")
        for msgs in messages:
            for m in msgs:
                role = getattr(m, "type", type(m).__name__)
                content = getattr(m, "content", str(m))
                logger.info(f"Role: {role}\nContent:\n{content}\n" + "-" * 80)
        logger.info("================================================================================\n")

_PRIORITY = ["groq", "gemini", "ollama"]

_PROVIDER_MAP: dict[str, type[LLMProvider]] = {
    "groq":   GroqProvider,
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
}

# ── LLM singleton ─────────────────────────────────────────────────────────────
# LLM instantiation (API key validation, HTTP client init) takes 50-200ms.
# Cache the model object so only the first request pays that cost.
_llm_singleton = None
_llm_singleton_key: Optional[str] = None


def get_llm(preferred: Optional[str] = None):
    """
    Return the singleton LangChain ChatModel, instantiating it on first call.

    The singleton is keyed by the effective provider name so a runtime change
    to LLM_PROVIDER (e.g., in tests) still produces a fresh instance.

    Args:
        preferred: Provider key override. Falls back to LLM_PROVIDER env var,
                   then the priority chain.

    Returns:
        An instantiated LangChain BaseChatModel.

    Raises:
        RuntimeError if no provider can be instantiated.
    """
    global _llm_singleton, _llm_singleton_key

    env_pref  = preferred or os.environ.get("LLM_PROVIDER", "").lower().strip()
    cache_key = env_pref or "auto"

    if _llm_singleton is not None and _llm_singleton_key == cache_key:
        logger.debug(f"[LLMFactory] Returning cached LLM (provider_key={cache_key})")
        return _llm_singleton

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
            
            # Attach debug logger for every single LLM call
            model = model.with_config({"callbacks": [LLMDebugLogHandler()]})
            
            logger.info(f"[LLMFactory] Using provider: {provider.name}")
            _llm_singleton     = model
            _llm_singleton_key = cache_key
            return model
        except Exception as exc:
            logger.warning(f"[LLMFactory] Provider '{key}' unavailable: {exc}")
            last_error = exc

    raise RuntimeError(
        f"No LLM provider could be instantiated. "
        f"Set at least one of: GROQ_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL. "
        f"Last error: {last_error}"
    )


__all__ = ["get_llm", "LLMProvider", "LLMDebugLogHandler"]
