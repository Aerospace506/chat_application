import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { UserProvider } from "./context/UserContext";
import { GroupProvider } from "./context/GroupContext";
import { WebSocketProvider, useWebSocket } from "./context/WebSocketContext";
import UserList from "./components/UserList";
import GroupList from "./components/GroupList";
import Chat from "./components/Chat";
import GroupChat from "./components/GroupChat";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import { FiLogOut } from "react-icons/fi";

const ChatApp = () => {
  const { user, loading, logout } = useAuth();
  const { disconnectWebSocket } = useWebSocket();
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [view, setView] = useState("direct"); // "direct" or "group"
  const [showSignUp, setShowSignUp] = useState(false);

  if (loading) return <div>Loading...</div>;

  if (!user) {
    return showSignUp ? (
      <SignUp onSwitchToLogin={() => setShowSignUp(false)} />
    ) : (
      <Login onSwitchToSignUp={() => setShowSignUp(true)} />
    );
  }

  return (
    <div className="flex h-screen">
      <div className="w-1/4 border-r overflow-y-auto relative">
        <div className="p-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
              {user.username[0].toUpperCase()}
            </div>
            <div>
              <div className="text-xl font-bold">{user.username}</div>
              <div className="text-sm text-gray-500">Online</div>
            </div>
          </div>
          <button
            className="p-2 rounded-full hover:bg-gray-100 text-gray-600"
            title="Log Out"
            onClick={() => {
              logout();
              disconnectWebSocket();
            }}
          >
            <FiLogOut size={20} />
          </button>
        </div>
        <div className="space-y-4 p-4 pt-0">
          {/* View switcher */}
          <div className="flex space-x-2">
            <button
              className={`flex-1 py-2 px-4 rounded-lg ${
                view === "direct"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              onClick={() => {
                setView("direct");
                setSelectedGroup(null);
              }}
            >
              Direct Messages
            </button>
            <button
              className={`flex-1 py-2 px-4 rounded-lg ${
                view === "group"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              onClick={() => {
                setView("group");
                setSelectedUser(null);
              }}
            >
              Groups
            </button>
          </div>

          {/* User or Group list based on view */}
          {view === "direct" ? (
            <UserList
              onSelectUser={(user) => {
                setSelectedUser(user);
                setSelectedGroup(null);
              }}
              selectedUser={selectedUser}
            />
          ) : (
            <GroupList
              onSelectGroup={(group) => {
                setSelectedGroup(group);
                setSelectedUser(null);
              }}
              selectedGroup={selectedGroup}
            />
          )}
        </div>
      </div>

      <div className="flex-1">
        {view === "direct" ? (
          <Chat selectedUser={selectedUser} />
        ) : (
          <GroupChat selectedGroup={selectedGroup} />
        )}
      </div>
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <WebSocketProvider>
        <UserProvider>
          <GroupProvider>
            <ChatApp />
          </GroupProvider>
        </UserProvider>
      </WebSocketProvider>
    </AuthProvider>
  );
};

export default App;
