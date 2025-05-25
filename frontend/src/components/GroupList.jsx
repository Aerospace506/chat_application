import { useGroup } from "../context/GroupContext";
import { useUser } from "../context/UserContext";
import { useAuth } from "../context/AuthContext";
import authFetch from "../utils/authFetch";
import { useEffect, useState } from "react";
import CreateGroupModal from "./CreateGroupModal";
import { useWebSocket } from "../context/WebSocketContext";

const GroupList = ({ onSelectGroup, selectedGroup }) => {
  const { groups, isMember, addGroup, addAllGroups } = useGroup();
  const { currentUser } = useUser();
  const { token } = useAuth();
  const { subscribe } = useWebSocket();
  const [showModal, setShowModal] = useState(false);
  const [allUsers, setAllUsers] = useState([]);

  // Fetch all users for member selection in modal
  useEffect(() => {
    if (!token) return;
    authFetch("http://localhost:8000/api/auth/users", token)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAllUsers(Array.isArray(data) ? data : []));
  }, [token]);

  // Defensive: if currentUser is not loaded, show loading
  if (!currentUser || !currentUser.name) {
    return <div className="text-gray-500 p-3">Loading user info...</div>;
  }
  // Defensive: if groups is not an array, show loading
  if (!Array.isArray(groups)) {
    return <div className="text-gray-500 p-3">Loading groups...</div>;
  }

  // Only show groups where the current user is a member
  const availableGroups = Array.isArray(groups)
    ? groups.filter(
        (group) => currentUser && isMember(group.id, currentUser.name)
      )
    : [];

  useEffect(() => {
    // Listen for group_created and group_added messages and refresh group list if needed
    const unsubscribe = subscribe((data) => {
      if (data.type === "group_created" && data.group) {
        setShowModal(false);
        addGroup(data.group);
        // Force a refresh of the group list for all users
        if (token) {
          authFetch(`http://localhost:8000/api/groups/me`, token)
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => addAllGroups(Array.isArray(data) ? data : []));
        }
      } else if (data.type === "group_added" && data.group) {
        // Fetch latest groups from backend to ensure up-to-date membership
        if (token) {
          authFetch(`http://localhost:8000/api/groups/me`, token)
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => addAllGroups(Array.isArray(data) ? data : []));
        }
      } else if (data.type === "group_removed" && data.groupId) {
        // Remove the group from the list
        addAllGroups(groups.filter((g) => g.id !== data.groupId));
        if (selectedGroup && selectedGroup.id === data.groupId) {
          onSelectGroup(null);
        }
      } else if (data.type === "group_exited" && data.groupId) {
        // Remove the group from the list and clear selection
        addAllGroups(groups.filter((g) => g.id !== data.groupId));
        if (selectedGroup && selectedGroup.id === data.groupId) {
          onSelectGroup(null);
        }
      }
    });
    return () => unsubscribe();
  }, [
    subscribe,
    addGroup,
    addAllGroups,
    token,
    selectedGroup,
    onSelectGroup,
    groups,
  ]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-gray-700">Groups</div>
        <button
          className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
          onClick={() => setShowModal(true)}
        >
          Create Group
        </button>
      </div>
      {availableGroups.map((group) => (
        <div
          key={group.id}
          className={`p-3 cursor-pointer rounded-lg flex items-center justify-between transition-colors ${
            selectedGroup?.id === group.id ? "bg-blue-100" : "hover:bg-gray-100"
          }`}
          onClick={() => onSelectGroup(group)}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-400 flex items-center justify-center text-white font-bold text-base">
              {group.name[0].toUpperCase()}
            </div>
            <span className="font-medium">{group.name}</span>
          </div>
          <div className="text-sm text-gray-500">
            {group.members.length} members
          </div>
        </div>
      ))}
      {availableGroups.length === 0 && (
        <div className="text-sm text-gray-500 p-3">
          {Array.isArray(groups) && groups.length === 0
            ? "No groups found. Create a group to get started!"
            : "You are not a member of any groups"}
        </div>
      )}
      <CreateGroupModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        allUsers={allUsers}
        currentUser={currentUser}
        token={token}
      />
    </div>
  );
};

export default GroupList;
