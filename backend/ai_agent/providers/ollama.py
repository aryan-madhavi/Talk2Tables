# ai_agent/providers/ollama.py
"""
Ollama provider — OPTIONAL local/offline inference.
No API key needed. Ideal for air-gapped industrial deployments.

Env vars:
    OLLAMA_BASE_URL  optional (default: http://localhost:11434)
    OLLAMA_MODEL     optional (default: qwen2.5-coder:7b)

Setup: docker exec ollama ollama pull qwen2.5-coder:7b
"""
from __future__ import annotations

import os

from .base import LLMProvider

_DEFAULT_MODEL    = "qwen2.5-coder:7b"
_DEFAULT_BASE_URL = "http://localhost:11434"


class OllamaProvider(LLMProvider):

    def __init__(self):
        self.base_url = os.environ.get("OLLAMA_BASE_URL", _DEFAULT_BASE_URL)
        self.model    = os.environ.get("OLLAMA_MODEL", _DEFAULT_MODEL)

    @property
    def name(self) -> str:
        return f"ollama/{self.model}"

    def get_model(self):
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model       = self.model,
            base_url    = self.base_url,
            temperature = 0.1,
            num_predict = 16384,
        )
