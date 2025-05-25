from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..services.group_service import GroupService
from ..models.group import Group, GroupMember
from ..dependencies import get_db, get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/api/groups", tags=["groups"])

class GroupCreate(BaseModel):
    name: str
    description: str

class GroupResponse(BaseModel):
    id: int
    name: str
    description: str
    created_by: int

    class Config:
        from_attributes = True

class GroupMemberResponse(BaseModel):
    id: int
    user_id: int
    is_admin: bool
    joined_at: str

    class Config:
        from_attributes = True

@router.post("", response_model=GroupResponse)
def create_group(
    group_data: GroupCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group_service = GroupService(db)
    return group_service.create_group(
        name=group_data.name,
        description=group_data.description,
        creator_id=current_user["id"]
    )

@router.post("/{group_id}/members/{user_id}")
def add_member(
    group_id: int,
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group_service = GroupService(db)
    return group_service.add_member(group_id, user_id, current_user["id"])

@router.delete("/{group_id}/members/{user_id}")
def remove_member(
    group_id: int,
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group_service = GroupService(db)
    return group_service.remove_member(group_id, user_id, current_user["id"])

@router.post("/{group_id}/members/{user_id}/admin")
def make_admin(
    group_id: int,
    user_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group_service = GroupService(db)
    return group_service.make_admin(group_id, user_id, current_user["id"])

@router.delete("/{group_id}/leave")
def leave_group(
    group_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group_service = GroupService(db)
    return group_service.leave_group(group_id, current_user["id"])

@router.get("/{group_id}/members", response_model=List[GroupMemberResponse])
def get_group_members(
    group_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group_service = GroupService(db)
    return group_service.get_group_members(group_id)

@router.get("/my-groups", response_model=List[GroupResponse])
def get_user_groups(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group_service = GroupService(db)
    return group_service.get_user_groups(current_user["id"]) 