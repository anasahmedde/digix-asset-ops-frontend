"use client";

import { Pencil, Plus, Trash2, Truck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface Supplier {
  id: string;
  name: string;
  code: string;
  contact_person: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  website: string;
  is_active: boolean;
  created_at: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

export default function SuppliersPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("suppliers");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "" });
  const [search, setSearch] = useState("");

  const fetchSuppliers = useCallback(async () => {
    try {
      const { data } = await api.get("/suppliers/");
      setSuppliers(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load suppliers"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

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
      website: fd.get("website"),
    };
    try {
      if (modalMode === "create") {
        await api.post("/suppliers/", payload);
        toast.success("Supplier created");
      } else if (selected) {
        await api.patch(`/suppliers/${selected.id}/`, payload);
        toast.success("Supplier updated");
      }
      closeModal();
      fetchSuppliers();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save supplier"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(supplier: Supplier) {
    if (!confirm(`Delete supplier "${supplier.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/suppliers/${supplier.id}/`);
      toast.success("Supplier deleted");
      fetchSuppliers();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — supplier may have linked records"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Suppliers & Vendors</h1>
            <p className="text-muted-foreground">Manage supplier relationships and vendor contracts</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={() => { setSelected(null); setModalMode("create"); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
            <Plus className="h-4 w-4" /> Add Supplier
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
        const filtered = suppliers.filter((s) => {
          if (filterValues.status === "active" && !s.is_active) return false;
          if (filterValues.status === "inactive" && s.is_active) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!s.name.toLowerCase().includes(q) && !s.code.toLowerCase().includes(q) && !(s.contact_person || "").toLowerCase().includes(q) && !(s.contact_email || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Truck className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No suppliers found</h3>
          <p className="mt-2 text-sm text-muted-foreground">{suppliers.length > 0 ? "Try adjusting your filters." : "Add suppliers to start tracking your supply chain."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Name</th>
                  <th className={thClass}>Code</th>
                  <th className={thClass}>Contact</th>
                  <th className={thClass}>Email</th>
                  <th className={thClass}>Phone</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} onClick={() => { setSelected(s); setModalMode("edit"); }} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-medium text-foreground`}>{s.name}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{s.code}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{s.contact_person || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{s.contact_email || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{s.contact_phone || "-"}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${s.is_active ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" : "bg-red-500/10 text-red-400 ring-red-500/20"}`}>
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSelected(s); setModalMode("edit"); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(s)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" title="Delete">
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
              <h2 className="text-lg font-semibold text-foreground">{modalMode === "create" ? "Add New Supplier" : "Edit Supplier"}</h2>
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
                  <label htmlFor="code" className={labelClass}>Supplier Code</label>
                  <input id="code" name="code" required defaultValue={selected?.code ?? ""} className={inputClass} placeholder="e.g. SUP-001" />
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
                <label htmlFor="website" className={labelClass}>Website</label>
                <input id="website" name="website" type="url" defaultValue={selected?.website ?? ""} className={inputClass} placeholder="https://" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="address" className={labelClass}>Address</label>
                <textarea id="address" name="address" rows={2} defaultValue={selected?.address ?? ""} className={`${inputClass} h-auto py-2`} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Create Supplier" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
