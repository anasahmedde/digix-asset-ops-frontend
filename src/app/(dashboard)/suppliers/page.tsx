"use client";

import { Pencil, Plus, Power, Trash2, Truck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import {
  ContactList, blankContact, contactsForPayload, type ContactRow,
} from "@/components/ui/contact-list";
import { ContactsEditor } from "@/components/ui/contacts-editor";
import { Pagination, pageSlice } from "@/components/ui/pagination";
import { FilterBar } from "@/components/ui/filter-bar";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import { confirmAction } from "@/components/ui/confirm";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface Supplier {
  id: string;
  name: string;
  code: string;
  contact_person: string;
  contacts?: ContactRow[];
  contact_email: string;
  contact_phone: string;
  address: string;
  website: string;
  is_active: boolean;
  service_categories: string[];
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
  const [vendorPage, setVendorPage] = useState(1);
  const sort = useSortState();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
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
    api.get("/suppliers/service-categories/").then((r) => setCategories(r.data.results ?? r.data)).catch(() => {});
  }, [fetchSuppliers]);

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  /** The people to ring at this supplier, while the form is open. */
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  useEffect(() => {
    if (!modalMode) return;
    setContacts(
      selected?.contacts?.length
        ? selected.contacts.map((c) => ({ ...c }))
        : [blankContact(true)],
    );
  }, [modalMode, selected]);

  /** Taken off the books without being erased from the history. */
  async function toggleActive(sup: Supplier) {
    const off = sup.is_active;
    if (off && !(await confirmAction(
      `Deactivate ${sup.name}? They stay on every order and asset they are `
      + "already on, and stop being offered when something new is raised.",
    ))) return;
    try {
      await api.patch(`/suppliers/${sup.id}/`, { is_active: !off });
      toast.success(off ? "Supplier deactivated" : "Supplier reactivated");
      fetchSuppliers();
    } catch (err) {
      toast.error(getApiError(err, "Could not change that"));
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contacts.some((c) => c.name.trim() && c.phone.trim())) {
      toast.error("Add at least one contact — a name and a number");
      return;
    }
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name"),
      address: fd.get("address"),
      // The person, number and email on the supplier itself are written
      // by the server from whichever contact is primary.
      contacts: contactsForPayload(contacts),
      website: fd.get("website"),
      service_categories: fd.getAll("service_categories"),
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
    if (!(await confirmAction(`Delete supplier "${supplier.name}"? This cannot be undone.`))) return;
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
                  <SortTh sort={sort} k="name" className={thClass}>Name</SortTh>
                  <SortTh sort={sort} k="code" className={thClass}>Code</SortTh>
                  <SortTh sort={sort} k="contact_person" className={thClass}>Contact</SortTh>
                  <SortTh sort={sort} k="contact_email" className={thClass}>Email</SortTh>
                  <SortTh sort={sort} k="contact_phone" className={thClass}>Phone</SortTh>
                  <SortTh sort={sort} k="is_active" className={thClass}>Status</SortTh>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice(sortRows(filtered, sort), vendorPage).map((s) => (
                  <tr key={s.id} onClick={() => { setSelected(s); setModalMode("edit"); }} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-medium text-foreground`}>{s.name}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{s.code}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{s.contact_person || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{s.contact_email || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{s.contact_phone || "-"}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${s.is_active ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20" : "bg-red-500/10 text-red-600 ring-red-500/20"}`}>
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSelected(s); setModalMode("edit"); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => toggleActive(s)}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-secondary ${
                              s.is_active ? "text-muted-foreground hover:text-amber-600" : "text-emerald-600"
                            }`}
                            title={s.is_active ? "Deactivate" : "Reactivate"}
                          >
                            <Power className="h-3.5 w-3.5" />
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
            <Pagination page={vendorPage} total={filtered.length} onPage={setVendorPage} noun="vendors" />
          </div>
        </div>
      );
      })()}

      {modalMode && (
        <Modal open onClose={closeModal} title={modalMode === "create" ? "Add New Supplier" : "Edit Supplier"} size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="name" className={labelClass}>Company Name</label>
                  <input id="name" name="name" required defaultValue={selected?.name ?? ""} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Supplier Code</label>
                  {/* Issued by the register, like every other code in the
                      platform. Asking somebody to invent one is asking for
                      two suppliers to end up sharing it. */}
                  {modalMode === "create" ? (
                    <p className={`${inputClass} flex items-center bg-secondary/30 text-muted-foreground`}>
                      Generated on save
                    </p>
                  ) : (
                    <p className={`${inputClass} flex items-center bg-secondary/40 font-mono text-foreground`}>
                      {selected?.code}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="website" className={labelClass}>Website</label>
                <input id="website" name="website" type="url" defaultValue={selected?.website ?? ""} className={inputClass} placeholder="https://" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="address" className={labelClass}>Address *</label>
                <textarea id="address" name="address" rows={2} required defaultValue={selected?.address ?? ""} className={`${inputClass} h-auto py-2`} />
              </div>

              <ContactList rows={contacts} onChange={setContacts} />
              {categories.length > 0 && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Service Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => (
                      <label key={c.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs text-foreground">
                        <input type="checkbox" name="service_categories" value={c.id} defaultChecked={selected?.service_categories?.includes(c.id)} className="h-3.5 w-3.5 rounded border-border text-primary" />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {modalMode === "edit" && selected && (
                <ContactsEditor endpoint="/suppliers/contacts/" parentField="supplier" parentId={selected.id} />
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Create Supplier" : "Save Changes"}
                </button>
              </div>
            </form>
          
      </Modal>
      )}
    </div>
  );
}
