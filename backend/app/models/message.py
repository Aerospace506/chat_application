from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

class Message(BaseModel):
    sender_id: str
    receiver_id: str
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    likes: List[str] = Field(default_factory=list)  # List of user IDs who liked the message
    deleted_by: List[str] = Field(default_factory=list)  # List of user IDs who deleted the message

class MessageInDB(Message):
    id: Optional[str] = Field(None, alias="_id") 