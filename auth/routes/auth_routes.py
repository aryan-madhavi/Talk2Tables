# auth/routes/auth_routes.py
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, List
from auth.core.security import verify_password, create_access_token, create_refresh_token
from auth.core.mongo import get_database
from core.redis_client import redis_set, redis_delete, redis_get
import uuid
import logging

from .dependencies import get_current_user
from .schemas import (
    LoginResponse, 
    UserOut, 
    SessionOut, 
    MessageResponse, 
    UpdateProfileRequest,
    MeResponse
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

class LoginRequest(BaseModel):
    email: str
    password: str

class SignupRequest(BaseModel):
    email: str
    password: str
    display_name: str

@router.post("/signup")
async def signup(request: SignupRequest):
    db = get_database()
    
    # Check if user exists
    existing = await db["users"].find_one({"email": request.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    user_id = str(uuid.uuid4())
    from auth.core.security import get_password_hash
    
    user_doc = {
        "_id": user_id,
        "firebase_uid": user_id, # Compatibility
        "email": request.email,
        "password_hash": get_password_hash(request.password),
        "display_name": request.display_name,
        "role": "admin", # Default role changed to admin
        "is_active": True,
        "email_verified": False,
        "sign_in_provider": "password",
        "created_at": uuid.uuid4().hex # Simple timestamp or just leave it
    }
    
    await db["users"].insert_one(user_doc)
    
    # After signup, we can automatically log them in or just return success
    return {"message": "User created successfully", "uid": user_id}

@router.post("/login")
async def login(request: LoginRequest):
    db = get_database()
    user = await db["users"].find_one({"email": request.email})
    
    if not user or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")
        
    user_id = str(user["_id"])
    user_role = user.get("role", "analyst")
    access_token = create_access_token(subject=user_id, role=user_role)
    refresh_token = create_refresh_token(subject=user_id)
    
    # Store refresh token in Redis for session tracking/revocation
    session_id = str(uuid.uuid4())
    await redis_set(f"session:{user_id}:{session_id}", refresh_token, ttl_seconds=604800) # 7 days
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "uid": user_id,
            "firebase_uid": user_id,
            "email": user["email"],
            "role": user_role,
            "display_name": user.get("display_name"),
            "photo_url": user.get("photo_url"),
            "is_active": user.get("is_active", True),
            "email_verified": user.get("email_verified", False)
        }
    }

@router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    await redis_delete(f"session:{user['uid']}:*")
    return {"message": "Logged out successfully"}

@router.get("/me", response_model=MeResponse)
async def get_me(user: dict = Depends(get_current_user)):
    db = get_database()
    # User in dependencies is already checked, but let's get full profile
    user_doc = await db["users"].find_one({"_id": user["uid"]})
    if not user_doc:
         raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "uid": str(user_doc["_id"]),
        "firebase_uid": str(user_doc["_id"]),
        "email": user_doc["email"],
        "display_name": user_doc.get("display_name"),
        "photo_url": user_doc.get("photo_url"),
        "role": user_doc.get("role", "analyst"),
        "is_active": user_doc.get("is_active", True),
        "email_verified": user_doc.get("email_verified", False)
    }

@router.patch("/me", response_model=MeResponse)
async def update_profile(body: UpdateProfileRequest, user: dict = Depends(get_current_user)):
    db = get_database()
    await db["users"].update_one(
        {"_id": user["uid"]},
        {"$set": {"display_name": body.display_name}}
    )
    return await get_me(user)

@router.get("/sessions", response_model=List[SessionOut])
async def get_sessions(user: dict = Depends(get_current_user)):
    # In this simplified MongoDB + Redis version, we'll return a placeholder
    # as we don't store detailed session metadata in Redis besides the token.
    return [
        {
            "session_id": "current",
            "device_info": "Web Browser",
            "ip_address": "Internal",
            "is_revoked": False,
            "created_at": None,
            "last_seen_at": None,
            "expires_at": None
        }
    ]

@router.delete("/sessions/{session_id}", response_model=MessageResponse)
async def revoke_session(session_id: str, user: dict = Depends(get_current_user)):
    if session_id == "current":
        await redis_delete(f"session:{user['uid']}:*")
    return {"message": "Session revoked"}

@router.post("/admin/logout/{uid}", response_model=MessageResponse)
async def force_logout(uid: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await redis_delete(f"session:{uid}:*")
    return {"message": f"User {uid} forced logout"}
