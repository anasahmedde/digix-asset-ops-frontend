"use client";

import { AlertTriangle, Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { confirmAction } from "@/components/ui/confirm";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

/**
 * Every role against every capability, as a grid of ticks.
 *
 * A role is a record, so this is where the rights of a whole job are set at
 * once — tick a box and everybody holding that role gains it. The eleven
 * built-in roles can be adjusted; new ones can be written for the jobs this
 * organisation actually has.
 */
interface CapabilityDef {
  key: string;
  label: string;
  module: string;
  /** What sort of right it is: seeing, doing, deciding, or administering. */
  kind: "view" | "work" | "approve" | "admin";
  description: string;
  sensitive: boolean;
}

// The order the kinds read in, within a module: see it, work on it, sign
// it off, administer it.
const KINDS: CapabilityDef["kind"][] = ["view", "work", "approve", "admin"];
const KIND_LABEL: Record<CapabilityDef["kind"], string> = {
  view: "See", work: "Do", approve: "Approve & decide", admin: "Administer",
};

interface Role {
  id: string;
  key: string;
  label: string;
  description: string;
  capabilities: string[];
  is_builtin: boolean;
  is_active: boolean;
  holders: number;
}

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

export function RolesMatrix({ readOnly = false }: { readOnly?: boolean }) {
  const [caps, setCaps] = useState<CapabilityDef[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // "copy_from" starts the new role with another's ticks.
  const [newRole, setNewRole] = useState({ label: "", description: "", copy_from: "" });
  // The custom role whose name or purpose is being rewritten.
  const [editing, setEditing] = useState<Role | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([api.get("/accounts/capabilities/"), api.get("/accounts/roles/")])
      .then(([cat, rs]) => {
        setCaps(cat.data.capabilities);
        setModules(cat.data.modules);
        const rows: Role[] = rs.data.results ?? rs.data;
        setRoles(rows);
        setDraft(Object.fromEntries(rows.map((r) => [r.id, new Set(r.capabilities)])));
      })
      .catch((err) => toast.error(getApiError(err, "Could not load roles")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const saved = useMemo(
    () => Object.fromEntries(roles.map((r) => [r.id, new Set(r.capabilities)])),
    [roles],
  );

  const changed = useCallback(
    (roleId: string) => {
      const now = draft[roleId];
      const was = saved[roleId];
      if (!now || !was) return false;
      return now.size !== was.size || [...now].some((k) => !was.has(k));
    },
    [draft, saved],
  );

  function toggle(roleId: string, capKey: string) {
    setDraft((prev) => {
      const next = new Set(prev[roleId] ?? []);
      if (next.has(capKey)) next.delete(capKey);
      else next.add(capKey);
      return { ...prev, [roleId]: next };
    });
  }

  async function saveRole(role: Role) {
    setSaving(role.id);
    try {
      const { data } = await api.patch(`/accounts/roles/${role.id}/`, {
        capabilities: [...(draft[role.id] ?? [])],
      });
      setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, ...data } : r)));
      toast.success(
        role.holders > 0
          ? `${role.label} updated — ${role.holders} ${role.holders === 1 ? "person" : "people"} affected`
          : `${role.label} updated`,
      );
    } catch (err) {
      toast.error(getApiError(err, "Could not save the role"));
    } finally {
      setSaving(null);
    }
  }

  async function createRole() {
    if (!newRole.label.trim()) {
      toast.error("Give the role a name");
      return;
    }
    setSaving("new");
    const from = roles.find((r) => r.id === newRole.copy_from);
    try {
      const { data } = await api.post("/accounts/roles/", {
        label: newRole.label.trim(),
        description: newRole.description.trim(),
        capabilities: from?.capabilities ?? [],
      });
      setRoles((prev) => [...prev, data]);
      setDraft((prev) => ({ ...prev, [data.id]: new Set(data.capabilities) }));
      setAdding(false);
      setNewRole({ label: "", description: "", copy_from: "" });
      toast.success(from ? `${data.label} added, starting from ${from.label}` : `${data.label} added — tick what it may do`);
    } catch (err) {
      toast.error(getApiError(err, "Could not add the role"));
    } finally {
      setSaving(null);
    }
  }

  async function renameRole() {
    if (!editing || !editing.label.trim()) {
      toast.error("Give the role a name");
      return;
    }
    setSaving(editing.id);
    try {
      const { data } = await api.patch(`/accounts/roles/${editing.id}/`, {
        label: editing.label.trim(), description: editing.description.trim(),
      });
      setRoles((prev) => prev.map((r) => (r.id === data.id ? { ...r, ...data } : r)));
      setEditing(null);
      toast.success(`${data.label} updated`);
    } catch (err) {
      toast.error(getApiError(err, "Could not update the role"));
    } finally {
      setSaving(null);
    }
  }

  async function removeRole(role: Role) {
    if (!(await confirmAction(`Delete the role "${role.label}"? This cannot be undone.`))) return;
    try {
      await api.delete(`/accounts/roles/${role.id}/`);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      toast.success(`${role.label} deleted`);
    } catch (err) {
      toast.error(getApiError(err, "Could not delete the role"));
    }
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading roles…</p>;
  }

  const dirty = roles.filter((r) => changed(r.id));
  const q = query.trim().toLowerCase();
  const shown = q
    ? caps.filter((c) => `${c.label} ${c.description} ${c.module} ${c.key}`.toLowerCase().includes(q))
    : caps;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {readOnly
            ? "What each role may do. Changing it needs the right to change what people may do."
            : "Tick what each role may do. Everybody holding that role is affected at once — a single person can still be adjusted from their own row on the Employees tab."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <label className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              id="roles_search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a right…"
              aria-label="Find a capability"
              className="h-9 w-48 rounded-lg border border-border bg-card pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </label>
          {!readOnly && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" /> New role
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className="sticky left-0 z-20 min-w-64 border-b border-border bg-secondary px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Capability
              </th>
              {roles.map((role) => (
                <th key={role.id} className="min-w-28 border-b border-border px-2 py-3 text-center align-bottom">
                  <span className="block text-xs font-semibold text-foreground">{role.label}</span>
                  <span className="block text-2xs font-normal text-muted-foreground">
                    {role.holders} {role.holders === 1 ? "person" : "people"}
                  </span>
                  {!role.is_builtin && (
                    <span className="mt-1 inline-flex items-center gap-1">
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary">
                        custom
                      </span>
                      {!readOnly && (<>
                      <button
                        type="button"
                        onClick={() => setEditing(role)}
                        aria-label={`Rename ${role.label}`}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeRole(role)}
                        aria-label={`Delete ${role.label}`}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      </>)}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={roles.length + 1} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No right matches &ldquo;{query}&rdquo;.
                </td>
              </tr>
            )}
            {modules.map((mod) => {
              const rows = KINDS.flatMap((k) => shown.filter((c) => c.module === mod && c.kind === k));
              if (rows.length === 0) return null;
              return (
                <Fragment key={mod}>
                  <tr className="border-b border-border/60 bg-secondary/20">
                    <td
                      colSpan={roles.length + 1}
                      className="sticky left-0 z-10 border-b border-border/60 bg-secondary/20 px-4 py-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {mod}
                    </td>
                  </tr>
                  {rows.map((cap, i) => (
                    <tr key={cap.key} className="group">
                      <td className="sticky left-0 z-10 border-b border-border/60 bg-card px-4 py-2 group-hover:bg-secondary/20">
                        <span className="flex items-center gap-1.5">
                          {(i === 0 || rows[i - 1].kind !== cap.kind) && (
                            <span className="w-24 shrink-0 text-2xs font-semibold uppercase tracking-wider text-primary/80">
                              {KIND_LABEL[cap.kind]}
                            </span>
                          )}
                          {i > 0 && rows[i - 1].kind === cap.kind && <span className="w-24 shrink-0" />}
                          <span className="text-sm font-medium text-foreground">{cap.label}</span>
                          {cap.sensitive && (
                            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" aria-label="Hands over real authority" />
                          )}
                        </span>
                        <span className="block max-w-md pl-[6.375rem] text-2xs leading-snug text-muted-foreground">
                          {cap.description}
                        </span>
                      </td>
                      {roles.map((role) => {
                        const on = draft[role.id]?.has(cap.key) ?? false;
                        return (
                          <td key={role.id} className="border-b border-border/60 px-2 py-2 text-center group-hover:bg-secondary/20">
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={readOnly}
                              onChange={() => toggle(role.id, cap.key)}
                              aria-label={`${cap.label} for ${role.label}`}
                              className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-secondary/30">
              <td className="sticky left-0 z-10 border-t border-border bg-secondary px-4 py-2 text-xs font-medium text-muted-foreground">
                {dirty.length > 0
                  ? `${dirty.length} role${dirty.length === 1 ? "" : "s"} changed`
                  : "No changes"}
              </td>
              {roles.map((role) => (
                <td key={role.id} className="border-t border-border px-2 py-2 text-center">
                  <span className="block text-2xs text-muted-foreground">
                    {draft[role.id]?.size ?? 0}/{caps.length}
                  </span>
                  {changed(role.id) && (
                    <button
                      type="button"
                      onClick={() => saveRole(role)}
                      disabled={saving === role.id}
                      className="mt-1 inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-2xs font-medium text-white disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" /> {saving === role.id ? "Saving…" : "Save"}
                    </button>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Rename role" size="sm">
        {editing && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="edit_role_label" className="text-xs font-medium text-muted-foreground">Name *</label>
              <input
                id="edit_role_label"
                autoFocus
                value={editing.label}
                onChange={(e) => setEditing((r) => (r ? { ...r, label: e.target.value } : r))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="edit_role_desc" className="text-xs font-medium text-muted-foreground">What it is for</label>
              <input
                id="edit_role_desc"
                value={editing.description}
                onChange={(e) => setEditing((r) => (r ? { ...r, description: e.target.value } : r))}
                className={inputClass}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={renameRole}
                disabled={saving === editing.id}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving === editing.id ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="New role" size="sm">
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Name the job as your organisation says it. Start from a role that is close, or tick what it may do next.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="role_label" className="text-xs font-medium text-muted-foreground">Name *</label>
            <input
              id="role_label"
              autoFocus
              value={newRole.label}
              onChange={(e) => setNewRole((s) => ({ ...s, label: e.target.value }))}
              placeholder="e.g. Site Auditor"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="role_desc" className="text-xs font-medium text-muted-foreground">What it is for</label>
            <input
              id="role_desc"
              value={newRole.description}
              onChange={(e) => setNewRole((s) => ({ ...s, description: e.target.value }))}
              placeholder="Walks sites and reports; changes nothing"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="role_copy_from" className="text-xs font-medium text-muted-foreground">Start from</label>
            <select
              id="role_copy_from"
              value={newRole.copy_from}
              onChange={(e) => setNewRole((s) => ({ ...s, copy_from: e.target.value }))}
              className={inputClass}
            >
              <option value="">Nothing ticked</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.label} ({r.capabilities.length} rights)</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
            </button>
            <button
              type="button"
              onClick={createRole}
              disabled={saving === "new"}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving === "new" ? "Adding…" : "Add role"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
