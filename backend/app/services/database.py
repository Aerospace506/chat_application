from motor.motor_asyncio import AsyncIOMotorClient
from app.models.message import Message, MessageInDB
from typing import List, Union
from bson import ObjectId
import logging
from app.models.group_pydantic import Group, GroupMessage
from dotenv import load_dotenv


logger = logging.getLogger(__name__)

class Database:
    def __init__(self, url: str = None):
        load_dotenv()
        mongo_url = url or os.getenv("MONGO_URI", "mongodb://localhost:27017")
        self.client = AsyncIOMotorClient(mongo_url)
        self.db = self.client.chat_app

    async def save_message(self, message: Message) -> MessageInDB:
        try:
            # Convert the message to a dictionary and ensure proper types
            message_dict = message.model_dump()
            
            # Ensure proper initialization of arrays
            message_dict.setdefault("likes", [])
            message_dict.setdefault("deleted_by", [])
            
            # Insert the message
            result = await self.db.messages.insert_one(message_dict)
            message_dict["_id"] = str(result.inserted_id)
            
            # Return the saved message with its ID
            return MessageInDB(**message_dict)
        except Exception as e:
            logger.error(f"Error saving message: {str(e)}")
            raise

    async def get_messages(self, user_id: str, other_user_id: str) -> List[MessageInDB]:
        try:
            cursor = self.db.messages.find({
                "$or": [
                    {"sender_id": user_id, "receiver_id": other_user_id},
                    {"sender_id": other_user_id, "receiver_id": user_id}
                ]
            }).sort("timestamp", 1)
            
            messages = []
            async for document in cursor:
                # Check if message is globally deleted or personally deleted
                deleted_by = document.get("deleted_by", [])
                if "*" not in deleted_by and user_id not in deleted_by:
                    document["_id"] = str(document["_id"])
                    messages.append(MessageInDB(**document))
            return messages
        except Exception as e:
            logger.error(f"Error retrieving messages: {str(e)}")
            raise

    async def toggle_like(self, message_id: str, user_id: str, is_group_message: bool = False) -> Union[MessageInDB, GroupMessage]:
        try:
            # Convert string ID to ObjectId
            object_id = ObjectId(message_id)
            
            # Choose the correct collection
            collection = self.db.group_messages if is_group_message else self.db.messages
            
            # Find the message
            message = await collection.find_one({"_id": object_id})
            if not message:
                logger.error(f"Message {message_id} not found")
                raise ValueError("Message not found")

            # Check if message is deleted
            deleted_by = message.get("deleted_by", [])
            if "*" in deleted_by or user_id in deleted_by:
                logger.error(f"Cannot like deleted message {message_id}")
                raise ValueError("Cannot like deleted message")

            likes = message.get("likes", [])
            if user_id in likes:
                likes.remove(user_id)
            else:
                likes.append(user_id)

            # Update the message
            await collection.update_one(
                {"_id": object_id},
                {"$set": {"likes": likes}}
            )

            message["likes"] = likes
            message["_id"] = str(message["_id"])
            return GroupMessage(**message) if is_group_message else MessageInDB(**message)
            
        except Exception as e:
            logger.error(f"Error toggling like for message {message_id}: {str(e)}")
            raise

    async def delete_message(self, message_id: str, user_id: str, is_group_message: bool = False) -> Union[MessageInDB, GroupMessage]:
        try:
            # Convert string ID to ObjectId
            object_id = ObjectId(message_id)
            
            # Choose the correct collection
            collection = self.db.group_messages if is_group_message else self.db.messages
            
            # Find the message
            message = await collection.find_one({"_id": object_id})
            if not message:
                logger.error(f"Message {message_id} not found")
                raise ValueError("Message not found")

            deleted_by = message.get("deleted_by", [])
            likes = message.get("likes", [])
            
            # If the user is the sender, delete for everyone
            if message["sender_id"] == user_id:
                logger.info(f"Sender {user_id} deleting message {message_id} for everyone")
                # Delete the message completely
                await collection.delete_one({"_id": object_id})
                message["deleted_by"] = ["*"]  # Mark as globally deleted for the response
            else:
                # If receiver wants to delete just for themselves
                if user_id not in deleted_by:
                    logger.info(f"Receiver {user_id} deleting message {message_id} for themselves")
                    deleted_by.append(user_id)
                    
                    # Remove user's like if they had liked the message
                    if user_id in likes:
                        likes.remove(user_id)
                        logger.info(f"Removed like from user {user_id} for message {message_id}")
                    
                    await collection.update_one(
                        {"_id": object_id},
                        {"$set": {
                            "deleted_by": deleted_by,
                            "likes": likes
                        }}
                    )
                    message["deleted_by"] = deleted_by
                    message["likes"] = likes

            message["_id"] = str(message["_id"])
            return GroupMessage(**message) if is_group_message else MessageInDB(**message)
            
        except Exception as e:
            logger.error(f"Error deleting message {message_id}: {str(e)}")
            raise

    # --- GROUPS ---
    async def create_group(self, group: Group) -> Group:
        group_dict = group.model_dump()
        result = await self.db.groups.insert_one(group_dict)
        group_dict["_id"] = str(result.inserted_id)
        return Group(**group_dict)

    async def get_group(self, group_id: str) -> Group:
        doc = await self.db.groups.find_one({"id": group_id})
        if not doc:
            return None
        return Group(**doc)

    async def update_group(self, group_id: str, update: dict) -> Group:
        await self.db.groups.update_one({"id": group_id}, {"$set": update})
        doc = await self.db.groups.find_one({"id": group_id})
        return Group(**doc)

    async def get_user_groups(self, username: str) -> list:
        cursor = self.db.groups.find({"members": username})
        groups = []
        async for doc in cursor:
            groups.append(Group(**doc))
        return groups

    # --- GROUP MESSAGES ---
    async def save_group_message(self, message: GroupMessage) -> GroupMessage:
        msg_dict = message.model_dump()
        result = await self.db.group_messages.insert_one(msg_dict)
        msg_dict["_id"] = str(result.inserted_id)
        return GroupMessage(**msg_dict)

    async def get_group_messages(self, group_id: str) -> list:
        cursor = self.db.group_messages.find({"group_id": group_id}).sort("timestamp", 1)
        messages = []
        async for doc in cursor:
            doc["_id"] = str(doc["_id"])  # Ensure _id is included as a string
            messages.append(GroupMessage(**doc))  # Parse as GroupMessage
        return messages

db = Database() 