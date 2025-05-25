from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.websockets import WebSocket
from app.models.user import UserCreate, UserLogin
from app.services.auth_service import AuthService
from app.dependencies import get_current_user
from app.services.database import db
from app.websockets.manager import manager
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register")
async def register(user: UserCreate):
    try:
        user_id = await AuthService.register(user)
        return {"success": True, "user_id": user_id}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/login")
async def login(user: UserLogin):
    user_in_db = await AuthService.authenticate(user)
    if not user_in_db:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = AuthService.create_access_token({"sub": user_in_db.username})
    return {"access_token": token, "token_type": "bearer", "username": user_in_db.username}

@router.get("/users")
async def get_users(current_user: dict = Depends(get_current_user)):
    users = await db.db.users.find({}, {"username": 1, "_id": 0}).to_list(length=1000)
    return [u["username"] for u in users]

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, token: str = Query(...)):
    # Authenticate token
    username = AuthService.verify_token(token)
    norm_user_id = user_id.strip().lower()
    if not username or username != norm_user_id:
        await websocket.close(code=4401)  # 4401: Unauthorized
        return
    await manager.connect(websocket, user_id)

class ResetPasswordRequest(BaseModel):
    username: str
    pin: str
    new_password: str

@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    user_doc = await db.db.users.find_one({"username": req.username.strip().lower()})
    if not user_doc:
        raise HTTPException(status_code=404, detail="User not found")
    if user_doc.get("pin") != req.pin:
        raise HTTPException(status_code=403, detail="Invalid PIN")
    from app.services.auth_service import pwd_context
    new_hash = pwd_context.hash(req.new_password)
    await db.db.users.update_one({"username": req.username.strip().lower()}, {"$set": {"password_hash": new_hash}})
    return {"success": True} 