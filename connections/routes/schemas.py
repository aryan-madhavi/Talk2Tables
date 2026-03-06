# connections/routes/schemas.py
"""
Pydantic schemas for the database connections module.

IMPORTANT:
  - CreateConnectionRequest  contains the raw plaintext password (never stored)
  - ConnectionOut            is the SAFE response shape — no password field at all
  - password_enc is encrypted by the service layer before writing to Firestore
"""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


# ── Enum types ────────────────────────────────────────────────────────────────

DbType = Literal["postgresql", "mysql", "oracle", "mssql", "sqlite"]


# ── Request schemas ───────────────────────────────────────────────────────────

class CreateConnectionRequest(BaseModel):
    """Body for POST /api/v1/connections"""

    name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Human-readable label. E.g. 'Production PostgreSQL'.",
        examples=["Production PostgreSQL"],
    )
    db_type: DbType = Field(
        ...,
        description="Database engine type.",
        examples=["postgresql"],
    )
    host: str = Field(
        ...,
        min_length=1,
        max_length=253,
        description="Hostname or IP of the database server.",
        examples=["db.example.com"],
    )
    port: int = Field(
        ...,
        ge=1,
        le=65535,
        description="Port number.",
        examples=[5432],
    )
    database_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="The specific database/schema to connect to.",
        examples=["analytics"],
    )
    username: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Database username.",
        examples=["readonly_user"],
    )
    password: str = Field(
        ...,
        min_length=1,
        description="Plaintext password — encrypted by backend before storage. Never logged.",
    )
    ssl_enabled: bool = Field(
        default=False,
        description="Whether to use SSL/TLS for the connection.",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Optional notes for admins.",
        examples=["Read-only replica for analysts"],
    )

    @field_validator("host")
    @classmethod
    def strip_host(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("name", "database_name", "username")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return v.strip()


class UpdateConnectionRequest(BaseModel):
    """Body for PATCH /api/v1/connections/{id} — all fields optional."""

    name:          Optional[str]  = Field(None, min_length=1, max_length=100)
    host:          Optional[str]  = Field(None, min_length=1, max_length=253)
    port:          Optional[int]  = Field(None, ge=1, le=65535)
    database_name: Optional[str]  = Field(None, min_length=1, max_length=100)
    username:      Optional[str]  = Field(None, min_length=1, max_length=100)
    password:      Optional[str]  = Field(None, min_length=1, description="Re-encrypt if provided.")
    ssl_enabled:   Optional[bool] = None
    description:   Optional[str]  = Field(None, max_length=500)
    is_active:     Optional[bool] = None


# ── Response schemas ──────────────────────────────────────────────────────────

class ConnectionOut(BaseModel):
    """
    Safe connection info returned to frontend.
    password_enc is NEVER included — not even in admin responses.
    """
    connection_id:  str
    name:           str
    db_type:        str
    host:           str
    port:           int
    database_name:  str
    username:       str
    ssl_enabled:    bool
    is_active:      bool
    description:    Optional[str]   = None
    created_by_uid: str
    created_at:     str
    updated_at:     str
    last_tested_at: Optional[str]   = None
    last_tested_ok: Optional[bool]  = None


class ConnectionListResponse(BaseModel):
    connections: list[ConnectionOut]
    total:       int


class MessageResponse(BaseModel):
    message: str