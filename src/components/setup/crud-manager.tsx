"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

type FieldType = "text" | "number" | "textarea" | "checkbox" | "select" | "email" | "url";

export interface FieldSpec {
  name: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: { value: string; label: string }[];
  /** default for "create" mode */
  default?: string | number | boolean;
  /** bounds for number fields — also switches the input to integer steps */
  min?: number;
  max?: number;
  /** shown read-only in "edit" mode and excluded from the payload */
  immutable?: boolean;
  colSpan?: 1 | 2;
}

export interface ColumnSpec<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface CrudManagerProps<T extends { id: string }> {
  /** REST collection endpoint, e.g. "/setup/company/" (trailing slash required) */
  endpoint: string;
  /** singular label used in buttons/toasts, e.g. "Company" */
  singular: string;
  /** display name of a row for confirm dialogs */
  labelKey: keyof T;
  columns: ColumnSpec<T>[];
  fields: FieldSpec[];
  /** keys used for client-side search */
  searchKeys?: (keyof T)[];
  searchPlaceholder?: string;
  /** permission module for useUser().canWrite */
  resource?: string;
  /** hide the Active/Inactive filter (for tables without is_active) */
  hasActiveFilter?: boolean;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
        active
          ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
          : "bg-red-500/10 text-red-400 ring-red-500/20"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function CrudManager<T extends { id: string; [key: string]: unknown }>({
  endpoint,
  singular,
  labelKey,
  columns,
  fields,
  searchKeys = [],
  searchPlaceholder = "Search...",
  resource = "setup",
  hasActiveFilter = true,
}: CrudManagerProps<T>) {
  const { canWrite } = useUser();
  const canEdit = canWrite(resource);

  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"" | "active" | "inactive">("");

  const fetchRows = useCallback(async () => {
    try {
      const { data } = await api.get(endpoint);
      setRows(data.results ?? data);
    } catch (err) {
      toast.error(getApiError(err, `Failed to load ${singular.toLowerCase()} records`));
    } finally {
      setLoading(false);
    }
  }, [endpoint, singular]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  function buildPayload(fd: FormData): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.immutable && modalMode === "edit") continue;
      if (f.type === "checkbox") {
        payload[f.name] = fd.get(f.name) === "on";
      } else if (f.type === "number") {
        const v = fd.get(f.name);
        payload[f.name] = v === "" || v === null ? null : Number(v);
      } else {
        payload[f.name] = fd.get(f.name) ?? "";
      }
    }
    return payload;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const payload = buildPayload(new FormData(e.currentTarget));
    try {
      if (modalMode === "create") {
        await api.post(endpoint, payload);
        toast.success(`${singular} created`);
      } else if (selected) {
        await api.patch(`${endpoint}${selected.id}/`, payload);
        toast.success(`${singular} updated`);
      }
      closeModal();
      fetchRows();
    } catch (err) {
      toast.error(getApiError(err, `Failed to save ${singular.toLowerCase()}`));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: T) {
    if (!confirm(`Delete "${String(row[labelKey])}"? This cannot be undone.`)) return;
    try {
      await api.delete(`${endpoint}${row.id}/`);
      toast.success(`${singular} deleted`);
      fetchRows();
    } catch (err) {
      toast.error(getApiError(err, "Cannot delete — record may be in use"));
    }
  }

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (activeFilter === "active" && !row.is_active) return false;
      if (activeFilter === "inactive" && row.is_active) return false;
      if (search && searchKeys.length) {
        const q = search.toLowerCase();
        const match = searchKeys.some((k) =>
          String(row[k] ?? "").toLowerCase().includes(q)
        );
        if (!match) return false;
      }
      return true;
    });
  }, [rows, activeFilter, search, searchKeys]);

  function fieldDefault(f: FieldSpec): string | number | boolean | undefined {
    if (selected) return selected[f.name] as string | number | boolean;
    return f.default;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {searchKeys.length > 0 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-56 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
            />
          )}
          {hasActiveFilter && (
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as "" | "active" | "inactive")}
              className="h-9 rounded-lg border border-border bg-card px-3 pr-8 text-xs font-medium text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
            >
              <option value="">Status: All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          )}
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setSelected(null);
              setModalMode("create");
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all"
          >
            <Plus className="h-4 w-4" /> Add {singular}
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <h3 className="text-base font-semibold text-foreground">No {singular.toLowerCase()} records</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {rows.length > 0 ? "Try adjusting your filters." : `Add a ${singular.toLowerCase()} to get started.`}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  {columns.map((c) => (
                    <th key={c.key} className={thClass}>{c.label}</th>
                  ))}
                  {canEdit && <th className={thClass}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => canEdit && (setSelected(row), setModalMode("edit"))}
                    className={`border-b border-border transition-colors hover:bg-secondary/30 ${canEdit ? "cursor-pointer" : ""}`}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={`${tdClass} ${c.className ?? "text-muted-foreground"}`}>
                        {c.render ? c.render(row) : String(row[c.key] ?? "-")}
                      </td>
                    ))}
                    {canEdit && (
                      <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setSelected(row); setModalMode("edit"); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(row)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalMode !== null}
        onClose={closeModal}
        title={modalMode === "create" ? `Add ${singular}` : `Edit ${singular}`}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const dv = fieldDefault(f);
              const span = f.colSpan === 2 || f.type === "textarea" ? "sm:col-span-2" : "";
              if (f.immutable && modalMode === "edit") {
                return (
                  <div key={f.name} className={`space-y-1.5 ${span}`}>
                    <label className={labelClass}>{f.label}</label>
                    <p className="flex h-10 items-center rounded-lg border border-border bg-secondary/40 px-3 text-sm text-foreground">
                      {String(dv ?? "-")}
                    </p>
                  </div>
                );
              }
              if (f.type === "checkbox") {
                return (
                  <label key={f.name} className={`flex items-center gap-2.5 ${span} pt-1`}>
                    <input
                      type="checkbox"
                      name={f.name}
                      defaultChecked={dv === undefined ? false : Boolean(dv)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                    />
                    <span className="text-sm text-foreground">{f.label}</span>
                  </label>
                );
              }
              return (
                <div key={f.name} className={`space-y-1.5 ${span}`}>
                  <label htmlFor={f.name} className={labelClass}>{f.label}</label>
                  {f.type === "textarea" ? (
                    <textarea
                      id={f.name}
                      name={f.name}
                      rows={3}
                      required={f.required}
                      defaultValue={(dv as string) ?? ""}
                      placeholder={f.placeholder}
                      className={`${inputClass} h-auto py-2`}
                    />
                  ) : f.type === "select" ? (
                    <select
                      id={f.name}
                      name={f.name}
                      required={f.required}
                      defaultValue={(dv as string) ?? ""}
                      className={inputClass}
                    >
                      <option value="">Select…</option>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={f.name}
                      name={f.name}
                      type={f.type === "number" ? "number" : f.type ?? "text"}
                      step={f.type === "number" ? (f.min !== undefined || f.max !== undefined ? "1" : "any") : undefined}
                      min={f.type === "number" ? f.min : undefined}
                      max={f.type === "number" ? f.max : undefined}
                      required={f.required}
                      defaultValue={dv === undefined || dv === null ? "" : String(dv)}
                      placeholder={f.placeholder}
                      className={inputClass}
                    />
                  )}
                  {f.help && <p className="text-[11px] text-muted-foreground">{f.help}</p>}
                </div>
              );
            })}
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={closeModal}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
            >
              {saving ? "Saving..." : modalMode === "create" ? `Create ${singular}` : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
