"use client";

import { Building2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface Client {
  id: string;
  name: string;
  code: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  is_active: boolean;
  created_at: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

export default function ClientsPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("clients");

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Client | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "" });
  const [search, setSearch] = useState("");

  const fetchClients = useCallback(async () => {
    try {
      const { data } = await api.get("/clients/");
      setClients(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load clients"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name"),
      code: fd.get("code"),
      contact_person: fd.get("contact_person"),
      contact_email: fd.get("contact_email"),
      contact_phone: fd.get("contact_phone"),
      address: fd.get("address"),
    };
    try {
      if (modalMode === "create") {
        await api.post("/clients/", payload);
        toast.success("Client created");
      } else if (selected) {
        await api.patch(`/clients/${selected.id}/`, payload);
        toast.success("Client updated");
      }
      closeModal();
      fetchClients();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save client"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(client: Client) {
    if (!confirm(`Delete client "${client.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/clients/${client.id}/`);
      toast.success("Client deleted");
      fetchClients();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — client may have linked records"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Clients</h1>
            <p className="text-muted-foreground">Manage client contracts, SLAs, and device assignments</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={() => { setSelected(null); setModalMode("create"); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
            <Plus className="h-4 w-4" /> Add Client
          </button>
        )}
      </div>

      <FilterBar
        filters={[
          { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, code, contact..."
      />

      {(() => {
        const filtered = clients.filter((c) => {
          if (filterValues.status === "active" && !c.is_active) return false;
          if (filterValues.status === "inactive" && c.is_active) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!c.name.toLowerCase().includes(q) && !c.code.toLowerCase().includes(q) && !(c.contact_person || "").toLowerCase().includes(q) && !(c.contact_email || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Building2 className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No clients found</h3>
          <p className="mt-2 text-sm text-muted-foreground">{clients.length > 0 ? "Try adjusting your filters." : "Add your first client to start managing contracts and SLAs."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Name</th>
                  <th className={thClass}>Code</th>
                  <th className={thClass}>Contact Person</th>
                  <th className={thClass}>Email</th>
                  <th className={thClass}>Phone</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} onClick={() => { setSelected(c); setModalMode("edit"); }} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-medium text-foreground`}>{c.name}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{c.code}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{c.contact_person || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{c.contact_email || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{c.contact_phone || "-"}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${c.is_active ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" : "bg-red-500/10 text-red-400 ring-red-500/20"}`}>
                        {c.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSelected(c); setModalMode("edit"); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(c)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
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
              <h2 className="text-lg font-semibold text-foreground">{modalMode === "create" ? "Add New Client" : "Edit Client"}</h2>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="name" className={labelClass}>Company Name</label>
                  <input id="name" name="name" required defaultValue={selected?.name ?? ""} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="code" className={labelClass}>Client Code</label>
                  <input id="code" name="code" required defaultValue={selected?.code ?? ""} className={inputClass} placeholder="e.g. ACME-001" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="contact_person" className={labelClass}>Contact Person</label>
                  <input id="contact_person" name="contact_person" defaultValue={selected?.contact_person ?? ""} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="contact_phone" className={labelClass}>Phone</label>
                  <input id="contact_phone" name="contact_phone" type="tel" defaultValue={selected?.contact_phone ?? ""} className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="contact_email" className={labelClass}>Email</label>
                <input id="contact_email" name="contact_email" type="email" defaultValue={selected?.contact_email ?? ""} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="address" className={labelClass}>Address</label>
                <textarea id="address" name="address" rows={2} defaultValue={selected?.address ?? ""} className={`${inputClass} h-auto py-2`} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Create Client" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
