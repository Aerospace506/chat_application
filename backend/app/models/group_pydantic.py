from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class Group(BaseModel):
    id: str = Field(...)
    name: str
    members: List[str]
    admins: List[str]
    banned: List[str] = []
    createdAt: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class GroupMessage(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    group_id: str
    sender_id: str
    content: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    likes: List[str] = []
    deleted_by: List[str] = [] 