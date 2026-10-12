"use client";

import { KeyRound, Pencil, Plus, Power, RotateCcw, ShieldCheck, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Organogram } from "@/components/teams/organogram";
import { PermissionsDialog } from "@/components/teams/permissions-dialog";
import { RolesMatrix } from "@/components/teams/roles-matrix";
import { Modal } from "@/components/ui/modal";
import { FilterBar } from "@/components/ui/filter-bar";
import { Tabs } from "@/components/ui/tabs";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import { confirmAction } from "@/components/ui/confirm";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { formatDate } from "@/lib/utils";

interface User {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: string;
  role_label?: string;
  job_title?: string;
  phone: string;
  is_field_staff: boolean;
  is_active: boolean;
  date_joined: string;
  /** When the login was last used; never, for an account nobody has opened. */
  last_login?: string | null;
  employee_id?: string;
  cnic?: string;
  join_date?: string | null;
  leaving_date?: string | null;
  /** Who this person answers to — the line the organogram draws. */
  reports_to?: string | null;
  reports_to_name?: string | null;
  direct_report_count?: number;
}

const CNIC_RE = /^\d{5}-\d{7}-\d$/;

function hasLeft(user: User): boolean {
  return !!user.leaving_date && new Date(user.leaving_date).getTime() < Date.now();
}

/** The roles as Roles & Rights defines them — fetched, so a role written
 *  there is offered here the moment it exists. */
