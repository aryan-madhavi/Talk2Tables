# auth/core/config.py
"""
Talk2Tables — On-Premise Settings
=================================
Loads configuration from environment variables or a .env file.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Authentication (Local JWT) ──────────────────────────────────────────
    jwt_secret_key: str = "your-default-secret-change-it"
    jwt_algorithm:  str = "HS256"
    access_token_expire_minutes:  int = 60
    refresh_token_expire_days:    int = 7

    # ── MongoDB (Users, Chats, Sessions, Connections) ────────────────────────
    mongo_uri:     str = "mongodb://localhost:27017"
    mongo_db_name: str = "talk2tables_db"

    # ── Redis cache (optional) ────────────────────────────────────────────
    # Format: redis://[:password@]host[:port][/db]
    redis_url: Optional[str] = None

    # ── Database Password Encryption ────────────────────────────────────────
    # AES-256 Key to encrypt your connected database passwords in MongoDB.
    db_encryption_key: str = "your-64-char-hex-key-here"

    # ── Local AI (Ollama) ───────────────────────────────────────────────────
    llm_provider:    str = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model:    str = "qwen2.5-coder:7b"

    # ── CORS ──────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"

    log_level: str  = "INFO"
    debug:     bool = False  # Set DEBUG=true to enable /docs and /redoc


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
