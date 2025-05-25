import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../context/WebSocketContext";
import authFetch from "../utils/authFetch";

const UserList = ({ onSelectUser, selectedUser }) => {
  const { user, token } = useAuth();
  const { onlineUsers } = useWebSocket();
  const [users, setUsers] = useState([]);

  // Fetch users initially and whenever onlineUsers changes
  useEffect(() => {
    if (!token) return;
    authFetch("http://localhost:8000/api/auth/users", token)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        // Exclude the currently logged-in user
        setUsers(data.filter((u) => u !== user.username));
      });
  }, [token, user, onlineUsers]);

  return (
    <div className="space-y-2">
      <div className="font-semibold text-gray-700 mb-2">Direct Messages</div>
      {users.map((u) => {
        const normU = u.trim().toLowerCase();
        return (
          <div
            key={normU}
            className={`p-3 cursor-pointer rounded-lg flex items-center justify-between transition-colors ${
              selectedUser?.name.trim().toLowerCase() === normU
                ? "bg-blue-100"
                : "hover:bg-gray-100"
            }`}
            onClick={() => onSelectUser({ name: normU })}
          >
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-base">
                {u[0].toUpperCase()}
              </div>
              <span className="font-medium">{u}</span>
            </div>
            <span
              className={`ml-2 w-3 h-3 rounded-full ${
                onlineUsers.has(normU)
                  ? "bg-green-500 animate-pulse"
                  : "bg-gray-300"
              }`}
              title={onlineUsers.has(normU) ? "Online" : "Offline"}
            ></span>
          </div>
        );
      })}
      {users.length === 0 && (
        <div className="text-sm text-gray-500 p-3">No other users found</div>
      )}
    </div>
  );
};

export default UserList;
