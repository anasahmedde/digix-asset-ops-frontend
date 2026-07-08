"use client";

import { Plus, Star, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

interface Contact {
  id: string;
  name: string;
  designation: string;
  phone: string;
  email: string;
  is_primary: boolean;
}

interface ContactsEditorProps {
  /** collection endpoint, e.g. "/sites/site-contacts/" (trailing slash) */
  endpoint: string;
  /** FK field name on the contact, e.g. "site" or "supplier" */
  parentField: string;
  parentId: string;
  label?: string;
}

const inputClass =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";

const empty = { name: "", designation: "", phone: "", email: "", is_primary: false };

export function ContactsEditor({ endpoint, parentField, parentId, label = "Contacts (POC)" }: ContactsEditorProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(endpoint, { params: { [parentField]: parentId } });
      setContacts(data.results ?? data);
    } catch {
      /* silent — parent modal already surfaces errors */
    }
  }, [endpoint, parentField, parentId]);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!form.name.trim()) {
      toast.error("Contact name is required");
      return;
    }
    setSaving(true);
    try {
      await api.post(endpoint, { [parentField]: parentId, ...form });
      setForm(empty);
      toast.success("Contact added");
      load();
    } catch (err) {
      toast.error(getApiError(err, "Failed to add contact"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`${endpoint}${id}/`);
      load();
    } catch (err) {
      toast.error(getApiError(err, "Failed to delete contact"));
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>

      {contacts.length > 0 && (
        <div className="space-y-1.5">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              {c.is_primary && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">
                  {c.name}
                  {c.designation ? <span className="font-normal text-muted-foreground"> · {c.designation}</span> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{[c.phone, c.email].filter(Boolean).join(" · ") || "—"}</p>
              </div>
              <button type="button" onClick={() => remove(c.id)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive" title="Remove">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className={inputClass} />
        <input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="Designation" className={inputClass} />
        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className={inputClass} />
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" className={inputClass} />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} className="h-3.5 w-3.5 rounded border-border text-primary" />
          Primary contact
        </label>
        <button type="button" onClick={add} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> Add contact
        </button>
      </div>
    </div>
  );
}
