import { createContext, useContext, useState, useEffect } from "react";
import { useUser } from "./UserContext";
import { useAuth } from "./AuthContext";
import authFetch from "../utils/authFetch";

const GroupContext = createContext();

export const GroupProvider = ({ children }) => {
  const { currentUser } = useUser();
  const { token } = useAuth();
  const [groups, setGroups] = useState([]);

  // Fetch groups from backend when user logs in or reconnects
  useEffect(() => {
    if (!token) {
      setGroups([]);
      return;
    }
    authFetch(`http://localhost:8000/api/groups/me`, token)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setGroups(Array.isArray(data) ? data : []))
      .catch(() => setGroups([]));
  }, [token]);

  const addMember = (groupId, userId) => {
    setGroups((prevGroups) =>
      prevGroups.map((group) => {
        if (group.id === groupId && !group.blockedUsers.includes(userId)) {
          return {
            ...group,
            members: [...new Set([...group.members, userId])],
          };
        }
        return group;
      })
    );
  };

  const removeMember = (groupId, userId) => {
    setGroups((prevGroups) =>
      prevGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            members: group.members.filter((id) => id !== userId),
            admins: group.admins.filter((id) => id !== userId),
          };
        }
        return group;
      })
    );
  };

  const promoteToAdmin = (groupId, userId) => {
    setGroups((prevGroups) =>
      prevGroups.map((group) => {
        if (group.id === groupId && group.members.includes(userId)) {
          return {
            ...group,
            admins: [...new Set([...group.admins, userId])],
          };
        }
        return group;
      })
    );
  };

  const demoteFromAdmin = (groupId, userId) => {
    setGroups((prevGroups) =>
      prevGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            admins: group.admins.filter((id) => id !== userId),
          };
        }
        return group;
      })
    );
  };

  const kickUser = (groupId, userId) => {
    setGroups((prevGroups) =>
      prevGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            members: group.members.filter((id) => id !== userId),
            admins: group.admins.filter((id) => id !== userId),
            blockedUsers: [...new Set([...group.blockedUsers, userId])],
          };
        }
        return group;
      })
    );
  };

  const leaveGroup = (groupId, userId) => {
    removeMember(groupId, userId);
  };

  const isAdmin = (groupId, userId) => {
    const group = groups.find((g) => g.id === groupId);
    return group?.admins.includes(userId) || false;
  };

  const isMember = (groupId, userId) => {
    const group = groups.find((g) => g.id === groupId);
    return group?.members.includes(userId) || false;
  };

  const isBlocked = (groupId, userId) => {
    const group = groups.find((g) => g.id === groupId);
    return group?.blockedUsers.includes(userId) || false;
  };

  const getGroupById = (groupId) => {
    return groups.find((g) => g.id === groupId);
  };

  const addGroup = (group) => {
    setGroups((prevGroups) => {
      if (prevGroups.some((g) => g.id === group.id)) return prevGroups;
      return [...prevGroups, group];
    });
  };

  const addAllGroups = (groupsArray) => {
    setGroups(groupsArray);
  };

  const value = {
    groups,
    addGroup,
    addAllGroups,
    addMember,
    removeMember,
    promoteToAdmin,
    demoteFromAdmin,
    kickUser,
    leaveGroup,
    isAdmin,
    isMember,
    isBlocked,
    getGroupById,
  };

  return (
    <GroupContext.Provider value={value}>{children}</GroupContext.Provider>
  );
};

export const useGroup = () => {
  const context = useContext(GroupContext);
  if (!context) {
    throw new Error("useGroup must be used within a GroupProvider");
  }
  return context;
};
