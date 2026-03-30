# users/routes/user_routes.py
"""
User management endpoints (On-Premise).

Role requirements per endpoint:
  GET  /users              — db_manager+ (view users)
  GET  /users/{uid}        — db_manager+
  POST /users              — admin only  (create user)
  PATCH /users/{uid}       — admin only  (update display_name / is_active)
  PATCH /users/{uid}/role  — admin only  (change role)
  PATCH /users/{uid}/activate   — admin only
  PATCH /users/{uid}/deactivate — admin only
  DELETE /users/{uid}      — admin only  (hard delete)
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from auth.routes.dependencies import require_admin, require_db_manager
from users.routes.schemas import (
    CreateUserRequest,
    UpdateRoleRequest,
    UpdateUserRequest,
    UserOut,
    UserListResponse,
)
from users.services.user_service import (
    create_user,
    get_user_by_uid,
    list_users,
    update_user,
    update_user_role,
    set_user_active,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/users",
    tags=["User Management"],
)


# ── POST /api/v1/users ────────────────────────────────────────────────────────

@router.post(
    "",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new user",
    description=(
        "Admin creates a user in the local database. "
        "Role defaults to 'analyst'. "
    ),
)
async def create_user_route(
    body: CreateUserRequest,
    current_user: dict = Depends(require_admin),
):
    logger.info(
        f"[POST /users] email={body.email} role={body.role} "
        f"by={current_user['uid']}"
    )
    try:
        user = await create_user(body, created_by_uid=current_user["uid"])
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    return user


# ── GET /api/v1/users ─────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=UserListResponse,
    summary="List all users",
    description="Returns all users. db_manager and admin can view.",
)
async def list_users_route(
    active_only: bool = False,
    current_user: dict = Depends(require_db_manager),
):
    users = await list_users(active_only=active_only)
    return UserListResponse(users=users, total=len(users))


# ── GET /api/v1/users/{uid} ───────────────────────────────────────────────────

@router.get(
    "/{uid}",
    response_model=UserOut,
    summary="Get a single user",
)
async def get_user_route(
    uid: str,
    current_user: dict = Depends(require_db_manager),
):
    user = await get_user_by_uid(uid)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{uid}' not found.",
        )
    return user


# ── PATCH /api/v1/users/{uid} ─────────────────────────────────────────────────

@router.patch(
    "/{uid}",
    response_model=UserOut,
    summary="Update user profile",
    description="Admin can update display_name and is_active.",
)
async def update_user_route(
    uid: str,
    body: UpdateUserRequest,
    current_user: dict = Depends(require_admin),
):
    user = await update_user(uid, body)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{uid}' not found.",
        )
    return user


# ── PATCH /api/v1/users/{uid}/role ────────────────────────────────────────────

@router.patch(
    "/{uid}/role",
    response_model=UserOut,
    summary="Change a user's role",
    description=(
        "Admin only. Updates role in the local database. "
        "Role change is reflected in the next access token issuance."
    ),
)
async def update_role_route(
    uid: str,
    body: UpdateRoleRequest,
    current_user: dict = Depends(require_admin),
):
    # Prevent admin from demoting themselves
    if uid == current_user["uid"] and body.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot change your own role.",
        )

    logger.info(
        f"[PATCH /users/{uid}/role] new_role={body.role} "
        f"by={current_user['uid']}"
    )
    user = await update_user_role(
        uid,
        new_role=body.role,
        changed_by_uid=current_user["uid"],
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{uid}' not found.",
        )
    return user


# ── PATCH /api/v1/users/{uid}/activate ───────────────────────────────────────

@router.patch(
    "/{uid}/activate",
    response_model=UserOut,
    summary="Activate a deactivated user",
)
async def activate_user_route(
    uid: str,
    current_user: dict = Depends(require_admin),
):
    user = await set_user_active(
        uid, is_active=True, changed_by_uid=current_user["uid"]
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{uid}' not found.",
        )
    return user


# ── PATCH /api/v1/users/{uid}/deactivate ─────────────────────────────────────

@router.patch(
    "/{uid}/deactivate",
    response_model=UserOut,
    summary="Deactivate a user",
    description=(
        "Deactivates the user in the local database. "
        "User immediately loses access."
    ),
)
async def deactivate_user_route(
    uid: str,
    current_user: dict = Depends(require_admin),
):
    # Prevent self-deactivation
    if uid == current_user["uid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot deactivate your own account.",
        )

    user = await set_user_active(
        uid, is_active=False, changed_by_uid=current_user["uid"]
    )
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{uid}' not found.",
        )
    return user


# ── DELETE /api/v1/users/{uid} ────────────────────────────────────────────────

@router.delete(
    "/{uid}",
    response_model=UserOut,
    summary="Delete a user (admin only)",
    description=(
        "Soft-deletes the user by setting is_active=False. "
        "All audit history and data are preserved. "
    ),
)
async def delete_user_route(
    uid: str,
    current_user: dict = Depends(require_admin),
):
    if uid == current_user["uid"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account.",
        )

    logger.info(f"[DELETE /users/{uid}] soft-delete by={current_user['uid']}")
    user = await set_user_active(uid, is_active=False, changed_by_uid=current_user["uid"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{uid}' not found.",
        )
    return user
