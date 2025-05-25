import { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const { user } = useAuth();
  const [currentUser, setCurrentUser] = useState(null);

  // Sync with AuthContext
  useEffect(() => {
    if (user && user.username) {
      setCurrentUser({ name: user.username });
    } else {
      setCurrentUser(null);
    }
  }, [user]);

  return (
    <UserContext.Provider value={{ currentUser, setCurrentUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};
