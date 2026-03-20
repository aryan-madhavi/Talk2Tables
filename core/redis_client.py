# core/redis_client.py
"""
Redis client — creates a fresh connection per call, no singleton.

Why no singleton/pool:
    On Windows with uvicorn --reload, the event loop is replaced between
    the lifespan startup and actual request handling. Any redis.asyncio
    client or ConnectionPool created during startup holds a reference to
    the OLD loop → RuntimeError: Event loop is closed on first request.

Solution:
    Don't store any client or pool. On every helper call, create a fresh
    redis.asyncio.Redis from the URL. redis.asyncio uses its own internal
    pool per-client, which lazily binds to the CURRENT running loop.
    Each client is closed after use via `async with` — this is the
    officially recommended pattern for short-lived async Redis clients.

Performance note:
    Creating a Redis() object is ~0ms. The actual TCP connection is
    reused via the internal pool within a single client's lifetime.
    For a FastAPI app this is negligible compared to Firestore latency.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Optional

from auth.core.config import settings

_REDIS_TIMEOUT = 1.0  # max seconds any Redis call may take before we give up and hit Firestore

logger = logging.getLogger(__name__)


# ── Startup / shutdown hooks (kept for main.py lifespan compatibility) ────────

async def init_redis() -> None:
    """Verify Redis is reachable at startup. No-op if REDIS_URL not set."""
    url = settings.redis_url
    if not url:
        logger.warning("[Redis] REDIS_URL not set — caching disabled, all reads hit Firestore.")
        return
    try:
        import redis.asyncio as aioredis
        async with aioredis.from_url(url, encoding="utf-8", decode_responses=True) as client:
            await client.ping()
        safe_url = url.split("@")[-1]
        logger.info(f"[Redis] Reachable — {safe_url}")
    except Exception as e:
        logger.warning(f"[Redis] Could not connect ({e}) — caching disabled.")


async def close_redis() -> None:
    """No persistent pool to close — nothing to do."""
    logger.info("[Redis] No persistent pool — nothing to close.")


# ── Internal: get a fresh client for the current event loop ──────────────────

def _client():
    """
    Return a new redis.asyncio.Redis instance bound to the current loop.
    Returns None if REDIS_URL is not configured.
    Use as:  async with _client() as r:  await r.get(...)
    """
    url = settings.redis_url
    if not url:
        return None
    try:
        import redis.asyncio as aioredis
        return aioredis.from_url(
            url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    except Exception as e:
        logger.warning(f"[Redis] Client creation failed: {e}")
        return None


# ── Health check ─────────────────────────────────────────────────────────────

async def redis_health() -> dict:
    """
    Ping Redis and return a health dict:
      { status, latency_ms, url, message }

    status values:
      "ok"             — reachable and PING returned PONG
      "error"          — configured but unreachable / timed out
      "not_configured" — REDIS_URL not set
    """
    url = settings.redis_url
    if not url:
        return {
            "status":     "not_configured",
            "latency_ms": None,
            "url":        None,
            "message":    "REDIS_URL is not set — caching disabled.",
        }

    safe_url = url.split("@")[-1]   # strip credentials if present
    client   = _client()
    if client is None:
        return {
            "status":     "error",
            "latency_ms": None,
            "url":        safe_url,
            "message":    "Redis client could not be created.",
        }

    try:
        t0 = time.perf_counter()
        async with client as r:
            await asyncio.wait_for(r.ping(), timeout=_REDIS_TIMEOUT)
        latency_ms = round((time.perf_counter() - t0) * 1000, 2)
        return {
            "status":     "ok",
            "latency_ms": latency_ms,
            "url":        safe_url,
            "message":    "PONG",
        }
    except asyncio.TimeoutError:
        return {
            "status":     "error",
            "latency_ms": None,
            "url":        safe_url,
            "message":    f"Ping timed out after {_REDIS_TIMEOUT}s.",
        }
    except Exception as exc:
        return {
            "status":     "error",
            "latency_ms": None,
            "url":        safe_url,
            "message":    str(exc),
        }


# ── Public helpers ────────────────────────────────────────────────────────────

async def redis_get(key: str) -> Optional[Any]:
    """
    GET a JSON-decoded value.
    Returns None on miss, Redis error, or if Redis times out (_REDIS_TIMEOUT).
    Caller should fall back to Firestore on None.
    """
    client = _client()
    if client is None:
        return None
    try:
        async with client as r:
            raw = await asyncio.wait_for(r.get(key), timeout=_REDIS_TIMEOUT)
        if raw is None:
            return None
        return json.loads(raw)
    except asyncio.TimeoutError:
        logger.warning(f"[Redis] GET timeout (>{_REDIS_TIMEOUT}s) key={key} — falling back to Firestore")
        return None
    except Exception as e:
        logger.warning(f"[Redis] GET failed key={key}: {e}")
        return None


async def redis_set(key: str, value: Any, ttl_seconds: int) -> bool:
    """SET a JSON-encoded value with TTL. Returns True on success. Non-fatal on timeout/error."""
    client = _client()
    if client is None:
        return False
    try:
        async with client as r:
            await asyncio.wait_for(
                r.setex(key, ttl_seconds, json.dumps(value, default=str)),
                timeout=_REDIS_TIMEOUT,
            )
        return True
    except asyncio.TimeoutError:
        logger.warning(f"[Redis] SET timeout (>{_REDIS_TIMEOUT}s) key={key} — skipping cache write")
        return False
    except Exception as e:
        logger.warning(f"[Redis] SET failed key={key}: {e}")
        return False


async def redis_delete(*keys: str) -> bool:
    """DELETE one or more exact keys. Non-fatal on timeout/error."""
    client = _client()
    if client is None or not keys:
        return False
    try:
        async with client as r:
            await asyncio.wait_for(r.delete(*keys), timeout=_REDIS_TIMEOUT)
        return True
    except asyncio.TimeoutError:
        logger.warning(f"[Redis] DELETE timeout keys={keys}")
        return False
    except Exception as e:
        logger.warning(f"[Redis] DELETE failed keys={keys}: {e}")
        return False


async def redis_delete_pattern(pattern: str) -> int:
    """DELETE all keys matching a glob pattern. Uses SCAN — production safe."""
    client = _client()
    if client is None:
        return 0
    try:
        deleted = 0
        async with client as r:
            async for key in r.scan_iter(match=pattern, count=100):
                await asyncio.wait_for(r.delete(key), timeout=_REDIS_TIMEOUT)
                deleted += 1
        return deleted
    except asyncio.TimeoutError:
        logger.warning(f"[Redis] DELETE pattern timeout pattern={pattern}")
        return 0
    except Exception as e:
        logger.warning(f"[Redis] DELETE pattern={pattern} failed: {e}")
        return 0