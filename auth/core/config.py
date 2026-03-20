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

# Redis cache (optional — leave blank to disable, app falls back to Firestore)
# Local dev:          REDIS_URL=redis://localhost:6379/0
# Cloud Memorystore:  REDIS_URL=redis://10.x.x.x:6379/0
REDIS_URL=
────────────────────────────────────────────────────────────────────

Storage architecture:
  • Firebase Auth    — identity, password hashing, token signing/verification
  • Firestore        — users collection, sessions sub-collection
  • Redis            — optional cache layer (tokens, users, connections, grants)
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
    # Paste the full service-account JSON as a single-line string.
    # Download from: Firebase Console → Project Settings → Service Accounts
    #                → Generate new private key → copy contents as one line.
    firebase_credentials_json: Optional[str] = None

    firebase_project_id: str = ""

    # ── Firestore collection names ─────────────────────────────────────────
    firestore_users_collection:    str = "users"
    firestore_sessions_collection: str = "sessions"   # sub-collection under each user doc

    # ── Session TTL ───────────────────────────────────────────────────────
    session_expiry_seconds: int = 28800  # 8 hours

    # ── Redis cache (optional) ────────────────────────────────────────────
    # Leave blank/unset to disable — app works without Redis.
    # Format: redis://[:password@]host[:port][/db]
    redis_url: Optional[str] = None

    # ── CORS ──────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173"

    log_level: str = "INFO"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()