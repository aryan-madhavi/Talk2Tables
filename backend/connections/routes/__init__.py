# connections/routes/__init__.py
"""
Routes package for the connections module.

Exposes:
    router                  — FastAPI APIRouter with all /api/v1/connections endpoints
    CreateConnectionRequest — Pydantic schema for POST body
    UpdateConnectionRequest — Pydantic schema for PATCH body
    ConnectionOut           — Safe response schema (no password_enc)
    ConnectionListResponse  — Paginated list response schema
    MessageResponse         — Generic message response schema
"""
from .connection_routes import router
from .schemas import (
    CreateConnectionRequest,
    UpdateConnectionRequest,
    ConnectionOut,
    ConnectionListResponse,
    MessageResponse,
)

__all__ = [
    "router",
    "CreateConnectionRequest",
    "UpdateConnectionRequest",
    "ConnectionOut",
    "ConnectionListResponse",
    "MessageResponse",
]