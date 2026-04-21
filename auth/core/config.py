# auth/core/config.py
"""
Talk2Tables — On-Premise Settings
=================================
Loads configuration from environment variables or a .env file.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Authentication (Local JWT) ──────────────────────────────────────────
    jwt_secret_key: str = Field("your-default-secret-change-it", alias="JWT_SECRET_KEY")
    jwt_algorithm:  str = Field("HS256", alias="JWT_ALGORITHM")
    access_token_expire_minutes:  int = Field(60, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_days:    int = Field(7, alias="REFRESH_TOKEN_EXPIRE_DAYS")

    # ── MongoDB (Users, Chats, Sessions, Connections) ────────────────────────
    mongo_uri:     str = Field("mongodb://localhost:27017", alias="MONGO_URI")
    mongo_db_name: str = Field("talk2tables_db", alias="MONGO_DB_NAME")

    # ── Redis cache (optional) ────────────────────────────────────────────
    # Format: redis://[:password@]host[:port][/db]
    redis_url: Optional[str] = Field(None, alias="REDIS_URL")

    # ── Database Password Encryption ────────────────────────────────────────
    # AES-256 Key to encrypt your connected database passwords in MongoDB.
    db_encryption_key: str = Field("your-64-char-hex-key-here", alias="DB_ENCRYPTION_KEY")

    # ── Local AI (Ollama) ───────────────────────────────────────────────────
    llm_provider:    str = Field("ollama", alias="LLM_PROVIDER")
    ollama_base_url: str = Field("http://localhost:11434", alias="OLLAMA_BASE_URL")
    ollama_model:    str = Field("qwen2.5-coder:7b-instruct-q4_K_M", alias="OLLAMA_MODEL")

    # ── CORS ──────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"

    log_level: str  = "INFO"
    debug:     bool = False  # Set DEBUG=true to enable /docs and /redoc


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
