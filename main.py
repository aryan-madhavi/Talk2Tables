"""
Talk2Tables — FastAPI Application Entry Point
=============================================
Storage: Firebase Auth + Firestore (NO PostgreSQL, no SQLAlchemy)
Auth:    Firebase Service Account (verify_id_token + create_custom_token)
Cache:   Redis (optional — set REDIS_URL in .env to enable)

Run (dev):        uvicorn main:app --reload --port 8000
Run (production): uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
"""
from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Load .env before any module that reads settings
load_dotenv()

from auth import auth_router
from auth.core.config import settings
from auth.core.firebase import get_firebase_app, get_firestore_client
from connections import connections_router
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

    # 1. Initialise Firebase Admin SDK (validates Service Account credentials)
    try:
        get_firebase_app()
        logger.info("✅  Firebase Admin SDK ready (Service Account loaded)")
    except Exception as exc:
        logger.error(f"❌  Firebase Admin SDK failed: {exc}")
        raise   # Fatal — cannot run without Service Account

    # 2. Ping Firestore to confirm connectivity
    try:
        get_firestore_client()
        logger.info("✅  Firestore client ready")
    except Exception as exc:
        logger.error(f"❌  Firestore client failed: {exc}")
        raise   # Fatal — all user/session data is in Firestore

    # 3. Redis cache (optional — non-fatal if unavailable)
    try:
        await init_redis()
        if settings.redis_url:
            logger.info("✅  Redis cache connected")
        else:
            logger.info("ℹ️   Redis not configured (REDIS_URL not set) — all reads hit Firestore")
    except Exception as exc:
        logger.warning(f"⚠️   Redis init failed (non-fatal): {exc}")

    # 4. Optional: pre-compile the LangGraph agent
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
    await close_redis()
    logger.info("Talk2Tables — Shutting down gracefully.")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title       = "Talk2Tables API",
    description = (
        "AI-powered conversational SQL assistant for industrial databases. "
        "Built with FastAPI + LangGraph. UX4G compliant. "
        "Diploma Final Year Project — Mumbai, 2025-26."
    ),
    version  = "2.0.0",
    docs_url = "/docs",
    redoc_url= "/redoc",
    lifespan = lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────

_cors_origins = [o.strip() for o in settings.cors_origins.split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins     = _cors_origins,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

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

app.include_router(auth_router)         # /api/v1/auth/*
app.include_router(connections_router)  # /api/v1/connections/*
app.include_router(users_router)        # /api/v1/users/*
app.include_router(access_router)       # /api/v1/access-grants/*
app.include_router(query_router)        # /api/v1/query, /api/v1/schema/*
app.include_router(chat_router)         # /api/v1/chat/*

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "service": "talk2tables-backend", "version": "2.0.0"}


@app.get("/health/redis", tags=["system"])
async def health_redis():
    """
    Ping Redis and return its health status.

    Response shape:
      { status, latency_ms, url, message }

    - status "ok"             — Redis reachable, PING returned PONG
    - status "error"          — configured but unreachable or timed out
    - status "not_configured" — REDIS_URL env var not set
    """
    return await redis_health()

@app.get("/", tags=["system"])
async def root():
    return {"message": "Talk2Tables API running. See /docs", "docs": "/docs"}

