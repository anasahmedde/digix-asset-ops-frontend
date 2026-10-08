"use client";

import {CalendarPlus, Download, Pencil, Plus, RotateCcw, Shield, Ticket, Trash2} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { ComponentWarranties } from "@/components/warranties/component-warranties";
import { WarrantyClaims } from "@/components/warranties/warranty-claims";
import { ExtendWarranty, type ExtendTarget } from "@/components/warranties/extend-warranty";
import { CopyButton } from "@/components/ui/copy-button";
import { Pagination, pageSlice } from "@/components/ui/pagination";
import { Modal } from "@/components/ui/modal";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchSelect } from "@/components/ui/search-select";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import { confirmAction } from "@/components/ui/confirm";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { formatDate, formatTerm } from "@/lib/utils";

interface Warranty {
  id: string;
  device: string;
  device_code: string | null;
  device_name: string | null;
  component_name: string | null;
  supplier: string | null;
  component: string | null;
  supplier_name: string | null;
  /** Whose asset it is, and where it stands. */
  client_name?: string | null;
  site_name?: string | null;
  warranty_type: string;
  warranty_type_display?: string;
  status: string;
  status_display?: string;
  months?: number | null;
  reissued_from?: string | null;
  start_date: string;
  end_date: string;
  coverage_details: string;
  /** Ours, handed out on creation (CLW-/VNW-/CPW-…). */
  reference_number: string;
  /** The vendor's own certificate number. */
  vendor_reference?: string;
  notes: string;
  is_expired: boolean;
  created_at: string;
}

// Warranty-claim tickets listed on the Claims tab (WF-14) — fields come from
// the tickets list serializer.
interface ClaimTicket {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  device: string | null;
  device_code: string | null;
  is_billable: boolean;
  charge_to: string;
  created_at: string;
}

interface DeviceOption {
  id: string;
  asset_code: string;
  display_name: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass =
  "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const STATUS_BADGES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  expired: "bg-red-500/10 text-red-600 ring-red-500/20",
  reissued: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  claimed: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  void: "bg-secondary/500/10 text-muted-foreground ring-gray-500/20",
};

/** Item 23: a term under a month reads in days — "0mo" tells nobody anything. */
function termLabel(w: { months?: number | null; start_date?: string | null; end_date?: string | null }): string {
  if (w.months) return ` · ${w.months}mo`;
  if (w.start_date && w.end_date) {
    const days = Math.round((new Date(w.end_date).getTime() - new Date(w.start_date).getTime()) / 86400000);
    if (days > 0) return ` · ${days}d`;
  }
  return "";
}

/** The day after a YYYY-MM-DD date: the earliest a warranty can end. */
function dayAfter(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d + 1).toLocaleDateString("en-CA");
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  expired: "Expired",
  reissued: "Reissued",
  claimed: "Pending",
  void: "Void",
};

// Named for who gives the cover, the same way the asset section names them.
/** Which list is on screen. "supplier" is the vendor's cover on the asset;
 *  component cover comes from the inventory line the part came from. */
type WarrantySide = "client" | "supplier" | "components" | "claims";

const TYPE_LABELS: Record<string, string> = {
  manufacturer: "Manufacturer",
  extended: "Extended",
  supplier: "Vendor",
  client: "Client",
};

const TYPE_BADGES: Record<string, string> = {
  manufacturer: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  extended: "bg-purple-500/10 text-purple-600 ring-purple-500/20",
  supplier: "bg-teal-500/10 text-teal-600 ring-teal-500/20",
  client: "bg-cyan-500/10 text-cyan-600 ring-cyan-500/20",
};

