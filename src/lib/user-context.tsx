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
  /** The role as the Roles & Rights screen names it (custom roles included). */
  role_label?: string;
  phone: string;
  avatar: string | null;
  is_field_staff: boolean;
  /** Everything this person may do, after their role's defaults are adjusted. */
  capabilities?: string[];
}

interface UserContextValue {
  user: UserInfo | null;
  loading: boolean;
  refresh: () => void;
  /** Holds this capability. The one question every button should ask. */
  can: (capability: string) => boolean;
  /** Holds any of these. */
  canAny: (...capabilities: string[]) => boolean;
  /** Older screens ask by module; each module names the capability it means. */
  canWrite: (module: string) => boolean;
  canDelete: (module: string) => boolean;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  refresh: () => {},
  can: () => false,
  canAny: () => false,
  canWrite: () => false,
  canDelete: () => false,
});

/** What "writing" a module means on the server. Rights are editable per role
 *  and per person, so the role lists that used to sit here were a second copy
 *  of the rules that drifted; the capability is the only rule now. */
const MODULE_CAPABILITY: Record<string, string[]> = {
  users: ["manage_team"],
  teams: ["manage_team"],
  setup: ["manage_setup"],
  devices: ["edit_assets"],
  sites: ["manage_sites"],
  tickets: ["work_tickets", "raise_ticket", "assign_ticket"],
  warranties: ["manage_warranties"],
  maintenance: ["manage_maintenance", "assign_maintenance", "work_maintenance"],
  inventory: ["manage_stock", "receive_goods", "issue_stock", "inspect_goods"],
  suppliers: ["manage_suppliers"],
  clients: ["manage_clients"],
  procurement: ["raise_po"],
  quotations: ["manage_quotations"],
  finance: ["manage_finance"],
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

  const can = useCallback(
    (capability: string): boolean => user?.capabilities?.includes(capability) ?? false,
    [user],
  );
  const canAny = useCallback(
    (...capabilities: string[]): boolean => capabilities.some(can),
    [can],
  );
  const canWrite = useCallback(
    (module: string): boolean => canAny(...(MODULE_CAPABILITY[module] ?? [])),
    [canAny],
  );
  // Removing a record is its own right, on top of being able to work on it.
  const canDelete = useCallback(
    (module: string): boolean => canWrite(module) && can("delete_records"),
    [canWrite, can],
  );

  return (
    <UserContext.Provider value={{ user, loading, refresh: fetchUser, can, canAny, canWrite, canDelete }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
