"use client";

import dynamic from "next/dynamic";
import { List, Map, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

const SiteMap = dynamic(() => import("@/components/map/site-map"), { ssr: false, loading: () => <div className="flex h-[500px] items-center justify-center rounded-xl border border-border bg-secondary/50"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /></div> });
const LocationPicker = dynamic(() => import("@/components/map/location-picker"), { ssr: false, loading: () => <div className="flex h-[280px] items-center justify-center rounded-lg border border-border bg-secondary/50"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /></div> });

interface Site {
  id: string;
  name: string;
  address: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  client: string | null;
  is_active: boolean;
  device_count: number;
  created_at: string;
}

interface SiteDetail extends Site {
  contact_person: string;
  contact_phone: string;
  contact_email: string;
  access_instructions: string;
  operating_hours: string;
}

interface Option { id: string; label: string; }

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

export default function SitesPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("sites");

  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<SiteDetail | null>(null);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Option[]>([]);
  const [view, setView] = useState<"list" | "map">("list");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "", country: "" });
  const [search, setSearch] = useState("");
  const [pickerLat, setPickerLat] = useState<number | null>(null);
  const [pickerLng, setPickerLng] = useState<number | null>(null);
  const searchParams = useSearchParams();
  const autoOpenedRef = useRef(false);

  const fetchSites = useCallback(async () => {
    try {
      const { data } = await api.get("/sites/sites/");
      setSites(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load sites"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  useEffect(() => {
    if (autoOpenedRef.current || loading) return;
    const siteId = searchParams.get("site");
    if (!siteId) return;
    autoOpenedRef.current = true;
    Promise.all([
      api.get(`/sites/sites/${siteId}/`),
      api.get("/clients/", { params: { page_size: 200 } }),
    ]).then(([siteRes, clientsRes]) => {
      setSelected(siteRes.data);
      setPickerLat(siteRes.data.latitude ?? null);
      setPickerLng(siteRes.data.longitude ?? null);
      setClients((clientsRes.data.results ?? clientsRes.data).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })));
      setModalMode("edit");
    }).catch(() => {});
  }, [searchParams, loading]);

  async function loadClients() {
    try {
      const { data } = await api.get("/clients/", { params: { page_size: 200 } });
      setClients((data.results ?? data).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })));
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load clients"));
    }
  }

  function openCreate() {
    setSelected(null);
    setPickerLat(null);
    setPickerLng(null);
    setModalMode("create");
    loadClients();
  }

  async function openEdit(site: Site) {
    try {
      const { data } = await api.get(`/sites/sites/${site.id}/`);
      setSelected(data);
      setPickerLat(data.latitude ?? null);
      setPickerLng(data.longitude ?? null);
      setModalMode("edit");
      loadClients();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load site details"));
    }
  }

  function closeModal() {
    setModalMode(null);
    setSelected(null);
    setPickerLat(null);
    setPickerLng(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      name: fd.get("name"),
      address: fd.get("address"),
      city: fd.get("city"),
      country: fd.get("country"),
      contact_person: fd.get("contact_person"),
      contact_phone: fd.get("contact_phone"),
      contact_email: fd.get("contact_email"),
      access_instructions: fd.get("access_instructions"),
      operating_hours: fd.get("operating_hours"),
      client: fd.get("client") || null,
      latitude: pickerLat,
      longitude: pickerLng,
    };
    try {
      if (modalMode === "create") {
        await api.post("/sites/sites/", payload);
        toast.success("Site created");
      } else if (selected) {
        await api.patch(`/sites/sites/${selected.id}/`, payload);
        toast.success("Site updated");
      }
      closeModal();
      fetchSites();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save site"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(site: Site) {
    if (!confirm(`Delete site "${site.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/sites/sites/${site.id}/`);
      toast.success("Site deleted");
      fetchSites();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — site has linked devices or records"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600">
            <MapPin className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Sites</h1>
            <p className="text-muted-foreground">Manage client sites and device locations</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border bg-secondary/50 p-0.5">
            <button onClick={() => setView("list")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button onClick={() => setView("map")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === "map" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <Map className="h-3.5 w-3.5" /> Map
            </button>
          </div>
          {canEdit && (
            <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
              <Plus className="h-4 w-4" /> Add Site
            </button>
          )}
        </div>
      </div>

      <FilterBar
        filters={[
          { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
          { key: "country", label: "Country", options: [...new Set(sites.map((s) => s.country).filter(Boolean))].sort().map((c) => ({ value: c, label: c })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, city..."
      />

      {(() => {
        const filtered = sites.filter((s) => {
          if (filterValues.status === "active" && !s.is_active) return false;
          if (filterValues.status === "inactive" && s.is_active) return false;
          if (filterValues.country && s.country !== filterValues.country) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!s.name.toLowerCase().includes(q) && !(s.city || "").toLowerCase().includes(q) && !s.country.toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <MapPin className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No sites found</h3>
          <p className="mt-2 text-sm text-muted-foreground">{sites.length > 0 ? "Try adjusting your filters." : "Add your first client site to start managing device locations."}</p>
        </div>
      ) : view === "map" ? (
        <SiteMap sites={filtered.filter((s): s is typeof s & { latitude: number; longitude: number } => s.latitude != null && s.longitude != null)} />
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Name</th>
                  <th className={thClass}>City</th>
                  <th className={thClass}>Country</th>
                  <th className={thClass}>Devices</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} onClick={() => openEdit(s)} className="border-b border-border/30 cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-medium text-foreground`}>{s.name}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{s.city || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{s.country}</td>
                    <td className={tdClass}>
                      <span className="inline-flex rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400 ring-1 ring-blue-500/20">
                        {s.device_count}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${s.is_active ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" : "bg-red-500/10 text-red-400 ring-red-500/20"}`}>
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(s)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 py-8 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{modalMode === "create" ? "Add New Site" : "Edit Site"}</h2>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="name" className={labelClass}>Site Name *</label>
                  <input id="name" name="name" required defaultValue={selected?.name ?? ""} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="client" className={labelClass}>Client</label>
                  <select id="client" name="client" defaultValue={selected?.client ?? ""} className={inputClass}>
                    <option value="">None</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="address" className={labelClass}>Address *</label>
                <textarea id="address" name="address" required rows={2} defaultValue={selected?.address ?? ""} className={`${inputClass} h-auto py-2`} />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="city" className={labelClass}>City</label>
                  <input id="city" name="city" defaultValue={selected?.city ?? ""} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="country" className={labelClass}>Country</label>
                  <input id="country" name="country" defaultValue={selected?.country ?? "Pakistan"} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="operating_hours" className={labelClass}>Operating Hours</label>
                  <input id="operating_hours" name="operating_hours" defaultValue={selected?.operating_hours ?? ""} className={inputClass} placeholder="e.g. 9AM-6PM" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className={labelClass}>Location (click map or search)</label>
                <LocationPicker
                  lat={pickerLat}
                  lng={pickerLng}
                  onChange={({ lat, lng }) => { setPickerLat(lat); setPickerLng(lng); }}
                />
              </div>

              <div className="border-t border-border/30 pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contact</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label htmlFor="contact_person" className={labelClass}>Contact Person</label>
                    <input id="contact_person" name="contact_person" defaultValue={selected?.contact_person ?? ""} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="contact_phone" className={labelClass}>Phone</label>
                    <input id="contact_phone" name="contact_phone" type="tel" defaultValue={selected?.contact_phone ?? ""} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="contact_email" className={labelClass}>Email</label>
                    <input id="contact_email" name="contact_email" type="email" defaultValue={selected?.contact_email ?? ""} className={inputClass} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="access_instructions" className={labelClass}>Access Instructions</label>
                <textarea id="access_instructions" name="access_instructions" rows={2} defaultValue={selected?.access_instructions ?? ""} className={`${inputClass} h-auto py-2`} placeholder="e.g. Security gate code, parking info..." />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Create Site" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
