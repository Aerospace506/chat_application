import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useWebSocket } from "../context/WebSocketContext";
import authFetch from "../utils/authFetch";

const Chat = ({ selectedUser }) => {
  const { user, token } = useAuth();
  const { sendMessage, subscribe, onlineUsers } = useWebSocket();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [forceRerender, setForceRerender] = useState(0);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Clear input field and messages when switching users
  useEffect(() => {
    setNewMessage(""); // Clear input field when changing chat partner

    if (!user || !selectedUser || !token) {
      setMessages([]);
      return;
    }

    // Load previous messages
    authFetch(
      `http://localhost:8000/api/messages/${user.username}/${selectedUser.name}`,
      token
    )
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        console.log("Loaded messages:", data);
        // Normalize message IDs
        const normalizedMessages = data.map((msg) => ({
          ...msg,
          _id: msg._id || msg.id || `optimistic-${Date.now()}`,
        }));
        setMessages(normalizedMessages);
      })
      .catch((error) => {
        console.error("Error loading messages:", error);
        setMessages([]);
      });
  }, [user, selectedUser, token]);

  useEffect(() => {
    if (!user) return;
    // Subscribe to messages and status updates
    const unsubscribe = subscribe((data) => {
      if (data.type === "status") {
        // Handle status update
      } else if (data.type === "initial_status") {
        // Handle initial status update
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
          if (!found && user && selectedUser && token) {
            authFetch(
              `http://localhost:8000/api/messages/${user.username}/${selectedUser.name}`,
              token
            )
              .then((res) => (res.ok ? res.json() : []))
              .then((msgs) => setMessages(Array.isArray(msgs) ? msgs : []));
          }
          return updated;
        });
        setForceRerender((v) => v + 1);
      } else if (data.type === "delete_update") {
        setMessages((prev) => {
          if (data.deleted_by.includes("*")) {
            // Remove message completely if deleted by sender
            return prev.filter((msg) => msg._id !== data.message_id);
          } else {
            // Update deleted_by array and likes for personal deletion
            return prev.map((msg) =>
              msg._id === data.message_id
                ? {
                    ...msg,
                    deleted_by: data.deleted_by,
                    likes: data.likes || msg.likes,
                  }
                : msg
            );
          }
        });
      } else if (data.type === "message") {
        // Debug log for real-time message delivery
        const loggedInUser = user.username.trim().toLowerCase();
        const selected = selectedUser?.name.trim().toLowerCase();
        const msgSender = data.sender_id?.trim().toLowerCase();
        const msgReceiver = data.receiver_id?.trim().toLowerCase();
        // Remove any optimistic message with same sender, receiver, and content
        setMessages((prev) => {
          let filtered = prev.filter(
            (msg) =>
              !msg._id?.startsWith("optimistic-") ||
              msg.sender_id !== data.sender_id ||
              msg.receiver_id !== data.receiver_id ||
              msg.content !== data.content
          );
          // Only add the message if it's relevant to the current chat and not already present
          const exists = filtered.some((msg) => msg._id === data._id);
          if (
            ((msgSender === loggedInUser && msgReceiver === selected) ||
              (msgSender === selected && msgReceiver === loggedInUser)) &&
            !exists
          ) {
            return [...filtered, data];
          }
          return filtered;
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [user, selectedUser, token, subscribe]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !user) return;
    const sender = user.username.trim().toLowerCase();
    const receiver = selectedUser.name.trim().toLowerCase();
    const messageData = {
      type: "message",
      sender_id: sender,
      receiver_id: receiver,
      content: newMessage.trim(),
      timestamp: new Date().toISOString(),
      likes: [],
      deleted_by: [],
    };
    setNewMessage("");
    // Optimistically add the message to the chat
    const optimisticId = `optimistic-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        ...messageData,
        _id: optimisticId,
      },
    ]);
    sendMessage(messageData);
  };

  const handleLike = (messageId) => {
    if (!messageId) {
      console.error("No message ID provided for like");
      return;
    }
    // Don't try to like optimistic messages
    if (messageId.startsWith("optimistic-")) {
      console.log("Skipping like for optimistic message");
      return;
    }
    sendMessage({
      type: "like",
      message_id: String(messageId),
      is_group: false,
    });
  };

  const handleDelete = (messageId) => {
    if (!messageId) {
      console.error("No message ID provided for deletion");
      return;
    }
    // Don't try to delete optimistic messages
    if (messageId.startsWith("optimistic-")) {
      console.log("Skipping delete for optimistic message");
      return;
    }
    sendMessage({
      type: "delete",
      message_id: String(messageId),
      is_group: false,
    });
  };

  // Defensive render: if no user or no selected user, show prompt and return early
  if (!user || !selectedUser) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Select a user to start chatting
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center">
          <div className="font-semibold">{selectedUser.name}</div>
          <div
            className={`ml-2 w-3 h-3 rounded-full ${
              onlineUsers.has(selectedUser.name)
                ? "bg-green-500 animate-pulse"
                : "bg-gray-300"
            }`}
            title={onlineUsers.has(selectedUser.name) ? "Online" : "Offline"}
          ></div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Deduplicate messages before rendering */}
        {(() => {
          const dedupedMessages = [];
          const seen = new Set();
          for (const msg of messages) {
            console.log("Processing message:", msg); // Debug log
            // Use sender_id, receiver_id, content, and timestamp rounded to nearest second as key
            const roundedTime = new Date(msg.timestamp);
            roundedTime.setMilliseconds(0);
            const key = [
              msg.sender_id,
              msg.receiver_id,
              msg.content,
              roundedTime.toISOString(),
            ].join("|");
            if (!seen.has(key)) {
              seen.add(key);
              dedupedMessages.push(msg);
            }
          }
          return dedupedMessages.map((message, index) => {
            console.log("Rendering message:", message); // Debug log
            const prevMessage = index > 0 ? dedupedMessages[index - 1] : null;
            const nextMessage =
              index < dedupedMessages.length - 1
                ? dedupedMessages[index + 1]
                : null;

            // Check if this message starts a new group
            const isFirstInGroup =
              !prevMessage || prevMessage.sender_id !== message.sender_id;
            // Check if this message ends a group
            const isLastInGroup =
              !nextMessage || nextMessage.sender_id !== message.sender_id;

            const isDeletedForMe =
              message.deleted_by?.includes("*") ||
              message.deleted_by?.includes(user.username);

            return (
              <div
                key={message._id || message.id || index}
                className={`flex items-end mb-2 ${
                  message.sender_id === user.username
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                {message.sender_id !== user.username && (
                  <div className="w-8 h-8 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-base mr-2">
                    {message.sender_id[0].toUpperCase()}
                  </div>
                )}
                <div className="relative max-w-[70%]">
                  <div
                    className={`rounded-lg p-3 shadow-sm ${
                      message.sender_id === user.username
                        ? "bg-blue-500 text-white"
                        : "bg-white border text-gray-800"
                    }`}
                  >
                    {message.sender_id !== user.username && (
                      <div className="text-xs font-medium mb-1 opacity-75">
                        {selectedUser.name}
                      </div>
                    )}
                    <div>
                      {isDeletedForMe ? (
                        <span className="italic text-gray-400">
                          This message was deleted
                        </span>
                      ) : (
                        message.content
                      )}
                    </div>
                    <div className="text-xs opacity-75 mt-1">
                      {new Date(message.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="flex items-center mt-1 space-x-2">
                    {!isDeletedForMe && (
                      <button
                        className={`text-xs flex items-center space-x-1 border-2 ${
                          message.likes?.includes(user.username)
                            ? "text-red-500 border-red-500"
                            : "text-blue-500 border-blue-500"
                        } hover:underline`}
                        style={{
                          borderStyle: "dashed",
                          borderRadius: "4px",
                          padding: "2px 6px",
                          background: message.likes?.includes(user.username)
                            ? "#ffe6e6"
                            : "#f0f8ff",
                        }}
                        onClick={() => handleLike(message._id)}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-4 w-4"
                          fill={
                            message.likes?.includes(user.username)
                              ? "currentColor"
                              : "none"
                          }
                          viewBox="0 0 20 20"
                          stroke="currentColor"
                          strokeWidth={
                            message.likes?.includes(user.username) ? "0" : "2"
                          }
                          style={{
                            color: message.likes?.includes(user.username)
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
                        <span>Like ({message.likes?.length || 0})</span>
                      </button>
                    )}
                    {!isDeletedForMe && (
                      <button
                        className="text-xs text-red-500 hover:underline flex items-center space-x-1"
                        onClick={() => handleDelete(message._id)}
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
                {message.sender_id === user.username && (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-base ml-2">
                    {user.username[0].toUpperCase()}
                  </div>
                )}
              </div>
            );
          });
        })()}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="p-4 border-t flex">
        <input
          className="flex-1 border rounded p-2 mr-2"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
        />
        <button
          className="bg-blue-500 text-white px-4 py-2 rounded"
          type="submit"
        >
          Send
        </button>
      </form>
    </div>
  );
};

export default Chat;
