from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Query, Depends
from app.models.message import Message
from app.services.database import db
from app.websockets.manager import manager
from app.services.auth_service import AuthService
import json
import logging
from datetime import datetime
from app.dependencies import get_current_user
from app.models.group_pydantic import Group as PydanticGroup, GroupMessage

logger = logging.getLogger(__name__)
router = APIRouter()

USERS = ["Alice", "Bob", "Charlie", "David"]

# In-memory group chat data (Phase 1)
groups = {
    "g1": {
        "id": "g1",
        "name": "Project Team",
        "members": ["Alice", "Bob", "Charlie"],
        "admins": ["Alice"],
        "banned": [],
        "createdAt": datetime.utcnow().isoformat(),
        "history": []
    }
}

messages = {}  # { (user1, user2): [msg, ...] }
message_by_id = {}  # _id: message

# Add a group_by_id dict for fast lookup
# (kept in sync with groups)
group_by_id = groups

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str, token: str = Query(...)):
    # Authenticate token
    username = AuthService.verify_token(token)
    if not username or username != user_id:
        await websocket.close(code=4401)  # 4401: Unauthorized
        return
    try:
        await manager.connect(websocket, user_id)
        
        # Send current online users to the newly connected user
        online_users = list(manager.get_online_users())
        await websocket.send_text(json.dumps({
            "type": "initial_status",
            "online_users": online_users
        }))
        
        # Broadcast user's online status to all other users
        await manager.broadcast(json.dumps({
            "type": "status",
            "user_id": user_id,
            "status": "online"
        }))
        
        try:
            while True:
                data = await websocket.receive_text()
                message_data = json.loads(data)
                
                # --- GROUP CHAT HANDLING ---
                if message_data.get("type") == "group_message":
                    group_id = message_data.get("groupId").strip().lower()
                    group = await db.get_group(group_id)
                    logger.info(f"Group message attempt: group_id={group_id}, user_id={user_id}, group_members={group.members if group else None}")
                    if not group or user_id not in group.members:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Not a group member"}))
                        continue
                    try:
                        # Create and save group message
                        msg_obj = GroupMessage(
                            group_id=group_id,
                            sender_id=user_id.strip().lower(),
                            content=message_data.get("content"),
                            likes=[],
                            deleted_by=[]
                        )
                        saved_msg = await db.save_group_message(msg_obj)
                        msg_dict = saved_msg.model_dump()
                        
                        # Broadcast to all online group members
                        for member_id in group.members:
                            norm_member = member_id.strip().lower()
                            if norm_member in manager.active_connections:
                                await manager.send_personal_message(json.dumps({
                                    **msg_dict,
                                    "type": "group_message",
                                    "_id": saved_msg.id,
                                    "from": saved_msg.sender_id,
                                    "groupId": saved_msg.group_id
                                }), norm_member)
                    except Exception as e:
                        logger.error(f"Error saving group message: {e}", exc_info=True)
                        await websocket.send_text(json.dumps({"type": "error", "message": "Failed to save message"}))
                    continue

                elif message_data.get("type") == "add_member":
                    group_id = message_data.get("groupId").strip().lower()
                    by = message_data.get("by").strip().lower()
                    user_to_add = message_data.get("userId").strip().lower()
                    group = await db.get_group(group_id)
                    if not group or by not in group.admins:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Only admins can add members"}))
                        continue
                    if user_to_add in group.banned:
                        group.banned.remove(user_to_add)
                    if user_to_add not in group.members:
                        group.members.append(user_to_add)
                        # Update group in DB
                        await db.update_group(group_id, {"members": group.members, "banned": group.banned})
                        # Notify new user
                        if user_to_add in manager.active_connections:
                            await manager.send_personal_message(json.dumps({"type": "group_added", "group": group.model_dump()}), user_to_add)
                        # Notify all members
                        for member_id in group.members:
                            if member_id in manager.active_connections:
                                await manager.send_personal_message(json.dumps({"type": "group_updated", "group": group.model_dump()}), member_id)
                    continue

                elif message_data.get("type") == "remove_member":
                    group_id = message_data.get("groupId").strip().lower()
                    by = message_data.get("by").strip().lower()
                    user_to_remove = message_data.get("userId").strip().lower()
                    group = await db.get_group(group_id)
                    if not group or by not in group.admins:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Only admins can remove members"}))
                        continue
                    if user_to_remove in group.members:
                        group.members.remove(user_to_remove)
                        if user_to_remove in group.admins:
                            group.admins.remove(user_to_remove)
                        group.banned.append(user_to_remove)
                        # Update group in DB
                        await db.update_group(group_id, {"members": group.members, "admins": group.admins, "banned": group.banned})
                        # Notify removed user
                        if user_to_remove in manager.active_connections:
                            await manager.send_personal_message(json.dumps({"type": "group_removed", "groupId": group_id}), user_to_remove)
                        # Notify all remaining members
                        for member_id in group.members:
                            if member_id in manager.active_connections:
                                await manager.send_personal_message(json.dumps({"type": "group_updated", "group": group.model_dump()}), member_id)
                    continue

                elif message_data.get("type") == "promote_admin":
                    group_id = message_data.get("groupId").strip().lower()
                    by = message_data.get("by").strip().lower()
                    user_to_promote = message_data.get("userId").strip().lower()
                    group = await db.get_group(group_id)
                    if not group or by not in group.admins:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Only admins can promote admins"}))
                        continue
                    if user_to_promote in group.members and user_to_promote not in group.admins:
                        group.admins.append(user_to_promote)
                        # Update group in DB
                        await db.update_group(group_id, {"admins": group.admins})
                        # Notify all members
                        for member_id in group.members:
                            if member_id in manager.active_connections:
                                await manager.send_personal_message(json.dumps({"type": "group_updated", "group": group.model_dump()}), member_id)
                    continue

                elif message_data.get("type") == "exit_group":
                    group_id = message_data.get("groupId").strip().lower()
                    user_exiting = message_data.get("userId").strip().lower()
                    group = await db.get_group(group_id)
                    if not group or user_exiting not in group.members:
                        await websocket.send_text(json.dumps({"type": "error", "message": "Not a group member"}))
                        continue
                    # Prevent last admin from leaving
                    if user_exiting in group.admins and len(group.admins) == 1:
                        # Try to auto-promote another member
                        other_members = [m for m in group.members if m != user_exiting]
                        if other_members:
                            group.admins.append(other_members[0])
                        else:
                            await websocket.send_text(json.dumps({"type": "error", "message": "Cannot leave as the last admin and member"}))
                            continue
                        group.admins.remove(user_exiting)
                    if user_exiting in group.admins:
                        group.admins.remove(user_exiting)
                    group.members.remove(user_exiting)
                    # Update group in DB
                    await db.update_group(group_id, {"members": group.members, "admins": group.admins})
                    # Notify all members
                    for member_id in group.members:
                        if member_id in manager.active_connections:
                            await manager.send_personal_message(json.dumps({"type": "group_updated", "group": group.model_dump()}), member_id)
                    # Optionally notify the user who left
                    if user_exiting in manager.active_connections:
                        await manager.send_personal_message(json.dumps({"type": "group_exited", "groupId": group_id}), user_exiting)
                    continue

                elif message_data.get("type") == "create_group":
                    try:
                        group_name = message_data.get("groupName")
                        creator = message_data.get("creator").strip().lower()
                        members = [m.strip().lower() for m in message_data.get("members", [creator])]
                        logger.info(f"Received create_group event: name={group_name}, creator={creator}, members={members}")
                        if not group_name or not creator:
                            await websocket.send_text(json.dumps({"type": "error", "message": "Missing groupName or creator"}))
                            continue
                        # Generate a unique groupId
                        group_id = f"g{int(datetime.utcnow().timestamp())}"
                        group_obj = PydanticGroup(
                            id=group_id,
                            name=group_name,
                            members=list(set(members)),
                            admins=[creator],
                            banned=[],
                            createdAt=datetime.utcnow().isoformat()
                        )
                        saved_group = await db.create_group(group_obj)
                        logger.info(f"Group created in MongoDB: {saved_group}")
                        # Notify the creator (and all members)
                        for member_id in saved_group.members:
                            if member_id in manager.active_connections:
                                await manager.send_personal_message(json.dumps({
                                    "type": "group_created",
                                    "group": saved_group.model_dump()
                                }), member_id)
                        # Also send group_added to all except creator
                        for member_id in saved_group.members:
                            if member_id != creator and member_id in manager.active_connections:
                                await manager.send_personal_message(json.dumps({
                                    "type": "group_added",
                                    "group": saved_group.model_dump()
                                }), member_id)
                    except Exception as e:
                        logger.error(f"Error during group creation: {e}", exc_info=True)
                        await websocket.send_text(json.dumps({"type": "error", "message": "Internal server error during group creation"}))
                        continue

                # --- END GROUP CHAT HANDLING ---
                elif message_data.get("type") == "like":
                    logger.info(f"Received like event: {message_data}")
                    msg_id = message_data.get("message_id")
                    user = user_id
                    is_group = message_data.get("is_group", False)  # Check if this is a group message
                    try:
                        updated_msg = await db.toggle_like(msg_id, user, is_group_message=is_group)
                        # For group messages, broadcast to all group members
                        if is_group:
                            group_id = message_data.get("group_id")
                            if group_id:
                                group = await db.get_group(group_id)
                                if group:
                                    for member_id in group.members:
                                        if member_id in manager.active_connections:
                                            await manager.send_personal_message(json.dumps({
                                                "type": "like_update",
                                                "message_id": updated_msg.id or updated_msg._id,
                                                "likes": updated_msg.likes
                                            }), member_id)
                        else:
                            # For direct messages, broadcast to both sender and receiver
                            for uid in [updated_msg.sender_id, updated_msg.receiver_id]:
                                if uid in manager.active_connections:
                                    await manager.send_personal_message(json.dumps({
                                        "type": "like_update",
                                        "message_id": updated_msg.id or updated_msg._id,
                                        "likes": updated_msg.likes
                                    }), uid)
                    except Exception as e:
                        logger.error(f"Error toggling like: {e}")
                        await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
                    continue
                elif message_data.get("type") == "delete":
                    msg_id = message_data.get("message_id")
                    user = user_id
                    is_group = message_data.get("is_group", False)  # Check if this is a group message
                    try:
                        deleted_msg = await db.delete_message(msg_id, user, is_group_message=is_group)
                        # For group messages, broadcast to all group members
                        if is_group:
                            group_id = message_data.get("group_id")
                            if group_id:
                                group = await db.get_group(group_id)
                                if group:
                                    for member_id in group.members:
                                        if member_id in manager.active_connections:
                                            await manager.send_personal_message(json.dumps({
                                                "type": "delete_update",
                                                "message_id": deleted_msg.id or deleted_msg._id,
                                                "deleted_by": deleted_msg.deleted_by,
                                                "likes": deleted_msg.likes
                                            }), member_id)
                        else:
                            # For direct messages, handle as before
                            if deleted_msg.deleted_by == ["*"]:
                                for uid in [deleted_msg.sender_id, deleted_msg.receiver_id]:
                                    if uid in manager.active_connections:
                                        await manager.send_personal_message(json.dumps({
                                            "type": "delete_update",
                                            "message_id": deleted_msg.id or deleted_msg._id,
                                            "deleted_by": deleted_msg.deleted_by,
                                            "likes": deleted_msg.likes
                                        }), uid)
                            else:
                                for uid in [deleted_msg.sender_id, deleted_msg.receiver_id]:
                                    if uid in manager.active_connections:
                                        await manager.send_personal_message(json.dumps({
                                            "type": "delete_update",
                                            "message_id": deleted_msg.id or deleted_msg._id,
                                            "deleted_by": deleted_msg.deleted_by,
                                            "likes": deleted_msg.likes
                                        }), uid)
                    except Exception as e:
                        logger.error(f"Error deleting message: {e}")
                        await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
                    continue
                elif message_data.get("type") == "message":
                    # Handle regular 1-to-1 message
                    if "receiver_id" not in message_data or "content" not in message_data:
                        logger.error(f"Missing required fields in message from user {user_id}")
                        continue
                    try:
                        # Normalize sender and receiver IDs
                        sender_id = user_id.strip().lower()
                        receiver_id = message_data["receiver_id"].strip().lower()
                        msg_obj = Message(
                            sender_id=sender_id,
                            receiver_id=receiver_id,
                            content=message_data["content"],
                            likes=[],
                            deleted_by=[]
                        )
                        saved_msg = await db.save_message(msg_obj)
                        logger.info(f"Broadcasting message from {saved_msg.sender_id} to {saved_msg.receiver_id}. Active connections: {list(manager.active_connections.keys())}")
                        for uid in [saved_msg.sender_id, saved_msg.receiver_id]:
                            if uid in manager.active_connections:
                                msg_dict = saved_msg.model_dump()
                                if isinstance(msg_dict.get("timestamp"), datetime):
                                    msg_dict["timestamp"] = msg_dict["timestamp"].isoformat()
                                await manager.send_personal_message(json.dumps({
                                    **msg_dict,
                                    "type": "message",
                                    "_id": saved_msg.id or saved_msg._id
                                }), uid)
                            else:
                                logger.warning(f"User {uid} not in active_connections, cannot send real-time message.")
                    except Exception as e:
                        logger.error(f"Error saving message: {str(e)}")
                        await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
                    continue
                else:
                    # Unknown message type
                    logger.error(f"Unknown message type: {message_data}")
                    await websocket.send_text(json.dumps({"type": "error", "message": "Unknown message type"}))
        except WebSocketDisconnect:
            manager.disconnect(user_id)
            await manager.broadcast(json.dumps({
                "type": "status",
                "user_id": user_id,
                "status": "offline"
            }))
            
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {str(e)}")
        manager.disconnect(user_id)
        await manager.broadcast(json.dumps({
            "type": "status",
            "user_id": user_id,
            "status": "offline"
        }))
        raise

@router.get("/users")
async def get_users():
    # Return hardcoded usernames
    return [{"id": u, "name": u} for u in USERS]

@router.get("/api/messages/{user_id}/{other_user_id}")
async def get_messages(user_id: str, other_user_id: str):
    # Fetch messages from MongoDB
    try:
        messages = await db.get_messages(user_id, other_user_id)
        return [msg.model_dump() for msg in messages]
    except Exception as e:
        logger.error(f"Error fetching messages: {e}")
        return []

@router.get("/api/groups/me")
async def get_user_groups(current_user: dict = Depends(get_current_user)):
    # Return all groups where the user is a member, from MongoDB
    username = current_user["username"]
    try:
        groups = await db.get_user_groups(username)
        return [g.model_dump() for g in groups]
    except Exception as e:
        logger.error(f"Error fetching user groups: {e}")
        return []

@router.get("/api/groups/{group_id}/messages")
async def get_group_messages(group_id: str):
    # Fetch group messages from MongoDB
    try:
        messages = await db.get_group_messages(group_id.strip().lower())
        return [msg.model_dump() for msg in messages]
    except Exception as e:
        logger.error(f"Error fetching group messages: {e}")
        return [] 