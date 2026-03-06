# auth/routes/schemas.py
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


# ── Requests ──────────────────────────────────────────────────────────────────

class FirebaseTokenRequest(BaseModel):
    """
    Sent by client after signing in via Firebase SDK.

    Client-side (email/password):
        const { user } = await signInWithEmailAndPassword(auth, email, password)
        const idToken  = await user.getIdToken()
        POST /api/v1/auth/login  { firebase_id_token: idToken }
    """
    firebase_id_token: str = Field(
        ...,
        description="Firebase ID token from client-side Firebase SDK after sign-in.",
    )
    session_id: Optional[str] = Field(
        default=None,
        description="Existing session ID to update instead of creating a new one.",
    )


class TokenActiveRequest(BaseModel):
    """
    POST /api/v1/auth/token-active
    Check whether a Firebase ID token + our session are both still valid.
    """
    firebase_id_token: str = Field(..., description="Firebase ID token to check.")


class LogoutRequest(BaseModel):
    session_id: Optional[str] = Field(
        default=None,
        description="Session ID to revoke. Omit or null to revoke all sessions.",
    )


# ── Responses ─────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: str
    email: str
    display_name: Optional[str]
    photo_url: Optional[str]
    role: str
    email_verified: bool
    is_active: bool
    created_at: Optional[str]
    last_login_at: Optional[str]


class LoginResponse(BaseModel):
    """
    custom_token — Firebase custom token signed by our Service Account.
    Client MUST exchange it:
        await firebase.auth().signInWithCustomToken(custom_token)
    That returns a fresh Firebase ID token carrying our role claim.
    """
    custom_token: str = Field(
        ...,
        description=(
            "Firebase custom token signed by Service Account. "
            "Exchange via firebase.auth().signInWithCustomToken(custom_token) "
            "to get a fresh Firebase ID token."
        ),
    )
    session_id: str    = Field(..., description="Our session record ID for this login.")
    user: UserOut


class TokenActiveResponse(BaseModel):
    active: bool
    uid: Optional[str]     = None
    email: Optional[str]   = None
    role: Optional[str]    = None
    db_user_id: Optional[str] = None
    expires_at: Optional[str] = None
    session_id: Optional[str] = None
    reason: Optional[str]  = None   # present only when active=False


class MeResponse(BaseModel):
    firebase_uid:   str
    email:          str
    display_name:   Optional[str] = None
    photo_url:      Optional[str] = None
    role:           str
    email_verified: bool
    is_active:      bool


class SessionOut(BaseModel):
    id: str
    device_info: Optional[str]
    ip_address: Optional[str]
    is_revoked: bool
    created_at: Optional[str]
    last_seen_at: Optional[str]
    expires_at: Optional[str]


class MessageResponse(BaseModel):
    message: str