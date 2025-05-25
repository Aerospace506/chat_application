import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";

const WebSocketContext = createContext();

export const WebSocketProvider = ({ children }) => {
  const { user, token } = useAuth();
  const [ws, setWs] = useState(null);
  const subscribers = useRef([]);
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  // Open WebSocket when user logs in
  useEffect(() => {
    if (!user || !user.username || !token) return;
    const normUsername = user.username.trim().toLowerCase();
    const socket = new window.WebSocket(
      `ws://localhost:8000/ws/${normUsername}?token=${token}`
    );
    setWs(socket);

    socket.onopen = () => {
      // Optionally notify subscribers
    };
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Centralize online user state
      if (data.type === "status") {
        setOnlineUsers((prev) => {
          const newSet = new Set(prev);
          if (data.status === "online") {
            newSet.add(data.user_id);
          } else {
            newSet.delete(data.user_id);
          }
          return newSet;
        });
      } else if (data.type === "initial_status") {
        setOnlineUsers(new Set(data.online_users));
      }
      subscribers.current.forEach((cb) => cb(data));
    };
    socket.onclose = () => {
      setWs(null);
    };
    socket.onerror = () => {
      setWs(null);
    };
    return () => {
      socket.close();
    };
  }, [user, token]);

  // Subscribe to messages
  const subscribe = (cb) => {
    subscribers.current.push(cb);
    return () => {
      subscribers.current = subscribers.current.filter((fn) => fn !== cb);
    };
  };

  // Send a message if WebSocket is open
  const sendMessage = (msg) => {
    if (ws && ws.readyState === 1) {
      ws.send(typeof msg === "string" ? msg : JSON.stringify(msg));
    } else {
      // Optionally handle not connected
      // console.warn("WebSocket not connected");
    }
  };

  // Manual disconnect for logout
  const disconnectWebSocket = () => {
    if (ws) {
      ws.close();
      setWs(null);
    }
  };

  return (
    <WebSocketContext.Provider
      value={{ ws, sendMessage, subscribe, onlineUsers, disconnectWebSocket }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context)
    throw new Error("useWebSocket must be used within a WebSocketProvider");
  return context;
};
