// Simple WebSocket manager to prevent multiple connections
class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Set();
    this.userId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = 3000; // 3 seconds
    this.isConnecting = false;
  }

  connect(userId) {
    // Prevent multiple connection attempts
    if (this.isConnecting) {
      console.log("Connection attempt already in progress");
      return;
    }

    // If already connected with the same user ID, don't reconnect
    if (
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      this.userId === userId
    ) {
      console.log("Already connected with this user ID");
      return;
    }

    // If there's an existing connection, close it first
    if (this.ws) {
      this.disconnect();
    }

    this.isConnecting = true;
    this.userId = userId;
    const backendURL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
const wsProtocol = backendURL.startsWith("https") ? "wss" : "ws";
this.ws = new WebSocket(`${wsProtocol}://${backendURL.replace(/^https?:\/\//, "")}/api/ws/${userId}`);

    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.reconnectAttempts = 0;
      this.isConnecting = false;
    };

    this.ws.onclose = () => {
      console.log("WebSocket disconnected");
      this.ws = null;
      this.isConnecting = false;

      // Attempt to reconnect
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++;
        setTimeout(() => this.connect(userId), this.reconnectTimeout);
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      this.isConnecting = false;
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Handle group-specific messages
      if (data.type === "group_message") {
        // Validate sender is in group and not blocked
        this.listeners.forEach((listener) => listener(data));
      } else if (data.type === "group_admin_action") {
        // Handle admin actions (add/remove members, promote/demote admins)
        this.listeners.forEach((listener) => listener(data));
      } else if (data.type === "group_leave") {
        // Handle member leaving group
        this.listeners.forEach((listener) => listener(data));
      } else {
        // Handle regular messages and status updates
        this.listeners.forEach((listener) => listener(data));
      }
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  sendMessage(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.error("WebSocket is not connected");
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.listeners.clear();
    this.userId = null;
    this.reconnectAttempts = 0;
    this.isConnecting = false;
  }
}

// Create a single instance to share across components
export const wsService = new WebSocketService();
