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
  /** Everything this person may do, after their role's defaults are adjusted. */
  capabilities?: string[];
}

interface UserContextValue {
  user: UserInfo | null;
  loading: boolean;
  refresh: () => void;
  canWrite: (module: string) => boolean;
  canDelete: (module: string) => boolean;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  loading: true,
  refresh: () => {},
  canWrite: () => false,
  canDelete: () => false,
});

/** Removing a record is not the same as working on one.
 *
 * A technician edits a ticket and a round; deleting either is Operations'.
 * The screens asked canWrite for both, so they drew a trash icon that the
 * API then refused — which reads as a broken app, not as a rule. */
const DELETE_ROLES = ["super_admin", "group_head", "ops_manager", "marketing_head"];

/** What the server actually asks for, where a module maps onto one capability.
 *
 * The role list below was a second copy of the rules, and the copies drifted:
 * the Group Head could approve a purchase order but was never shown the
 * button. Rights are editable per person now, so a fixed role list cannot
 * be right for long — the capability is the answer, and the list is only
 * the fallback for a session that predates it.
 */
const MODULE_CAPABILITY: Record<string, string> = {
  users: "manage_team",
  teams: "manage_team",
  setup: "manage_setup",
  devices: "edit_assets",
  tickets: "work_tickets",
  warranties: "manage_warranties",
  maintenance: "manage_maintenance",
  inventory: "issue_stock",
  suppliers: "manage_suppliers",
  procurement: "raise_po",
  quotations: "manage_quotations",
  finance: "view_prices",
};

const WRITE_RULES: Record<string, string[]> = {
  users: ["super_admin"],
  setup: ["super_admin", "group_head", "ops_manager", "marketing_head"],
  devices: ["super_admin", "group_head", "ops_manager"],
  sites: ["super_admin", "group_head", "ops_manager", "marketing_head", "marketing"],
  tickets: ["super_admin", "group_head", "ops_manager", "supervisor", "technician", "marketing", "marketing_head"],
  teams: ["super_admin"],
  warranties: ["super_admin", "group_head", "ops_manager", "marketing_head"],
  maintenance: ["super_admin", "group_head", "ops_manager", "supervisor", "technician"],
  inventory: ["super_admin", "group_head", "ops_manager", "warehouse"],
  suppliers: ["super_admin", "group_head", "ops_manager"],
  clients: ["super_admin", "group_head", "ops_manager", "marketing_head"],
  procurement: ["super_admin", "group_head", "ops_manager", "finance"],
  quotations: ["super_admin", "group_head", "ops_manager", "marketing_head"],
  finance: ["super_admin", "group_head", "ops_manager", "finance"],
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
      const needed = MODULE_CAPABILITY[module];
      if (needed && user.capabilities?.includes(needed)) return true;
      const allowed = WRITE_RULES[module];
      if (!allowed) return false;
      return allowed.includes(user.role);
    },
    [user]
  );

  const canDelete = useCallback(
    (module: string): boolean =>
      canWrite(module) && DELETE_ROLES.includes(user?.role ?? ""),
    [canWrite, user]
  );

  return (
    <UserContext.Provider value={{ user, loading, refresh: fetchUser, canWrite, canDelete }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
