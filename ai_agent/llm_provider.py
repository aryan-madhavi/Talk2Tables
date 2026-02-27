"""
Talk2Tables — LLM Provider Abstraction Layer
=============================================
Implements a clean provider abstraction with:
  - OpenRouter   (PRIMARY   — broadest model choice, single API)
  - Groq         (SECONDARY — Qwen2.5-Coder-32B, free, ~1.5s)
  - Google Gemini(TERTIARY  — Gemini 1.5 Flash, free, Hindi support)
  - Ollama       (OPTIONAL  — local/offline, Qwen2.5-Coder:7B)

Priority order: openrouter → groq → gemini → ollama
Controlled by: LLM_PROVIDER env var (no code changes needed to switch)

Author  : Member 1 (Backend Lead)
Project : Talk2Tables — Diploma Final Year Project
"""

from __future__ import annotations

import json
import logging
import os
import time
from abc import ABC, abstractmethod
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEFAULT_MAX_TOKENS = 1024
REQUEST_TIMEOUT_S  = 30  # seconds — generous for slower models

# Model identifiers
OPENROUTER_DEFAULT_MODEL = "qwen/qwen-2.5-coder-32b-instruct"
GROQ_DEFAULT_MODEL       = "qwen-2.5-coder-32b"
GEMINI_DEFAULT_MODEL     = "gemini-1.5-flash"
OLLAMA_DEFAULT_MODEL     = "qwen2.5-coder:7b"


