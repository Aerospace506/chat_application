from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from .base import Base
from pydantic import BaseModel, Field
from typing import List, Optional

class Group(BaseModel):
    id: str = Field(...)
    name: str
    members: List[str]
    admins: List[str]
    banned: List[str] = []
    createdAt: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class GroupMessage(BaseModel):
    id: Optional[str] = None
    group_id: str
    sender_id: str
    content: str
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    likes: List[str] = []
    deleted_by: List[str] = []

class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Relationships
    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    creator = relationship("User", foreign_keys=[created_by])

class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_admin = Column(Boolean, default=False)
    joined_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    group = relationship("Group", back_populates="members")
    user = relationship("User") 