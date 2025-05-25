import { useState, useEffect, useRef } from "react";
import { useUser } from "../context/UserContext";
import { useGroup } from "../context/GroupContext";
import { useWebSocket } from "../context/WebSocketContext";

const GROUP_ID = "g1"; // Hardcoded for demo
const ALL_USERS = ["Alice", "Bob", "Charlie", "David"];

const GroupChat = ({ selectedGroup }) => {
  // All hooks at the top
  const { currentUser } = useUser();
  const { isAdmin, isMember, isBlocked, getGroupById } = useGroup();
  const { sendMessage, subscribe } = useWebSocket();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [group, setGroup] = useState({
    groupId: GROUP_ID,
    groupName: "Test Group",
    members: ["1", "2"],
    admins: ["1"],
    banned: [],
  });
  const [eventLog, setEventLog] = useState([]);
  const messagesEndRef = useRef(null);

  // All useEffect hooks here
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Utility to normalize MongoDB ObjectId to string
  function normalizeId(id) {
    if (!id) return undefined;
    if (typeof id === "string") {
      // If it's already a 24-char hex string, return as is
      if (/^[a-fA-F0-9]{24}$/.test(id)) return id;
      // If it's in the form ObjectId('...'), extract the hex
      const match = id.match(/[a-fA-F0-9]{24}/);
      if (match) return match[0];
      return id;
    }
    if (typeof id === "object" && id.$oid) return id.$oid;
    if (typeof id === "object" && id.toString) {
      const str = id.toString();
      const match = str.match(/[a-fA-F0-9]{24}/);
      if (match) return match[0];
    }
    return undefined;
  }

  // Clear input field and messages when switching groups
  useEffect(() => {
    setNewMessage("");
    setMessages([]);
    setGroup(selectedGroup);
    if (selectedGroup && selectedGroup.id) {
      fetch(`http://localhost:8000/api/groups/${selectedGroup.id}/messages`)
        .then((res) => (res.ok ? res.json() : []))
        .then((msgs) => {
          console.log("[FETCHED FROM BACKEND]", msgs);
          const normalized = Array.isArray(msgs)
            ? msgs.map((msg, idx) => {
                console.log(
                  "[NORMALIZE] raw _id:",
                  msg._id,
                  typeof msg._id,
                  msg
                );
                let id =
                  normalizeId(msg._id) ||
                  (msg.id && typeof msg.id === "string"
                    ? msg.id
                    : `optimistic-${Date.now()}-${idx}`);
                return {
                  ...msg,
                  from: msg.from || msg.sender_id,
                  groupId: msg.groupId || msg.group_id || selectedGroup.id,
                  _id: id,
                };
              })
            : [];
          const realMessages = normalized.filter((msg) =>
            isValidObjectId(msg._id)
          );
          setMessages(realMessages);
        })
        .catch(() => setMessages([]));
    }
  }, [currentUser, selectedGroup]);

  // Listen for group events and update group/members/admins state
  useEffect(() => {
    if (!currentUser || !selectedGroup) return;
    const unsubscribe = subscribe((data) => {
      if (
        data.type === "group_message" &&
        (data.groupId === selectedGroup.id ||
          data.group_id === selectedGroup.id)
      ) {
        // Normalize incoming message
        let id =
          normalizeId(data._id) ||
          (data.id && typeof data.id === "string"
            ? data.id
            : `optimistic-${Date.now()}`);
        const normalized = {
          ...data,
          from: data.from || data.sender_id,
          groupId: data.groupId || data.group_id || selectedGroup.id,
          _id: id,
        };
        setMessages((prev) => {
          // If this is a real message, replace any optimistic one with same sender/content/timestamp
          if (isValidObjectId(normalized._id)) {
            let replaced = false;
            const filtered = prev.filter((msg) => {
              if (!isValidObjectId(msg._id)) {
                const isMatch =
                  msg.from === normalized.from &&
                  msg.content === normalized.content &&
                  Math.abs(
                    new Date(msg.timestamp) - new Date(normalized.timestamp)
                  ) < 5000;
                if (isMatch) {
                  replaced = true;
                  console.log(
                    "[Replacement] Replacing optimistic message with real one:",
                    msg,
                    "=>",
                    normalized
                  );
                  return false; // remove optimistic
                }
              }
              return true;
            });
            // Only add if not already present
            const exists = filtered.some((msg) => msg._id === normalized._id);
            if (!exists) return [...filtered, normalized];
            return filtered;
          } else {
            // If optimistic, just add if not present
            const exists = prev.some((msg) => msg._id === normalized._id);
            if (!exists) return [...prev, normalized];
            return prev;
          }
        });
      } else if (data.type === "like_update") {
        setMessages((prev) => {
          let found = false;
          const updated = prev.map((msg) => {
            if (msg._id === data.message_id) {
              found = true;
              return { ...msg, likes: [...data.likes] };
            }
            return { ...msg };
          });
          return updated;
        });
      } else if (data.type === "delete_update") {
        setMessages((prev) => {
          return prev.map((msg) =>
            msg._id === data.message_id
              ? {
                  ...msg,
                  deleted_by: data.deleted_by,
                  likes: data.likes || msg.likes,
                }
              : msg
          );
        });
      } else if (
        data.type === "group_updated" &&
        data.group.id === selectedGroup.id
      ) {
        setGroup(data.group);
      } else if (
        data.type === "group_added" &&
        data.group.id === selectedGroup.id
      ) {
        setGroup(data.group);
      } else if (
        data.type === "group_exited" &&
        data.groupId === selectedGroup.id
      ) {
        setGroup(null);
      } else if (data.type === "error") {
        setEventLog((log) => [...log, `Error: ${data.message}`]);
      }
    });
    return () => unsubscribe();
  }, [currentUser, selectedGroup, subscribe]);

  // Early returns after all hooks
  if (!currentUser || !currentUser.name) {
    return <div className="text-gray-500 p-3">Loading user info...</div>;
  }
  if (!selectedGroup || !selectedGroup.id || !selectedGroup.name) {
    return <div className="text-gray-500 p-3">No group selected.</div>;
  }
  if (!group || !Array.isArray(group.members) || !Array.isArray(group.admins)) {
    return <div className="text-gray-500 p-3">Loading group...</div>;
  }

  const sendGroupMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedGroup) return;
    sendMessage({
      type: "group_message",
      groupId: selectedGroup.id,
      from: currentUser.name,
      content: newMessage.trim(),
    });
    setNewMessage("");
    // Immediately fetch latest messages after sending
    setTimeout(() => {
      fetch(`http://localhost:8000/api/groups/${selectedGroup.id}/messages`)
        .then((res) => (res.ok ? res.json() : []))
        .then((msgs) => {
          console.log("[FETCHED FROM BACKEND]", msgs);
          const normalized = Array.isArray(msgs)
            ? msgs.map((msg, idx) => {
                console.log(
                  "[NORMALIZE] raw _id:",
                  msg._id,
                  typeof msg._id,
                  msg
                );
                let id =
                  normalizeId(msg._id) ||
                  (msg.id && typeof msg.id === "string"
                    ? msg.id
                    : `optimistic-${Date.now()}-${idx}`);
                return {
                  ...msg,
                  from: msg.from || msg.sender_id,
                  groupId: msg.groupId || msg.group_id || selectedGroup.id,
                  _id: id,
                };
              })
            : [];
          const realMessages = normalized.filter((msg) =>
            isValidObjectId(msg._id)
          );
          setMessages(realMessages);
        })
        .catch(() => setMessages([]));
    }, 800);
  };

  const handleAddMember = (userId) => {
    sendMessage({
      type: "add_member",
      groupId: selectedGroup.id,
      by: currentUser.name,
      userId,
    });
  };
  const handleRemoveMember = (userId) => {
    sendMessage({
      type: "remove_member",
      groupId: selectedGroup.id,
      by: currentUser.name,
      userId,
    });
  };
  const handlePromoteAdmin = (userId) => {
    sendMessage({
      type: "promote_admin",
      groupId: selectedGroup.id,
      by: currentUser.name,
      userId,
    });
  };
  const handleExitGroup = () => {
    sendMessage({
      type: "exit_group",
      groupId: selectedGroup.id,
      userId: currentUser.name,
    });
  };

  // Admin controls UI
  const isCurrentUserAdmin = group?.admins?.includes(currentUser.name);
  const canPromote = (user) =>
    isCurrentUserAdmin &&
    group.members.includes(user) &&
    !group.admins.includes(user);
  const canAddMember = isCurrentUserAdmin;

  const handleLike = (messageId) => {
    sendMessage({
      type: "like",
      message_id: messageId,
      is_group: true,
      group_id: selectedGroup.id,
    });
  };

  const handleDelete = (messageId) => {
    sendMessage({
      type: "delete",
      message_id: messageId,
      is_group: true,
      group_id: selectedGroup.id,
    });
  };

  // Utility function to check for valid MongoDB ObjectId
  function isValidObjectId(id) {
    return typeof id === "string" && /^[a-fA-F0-9]{24}$/.test(id);
  }

  if (!selectedGroup) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Select a group to start chatting
      </div>
    );
  }

  if (!group?.members?.includes(currentUser.name)) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        You are not a member of this group
      </div>
    );
  }

  // Add before rendering messages
  console.log("[Render] Messages array:", messages);

  return (
    <div className="flex flex-col h-full max-w-2xl mx-auto border rounded shadow bg-white">
      <div className="p-4 border-b flex justify-between items-center">
        <div>
          <div className="font-bold">{group.groupName}</div>
          <div className="text-xs text-gray-500">
            Members: {group.members.join(", ")} | Admins:{" "}
            {group.admins.join(", ")}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
        {messages.map((msg, idx) => {
          // Debug: log message details
          console.log("Message:", {
            _id: msg._id,
            from: msg.from,
            content: msg.content,
            timestamp: msg.timestamp,
            likes: msg.likes,
            deleted_by: msg.deleted_by,
            isOptimistic: !isValidObjectId(msg._id),
          });
          const isDeletedForMe =
            msg.deleted_by?.includes("*") ||
            msg.deleted_by?.includes(currentUser.name);
          return (
            <div
              key={msg._id || msg.id || idx}
              className={`flex items-end mb-2 ${
                msg.from === currentUser.name ? "justify-end" : "justify-start"
              }`}
            >
              {msg.from !== currentUser.name && (
                <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-base mr-2">
                  {msg.from[0].toUpperCase()}
                </div>
              )}
              <div className="relative max-w-[70%]">
                <div
                  className={`rounded-lg p-3 shadow-sm ${
                    msg.from === currentUser.name
                      ? "bg-blue-500 text-white"
                      : "bg-white border text-gray-800"
                  }`}
                >
                  <div className="text-xs font-medium mb-1 opacity-75">
                    {msg.from}
                  </div>
                  <div>
                    {isDeletedForMe ? (
                      <span className="italic text-gray-400">
                        This message was deleted
                      </span>
                    ) : (
                      msg.content
                    )}
                  </div>
                  <div className="text-xs opacity-75 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="flex items-center mt-1 space-x-2">
                  {/* TEMP: Show Like/Delete for all messages, not just valid ObjectId */}
                  {!isDeletedForMe && (
                    <button
                      className={`text-xs flex items-center space-x-1 border-2 ${
                        msg.likes?.includes(currentUser.name)
                          ? "text-red-500 border-red-500"
                          : "text-blue-500 border-blue-500"
                      } hover:underline`}
                      style={{
                        borderStyle: "dashed",
                        borderRadius: "4px",
                        padding: "2px 6px",
                        background: msg.likes?.includes(currentUser.name)
                          ? "#ffe6e6"
                          : "#f0f8ff",
                      }}
                      onClick={() => handleLike(String(msg._id))}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill={
                          msg.likes?.includes(currentUser.name)
                            ? "currentColor"
                            : "none"
                        }
                        viewBox="0 0 20 20"
                        stroke="currentColor"
                        strokeWidth={
                          msg.likes?.includes(currentUser.name) ? "0" : "2"
                        }
                        style={{
                          color: msg.likes?.includes(currentUser.name)
                            ? "#ef4444"
                            : "#3b82f6",
                          transition: "color 0.2s",
                        }}
                      >
                        <path
                          fillRule="evenodd"
                          d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>Like ({msg.likes?.length || 0})</span>
                    </button>
                  )}
                  {!isDeletedForMe && (
                    <button
                      className="text-xs text-red-500 hover:underline flex items-center space-x-1"
                      onClick={() => handleDelete(String(msg._id))}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
              {msg.from === currentUser.name && (
                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-base ml-2">
                  {currentUser.name[0].toUpperCase()}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendGroupMessage} className="p-4 border-t flex">
        <input
          className="flex-1 border rounded p-2 mr-2"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a group message..."
          disabled={!group?.members?.includes(currentUser.name)}
        />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded"
          type="submit"
          disabled={!group?.members?.includes(currentUser.name)}
        >
          Send
        </button>
      </form>
      <div className="p-2 border-t bg-gray-100 text-xs">
        <div className="font-bold mb-1">Group Events</div>
        <div className="h-16 overflow-y-auto">
          {eventLog.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      </div>
      {/* Admin Actions */}
      {isCurrentUserAdmin && (
        <div className="p-2 border-t bg-gray-50">
          <div className="font-bold mb-1">Admin Actions</div>
          <div className="flex flex-wrap gap-2 mb-2">
            {/* Add Member */}
            <button
              className="bg-green-200 px-2 py-1 rounded"
              onClick={() => {
                const user = prompt("Enter username to add:");
                if (user && !group.members.includes(user)) {
                  sendMessage({
                    type: "add_member",
                    groupId: group.id,
                    by: currentUser.name,
                    userId: user,
                  });
                }
              }}
            >
              Add Member
            </button>
            {/* Promote to Admin & Remove Member */}
            {group.members
              .filter((u) => u !== currentUser.name)
              .map((u) => (
                <span key={u} className="flex items-center gap-1">
                  {/* Promote to Admin: only for non-admins */}
                  {!group.admins.includes(u) && (
                    <button
                      className="bg-yellow-200 px-2 py-1 rounded"
                      onClick={() =>
                        sendMessage({
                          type: "promote_admin",
                          groupId: group.id,
                          by: currentUser.name,
                          userId: u,
                        })
                      }
                    >
                      Promote {u} to Admin
                    </button>
                  )}
                  {/* Remove: for all except self */}
                  <button
                    className="bg-red-200 px-2 py-1 rounded"
                    onClick={() =>
                      sendMessage({
                        type: "remove_member",
                        groupId: group.id,
                        by: currentUser.name,
                        userId: u,
                      })
                    }
                  >
                    Remove {u}
                  </button>
                </span>
              ))}
          </div>
        </div>
      )}
      {/* Exit Group - only show once, for all members */}
      {group?.members?.includes(currentUser.name) && (
        <div className="p-2 border-t bg-gray-50">
          <button
            className="bg-red-200 px-2 py-1 rounded"
            onClick={handleExitGroup}
          >
            Exit Group
          </button>
        </div>
      )}
    </div>
  );
};

export default GroupChat;
