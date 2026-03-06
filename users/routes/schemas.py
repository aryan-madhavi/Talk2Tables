# users/routes/schemas.py
"""
Pydantic schemas for the users module.

CreateUserRequest  — admin creates a user (email + password + role)
UpdateRoleRequest  — admin changes a user's role
UserOut            — safe response shape (no password, no internal fields)
"""
from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator

# ── Role type ─────────────────────────────────────────────────────────────────

RoleType = Literal["analyst", "power_user", "db_manager", "admin"]

# ── Request schemas ───────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    """Body for POST /api/v1/users — admin creates a new user."""

    email: str = Field(
        ...,
        description="Email address. Used as Firebase Auth login.",
        examples=["analyst@company.com"],
    )
    password: str = Field(
        ...,
        min_length=8,
        description="Initial password. User should change after first login.",
    )
    display_name: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Full name shown in the UI.",
        examples=["Aryan Madhavi"],
    )
    role: RoleType = Field(
        default="analyst",
        description="RBAC role. Defaults to analyst (least privilege).",
    )

    @field_validator("email")
    @classmethod
    def normalise_email(cls, v: str) -> str:
        return v.strip().lower()


class UpdateRoleRequest(BaseModel):
    """Body for PATCH /api/v1/users/{uid}/role — admin only."""

    role: RoleType = Field(
        ...,
        description="New role to assign to the user.",
    )


class UpdateUserRequest(BaseModel):
    """Body for PATCH /api/v1/users/{uid} — admin updates profile fields."""

    display_name: Optional[str] = Field(None, max_length=100)
    is_active:    Optional[bool] = None


# ── Response schemas ──────────────────────────────────────────────────────────

class UserOut(BaseModel):
    """Safe user info returned to frontend. No password fields ever."""

    firebase_uid:   str
    email:          str
    display_name:   Optional[str]  = None
    photo_url:      Optional[str]  = None
    role:           str
    is_active:      bool
    email_verified: bool
    sign_in_provider: str
    created_at:     Optional[str]  = None
    last_login_at:  Optional[str]  = None


class UserListResponse(BaseModel):
    users: list[UserOut]
    total: int


class MessageResponse(BaseModel):
    message: str