interface RoleOption { key: string; label: string; is_active: boolean }

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
  const { user: me, can } = useUser();
  // Editing people (role, title, reporting line) and administering logins
  // (add, remove, reset a password) are two rights; the matrix keeps the
  // second with the Super Admin.
  const isAdmin = can("manage_team");
  const managesLogins = can("manage_logins");
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const sort = useSortState();
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | "password" | "login" | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ role: "", status: "" });
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("people");
  // Whose rights are being looked at, if anyone's.
  const [permissionsFor, setPermissionsFor] = useState<User | null>(null);
  const [cnicInvalid, setCnicInvalid] = useState(false);

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
    api.get("/accounts/roles/", { params: { page_size: 100 } })
      .then((r) => setRoles(r.data.results ?? r.data))
      .catch(() => {});
  }, [fetchUsers]);
  const ROLES = roles.filter((r) => r.is_active).map((r) => ({ value: r.key, label: r.label }));
  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.label ?? key.replace(/_/g, " ");

  function openCreate() {
    setSelected(null);
    setCnicInvalid(false);
    setModalMode("create");
  }

  function openEdit(user: User) {
    setSelected(user);
    setCnicInvalid(user.cnic ? !CNIC_RE.test(user.cnic) : false);
    setModalMode("edit");
  }

  function openResetPassword(user: User) {
    setSelected(user);
    setModalMode("password");
  }

  // The login itself: its name, address and role.
  function openLogin(user: User) {
    setSelected(user);
    setModalMode("login");
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.patch(`/accounts/users/${selected.id}/`, {
        username: fd.get("username"),
        email: fd.get("email"),
        role: fd.get("role"),
      });
      toast.success("Account updated");
      closeModal();
      fetchUsers();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Could not update the account"));
    } finally {
      setSaving(false);
    }
  }

  function closeModal() {
    setModalMode(null);
    setSelected(null);
    setCnicInvalid(false);
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
        job_title: fd.get("job_title"),
        reports_to: (fd.get("reports_to") as string) || null,
        phone: fd.get("phone"),
        is_field_staff: fd.get("is_field_staff") === "on",
        employee_id: fd.get("employee_id"),
        cnic: fd.get("cnic"),
        join_date: (fd.get("join_date") as string) || null,
        leaving_date: (fd.get("leaving_date") as string) || null,
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
        job_title: fd.get("job_title"),
        reports_to: (fd.get("reports_to") as string) || null,
        phone: fd.get("phone"),
        is_field_staff: fd.get("is_field_staff") === "on",
        employee_id: fd.get("employee_id"),
        cnic: fd.get("cnic"),
        join_date: (fd.get("join_date") as string) || null,
        leaving_date: (fd.get("leaving_date") as string) || null,
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

  // Removing a login is the Super Admin's, as creating one is. The server
  // refuses it for yourself, for a superuser, and while anybody still reports
  // to the person — the chart is where those reports are moved first.
  async function removeUser(user: User) {
    const who = user.full_name || user.username;
    const ok = await confirmAction(
      `Delete ${who}'s account? Their attendance, chat and project memberships go with it. ` +
      "Tickets and installations they worked on stay, without their name. " +
      "If they have only left, Deactivate keeps everything."
    );
    if (!ok) return;
    try {
      await api.delete(`/accounts/users/${user.id}/`);
      toast.success(`${who} removed`);
      fetchUsers();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Could not remove this account"));
    }
  }

  // Dragging somebody onto a new manager on the chart.
  async function moveReport(personId: string, bossId: string | null) {
    const person = users.find((u) => u.id === personId);
    const boss = bossId ? users.find((u) => u.id === bossId) : null;
    try {
      await api.patch(`/accounts/users/${personId}/`, { reports_to: bossId });
      toast.success(
        boss
          ? `${person?.full_name || person?.username} now reports to ${boss.full_name || boss.username}`
          : `${person?.full_name || person?.username} now reports to nobody`
      );
      await fetchUsers();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Could not change who they report to"));
      throw err;
    }
  }

  async function toggleActive(user: User) {
    const who = user.full_name || user.username;
    if (user.is_active && !(await confirmAction(`Deactivate ${who}'s account? They will not be able to sign in until it is switched back on.`))) return;
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
        {managesLogins && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
            <Plus className="h-4 w-4" />
            Add User
          </button>
        )}
      </div>

      <Tabs
        tabs={[
          { key: "people", label: "Employees", count: users.length },
          { key: "chart", label: "Organogram" },
          { key: "roles", label: "Roles & Rights" },
          // Logins are the Super Admin's: the tab is only there for whoever holds that right.
          ...(managesLogins ? [{ key: "accounts", label: "Accounts", count: users.filter((u) => !u.is_active).length || undefined }] : []),
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "accounts" && managesLogins ? (
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <p className="text-xs text-muted-foreground">
            Every login on the system. Rename it, change its role, reset its password, switch it off
            when somebody leaves, or remove it outright. Only the Administrator sees this.
          </p>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white">
            <Plus className="h-3.5 w-3.5" />
            Add account
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50">
                <SortTh sort={sort} k="username" className={thClass}>Username</SortTh>
                <SortTh sort={sort} k="full_name" className={thClass}>Name</SortTh>
                <SortTh sort={sort} k="email" className={thClass}>Email</SortTh>
                <SortTh sort={sort} k="role" className={thClass}>Role</SortTh>
                <SortTh sort={sort} k="is_active" className={thClass}>Status</SortTh>
                <SortTh sort={sort} k="last_login" className={thClass}>Last sign-in</SortTh>
                <SortTh sort={sort} k="date_joined" className={thClass}>Created</SortTh>
                <th className={thClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortRows(users, sort).map((user) => (
                <tr key={user.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                  <td className={`${tdClass} font-mono text-foreground`}>
                    {user.username}
                    {user.id === me?.id && <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-2xs text-muted-foreground">you</span>}
                  </td>
                  <td className={`${tdClass} text-foreground`}>{user.full_name || "—"}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{user.email || "—"}</td>
                  <td className={tdClass}>
                    <span className="inline-flex rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-teal-500/20">
                      {user.role_label ?? roleLabel(user.role)}
                    </span>
                  </td>
                  <td className={tdClass}>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${user.is_active ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20" : "bg-red-500/10 text-red-600 ring-red-500/20"}`}>
                      {user.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className={`${tdClass} text-muted-foreground`}>{user.last_login ? formatDate(user.last_login) : "Never"}</td>
                  <td className={`${tdClass} text-muted-foreground`}>{formatDate(user.date_joined)}</td>
                  <td className={tdClass}>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openLogin(user)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit login">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => openResetPassword(user)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-amber-500" title="Reset password">
                        <KeyRound className="h-3.5 w-3.5" />
                      </button>
                      {user.id !== me?.id && (
                        <>
                          <button onClick={() => toggleActive(user)} className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary ${user.is_active ? "hover:text-red-500" : "hover:text-emerald-500"}`} title={user.is_active ? "Deactivate account" : "Activate account"}>
                            <Power className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => removeUser(user)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" title="Delete account">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      ) : tab === "roles" ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <RolesMatrix readOnly={!can("manage_permissions")} />
        </div>
      ) : tab === "chart" ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="mb-4 text-xs text-muted-foreground">
            Who reports to whom. A person&apos;s title is their place in the
            organisation; the badge is what the system lets them do.
          </p>
          <Organogram people={users} canEdit={isAdmin} onMove={moveReport} roleLabel={roleLabel} />
        </div>
      ) : (
      <>
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
                <SortTh sort={sort} k="full_name" className={thClass}>Name</SortTh>
                <SortTh sort={sort} k="employee_id" className={thClass}>Employee ID</SortTh>
                <SortTh sort={sort} k="username" className={thClass}>Username</SortTh>
                <SortTh sort={sort} k="email" className={thClass}>Email</SortTh>
                <SortTh sort={sort} k="role" className={thClass}>Role</SortTh>
                <SortTh sort={sort} k="is_field_staff" className={thClass}>Field Staff</SortTh>
                <SortTh sort={sort} k="is_active" className={thClass}>Status</SortTh>
                <th className={thClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                      Loading...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-muted-foreground">{users.length > 0 ? "No users match your filters" : "No users found"}</td>
                </tr>
              ) : (
                sortRows(filtered, sort).map((user) => (
                  <tr key={user.id} onClick={() => isAdmin && openEdit(user)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-medium text-foreground`}>{user.full_name || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{user.employee_id || "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{user.username}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{user.email}</td>
                    <td className={tdClass}>
                      <span className="inline-flex rounded-full bg-teal-500/10 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-teal-500/20">
                        {user.role_label ?? roleLabel(user.role)}
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{user.is_field_staff ? "Yes" : "No"}</td>
                    <td className={tdClass}>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${user.is_active ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20" : "bg-red-500/10 text-red-600 ring-red-500/20"}`}>
                          {user.is_active ? "Active" : "Inactive"}
                        </span>
                        {hasLeft(user) && (
                          <span className="inline-flex rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-400 ring-1 ring-slate-500/20" title={`Left on ${user.leaving_date}`}>
                            Left
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPermissionsFor(user)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                          title={`What ${user.full_name || user.username} may do`}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </button>
                      {isAdmin ? (
                        <>
                          <button onClick={() => openEdit(user)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit user">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          {managesLogins && (
                            <button onClick={() => { setTab("accounts"); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-amber-500" title="Manage login on the Accounts tab">
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </>
                      ) : null}
                      </div>
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
      </>
      )}

      {modalMode && (
        <Modal
          open
          onClose={closeModal}
          title={
            modalMode === "create"
              ? "Add New User"
              : modalMode === "edit"
                ? "Edit User"
                : modalMode === "login"
                  ? `Edit login — ${selected?.username}`
                  : `Reset Password — ${selected?.username}`
          }
          size="md"
        >
            {modalMode === "login" ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="login_username" className={labelClass}>Username</label>
                  <input id="login_username" name="username" required defaultValue={selected?.username ?? ""} className={inputClass} autoComplete="off" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="login_email" className={labelClass}>Email</label>
                  <input id="login_email" name="email" type="email" required defaultValue={selected?.email ?? ""} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="login_role" className={labelClass}>Role</label>
                  <select id="login_role" name="role" required defaultValue={selected?.role ?? "technician"} disabled={selected?.id === me?.id} className={`${inputClass} disabled:bg-secondary disabled:text-muted-foreground`}>
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                    {selected && !ROLES.some((r) => r.value === selected.role) && (
                      <option value={selected.role}>{roleLabel(selected.role)} (retired)</option>
                    )}
                  </select>
                  {selected?.id === me?.id && <p className="text-xs text-muted-foreground">Nobody changes their own role.</p>}
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={closeModal} className={btnSecondary}>Cancel</button>
                  <button type="submit" disabled={saving} className={btnPrimary}>{saving ? "Saving..." : "Save login"}</button>
                </div>
              </form>
            ) : modalMode === "password" ? (
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
                  <input id="email" name="email" type="email" required defaultValue={selected?.email ?? ""} disabled={modalMode === "edit" && !managesLogins} className={`${inputClass} disabled:bg-secondary disabled:text-muted-foreground`} />
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
                      {selected && !ROLES.some((r) => r.value === selected.role) && (
                        <option value={selected.role}>{roleLabel(selected.role)} (retired)</option>
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="phone" className={labelClass}>Phone</label>
                    <input id="phone" name="phone" type="tel" defaultValue={selected?.phone ?? ""} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="job_title" className={labelClass}>Job Title (display only)</label>
                    <input id="job_title" name="job_title" defaultValue={selected?.job_title ?? ""} className={inputClass} placeholder="e.g. Production Supervisor, Execution Supervisor" />
                  </div>
                  <div className="space-y-1.5">
                    {/* The reporting line. Permissions still come from the
                        role; this is who the person answers to. */}
                    <label htmlFor="reports_to" className={labelClass}>Reports To</label>
                    <select id="reports_to" name="reports_to" defaultValue={selected?.reports_to ?? ""} className={inputClass}>
                      <option value="">Nobody — top of the chart</option>
                      {users
                        .filter((u) => u.id !== selected?.id)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.full_name || u.username}{u.job_title ? ` · ${u.job_title}` : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="employee_id" className={labelClass}>Employee ID</label>
                    <input id="employee_id" name="employee_id" defaultValue={selected?.employee_id ?? ""} className={inputClass} placeholder="e.g. EMP-0042" />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="cnic" className={labelClass}>CNIC</label>
                    <input
                      id="cnic"
                      name="cnic"
                      defaultValue={selected?.cnic ?? ""}
                      maxLength={15}
                      className={inputClass}
                      placeholder="#####-#######-#"
                      onChange={(e) => setCnicInvalid(e.target.value !== "" && !CNIC_RE.test(e.target.value))}
                    />
                    <p className={`text-xs ${cnicInvalid ? "text-amber-400" : "text-muted-foreground/70"}`}>Format: #####-#######-# (e.g. 42101-1234567-1)</p>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="join_date" className={labelClass}>Join Date</label>
                    <input id="join_date" name="join_date" type="date" defaultValue={selected?.join_date ?? ""} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="leaving_date" className={labelClass}>Leaving Date</label>
                    <input id="leaving_date" name="leaving_date" type="date" min={selected?.join_date ?? undefined} defaultValue={selected?.leaving_date ?? ""} className={inputClass} />
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
          
      </Modal>
      )}

      {permissionsFor && (
        <PermissionsDialog
          userId={permissionsFor.id}
          userName={permissionsFor.full_name || permissionsFor.username}
          roleLabel={permissionsFor.role_label ?? roleLabel(permissionsFor.role)}
          onClose={() => setPermissionsFor(null)}
          onSaved={fetchUsers}
        />
      )}
    </div>
  );
}
