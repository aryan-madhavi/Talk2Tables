from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Load .env before any module that reads settings
load_dotenv()

from auth import auth_router
from auth.core.config import settings
# Updated Import: Firebase replaced by MongoDB
from auth.core.mongo import connect_to_mongo, close_mongo_connection
from connections import connections_router, docs_router
from users import users_router
from access import access_router
from query import query_router
from chat import chat_router
from core.redis_client import init_redis, close_redis, redis_health

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level   = settings.log_level.upper(),
    format  = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt = "%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("talk2tables")


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=" * 60)
    logger.info("  Talk2Tables — Starting up")
    logger.info("=" * 60)

    # 1. Initialize MongoDB connection (Replaces Firebase)
    try:
        await connect_to_mongo()
        logger.info("✅  MongoDB connection established")
    except Exception as exc:
        logger.error(f"❌  MongoDB connection failed: {exc}")
        raise   # Fatal — cannot run without database

    # 2. Redis cache (optional — non-fatal if unavailable)
    try:
        await init_redis()
        if settings.redis_url:
            logger.info("✅  Redis cache connected")
        else:
            logger.info("ℹ️   Redis not configured (REDIS_URL not set) — all reads hit MongoDB")
    except Exception as exc:
        logger.warning(f"⚠️   Redis init failed (non-fatal): {exc}")

    # 3. Optional: pre-compile the LangGraph agent
    try:
        from ai_agent import get_agent  # type: ignore
        get_agent()
        logger.info("✅  LangGraph SQL Agent compiled and ready")
    except ImportError:
        logger.info("ℹ️   ai_agent module not found — skipping")
    except Exception as exc:
        logger.warning(f"⚠️   LangGraph agent warmup failed (non-fatal): {exc}")

    logger.info(f"✅  Swagger UI: http://localhost:8000/docs")
    logger.info("=" * 60)

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────
    await close_mongo_connection()
    await close_redis()
    logger.info("Talk2Tables — Shutting down gracefully.")


# ── App ───────────────────────────────────────────────────────────────────────

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title       = "Talk2Tables API",
    description = (
        "AI-powered conversational SQL assistant for industrial databases. "
        "Built with FastAPI + LangGraph. UX4G compliant. "
        "Diploma Final Year Project — Mumbai, 2025-26."
    ),
    version   = "2.0.0",
    docs_url  = "/docs"  if settings.debug else None,
    redoc_url = "/redoc" if settings.debug else None,
    lifespan  = lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────

_cors_origins = [o.strip() for o in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins     = _cors_origins,
    allow_credentials = True,
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers     = ["Authorization", "Content-Type", "Accept", "X-Request-ID"],
)

# ── Body size limit ───────────────────────────────────────────────────────────

@app.middleware("http")
async def limit_request_body(request: Request, call_next):
    # Doc upload endpoint allows up to 100 MB; everything else is 1 MB
    path = request.url.path
    if "/docs" in path and request.method == "POST":
        max_bytes = 100 * 1024 * 1024  # 100 MB
    else:
        max_bytes = 1 * 1024 * 1024    # 1 MB
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > max_bytes:
        return JSONResponse(
            status_code = status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content     = {"error": f"Request body too large. Maximum size is {max_bytes // (1024*1024)} MB."},
        )
    return await call_next(request)


# ── Security headers ──────────────────────────────────────────────────────────

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"]        = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"]       = "1; mode=block"
    response.headers["Referrer-Policy"]        = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]     = "geolocation=(), microphone=(), camera=()"
    return response


# ── Timing middleware ─────────────────────────────────────────────────────────

@app.middleware("http")
async def add_response_time(request: Request, call_next):
    t0       = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Response-Time"] = f"{(time.perf_counter()-t0)*1000:.0f}ms"
    return response

# ── Global error handler ──────────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error":   "Internal Server Error",
            "message": "An unexpected error occurred.",
            "path":    str(request.url),
        },
    )

# ── Routes ────────────────────────────────────────────────────────────────────

app.include_router(auth_router)         
app.include_router(connections_router)  
app.include_router(users_router)        
app.include_router(access_router)       
app.include_router(query_router)        
app.include_router(chat_router)
app.include_router(docs_router)         

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "service": "talk2tables-backend", "version": "2.0.0"}


@app.get("/health/redis", tags=["system"])
async def health_redis():
    return await redis_health()

@app.get("/", tags=["system"])
async def root():
    return {"message": "Talk2Tables API running. See /docs", "docs": "/docs"}