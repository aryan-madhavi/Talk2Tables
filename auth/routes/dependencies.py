# auth/routes/dependencies.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from auth.core.config import settings
from auth.core.mongo import get_database

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    token = credentials.credentials
    try:
        # Note: In a real app, you'd want to handle settings.jwt_secret_key properly
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        
        user_id = payload.get("sub")
        role = payload.get("role")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token credentials")
            
        db = get_database()
        from bson import ObjectId
        try:
            user = await db["users"].find_one({"_id": ObjectId(user_id)})
        except Exception:
            user = await db["users"].find_one({"_id": user_id})
        
        if user is None or not user.get("is_active", True):
            raise HTTPException(status_code=401, detail="User not found or inactive")

        # Return dict matching your existing structure but with 'uid' and 'firebase_uid' for compatibility
        return {
            "uid": str(user["_id"]),
            "firebase_uid": str(user["_id"]), # COMPATIBILITY LAYER
            "role": role,
            "email": user["email"]
        }
        
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")

# ── Role-Based Access Control (RBAC) Dependencies ────────────────────────────

async def require_user(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("role"):
         raise HTTPException(status_code=403, detail="Role not assigned.")
    return user

async def require_analyst(user: dict = Depends(require_user)) -> dict:
    # analyst is the base role; all authenticated users are at least analysts
    return user

async def require_power_user(user: dict = Depends(require_user)) -> dict:
    if user["role"] not in {"power_user", "db_manager", "admin"}:
        raise HTTPException(status_code=403, detail="Power user access required.")
    return user

async def require_db_manager(user: dict = Depends(require_user)) -> dict:
    if user["role"] not in {"db_manager", "admin"}:
        raise HTTPException(status_code=403, detail="DB Manager access required.")
    return user

async def require_admin(user: dict = Depends(require_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user