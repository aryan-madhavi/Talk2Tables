# auth/routes/auth_routes.py
"""
Auth endpoints — Firebase Service Account + Firestore, no PostgreSQL.

  POST /api/v1/auth/login          verify Firebase ID token → return custom token
  POST /api/v1/auth/register       same flow as login (Firebase handles signup client-side)
  POST /api/v1/auth/logout         revoke session + Firebase refresh tokens
  POST /api/v1/auth/logout-all     revoke ALL sessions for this user
  POST /api/v1/auth/token-active   check if token + Firestore session are valid
  GET  /api/v1/auth/me             current user profile from Firestore
  GET  /api/v1/auth/sessions       list active Firestore sessions

──────────────────────────────────────────────────────────────────────
Frontend flow:

  import { getAuth, signInWithEmailAndPassword, signInWithCustomToken } from "firebase/auth"
  const auth = getAuth()

  // 1. Sign in with Firebase SDK (client-side — no server involved yet)
  const { user: fbUser } = await signInWithEmailAndPassword(auth, email, password)
  const idToken = await fbUser.getIdToken()

  // 2. Send Firebase ID token to our backend
  const res = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firebase_id_token: idToken })
  })
  const { custom_token, user, session_id } = await res.json()

  // 3. Exchange custom token for fresh Firebase ID token
  //    (new token contains our role claim embedded by Service Account)
  const { user: refreshedUser } = await signInWithCustomToken(auth, custom_token)
  const freshIdToken = await refreshedUser.getIdToken()

  // 4. Use freshIdToken for all API calls:
  //    Authorization: Bearer <freshIdToken>

  // 5. Auto-refresh before expiry (Firebase SDK handles this):
  //    const freshIdToken = await auth.currentUser.getIdToken(true)
──────────────────────────────────────────────────────────────────────
"""
from __future__ import annotations

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status

from auth.services.auth_service import (
    login,
    check_token_active,
    logout,
    logout_all,
    get_all_sessions,
)
from auth.routes.dependencies import get_current_user
from auth.routes.schemas import (
    FirebaseTokenRequest,
    LoginResponse,
    LogoutRequest,
    MeResponse,
    MessageResponse,
    SessionOut,
    TokenActiveRequest,
    TokenActiveResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])


# ── POST /api/v1/auth/login ───────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Login — verify Firebase ID token, return Service Account custom token",
)
async def login_route(body: FirebaseTokenRequest, request: Request):
    try:
        result = await login(
            id_token    = body.firebase_id_token,
            device_info = request.headers.get("User-Agent", "")[:512],
            ip_address  = request.client.host if request.client else "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    logger.info(f"[POST /auth/login] email={result['user']['email']}")
    return result


# ── POST /api/v1/auth/register ────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=LoginResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register — client creates Firebase account, server upserts Firestore doc",
    description=(
        "Client calls createUserWithEmailAndPassword() in Firebase SDK, "
        "then sends the ID token here. Server upserts the Firestore user doc "
        "and returns a custom token. Functionally identical to /login."
    ),
)
async def register_route(body: FirebaseTokenRequest, request: Request):
    try:
        result = await login(
            id_token    = body.firebase_id_token,
            device_info = request.headers.get("User-Agent", "")[:512],
            ip_address  = request.client.host if request.client else "",
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    logger.info(f"[POST /auth/register] email={result['user']['email']}")
    return result


# ── POST /api/v1/auth/token-active ───────────────────────────────────────────

@router.post(
    "/token-active",
    response_model=TokenActiveResponse,
    status_code=status.HTTP_200_OK,
    summary="Check token + Firestore session validity (never raises 401)",
)
async def token_active_route(body: TokenActiveRequest):
    result = await check_token_active(body.firebase_id_token)
    logger.info(f"[POST /auth/token-active] active={result.get('active')} uid={result.get('uid')}")
    return result


# ── POST /api/v1/auth/logout ──────────────────────────────────────────────────

@router.post(
    "/logout",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Logout — revoke Firestore session + Firebase refresh tokens",
)
async def logout_route(
    body: LogoutRequest,
    current_user: dict = Depends(get_current_user),
):
    await logout(
        firebase_uid = current_user["firebase_uid"],
        session_id   = body.session_id,
    )
    scope = f"session {body.session_id}" if body.session_id else "all sessions"
    logger.info(f"[POST /auth/logout] uid={current_user['firebase_uid']} scope={scope}")
    return {"message": f"Logged out ({scope})."}


# ── POST /api/v1/auth/logout-all ─────────────────────────────────────────────

@router.post(
    "/logout-all",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Logout from all devices — revoke all Firestore sessions",
)
async def logout_all_route(current_user: dict = Depends(get_current_user)):
    count = await logout_all(current_user["firebase_uid"])
    logger.info(f"[POST /auth/logout-all] uid={current_user['firebase_uid']} revoked={count}")
    return {"message": f"Logged out from all {count} active session(s)."}


# ── GET /api/v1/auth/me ───────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=MeResponse,
    status_code=status.HTTP_200_OK,
    summary="Current user profile from Firestore",
)
async def me_route(current_user: dict = Depends(get_current_user)):
    return {
        "firebase_uid": current_user["firebase_uid"],
        "email":        current_user["email"],
        "display_name": current_user.get("display_name"),
        "photo_url":    current_user.get("photo_url"),
        "role":         current_user["role"],
        "email_verified": True,
        "is_active":    current_user["is_active"],
    }


# ── GET /api/v1/auth/sessions ─────────────────────────────────────────────────

@router.get(
    "/sessions",
    response_model=List[SessionOut],
    status_code=status.HTTP_200_OK,
    summary="List active Firestore sessions for current user",
)
async def sessions_route(current_user: dict = Depends(get_current_user)):
    sessions = await get_all_sessions(current_user["firebase_uid"])
    return sessions