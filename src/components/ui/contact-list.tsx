"use client";

import { Plus, Trash2 } from "lucide-react";

/** Somebody to ring at an organisation, and the job they do. */
export interface ContactRow {
  id?: string;
  name: string;
  designation?: string;
  phone: string;
  email?: string;
  is_primary?: boolean;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";

/** A fresh row, primary when it is the only one. */
export function blankContact(isFirst = false): ContactRow {
  return { name: "", designation: "", phone: "", email: "", is_primary: isFirst };
}

/** The rows worth sending: anything somebody actually typed into. */
export function contactsForPayload(rows: ContactRow[]) {
  return rows
    .filter((c) => c.name.trim() || c.phone.trim())
    .map((c) => ({
      name: c.name.trim(),
      designation: (c.designation ?? "").trim(),
      phone: c.phone.trim(),
      email: (c.email ?? "").trim(),
      is_primary: Boolean(c.is_primary),
    }));
}

/**
 * The people to ring at a client, a supplier or anywhere else.
 *
 * One name and one number was never how an organisation works — the person
 * who signs the order is rarely the one who opens the gate. Written once
 * and used by both registers, because two copies of a form are two forms
 * that drift.
 *
 * Exactly one row is the primary; that is the name and number every other
 * screen shows, so it is picked here rather than guessed later.
 */
export function ContactList({
  rows,
  onChange,
  label = "Contacts",
  /** Distinguishes the primary radio group when two lists share a page. */
  name = "primary_contact",
}: {
  rows: ContactRow[];
  onChange: (rows: ContactRow[]) => void;
  label?: string;
  name?: string;
}) {
  const set = (i: number, patch: Partial<ContactRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{label} *</p>
        <button
          type="button"
          onClick={() => onChange([...rows, blankContact(rows.length === 0)])}
          className="inline-flex items-center gap-1 text-2xs font-semibold text-primary hover:underline"
        >
          <Plus className="h-3.5 w-3.5" /> Add contact
        </button>
      </div>

      {rows.map((c, i) => (
        <div key={c.id ?? i} className="grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-2">
          <input
            value={c.name}
            onChange={(e) => set(i, { name: e.target.value })}
            placeholder="Name *"
            required
            className={inputClass}
          />
          <input
            value={c.designation ?? ""}
            onChange={(e) => set(i, { designation: e.target.value })}
            placeholder="Designation"
            className={inputClass}
          />
          <input
            value={c.phone}
            onChange={(e) => set(i, { phone: e.target.value })}
            placeholder="Contact no *"
            type="tel"
            required
            className={inputClass}
          />
          <input
            value={c.email ?? ""}
            onChange={(e) => set(i, { email: e.target.value })}
            placeholder="Email"
            type="email"
            className={inputClass}
          />
          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="radio"
                name={name}
                checked={Boolean(c.is_primary)}
                onChange={() => onChange(rows.map((r, j) => ({ ...r, is_primary: j === i })))}
                className="h-3.5 w-3.5 accent-primary"
              />
              Primary — the one shown everywhere else
            </label>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                title="Remove this contact"
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
