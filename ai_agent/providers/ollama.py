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

from auth.core.config import settings
from .base import LLMProvider


class OllamaProvider(LLMProvider):

    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.model    = settings.ollama_model

    @property
    def name(self) -> str:
        return f"ollama/{self.model}"

    def get_model(self):
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model       = self.model,
            base_url    = self.base_url,
            temperature = 0.1,
            num_predict = 1024,
        )
