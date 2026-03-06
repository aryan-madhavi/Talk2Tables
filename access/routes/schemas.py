# access/routes/schemas.py
"""
Pydantic schemas for the user_db_access module.

CreateAccessGrantRequest — grant a user access to a DB
UpdateAccessGrantRequest — change permission read ↔ write
AccessGrantOut           — safe response shape
"""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field

# ── Permission type ───────────────────────────────────────────────────────────

PermissionType = Literal["read", "write"]

# ── Request schemas ───────────────────────────────────────────────────────────

class CreateAccessGrantRequest(BaseModel):
    """Body for POST /api/v1/access-grants"""

    firebase_uid: str = Field(
        ...,
        description="Firebase UID of the user being granted access.",
    )
    connection_id: str = Field(
        ...,
        description="UUID of the database_connection to grant access to.",
    )
    permission: PermissionType = Field(
        default="read",
        description=(
            "'read' = SELECT only. "
            "'write' = SELECT + INSERT/UPDATE/DELETE "
            "(power_user+ role still required at query time)."
        ),
    )
    expires_at: Optional[str] = Field(
        default=None,
        description="Optional ISO 8601 expiry. null = no expiry.",
        examples=["2026-12-31T23:59:59+00:00"],
    )
    note: Optional[str] = Field(
        default=None,
        max_length=500,
        description="Optional note e.g. 'Temp access for Q4 analysis'.",
    )


class UpdateAccessGrantRequest(BaseModel):
    """Body for PATCH /api/v1/access-grants/{id} — change permission or expiry."""

    permission: Optional[PermissionType] = None
    expires_at: Optional[str]            = None
    note:       Optional[str]            = Field(None, max_length=500)


# ── Response schemas ──────────────────────────────────────────────────────────

class AccessGrantOut(BaseModel):
    """Full access grant record returned to frontend."""

    access_id:      str
    firebase_uid:   str
    connection_id:  str
    granted_by_uid: str
    permission:     str
    is_active:      bool
    granted_at:     str
    revoked_at:     Optional[str] = None
    expires_at:     Optional[str] = None
    note:           Optional[str] = None


class AccessGrantListResponse(BaseModel):
    grants: list[AccessGrantOut]
    total:  int


class MessageResponse(BaseModel):
    message: str