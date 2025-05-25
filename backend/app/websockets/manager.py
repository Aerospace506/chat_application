from fastapi import WebSocket
from typing import Dict, Set
import json
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.online_users: Set[str] = set()

    async def connect(self, websocket: WebSocket, user_id: str):
        norm_user_id = user_id.strip().lower()
        await websocket.accept()
        self.active_connections[norm_user_id] = websocket
        self.online_users.add(norm_user_id)
        logger.info(f"User {norm_user_id} connected. Online users: {self.online_users}")

    def disconnect(self, user_id: str):
        norm_user_id = user_id.strip().lower()
        if norm_user_id in self.active_connections:
            del self.active_connections[norm_user_id]
        if norm_user_id in self.online_users:
            self.online_users.remove(norm_user_id)
        logger.info(f"User {norm_user_id} disconnected. Online users: {self.online_users}")

    def get_online_users(self) -> Set[str]:
        return self.online_users

    async def send_personal_message(self, message: str, user_id: str):
        norm_user_id = user_id.strip().lower()
        if norm_user_id in self.active_connections:
            try:
                await self.active_connections[norm_user_id].send_text(message)
            except Exception as e:
                logger.error(f"Error sending message to user {norm_user_id}: {str(e)}")
                self.disconnect(norm_user_id)

    async def broadcast(self, message: str):
        disconnected_users = []
        for user_id, connection in self.active_connections.items():
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.error(f"Error broadcasting to user {user_id}: {str(e)}")
                disconnected_users.append(user_id)

        # Clean up disconnected users
        for user_id in disconnected_users:
            self.disconnect(user_id)

manager = ConnectionManager() 