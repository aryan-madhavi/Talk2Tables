# ai_agent/providers/openrouter.py
"""
OpenRouter provider — PRIMARY.
Uses LangChain ChatOpenAI pointed at the OpenRouter API gateway.
Supports 100+ models via a single API key.

Env vars:
    OPENROUTER_API_KEY   required
    OPENROUTER_MODEL     optional (default: qwen/qwen-2.5-coder-32b-instruct)
    OPENROUTER_BASE_URL  optional (default: https://openrouter.ai/api/v1)
"""
from __future__ import annotations

import os

from .base import LLMProvider

_DEFAULT_MODEL   = "openai/gpt-4o-mini"
_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"


class OpenRouterProvider(LLMProvider):

    def __init__(self):
        self.api_key  = os.environ.get("OPENROUTER_API_KEY", "")
        self.model    = os.environ.get("OPENROUTER_MODEL", _DEFAULT_MODEL)
        self.base_url = os.environ.get("OPENROUTER_BASE_URL", _DEFAULT_BASE_URL)
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY is not set.")

    @property
    def name(self) -> str:
        return f"openrouter/{self.model}"

    def get_model(self):
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model          = self.model,
            api_key        = self.api_key,
            base_url       = self.base_url,
            temperature    = 0.1,
            max_tokens     = 16384,
            default_headers= {
                "HTTP-Referer": "https://talk2tables.project",
                "X-Title":      "Talk2Tables",
            },
        )