# ---------------------------------------------------------------------------
# Base class
# ---------------------------------------------------------------------------
class LLMProvider(ABC):
    """Abstract base class for all LLM backends."""

    @abstractmethod
    def generate_sql(
        self,
        system_prompt: str,
        user_query: str,
        chat_history: list[dict],
    ) -> tuple[str, str]:
        """
        Generate SQL from a natural language query.

        Args:
            system_prompt : Full system prompt (schema + doc context + rules)
            user_query    : The user's current natural language query
            chat_history  : Recent conversation turns for multi-turn context

        Returns:
            (generated_sql_or_directive, provider_name)
            Directives look like: "CLARIFY: <question>" or "WRITE_OP: <sql>"
        """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name for logging and API responses."""


# ---------------------------------------------------------------------------
# OpenRouter Provider  (PRIMARY)
# ---------------------------------------------------------------------------
class OpenRouterProvider(LLMProvider):
    """
    OpenRouter: unified API gateway supporting 100+ models.
    Uses OpenAI-compatible /v1/chat/completions endpoint.
    Default model: qwen/qwen-2.5-coder-32b-instruct (SQL-specialized).

    Environment vars:
        OPENROUTER_API_KEY  — required
        OPENROUTER_MODEL    — optional (default: qwen/qwen-2.5-coder-32b-instruct)
        OPENROUTER_BASE_URL — optional (default: https://openrouter.ai/api/v1)
    """

    def __init__(self):
        self.api_key  = os.environ.get("OPENROUTER_API_KEY", "")
        self.model    = os.environ.get("OPENROUTER_MODEL", OPENROUTER_DEFAULT_MODEL)
        self.base_url = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY is not set in environment.")

    @property
    def name(self) -> str:
        return f"openrouter/{self.model}"

    def generate_sql(
        self,
        system_prompt: str,
        user_query: str,
        chat_history: list[dict],
    ) -> tuple[str, str]:
        messages = _build_messages(system_prompt, user_query, chat_history)

        start = time.perf_counter()
        with httpx.Client(timeout=REQUEST_TIMEOUT_S) as client:
            response = client.post(
                f"{self.base_url}/chat/completions",
                headers={
                    "Authorization":  f"Bearer {self.api_key}",
                    "Content-Type":   "application/json",
                    "HTTP-Referer":   "https://talk2tables.project",  # OpenRouter attribution
                    "X-Title":        "Talk2Tables",
                },
                json={
                    "model":      self.model,
                    "messages":   messages,
                    "max_tokens": DEFAULT_MAX_TOKENS,
                    "temperature": 0.1,  # Low temperature for deterministic SQL
                },
            )
            response.raise_for_status()

        elapsed = (time.perf_counter() - start) * 1000
        logger.info(f"[OpenRouter] Response in {elapsed:.0f}ms | model={self.model}")

        data = response.json()
        sql  = data["choices"][0]["message"]["content"].strip()
        return _clean_llm_output(sql), self.name


# ---------------------------------------------------------------------------
# Groq Provider  (SECONDARY)
# ---------------------------------------------------------------------------
class GroqProvider(LLMProvider):
    """
    Groq: LPU-accelerated inference — ~1.5s response, generous free tier.
    Default model: Qwen2.5-Coder-32B (SQL-specialized).

    Environment vars:
        GROQ_API_KEY    — required
        GROQ_MODEL      — optional (default: qwen-2.5-coder-32b)
    """

    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY", "")
        self.model   = os.environ.get("GROQ_MODEL", GROQ_DEFAULT_MODEL)

        if not self.api_key:
            raise ValueError("GROQ_API_KEY is not set in environment.")

    @property
    def name(self) -> str:
        return f"groq/{self.model}"

    def generate_sql(
        self,
        system_prompt: str,
        user_query: str,
        chat_history: list[dict],
    ) -> tuple[str, str]:
        messages = _build_messages(system_prompt, user_query, chat_history)

        start = time.perf_counter()
        with httpx.Client(timeout=REQUEST_TIMEOUT_S) as client:
            response = client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type":  "application/json",
                },
                json={
                    "model":       self.model,
                    "messages":    messages,
                    "max_tokens":  DEFAULT_MAX_TOKENS,
                    "temperature": 0.1,
                },
            )
            response.raise_for_status()

        elapsed = (time.perf_counter() - start) * 1000
        logger.info(f"[Groq] Response in {elapsed:.0f}ms | model={self.model}")

        data = response.json()
        sql  = data["choices"][0]["message"]["content"].strip()
        return _clean_llm_output(sql), self.name


# ---------------------------------------------------------------------------
# Google Gemini Provider  (TERTIARY / FALLBACK)
# ---------------------------------------------------------------------------
class GeminiProvider(LLMProvider):
    """
    Google Gemini: free tier with Hindi language support.
    Default model: gemini-1.5-flash (~2.5s response).

    Environment vars:
        GEMINI_API_KEY  — required
        GEMINI_MODEL    — optional (default: gemini-1.5-flash)
    """

    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY", "")
        self.model   = os.environ.get("GEMINI_MODEL", GEMINI_DEFAULT_MODEL)

        if not self.api_key:
            raise ValueError("GEMINI_API_KEY is not set in environment.")

    @property
    def name(self) -> str:
        return f"gemini/{self.model}"

    def generate_sql(
        self,
        system_prompt: str,
        user_query: str,
        chat_history: list[dict],
    ) -> tuple[str, str]:
        # Gemini uses a different REST API shape — build content blocks
        contents = _build_gemini_contents(system_prompt, user_query, chat_history)

        start = time.perf_counter()
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        with httpx.Client(timeout=REQUEST_TIMEOUT_S) as client:
            response = client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={
                    "contents": contents,
                    "generationConfig": {
                        "temperature": 0.1,
                        "maxOutputTokens": DEFAULT_MAX_TOKENS,
                    },
                    "systemInstruction": {
                        "parts": [{"text": system_prompt}]
                    },
                },
            )
            response.raise_for_status()

        elapsed = (time.perf_counter() - start) * 1000
        logger.info(f"[Gemini] Response in {elapsed:.0f}ms | model={self.model}")

        data = response.json()
        sql  = data["candidates"][0]["content"]["parts"][0]["text"].strip()
        return _clean_llm_output(sql), self.name


# ---------------------------------------------------------------------------
# Ollama Provider  (OPTIONAL — local/offline)
# ---------------------------------------------------------------------------
class OllamaProvider(LLMProvider):
    """
    Ollama: runs open-source models locally, no API key needed.
    Default model: qwen2.5-coder:7b (quantized, CPU-friendly).
    Ideal for air-gapped / offline industrial deployments.

    Environment vars:
        OLLAMA_BASE_URL — optional (default: http://localhost:11434)
        OLLAMA_MODEL    — optional (default: qwen2.5-coder:7b)

    Setup: docker exec ollama ollama pull qwen2.5-coder:7b
    """

    def __init__(self):
        self.base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        self.model    = os.environ.get("OLLAMA_MODEL", OLLAMA_DEFAULT_MODEL)

    @property
    def name(self) -> str:
        return f"ollama/{self.model}"

    def generate_sql(
        self,
        system_prompt: str,
        user_query: str,
        chat_history: list[dict],
    ) -> tuple[str, str]:
        messages = _build_messages(system_prompt, user_query, chat_history)

        start = time.perf_counter()
        with httpx.Client(timeout=120) as client:  # Longer timeout for local CPU inference
            response = client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model":    self.model,
                    "messages": messages,
                    "stream":   False,
                    "options":  {"temperature": 0.1, "num_predict": DEFAULT_MAX_TOKENS},
                },
            )
            response.raise_for_status()

        elapsed = (time.perf_counter() - start) * 1000
        logger.info(f"[Ollama] Response in {elapsed:.0f}ms | model={self.model}")

        data = response.json()
        sql  = data["message"]["content"].strip()
        return _clean_llm_output(sql), self.name


# ---------------------------------------------------------------------------
# Provider Factory with cascading fallback
# ---------------------------------------------------------------------------

# Priority chain: openrouter → groq → gemini → ollama
_PROVIDER_PRIORITY = ["openrouter", "groq", "gemini", "ollama"]

_PROVIDER_MAP: dict[str, type[LLMProvider]] = {
    "openrouter": OpenRouterProvider,
    "groq":       GroqProvider,
    "gemini":     GeminiProvider,
    "ollama":     OllamaProvider,
}


def get_llm_provider(preferred: Optional[str] = None) -> LLMProvider:
    """
    Instantiate the best available LLM provider with automatic fallback.

    Priority order: openrouter → groq → gemini → ollama
    Override with LLM_PROVIDER env var or the `preferred` argument.

    Returns:
        An instantiated LLMProvider ready to call .generate_sql()

    Raises:
        RuntimeError if no provider can be instantiated.
    """
    env_pref = preferred or os.environ.get("LLM_PROVIDER", "").lower().strip()

    # If explicitly set, try that one first then fall through priority chain
    priority = (
        [env_pref] + [p for p in _PROVIDER_PRIORITY if p != env_pref]
        if env_pref in _PROVIDER_MAP
        else _PROVIDER_PRIORITY
    )

    last_error: Optional[Exception] = None
    for provider_key in priority:
        cls = _PROVIDER_MAP.get(provider_key)
        if cls is None:
            continue
        try:
            instance = cls()
            logger.info(f"[LLMFactory] Using provider: {provider_key}")
            return instance
        except (ValueError, Exception) as exc:
            logger.warning(f"[LLMFactory] Provider '{provider_key}' unavailable: {exc}")
            last_error = exc
            continue

    raise RuntimeError(
        f"No LLM provider could be instantiated. "
        f"Set at least one of: OPENROUTER_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, or OLLAMA_BASE_URL. "
        f"Last error: {last_error}"
    )


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _build_messages(
    system_prompt: str,
    user_query: str,
    chat_history: list[dict],
    max_history_turns: int | None = None,
) -> list[dict]:
    """
    Build OpenAI-compatible messages list.
    Includes system prompt + trimmed conversation history + current query.
    """
    max_turns = max_history_turns or int(os.environ.get("MAX_HISTORY_TURNS", "6"))

    # Trim to last N turns to keep token count manageable
    trimmed_history = chat_history[-(max_turns * 2):]  # *2 because user+assistant pairs

    messages = [{"role": "system", "content": system_prompt}]
    for turn in trimmed_history:
        # Guard against malformed history entries
        role    = turn.get("role", "user")
        content = turn.get("content", "")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_query})
    return messages


def _build_gemini_contents(
    system_prompt: str,
    user_query: str,
    chat_history: list[dict],
    max_history_turns: int | None = None,
) -> list[dict]:
    """
    Build Gemini-compatible 'contents' array.
    Gemini handles system instructions separately, so we only include
    user/model turns here. System prompt is passed in systemInstruction.
    """
    max_turns = max_history_turns or int(os.environ.get("MAX_HISTORY_TURNS", "6"))
    trimmed   = chat_history[-(max_turns * 2):]

    contents = []
    for turn in trimmed:
        role    = turn.get("role", "user")
        content = turn.get("content", "")
        if content:
            # Gemini uses 'user' and 'model' (not 'assistant')
            gemini_role = "model" if role == "assistant" else "user"
            contents.append({"role": gemini_role, "parts": [{"text": content}]})

    contents.append({"role": "user", "parts": [{"text": user_query}]})
    return contents


def _clean_llm_output(raw: str) -> str:
    """
    Strip common LLM formatting artifacts from SQL output.
    - Remove markdown code fences (```sql ... ```)
    - Strip leading/trailing whitespace
    - Preserve CLARIFY: and WRITE_OP: directives as-is
    """
    # Remove ```sql ... ``` or ``` ... ``` code fences
    if raw.startswith("```"):
        lines  = raw.split("\n")
        # Drop first line (```sql or ```) and last line (```)
        inner  = lines[1:] if lines[-1].strip() == "```" else lines[1:]
        inner  = inner[:-1] if inner and inner[-1].strip() == "```" else inner
        raw    = "\n".join(inner)

    return raw.strip()