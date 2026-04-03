# ai_agent/providers/groq.py
"""
Groq provider — SECONDARY.
LPU-accelerated inference. ~1.5s response, generous free tier.

Env vars:
    GROQ_API_KEY  required
    GROQ_MODEL    optional (default: qwen-2.5-coder-32b)
"""
from __future__ import annotations

import os

from .base import LLMProvider

_DEFAULT_MODEL = "qwen-2.5-coder-32b"


class GroqProvider(LLMProvider):

    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY", "")
        self.model   = os.environ.get("GROQ_MODEL", _DEFAULT_MODEL)
        if not self.api_key:
            raise ValueError("GROQ_API_KEY is not set.")

    @property
    def name(self) -> str:
        return f"groq/{self.model}"

    def get_model(self):
        from langchain_groq import ChatGroq
        return ChatGroq(
            model       = self.model,
            api_key     = self.api_key,
            temperature = 0.1,
            max_tokens  = 4096,
        )
