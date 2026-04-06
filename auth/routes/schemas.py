# auth/routes/schemas.py
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ── Role type ─────────────────────────────────────────────────────────────────
# Single source of truth — update here when roles change.
RoleType = Literal["analyst", "power_user", "db_manager", "admin"]

# ── Requests ──────────────────────────────────────────────────────────────────

class FirebaseTokenRequest(BaseModel):
    firebase_id_token: str = Field(
        ...,
        description="Firebase ID token from client-side Firebase SDK after sign-in.",
    )


class TokenActiveRequest(BaseModel):
    firebase_id_token: str = Field(..., description="Firebase ID token to check.")


class LogoutRequest(BaseModel):
    session_id: Optional[str] = Field(
        default=None,
        description="Session ID to revoke. Omit or null to revoke all sessions.",
    )


# ── Responses ─────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    firebase_uid:   str
    email:          str
    display_name:   Optional[str] = None
    photo_url:      Optional[str] = None
    role:           RoleType
    is_active:      bool
    created_at:     Optional[str] = None
    last_login_at:  Optional[str] = None


class LoginResponse(BaseModel):
    """
    custom_token — Firebase custom token signed by our Service Account.
    Client MUST exchange it:
        await signInWithCustomToken(auth, custom_token)
    The returned Firebase ID token will carry our role claim.
    """
    custom_token: str = Field(
        ...,
        description=(
            "Firebase custom token signed by Service Account. "
            "Exchange via signInWithCustomToken() to get a fresh Firebase ID token."
        ),
    )
    session_id: str   = Field(..., description="Firestore session document ID.")
    user: UserOut


class TokenActiveResponse(BaseModel):
    active:      bool
    uid:         Optional[str] = None
    email:       Optional[str] = None
    role:        Optional[str] = None
    db_user_id:  Optional[str] = None
    expires_at:  Optional[str] = None
    session_id:  Optional[str] = None
    reason:      Optional[str] = None   # only when active=False


class MeResponse(BaseModel):
    firebase_uid:   str
    email:          str
    display_name:   Optional[str] = None
    photo_url:      Optional[str] = None
    role:           RoleType
    email_verified: bool
    is_active:      bool


class SessionOut(BaseModel):
    session_id:   str
    device_info:  Optional[str] = None
    ip_address:   Optional[str] = None
    is_revoked:   bool
    created_at:   Optional[str] = None
    last_seen_at: Optional[str] = None
    expires_at:   Optional[str] = None


class MessageResponse(BaseModel):
    message: str


class SetRoleRequest(BaseModel):
    """Body for PATCH /users/{uid}/role — admin only."""
    role: RoleType = Field(..., description="New role to assign: analyst | power_user | db_manager | admin")


class UpdateProfileRequest(BaseModel):
    """Body for PATCH /auth/me — update own display name."""
    display_name: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="New display name for the current user.",
    )

class SignupRequest(BaseModel):
    firebase_id_token: str
    display_name:      str
    organization_name: str
 
