import { useState } from "react";
import { useUser } from "../context/UserContext";
import { useWebSocket } from "../context/WebSocketContext";

const CreateGroupModal = ({
  isOpen,
  onClose,
  allUsers = [],
  currentUser,
  token,
}) => {
  const { sendMessage } = useWebSocket();
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([
    currentUser?.name || "",
  ]);
  const [error, setError] = useState("");

  if (!isOpen || !currentUser || !currentUser.name) return null;

  const handleMemberToggle = (user) => {
    if (user === currentUser.name) return;
    setSelectedMembers((prev) =>
      prev.includes(user) ? prev.filter((u) => u !== user) : [...prev, user]
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError("Group name is required");
      return;
    }
    if (selectedMembers.length < 1) {
      setError("Select at least one member");
      return;
    }
    setError("");
    // Always include current user as admin and member
    const members = Array.from(new Set([...selectedMembers, currentUser.name]));
    sendMessage({
      type: "create_group",
      groupName: groupName.trim(),
      creator: currentUser.name,
      members,
    });
    onClose();
    setGroupName("");
    setSelectedMembers([currentUser.name]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <div className="text-lg font-bold mb-4">Create Group</div>
        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Group Name</label>
            <input
              className="w-full border rounded p-2"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Enter group name"
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">Members</label>
            <div className="flex flex-wrap gap-2">
              {allUsers
                .filter((u) => u !== currentUser.name)
                .map((user) => (
                  <label key={user} className="flex items-center space-x-1">
                    <input
                      type="checkbox"
                      checked={selectedMembers.includes(user)}
                      onChange={() => handleMemberToggle(user)}
                    />
                    <span>{user}</span>
                  </label>
                ))}
            </div>
          </div>
          {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              className="px-4 py-2 bg-gray-200 rounded"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateGroupModal;
