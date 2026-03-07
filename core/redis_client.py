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

import json
import logging
from typing import Any, Optional

from auth.core.config import settings

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


# ── Public helpers ────────────────────────────────────────────────────────────

async def redis_get(key: str) -> Optional[Any]:
    """GET a JSON-decoded value. Returns None on miss or any error."""
    client = _client()
    if client is None:
        return None
    try:
        async with client as r:
            raw = await r.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as e:
        logger.warning(f"[Redis] GET failed key={key}: {e}")
        return None


async def redis_set(key: str, value: Any, ttl_seconds: int) -> bool:
    """SET a JSON-encoded value with TTL. Returns True on success."""
    client = _client()
    if client is None:
        return False
    try:
        async with client as r:
            await r.setex(key, ttl_seconds, json.dumps(value, default=str))
        return True
    except Exception as e:
        logger.warning(f"[Redis] SET failed key={key}: {e}")
        return False


async def redis_delete(*keys: str) -> bool:
    """DELETE one or more exact keys. Returns True on success."""
    client = _client()
    if client is None or not keys:
        return False
    try:
        async with client as r:
            await r.delete(*keys)
        return True
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
                await r.delete(key)
                deleted += 1
        return deleted
    except Exception as e:
        logger.warning(f"[Redis] DELETE pattern={pattern} failed: {e}")
        return 0