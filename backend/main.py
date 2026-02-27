"""
Talk2Tables — FastAPI Application Entry Point
==============================================
Bootstraps the FastAPI app with:
  - CORS middleware         (React frontend on port 3000/5173)
  - JWT Auth middleware
  - Route registration      (query, auth, admin, schema_docs)
  - Database startup checks
  - LangGraph agent warmup
  - UX4G-compliant error responses

Run (development):
    uvicorn main:app --reload --port 8000

Run (production via Docker):
    uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

Author  : Member 1 (Backend Lead)
Project : Talk2Tables — Diploma Final Year Project
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

# ── Load .env before anything else ───────────────────────────────────────────
load_dotenv()

# ── Internal imports ──────────────────────────────────────────────────────────
from ai_agent import get_agent               # Pre-warms the LangGraph agent
from ai_agent.routes_query import router as query_router

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level   = os.getenv("LOG_LEVEL", "INFO").upper(),
    format  = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt = "%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("talk2tables")

# ---------------------------------------------------------------------------
# Lifespan — startup & shutdown events
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs startup tasks before the server accepts requests,
    and cleanup tasks on shutdown.
    """
    # ── STARTUP ───────────────────────────────────────────────────────────
    logger.info("=" * 60)
    logger.info("  Talk2Tables Backend — Starting up")
    logger.info("=" * 60)

    # 1. Pre-compile the LangGraph agent (avoids cold-start on first request)
    try:
        agent = get_agent()
        logger.info("✅  LangGraph SQL Agent compiled and ready.")
    except Exception as exc:
        logger.error(f"❌  LangGraph agent failed to compile: {exc}")
        # Don't crash on startup — agent errors surface per-request

    # 2. Log active LLM provider priority
    llm_provider = os.getenv("LLM_PROVIDER", "auto (openrouter → groq → gemini → ollama)")
    logger.info(f"✅  LLM Provider preference: {llm_provider}")

    # 3. Log environment
    debug_mode = os.getenv("DEBUG", "false").lower() == "true"
    logger.info(f"✅  Debug mode: {debug_mode}")
    logger.info(f"✅  Docs available at: http://localhost:8000/docs")
    logger.info("=" * 60)

    yield  # Server is now running and accepting requests

    # ── SHUTDOWN ──────────────────────────────────────────────────────────
    logger.info("Talk2Tables Backend — Shutting down gracefully.")


# ---------------------------------------------------------------------------
# FastAPI App Instance
# ---------------------------------------------------------------------------

app = FastAPI(
    title       = "Talk2Tables API",
    description = (
        "AI-powered conversational SQL assistant for industrial databases. "
        "Built with FastAPI + LangGraph. UX4G compliant. "
        "Diploma Final Year Project — Mumbai, 2025-26."
    ),
    version     = "2.0.0",
    docs_url    = "/docs",          # Swagger UI
    redoc_url   = "/redoc",         # ReDoc UI
    lifespan    = lifespan,
)

# ---------------------------------------------------------------------------
# CORS Middleware — Allow React dev server and production frontend
# ---------------------------------------------------------------------------

_cors_origins_raw = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173"  # Vite + CRA defaults
)
_cors_origins = [origin.strip() for origin in _cors_origins_raw.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins     = _cors_origins,
    allow_credentials = True,
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers     = ["Authorization", "Content-Type", "X-Request-ID"],
)

logger.info(f"CORS enabled for: {_cors_origins}")

# ---------------------------------------------------------------------------
# Request Timing Middleware — adds X-Response-Time header (useful for perf)
# ---------------------------------------------------------------------------

@app.middleware("http")
async def add_response_time_header(request: Request, call_next):
    t_start  = time.perf_counter()
    response = await call_next(request)
    elapsed  = (time.perf_counter() - t_start) * 1000
    response.headers["X-Response-Time"] = f"{elapsed:.0f}ms"
    return response

# ---------------------------------------------------------------------------
# Global Exception Handler — UX4G-aligned error format
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all handler. Returns a consistent JSON error shape so the
    React frontend can display a UX4G-compliant error alert.
    """
    logger.error(f"Unhandled exception on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
        content     = {
            "error":   "Internal Server Error",
            "message": "An unexpected error occurred. Please try again or contact support.",
            "path":    str(request.url),
        },
    )

# ---------------------------------------------------------------------------
# Route Registration
# ---------------------------------------------------------------------------

# Core NL2SQL query endpoints (the AI agent)
app.include_router(query_router)

# TODO (Member 1 + Member 3): Add these routers as you build them:
# from api.routes.auth        import router as auth_router
# from api.routes.admin       import router as admin_router
# from api.routes.schema_docs import router as schema_docs_router
# from api.routes.connections import router as connections_router
#
# app.include_router(auth_router)         # /api/auth/login, /register, /refresh
# app.include_router(admin_router)        # /api/admin/users
# app.include_router(schema_docs_router)  # /api/schema-docs/upload
# app.include_router(connections_router)  # /api/connections CRUD

# ---------------------------------------------------------------------------
# Health Check — used by Docker Compose and load balancers
# ---------------------------------------------------------------------------

@app.get("/health", tags=["system"])
async def health_check():
    """
    Lightweight liveness probe.
    Docker Compose healthcheck and Kubernetes readiness probe call this.
    """
    return {
        "status":  "ok",
        "service": "talk2tables-backend",
        "version": "2.0.0",
    }


@app.get("/", tags=["system"])
async def root():
    """API root — confirms the server is running."""
    return {
        "message": "Talk2Tables API is running. Visit /docs for the Swagger UI.",
        "docs":    "/docs",
        "health":  "/health",
    }