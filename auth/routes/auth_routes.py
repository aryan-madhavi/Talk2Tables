# auth/routes/auth_routes.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from auth.core.security import verify_password, create_access_token, create_refresh_token
from auth.core.mongo import get_database
from core.redis_client import redis_set, redis_delete
import uuid

router = APIRouter(prefix="/auth", tags=["auth"])

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/login")
async def login(request: LoginRequest):
    db = get_database()
    user = await db["users"].find_one({"email": request.email})
    
    if not user or not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
        
    user_id = str(user["_id"])
    access_token = create_access_token(subject=user_id, role=user.get("role", "analyst"))
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
            "email": user["email"],
            "role": user.get("role", "analyst")
        }
    }

@router.post("/logout")
async def logout(user: dict = Depends(get_current_user)):
    # In a full implementation, you would pass the specific session_id to delete
    # Or delete all sessions for the user to force global logout
    await redis_delete(f"session:{user['uid']}:*")
    return {"message": "Logged out successfully"}