from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta
from app.services.database import db
from app.models.user import UserCreate, UserLogin, UserInDB
import os

SECRET_KEY = os.environ.get("SECRET_KEY", "supersecretkey")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 1 week

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class AuthService:
    @staticmethod
    async def register(user: UserCreate):
        # Normalize username
        username = user.username.strip().lower()
        # Check if user exists
        existing = await db.db.users.find_one({"username": username})
        if existing:
            raise ValueError("Username already exists")
        password_hash = pwd_context.hash(user.password)
        user_doc = {
            "username": username,
            "password_hash": password_hash,
            "pin": user.pin,
        }
        result = await db.db.users.insert_one(user_doc)
        return str(result.inserted_id)

    @staticmethod
    async def authenticate(user: UserLogin):
        username = user.username.strip().lower()
        user_doc = await db.db.users.find_one({"username": username})
        if not user_doc:
            return None
        if not pwd_context.verify(user.password, user_doc["password_hash"]):
            return None
        return UserInDB(**user_doc)

    @staticmethod
    def create_access_token(data: dict, expires_delta: timedelta = None):
        to_encode = data.copy()
        # Always use normalized username in token
        if "sub" in to_encode:
            to_encode["sub"] = to_encode["sub"].strip().lower()
        expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    @staticmethod
    def verify_token(token: str):
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            username = payload.get("sub")
            if username is None:
                return None
            return username.strip().lower()
        except JWTError:
            return None 