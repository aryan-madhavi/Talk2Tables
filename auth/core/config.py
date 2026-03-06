# auth/core/config.py
"""
Settings — copy .env.example to .env and fill in your values.

Required .env keys:
────────────────────────────────────────────────────────────────────
# Firebase Service Account  (download from Firebase Console →
#   Project Settings → Service Accounts → Generate new private key)
FIREBASE_CREDENTIALS_PATH=firebase-credentials.json

# OR paste the entire JSON as one line for Docker / cloud deploys:
# FIREBASE_CREDENTIALS_JSON={"type":"service_account","project_id":"..."}

FIREBASE_PROJECT_ID=your-firebase-project-id
────────────────────────────────────────────────────────────────────

Storage architecture:
  • Firebase Auth    — identity, password hashing, token signing/verification
  • Firestore        — users collection, sessions sub-collection
  • NO PostgreSQL    — no SQLAlchemy, no asyncpg, no migrations needed
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

    # ── Firebase Service Account ───────────────────────────────────────────
    # Priority: JSON env var (Docker) > file path (local dev)
    firebase_credentials_path: str           = "firebase-credentials.json"
    firebase_credentials_json: Optional[str] = None

    firebase_project_id: str = ""

    # ── Firestore collection names ─────────────────────────────────────────
    firestore_users_collection:    str = "users"
    firestore_sessions_collection: str = "sessions"   # sub-collection under each user doc

    # ── Session TTL — matches Firebase ID token lifetime ──────────────────
    session_expiry_seconds: int = 3600   # 1 hour

    # ── CORS ──────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    log_level: str = "INFO"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()