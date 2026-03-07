# ai_agent/providers/gemini.py
"""
Google Gemini provider — TERTIARY.
Free tier with Hindi language support. Used as primary in the n8n workflow.

Env vars:
    GEMINI_API_KEY  required
    GEMINI_MODEL    optional (default: gemini-2.0-flash)
"""
from __future__ import annotations

import os

from .base import LLMProvider

_DEFAULT_MODEL = "gemini-2.0-flash"


class GeminiProvider(LLMProvider):

    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        self.model   = os.environ.get("GEMINI_MODEL", _DEFAULT_MODEL)
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not set.")

    @property
    def name(self) -> str:
        return f"gemini/{self.model}"

    def get_model(self):
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(
            model       = self.model,
            google_api_key = self.api_key,
            temperature = 0.1,
            max_tokens  = 16384,
        )
