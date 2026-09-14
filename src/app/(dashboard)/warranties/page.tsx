"use client";

import { CalendarPlus, Download, Pencil, Plus, RotateCcw, Shield, Ticket, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ComponentWarranties } from "@/components/warranties/component-warranties";
import { WarrantyClaims } from "@/components/warranties/warranty-claims";
import { CopyButton } from "@/components/ui/copy-button";
import { Modal } from "@/components/ui/modal";
import { FilterBar } from "@/components/ui/filter-bar";
import { SearchSelect } from "@/components/ui/search-select";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { formatDate } from "@/lib/utils";

interface Warranty {
  id: string;
  device: string;
  device_code: string | null;
  device_name: string | null;
  component_name: string | null;
  supplier: string | null;
  component: string | null;
  supplier_name: string | null;
  warranty_type: string;
  warranty_type_display?: string;
  status: string;
  status_display?: string;
  months?: number | null;
  reissued_from?: string | null;
  start_date: string;
  end_date: string;
  coverage_details: string;
  reference_number: string;
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

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  expired: "Warranty Completed",
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

const CLIENT_SIDE_ROLES = ["marketing", "marketing_head", "client_viewer"];
const SUPPLIER_SIDE_ROLES = ["ops_manager", "supervisor", "technician", "warehouse"];

export default function WarrantiesPage() {
  const { user, canWrite } = useUser();
  const canEdit = canWrite("warranties");
  const role = user?.role ?? "";
  const clientSideOnly = CLIENT_SIDE_ROLES.includes(role);
  const supplierSideOnly = SUPPLIER_SIDE_ROLES.includes(role);
  const seesBoth = !clientSideOnly && !supplierSideOnly;
  const router = useRouter();
  const [warrantySide, setWarrantySide] = useState<WarrantySide>(clientSideOnly ? "client" : "supplier");
  // The warranty being extended, if the Extend dialog is open.
  const [extendFor, setExtendFor] = useState<Warranty | null>(null);
  const [extending, setExtending] = useState(false);
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
      const { data } = await api.get("/warranties/");
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
      reference_number: fd.get("reference_number"),
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

  async function submitExtend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!extendFor) return;
    const fd = new FormData(e.currentTarget);
    const endDate = String(fd.get("end_date") || "");
    const months = String(fd.get("months") || "");
    if (!endDate && !months) {
      toast.error("Give the months to add, or the new expiry date.");
      return;
    }
    setExtending(true);
    try {
      await api.post(`/warranties/${extendFor.id}/extend/`, {
        ...(endDate ? { end_date: endDate } : { months: Number(months) }),
        reference_number: String(fd.get("reference_number") || ""),
        notes: String(fd.get("notes") || ""),
      });
      toast.success("Warranty extended");
      setExtendFor(null);
      fetchWarranties();
    } catch (err) {
      toast.error(getApiError(err, "Could not extend the warranty"));
    } finally {
      setExtending(false);
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
      !confirm(
        `Delete warranty for "${w.device_code ?? "this device"}"? This cannot be undone.`,
      )
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
          {canEdit && warrantySide !== "claims" && (
            <button
              onClick={() => {
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
      {warrantySide === "components" && <ComponentWarranties />}

      {warrantySide !== "claims" && warrantySide !== "components" && (
      <FilterBar
        filters={[
          { key: "status", label: "Status", options: Object.keys(STATUS_BADGES).map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })) },
          { key: "type", label: "Type", options: Object.keys(TYPE_BADGES).map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t })) },
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
          if (filterValues.type && w.warranty_type !== filterValues.type) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!(w.device_code || "").toLowerCase().includes(q) && !(w.device_name || "").toLowerCase().includes(q) && !(w.supplier_name || "").toLowerCase().includes(q) && !(w.reference_number || "").toLowerCase().includes(q)) return false;
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
                  <th className={thClass}>Asset ID</th>
                  <th className={thClass}>Asset Name</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Start Date</th>
                  <th className={thClass}>End Date</th>
                  <th className={thClass}>Supplier</th>
                  <th className={thClass}>Reference #</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
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
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TYPE_BADGES[w.warranty_type] ?? "bg-secondary/500/10 text-muted-foreground ring-gray-500/20"}`}
                      >
                        {TYPE_LABELS[w.warranty_type] ?? w.warranty_type_display ?? w.warranty_type}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGES[w.status] ?? "bg-secondary/500/10 text-muted-foreground ring-gray-500/20"}`}
                      >
                        {(w.status_display ?? STATUS_LABELS[w.status]) || w.status}{w.months ? ` · ${w.months}mo` : ""}
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {w.start_date}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {w.end_date}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {w.supplier_name || "-"}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {w.reference_number || "-"}
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          {w.warranty_type !== "client" && ["expired", "active"].includes(w.status) && (
                            <button
                              onClick={() => setExtendFor(w)}
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
          </div>
        </div>
      );
      })()}

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="max-h-[88vh] overflow-y-auto w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {modalMode === "create"
                  ? "Add New Warranty"
                  : "Edit Warranty"}
              </h2>
              <button
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
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
                <div className="space-y-1.5">
                  <label htmlFor="supplier" className={labelClass}>
                    Supplier
                  </label>
                  <select
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
                        <span className="text-[10px] text-muted-foreground">Fixed — extend it instead</span>
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
                      <option value="client">Client</option>
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
                    <option value="expired">Warranty Completed</option>
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
                    defaultValue={selected?.end_date ?? ""}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reference_number" className={labelClass}>
                  Reference Number
                </label>
                <input
                  id="reference_number"
                  name="reference_number"
                  defaultValue={selected?.reference_number ?? ""}
                  className={inputClass}
                  placeholder="e.g. WRN-2024-001"
                />
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
          </div>
        </div>
      )}
      {/* Extend — same warranty, later expiry, the change on record. */}
      <Modal
        open={!!extendFor}
        onClose={() => setExtendFor(null)}
        title={extendFor ? `Extend warranty — ${extendFor.device_code ?? ""}` : "Extend warranty"}
      >
        {extendFor && (
          <form onSubmit={submitExtend} className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
              <div>
                <p className="text-muted-foreground">Type</p>
                <p className="font-medium text-foreground">{TYPE_LABELS[extendFor.warranty_type] ?? extendFor.warranty_type}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Current expiry</p>
                <p className="font-medium text-foreground">{formatDate(extendFor.end_date)}</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="ext-months" className={labelClass}>Extend by (months)</label>
                <input id="ext-months" name="months" type="number" min={1} placeholder="e.g. 12" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ext-end" className={labelClass}>…or new expiry date</label>
                <input id="ext-end" name="end_date" type="date" min={extendFor.end_date} className={inputClass} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ext-ref" className={labelClass}>Vendor reference</label>
              <input id="ext-ref" name="reference_number" placeholder="Extension certificate / email ref" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ext-notes" className={labelClass}>Notes</label>
              <textarea id="ext-notes" name="notes" rows={2} placeholder="What the extension covers" className={`${inputClass} h-auto py-2`} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              The warranty keeps its start date and its history — each extension is written onto it
              and journalled on the asset.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setExtendFor(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={extending}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {extending ? "Saving…" : "Extend Warranty"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
