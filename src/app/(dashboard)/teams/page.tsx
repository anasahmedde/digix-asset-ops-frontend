"use client";

import { Pencil, Plus, RotateCcw, Users, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { useUser } from "@/lib/user-context";

interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  phone: string;
  is_field_staff: boolean;
  is_active: boolean;
  date_joined: string;
}

const ROLES = [
  { value: "super_admin", label: "Super Admin" },
  { value: "ops_manager", label: "Operations Manager" },
  { value: "technician", label: "Technician" },
  { value: "finance", label: "Finance" },
  { value: "warehouse", label: "Warehouse Staff" },
  { value: "client_viewer", label: "Client Viewer" },
];

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";
const btnSecondary =
  "inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";
const btnPrimary =
  "inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-foreground transition-all disabled:opacity-50";

export default function TeamsPage() {
  const { canWrite } = useUser();
  const isAdmin = canWrite("users");
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "password" | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ role: "", status: "" });
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const { data } = await api.get("/accounts/users/");
      setUsers(data.results);
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  function openCreate() {
    setSelected(null);
    setModalMode("create");
  }

  function openEdit(user: User) {
    setSelected(user);
    setModalMode("edit");
  }

  function openResetPassword(user: User) {
    setSelected(user);
    setModalMode("password");
  }

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/accounts/users/", {
        username: fd.get("username"),
        email: fd.get("email"),
        password: fd.get("password"),
        first_name: fd.get("first_name"),
        last_name: fd.get("last_name"),
        role: fd.get("role"),
        phone: fd.get("phone"),
        is_field_staff: fd.get("is_field_staff") === "on",
      });
      toast.success("User created successfully");
      closeModal();
      fetchUsers();
    } catch (err: unknown) {
      const resp = err && typeof err === "object" && "response" in err
        ? (err as { response?: { status?: number; data?: { detail?: string } } }).response
        : undefined;
      if (resp?.status === 403) {
        toast.error("You do not have permission to create users.");
      } else {
        toast.error(resp?.data?.detail || "Failed to create user. Check if username/email already exists.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.patch(`/accounts/users/${selected.id}/`, {
        first_name: fd.get("first_name"),
        last_name: fd.get("last_name"),
        email: fd.get("email"),
        role: fd.get("role"),
        phone: fd.get("phone"),
        is_field_staff: fd.get("is_field_staff") === "on",
      });
      toast.success("User updated successfully");
      closeModal();
      fetchUsers();
    } catch (err: unknown) {
      const resp = err && typeof err === "object" && "response" in err
        ? (err as { response?: { status?: number; data?: { detail?: string } } }).response
        : undefined;
      toast.error(resp?.status === 403 ? "You do not have permission to edit users." : (resp?.data?.detail || "Failed to update user"));
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const pw = fd.get("new_password") as string;
    const confirm = fd.get("confirm_password") as string;
    if (pw !== confirm) {
      toast.error("Passwords do not match");
      setSaving(false);
      return;
    }
    try {
      await api.post(`/accounts/users/${selected.id}/reset-password/`, { new_password: pw });
      toast.success(`Password reset for ${selected.username}`);
      closeModal();
    } catch {
      toast.error("Failed to reset password");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(user: User) {
    try {
      await api.patch(`/accounts/users/${user.id}/`, { is_active: !user.is_active });
      toast.success(`User ${user.is_active ? "deactivated" : "activated"}`);
      fetchUsers();
    } catch {
      toast.error("Failed to update user");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500">
            <Users className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Team Management</h1>
            <p className="text-muted-foreground">Manage users and their roles</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
            <Plus className="h-4 w-4" />
            Add User
          </button>
        )}
      </div>

      <FilterBar
        filters={[
          { key: "role", label: "Role", options: ROLES.map((r) => ({ value: r.value, label: r.label })) },
          { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, username, email..."
      />

      {(() => {
        const filtered = users.filter((u) => {
          if (filterValues.role && u.role !== filterValues.role) return false;
          if (filterValues.status === "active" && !u.is_active) return false;
          if (filterValues.status === "inactive" && u.is_active) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!(u.full_name || "").toLowerCase().includes(q) && !u.username.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <th className={thClass}>Name</th>
                <th className={thClass}>Username</th>
                <th className={thClass}>Email</th>
                <th className={thClass}>Role</th>
                <th className={thClass}>Field Staff</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">{users.length > 0 ? "No users match your filters" : "No users found"}</td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id} onClick={() => openEdit(user)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-medium text-foreground`}>{user.full_name || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{user.username}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{user.email}</td>
                    <td className={tdClass}>
                      <span className="inline-flex rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs font-medium capitalize text-primary ring-1 ring-teal-500/20">
                        {user.role.replace("_", " ")}
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{user.is_field_staff ? "Yes" : "No"}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${user.is_active ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" : "bg-red-500/10 text-red-400 ring-red-500/20"}`}>
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {isAdmin ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(user)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit user">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => openResetPassword(user)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-amber-400" title="Reset password">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => toggleActive(user)} className={`text-xs font-medium transition-colors ${user.is_active ? "text-red-400/70 hover:text-red-400" : "text-emerald-400/70 hover:text-emerald-400"}`}>
                            {user.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      );
      })()}

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {modalMode === "create" && "Add New User"}
                {modalMode === "edit" && "Edit User"}
                {modalMode === "password" && `Reset Password — ${selected?.username}`}
              </h2>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalMode === "password" ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="new_password" className={labelClass}>New Password</label>
                  <input id="new_password" name="new_password" type="password" required minLength={8} className={inputClass} placeholder="Min 8 characters" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="confirm_password" className={labelClass}>Confirm Password</label>
                  <input id="confirm_password" name="confirm_password" type="password" required minLength={8} className={inputClass} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeModal} className={btnSecondary}>Cancel</button>
                  <button type="submit" disabled={saving} className={btnPrimary}>{saving ? "Resetting..." : "Reset Password"}</button>
                </div>
              </form>
            ) : (
              <form onSubmit={modalMode === "create" ? handleCreate : handleEdit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="first_name" className={labelClass}>First Name</label>
                    <input id="first_name" name="first_name" required defaultValue={selected?.first_name ?? ""} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="last_name" className={labelClass}>Last Name</label>
                    <input id="last_name" name="last_name" required defaultValue={selected?.last_name ?? ""} className={inputClass} />
                  </div>
                </div>

                {modalMode === "create" && (
                  <div className="space-y-1.5">
                    <label htmlFor="username" className={labelClass}>Username</label>
                    <input id="username" name="username" required className={inputClass} />
                  </div>
                )}
                {modalMode === "edit" && (
                  <div className="space-y-1.5">
                    <label className={labelClass}>Username</label>
                    <input type="text" value={selected?.username ?? ""} disabled className="flex h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-muted-foreground" />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className={labelClass}>Email</label>
                  <input id="email" name="email" type="email" required defaultValue={selected?.email ?? ""} className={inputClass} />
                </div>

                {modalMode === "create" && (
                  <div className="space-y-1.5">
                    <label htmlFor="password" className={labelClass}>Password</label>
                    <input id="password" name="password" type="password" required minLength={8} className={inputClass} />
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="role" className={labelClass}>Role</label>
                    <select id="role" name="role" required defaultValue={selected?.role ?? "technician"} className={inputClass}>
                      {ROLES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="phone" className={labelClass}>Phone</label>
                    <input id="phone" name="phone" type="tel" defaultValue={selected?.phone ?? ""} className={inputClass} />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input id="is_field_staff" name="is_field_staff" type="checkbox" defaultChecked={selected?.is_field_staff ?? false} className="h-4 w-4 rounded border-border bg-card accent-teal-500" />
                  <label htmlFor="is_field_staff" className="text-sm text-muted-foreground">Field Staff (mobile app access)</label>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeModal} className={btnSecondary}>Cancel</button>
                  <button type="submit" disabled={saving} className={btnPrimary}>{saving ? "Saving..." : modalMode === "create" ? "Create User" : "Save Changes"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
