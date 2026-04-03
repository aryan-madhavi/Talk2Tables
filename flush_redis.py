import asyncio
import sys
import os

# Add the current directory to sys.path so we can import modules
sys.path.append(os.getcwd())

from core.redis_client import redis_delete_pattern, init_redis
from auth.core.config import settings

async def main():
    print(f"Connecting to Redis at: {settings.redis_url}")
    await init_redis()
    print("Flushing all database keys (FLUSHALL)...")
    import redis.asyncio as aioredis
    async with aioredis.from_url(settings.redis_url) as r:
        await r.flushall()
    print("Successfully flushed all Redis databases.")

if __name__ == "__main__":
    asyncio.run(main())