const TICKET_STATUS_BADGES: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  on_hold: "bg-gray-500/10 text-gray-600 ring-gray-500/20",
  blocked: "bg-red-500/10 text-red-600 ring-red-500/20",
  alignment_pending: "bg-cyan-500/10 text-cyan-600 ring-cyan-500/20",
  pending_ops_approval: "bg-orange-500/10 text-orange-600 ring-orange-500/20",
  pending_client_approval: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  pending_review: "bg-purple-500/10 text-purple-600 ring-purple-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  rejected: "bg-rose-500/10 text-rose-600 ring-rose-500/20",
  closed: "bg-slate-500/10 text-slate-600 ring-slate-500/20",
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WarrantiesPage() {
  const { can, canAny } = useUser();
  const canEdit = can("manage_warranties");
  // Client warranties belong to projects; vendor and component warranties
  // to the warranty register. Each side shows to whoever may read it.
  const seesClient = canAny("record_client_warranty", "view_projects");
  const seesSupplier = can("view_warranties");
  const clientSideOnly = seesClient && !seesSupplier;
  const supplierSideOnly = seesSupplier && !seesClient;
  const seesBoth = seesClient && seesSupplier;
  const router = useRouter();
  const params = useSearchParams();
  const [warrantySide, setWarrantySide] = useState<WarrantySide>(clientSideOnly ? "client" : "supplier");
  // A notification lands on the tab it is about.
  useEffect(() => {
    const t = params.get("tab");
    if (t === "client" || t === "supplier" || t === "components" || t === "claims") setWarrantySide(t);
  }, [params]);
  const [warrantyPage, setWarrantyPage] = useState(1);
  const sort = useSortState();
  // The warranty being extended, if the Extend dialog is open.
  const [extendFor, setExtendFor] = useState<ExtendTarget | null>(null);
  // The Component tab keeps its own list; the header's Add opens its form.
  const [componentAdd, setComponentAdd] = useState(0);
  // The start typed in the form, so the end can be held to after it.
  const [formStart, setFormStart] = useState("");
  const [createDevice, setCreateDevice] = useState("");
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Warranty | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "", type: "" });
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  async function exportExcel() {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterValues.status) params.status = filterValues.status;
      if (filterValues.type) params.warranty_type = filterValues.type;
      // Roles that see both sides browse per-tab; mirror the tab in the export
      // (?side=…) so the supplier tab no longer exports client warranties too.
      if (seesBoth && (warrantySide === "client" || warrantySide === "supplier")) {
        params.side = warrantySide;
      }
      const res = await api.get("/warranties/export/", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `warranties-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  }

  const fetchWarranties = useCallback(async () => {
    try {
      const { data } = await api.get("/warranties/", { params: { page_size: 500 } });
      setWarranties(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load warranties"));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const { data } = await api.get("/assets/devices/", { params: { page_size: 1000 } });
      setDevices(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load devices"));
    }
  }, []);

  const fetchSuppliers = useCallback(async () => {
    try {
      const { data } = await api.get("/suppliers/", { params: { page_size: 1000 } });
      setSuppliers(data.results ?? data);
    } catch {
      // supplier select degrades to "None" options only
    }
  }, []);

  useEffect(() => {
    fetchWarranties();
    fetchDevices();
    fetchSuppliers();
  }, [fetchWarranties, fetchDevices, fetchSuppliers]);

  // The user profile loads async; snap client-side roles onto their tab
  // (without yanking them off the Claims tab).
  useEffect(() => {
    if (clientSideOnly) setWarrantySide((s) => (s === "supplier" ? "client" : s));
  }, [clientSideOnly]);

  function closeModal() {
    setModalMode(null);
    setSelected(null);
    setFormStart("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      supplier: fd.get("supplier") || null,
      warranty_type: fd.get("warranty_type"),
      status: fd.get("status"),
      start_date: fd.get("start_date"),
      end_date: fd.get("end_date"),
      vendor_reference: fd.get("vendor_reference") ?? "",
      coverage_details: fd.get("coverage_details"),
      notes: fd.get("notes"),
    };
    try {
      if (modalMode === "create") {
        // The device is chosen at creation only; it stays fixed for the
        // warranty's lifetime (server enforces this too).
        payload.device = fd.get("device");
        await api.post("/warranties/", payload);
        toast.success("Warranty created");
      } else if (selected) {
        await api.patch(`/warranties/${selected.id}/`, payload);
        toast.success("Warranty updated");
      }
      closeModal();
      fetchWarranties();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save warranty"));
    } finally {
      setSaving(false);
    }
  }

  async function handleReissue(w: Warranty) {
    const raw = window.prompt("Reissue as client warranty for how many months? (3, 6 or 12)", "12");
    if (raw === null) return;
    const months = parseInt(raw.trim(), 10);
    if (![3, 6, 12].includes(months)) {
      toast.error("Term must be 3, 6 or 12 months.");
      return;
    }
    try {
      await api.post(`/warranties/${w.id}/reissue/`, { months });
      toast.success(`Warranty reissued for ${months} months`);
      fetchWarranties();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to reissue warranty"));
    }
  }

  async function handleDelete(w: Warranty) {
    if (
      !(await confirmAction(
        `Delete warranty for "${w.device_code ?? "this device"}"? This cannot be undone.`,
      ))
    )
      return;
    try {
      await api.delete(`/warranties/${w.id}/`);
      toast.success("Warranty deleted");
      fetchWarranties();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — warranty may have linked records"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Warranties</h1>
            <p className="text-muted-foreground">
              Track device warranty coverage and claims
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {warrantySide !== "claims" && (
            <button onClick={exportExcel} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60">
              <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
            </button>
          )}
          {/* Claims are raised from inside the Claims tab, against the cover
              being claimed. */}
          {canEdit && warrantySide !== "claims" && warrantySide !== "client" && (
            <button
              onClick={() => {
                if (warrantySide === "components") {
                  setComponentAdd((n) => n + 1);
                  return;
                }
                setSelected(null);
                setCreateDevice("");
                setModalMode("create");
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all"
            >
              <Plus className="h-4 w-4" /> Add Warranty
            </button>
          )}
        </div>
      </div>

      {(() => {
        const tabs: { key: WarrantySide; label: string }[] = seesBoth
          ? [
              { key: "client", label: "Client Warranties" },
              { key: "supplier", label: "Vendor Warranties" },
              { key: "components", label: "Component Warranties" },
              { key: "claims", label: "Claims" },
            ]
          : [
              { key: clientSideOnly ? "client" : "supplier", label: "Warranties" },
              { key: "components", label: "Component Warranties" },
              { key: "claims", label: "Claims" },
            ];
        return (
          <div className="flex gap-2">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setWarrantySide(t.key)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  warrantySide === t.key
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* Component cover is the unique items' own, listed from inventory. */}
      {warrantySide === "components" && <ComponentWarranties addTick={componentAdd} />}

      {warrantySide !== "claims" && warrantySide !== "components" && (
      <FilterBar
        filters={[
          { key: "status", label: "Status", options: Object.keys(STATUS_BADGES).map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by device code, supplier..."
      />
      )}

      {/* ── Claims tab: raised against vendor and component cover ─────────── */}
      {warrantySide === "claims" && <WarrantyClaims />}

      {warrantySide !== "claims" && warrantySide !== "components" && (() => {
        const filtered = warranties.filter((w) => {
          // A part's own cover belongs to the part, not to the asset, so it
          // never shows up in the client or vendor lists.
          if (warrantySide === "client") {
            if (w.warranty_type !== "client" || w.component) return false;
          } else if (seesBoth) {
            if (w.warranty_type === "client" || w.component) return false;
          } else if (w.component) {
            return false;
          }
          if (filterValues.status && w.status !== filterValues.status) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!(w.device_code || "").toLowerCase().includes(q) && !(w.device_name || "").toLowerCase().includes(q) && !(w.supplier_name || "").toLowerCase().includes(q) && !(w.reference_number || "").toLowerCase().includes(q) && !(w.vendor_reference || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No warranties found</h3>
          <p className="mt-2 text-sm text-muted-foreground">{warranties.length > 0 ? "Try adjusting your filters." : "Add warranties to start tracking device coverage."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <SortTh sort={sort} k="device_code" className={thClass}>Asset ID</SortTh>
                  <SortTh sort={sort} k="asset_name" className={thClass}>Asset Name</SortTh>
                  <SortTh sort={sort} k="status" className={thClass}>Status</SortTh>
                  <SortTh sort={sort} k="start_date" className={thClass}>Start Date</SortTh>
                  <SortTh sort={sort} k="end_date" className={thClass}>Valid Till</SortTh>
                  <SortTh sort={sort} k="months" className={thClass}>Term</SortTh>
                  <SortTh sort={sort} k="party" className={thClass}>{warrantySide === "client" ? "Client" : "Vendor"}</SortTh>
                  <SortTh sort={sort} k="reference_number" className={thClass}>Reference #</SortTh>
                  <SortTh sort={sort} k="site_name" className={thClass}>Site</SortTh>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice(sortRows(filtered, sort, { asset_name: (w) => w.component_name || w.device_name, party: (w) => (w.warranty_type === "client" ? w.client_name : w.supplier_name) }), warrantyPage).map((w) => (
                  <tr
                    key={w.id}
                    onClick={() => { setSelected(w); setModalMode("edit"); }}
                    className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30"
                  >
                    <td className={`${tdClass} font-medium text-foreground`}>
                      <span className="inline-flex items-center gap-1 font-mono text-primary">
                        {w.device_code || "-"}
                        {w.device_code && <CopyButton text={w.device_code} label="device code" />}
                      </span>
                    </td>
                    <td className={`${tdClass} text-foreground`}>
                      {w.device_name || "—"}
                      {w.component_name && (
                        <span className="block text-xs text-muted-foreground">Component: {w.component_name}</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGES[w.status] ?? "bg-secondary/500/10 text-muted-foreground ring-gray-500/20"}`}
                      >
                        {(w.status_display ?? STATUS_LABELS[w.status]) || w.status}
                      </span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>{formatDate(w.start_date)}</td>
                    <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>{formatDate(w.end_date)}</td>
                    <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>{w.months ? formatTerm(w.months) : termLabel(w).replace(" · ", "") || "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {(w.warranty_type === "client" ? w.client_name : w.supplier_name) || "—"}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap font-mono text-xs text-muted-foreground`}>
                      {w.reference_number || "—"}
                      {w.vendor_reference && (
                        <span className="block font-sans text-2xs" title="Vendor's reference">Vendor: {w.vendor_reference}</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{w.site_name || "—"}</td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          {["expired", "active"].includes(w.status) && (
                            <button
                              onClick={() => setExtendFor({
                                endpoint: `/warranties/${w.id}/extend/`,
                                label: w.device_code ?? "",
                                kind: w.warranty_type === "client" ? "Client" : "Vendor",
                                currentEnd: w.end_date,
                              })}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                              title="Extend this warranty"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {w.warranty_type === "client" && ["expired", "active"].includes(w.status) && (
                            <button
                              onClick={() => handleReissue(w)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                              title="Reissue as client warranty (3/6/12 months)"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => { setSelected(w); setModalMode("edit"); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(w)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                            title="Delete"
                          >
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
            <Pagination page={warrantyPage} total={filtered.length} onPage={setWarrantyPage} noun="warranties" />
          </div>
        </div>
      );
      })()}

      {modalMode && (
        <Modal open onClose={closeModal} title={modalMode === "create" ? "Add New Warranty" : "Edit Warranty"} size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="device" className={labelClass}>
                    Device
                  </label>
                  {modalMode === "edit" && selected ? (
                    <div className="flex h-10 w-full items-center rounded-lg border border-border bg-secondary/40 px-3 text-sm text-foreground">
                      <span className="truncate">
                        {selected.device_code || "—"}
                        {selected.device_name ? ` — ${selected.device_name}` : ""}
                      </span>
                    </div>
                  ) : (
                    <SearchSelect
                      options={devices.map((d) => ({ id: d.id, label: d.display_name ? `${d.asset_code} — ${d.display_name}` : d.asset_code }))}
                      value={createDevice}
                      onChange={setCreateDevice}
                      name="device"
                      required
                      placeholder="Search device by code or name…"
                    />
                  )}
                </div>
                {((modalMode === "create" && warrantySide === "supplier") || (selected != null && selected.warranty_type !== "client")) && (
                <div className="space-y-1.5">
                  <label htmlFor="supplier" className={labelClass}>
                    Vendor
                  </label>
                  <select key={suppliers.length}
                    id="supplier"
                    name="supplier"
                    defaultValue={selected?.supplier ?? ""}
                    className={inputClass}
                  >
                    <option value="">None</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                    {selected?.supplier && !suppliers.some((s) => s.id === selected.supplier) && (
                      <option value={selected.supplier}>{selected.supplier_name ?? "Current supplier"}</option>
                    )}
                  </select>
                </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="warranty_type" className={labelClass}>
                    Warranty Type
                  </label>
                  {(modalMode === "create" && warrantySide === "supplier") || selected?.warranty_type === "supplier" ? (
                    <>
                      {/* The vendor's cover on a finished asset is always a
                          vendor warranty; longer cover is an extension. */}
                      <input type="hidden" name="warranty_type" value="supplier" />
                      <div className={`${inputClass} items-center justify-between bg-secondary/40`}>
                        <span>Vendor</span>
                        <span className="text-2xs text-muted-foreground">Fixed — extend it instead</span>
                      </div>
                    </>
                  ) : (
                    <select
                      id="warranty_type"
                      name="warranty_type"
                      defaultValue={selected?.warranty_type ?? (warrantySide === "client" ? "client" : "supplier")}
                      className={inputClass}
                    >
                      {/* Manufacturer and extended cover belong to a component;
                          on the asset itself, outside cover is the vendor's. */}
                      {selected?.component && (
                        <>
                          <option value="manufacturer">Manufacturer</option>
                          <option value="extended">Extended</option>
                        </>
                      )}
                      <option value="supplier">Vendor</option>
                      {selected?.warranty_type === "client" && <option value="client">Client</option>}
                    </select>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="status" className={labelClass}>
                    Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    defaultValue={selected?.status ?? "active"}
                    className={inputClass}
                  >
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                    <option value="reissued">Reissued</option>
                    <option value="claimed">Pending</option>
                    <option value="void">Void</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="start_date" className={labelClass}>
                    Start Date
                  </label>
                  <input
                    id="start_date"
                    name="start_date"
                    type="date"
                    required
                    defaultValue={selected?.start_date ?? ""}
                    onChange={(e) => setFormStart(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="end_date" className={labelClass}>
                    End Date
                  </label>
                  <input
                    id="end_date"
                    name="end_date"
                    type="date"
                    required
                    min={dayAfter(formStart || selected?.start_date)}
                    defaultValue={selected?.end_date ?? ""}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Ours is handed out by the system; the vendor's own number is
                  typed beside it, so the two are never mistaken. */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={labelClass}>Reference Number</label>
                  <p className={`${inputClass} items-center bg-secondary/40 font-mono text-muted-foreground`}>
                    {selected?.reference_number || "Assigned on save"}
                  </p>
                </div>
                {(selected ? selected.warranty_type !== "client" : warrantySide !== "client") && (
                  <div className="space-y-1.5">
                    <label htmlFor="vendor_reference" className={labelClass}>Vendor reference</label>
                    <input
                      id="vendor_reference"
                      name="vendor_reference"
                      defaultValue={selected?.vendor_reference ?? ""}
                      className={inputClass}
                      placeholder="Vendor's warranty certificate no."
                    />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="coverage_details" className={labelClass}>
                  Coverage Details
                </label>
                <textarea
                  id="coverage_details"
                  name="coverage_details"
                  rows={2}
                  defaultValue={selected?.coverage_details ?? ""}
                  className={`${inputClass} h-auto py-2`}
                  placeholder="Describe what the warranty covers"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="notes" className={labelClass}>
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  defaultValue={selected?.notes ?? ""}
                  className={`${inputClass} h-auto py-2`}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
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
                  {saving
                    ? "Saving..."
                    : modalMode === "create"
                      ? "Create Warranty"
                      : "Save Changes"}
                </button>
              </div>
            </form>
          
      </Modal>
      )}
      <ExtendWarranty target={extendFor} onClose={() => setExtendFor(null)} onDone={fetchWarranties} />
    </div>
  );
}
