# ai_agent/providers/__init__.py
"""
LLM Provider factory — Ollama only (Local).

Priority order: ollama
Override with LLM_PROVIDER env var.
"""
from __future__ import annotations

import logging
from typing import Optional

from auth.core.config import settings
from .base import LLMProvider
from .ollama import OllamaProvider

logger = logging.getLogger(__name__)

_PRIORITY = ["ollama"]

_PROVIDER_MAP: dict[str, type[LLMProvider]] = {
    "ollama":     OllamaProvider,
}

# ── LLM singleton ─────────────────────────────────────────────────────────────
_llm_singleton = None
_llm_singleton_key: Optional[str] = None


def get_llm(preferred: Optional[str] = None):
    """
    Return the singleton LangChain ChatModel, instantiating it on first call.
    """
    global _llm_singleton, _llm_singleton_key

    effective_pref = preferred or settings.llm_provider
    cache_key = effective_pref or "auto"

    if _llm_singleton is not None and _llm_singleton_key == cache_key:
        return _llm_singleton

    # If a specific provider is requested, put it at the front of the line
    priority = (
        [effective_pref] + [p for p in _PRIORITY if p != effective_pref]
        if effective_pref in _PROVIDER_MAP
        else _PRIORITY
    )

    errors = []
    for key in priority:
        cls = _PROVIDER_MAP.get(key)
        if cls is None:
            continue
        try:
            provider = cls()
            model    = provider.get_model()
            logger.info(f"[LLMFactory] Successfully instantiated provider: {provider.name}")
            _llm_singleton     = model
            _llm_singleton_key = cache_key
            return model
        except Exception as exc:
            logger.warning(f"[LLMFactory] Provider '{key}' failed: {exc}")
            errors.append(f"{key}: {exc}")

    error_detail = " | ".join(errors)
    raise RuntimeError(
        f"No LLM provider could be instantiated. Checked: {priority}. "
        f"Details: {error_detail}"
    )


__all__ = ["get_llm", "LLMProvider"]
