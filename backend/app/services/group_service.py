from sqlalchemy.orm import Session
from ..models.group import Group, GroupMember
from typing import List, Optional
from fastapi import HTTPException

class GroupService:
    def __init__(self, db: Session):
        self.db = db

    def create_group(self, name: str, description: str, creator_id: int) -> Group:
        group = Group(name=name, description=description, created_by=creator_id)
        self.db.add(group)
        self.db.flush()  # To get the group ID
        
        # Add creator as admin
        member = GroupMember(group_id=group.id, user_id=creator_id, is_admin=True)
        self.db.add(member)
        self.db.commit()
        self.db.refresh(group)
        return group

    def add_member(self, group_id: int, user_id: int, added_by: int) -> GroupMember:
        # Check if adder is admin
        adder = self.db.query(GroupMember).filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == added_by,
            GroupMember.is_admin == True
        ).first()
        
        if not adder:
            raise HTTPException(status_code=403, detail="Only admins can add members")

        # Check if user is already a member
        existing_member = self.db.query(GroupMember).filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        ).first()
        
        if existing_member:
            raise HTTPException(status_code=400, detail="User is already a member")

        member = GroupMember(group_id=group_id, user_id=user_id)
        self.db.add(member)
        self.db.commit()
        self.db.refresh(member)
        return member

    def remove_member(self, group_id: int, user_id: int, removed_by: int) -> None:
        # Check if remover is admin
        remover = self.db.query(GroupMember).filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == removed_by,
            GroupMember.is_admin == True
        ).first()
        
        if not remover:
            raise HTTPException(status_code=403, detail="Only admins can remove members")

        member = self.db.query(GroupMember).filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        ).first()
        
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        self.db.delete(member)
        self.db.commit()

    def make_admin(self, group_id: int, user_id: int, promoted_by: int) -> GroupMember:
        # Check if promoter is admin
        promoter = self.db.query(GroupMember).filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == promoted_by,
            GroupMember.is_admin == True
        ).first()
        
        if not promoter:
            raise HTTPException(status_code=403, detail="Only admins can promote members")

        member = self.db.query(GroupMember).filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        ).first()
        
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        member.is_admin = True
        self.db.commit()
        self.db.refresh(member)
        return member

    def leave_group(self, group_id: int, user_id: int) -> None:
        member = self.db.query(GroupMember).filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == user_id
        ).first()
        
        if not member:
            raise HTTPException(status_code=404, detail="Member not found")

        # Check if this is the last admin
        if member.is_admin:
            admin_count = self.db.query(GroupMember).filter(
                GroupMember.group_id == group_id,
                GroupMember.is_admin == True
            ).count()
            
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot leave group as the last admin. Promote another admin first."
                )

        self.db.delete(member)
        self.db.commit()

    def get_group_members(self, group_id: int) -> List[GroupMember]:
        return self.db.query(GroupMember).filter(GroupMember.group_id == group_id).all()

    def get_user_groups(self, user_id: int) -> List[Group]:
        return self.db.query(Group).join(GroupMember).filter(GroupMember.user_id == user_id).all() 