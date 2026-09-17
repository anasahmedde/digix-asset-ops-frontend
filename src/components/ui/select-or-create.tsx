"use client";

import { useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

interface Option { id: string; name: string }

/**
 * A dropdown that can also create the thing it is selecting.
 *
 * Master data like material types and inventory categories is normally
 * maintained in Setup, but you should not have to leave a half-filled form to
 * add one — so this offers "+ Add new…" inline, posts it, and selects it.
 */
export function SelectOrCreate({
  label,
  value,
  onChange,
  options,
  onCreated,
  endpoint,
  createPlaceholder,
  extraCreateFields,
  required = false,
  allowEmpty = true,
  emptyLabel = "—",
  className = "",
  id,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: Option[];
  /** Called with the created record so the parent can refresh its list. */
  onCreated: (created: Option) => void;
  endpoint: string;
  createPlaceholder?: string;
  /** Extra payload sent alongside `name` when creating (e.g. a unit). */
  extraCreateFields?: Record<string, unknown>;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  className?: string;
  id?: string;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const inputClass =
    "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";

  async function create() {
    const name = draft.trim();
    if (!name) return;
    setSaving(true);
    try {
      const { data } = await api.post(endpoint, { name, ...(extraCreateFields ?? {}) });
      const created = { id: data.id, name: data.name };
      onCreated(created);
      onChange(created.id);
      setDraft("");
      setCreating(false);
      toast.success(`${label} "${created.name}" added`);
    } catch (err) {
      toast.error(getApiError(err, `Could not add the ${label.toLowerCase()}`));
    } finally {
      setSaving(false);
    }
  }

  if (creating) {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">New {label}</label>
          <button
            type="button"
            onClick={() => { setCreating(false); setDraft(""); }}
            className="text-2xs font-medium text-primary hover:underline"
          >
            Pick an existing one
          </button>
        </div>
        <div className="flex gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter would otherwise submit the surrounding form.
              if (e.key === "Enter") { e.preventDefault(); create(); }
            }}
            placeholder={createPlaceholder ?? `New ${label.toLowerCase()} name`}
            className={inputClass}
          />
          <button
            type="button"
            onClick={create}
            disabled={saving || !draft.trim()}
            className="inline-flex h-10 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white transition-all disabled:opacity-50"
          >
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
          {label}{required ? " *" : ""}
        </label>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="text-2xs font-medium text-primary hover:underline"
        >
          + Add new
        </button>
      </div>
      <select
        id={id}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}
