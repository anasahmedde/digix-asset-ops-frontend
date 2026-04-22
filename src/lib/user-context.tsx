"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import api from "./api";

export interface UserInfo {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  phone: string;
  avatar: string | null;
  is_field_staff: boolean;
}

interface UserContextValue {
  user: UserInfo | null;
  loading: boolean;
  refresh: () => void;
  canWrite: (module: string) => boolean;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  refresh: () => {},
  canWrite: () => false,
});

const WRITE_RULES: Record<string, string[]> = {
  users: ["super_admin"],
  devices: ["super_admin", "ops_manager"],
  sites: ["super_admin", "ops_manager"],
  tickets: ["super_admin", "ops_manager", "technician"],
  teams: ["super_admin"],
  warranties: ["super_admin", "ops_manager"],
  maintenance: ["super_admin", "ops_manager", "technician"],
  inventory: ["super_admin", "ops_manager", "warehouse"],
  suppliers: ["super_admin", "ops_manager"],
  clients: ["super_admin", "ops_manager"],
  procurement: ["super_admin", "ops_manager", "finance"],
  finance: ["super_admin", "ops_manager", "finance"],
};

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const { data } = await api.get<UserInfo>("/accounts/users/me/");
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const canWrite = useCallback(
    (module: string): boolean => {
      if (!user) return false;
      const allowed = WRITE_RULES[module];
      if (!allowed) return false;
      return allowed.includes(user.role);
    },
    [user]
  );

  return (
    <UserContext.Provider value={{ user, loading, refresh: fetchUser, canWrite }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
