from pydantic import BaseModel, Field
from typing import Optional

class UserInDB(BaseModel):
    username: str
    password_hash: str
    pin: str
    _id: Optional[str] = None

class UserCreate(BaseModel):
    username: str
    password: str
    pin: str

class UserLogin(BaseModel):
    username: str
    password: str 