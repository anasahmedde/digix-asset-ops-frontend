"use client";

import { Pencil, Plus, RotateCcw, Shield, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/ui/copy-button";
import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface Warranty {
  id: string;
  device: string;
  device_code: string | null;
  device_name: string | null;
  component_name: string | null;
  supplier: string | null;
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
  active: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  expired: "bg-red-500/10 text-red-400 ring-red-500/20",
  reissued: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  claimed: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  void: "bg-secondary/500/10 text-muted-foreground ring-gray-500/20",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  expired: "Warranty Completed",
  reissued: "Reissued",
  claimed: "Claimed",
  void: "Void",
};

const TYPE_BADGES: Record<string, string> = {
  manufacturer: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  extended: "bg-purple-500/10 text-purple-400 ring-purple-500/20",
  supplier: "bg-teal-500/10 text-teal-400 ring-teal-500/20",
  client: "bg-cyan-500/10 text-cyan-400 ring-cyan-500/20",
};

export default function WarrantiesPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("warranties");
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Warranty | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "", type: "" });
  const [search, setSearch] = useState("");

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
        {canEdit && (
          <button
            onClick={() => {
              setSelected(null);
              setModalMode("create");
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all"
          >
            <Plus className="h-4 w-4" /> Add Warranty
          </button>
        )}
      </div>

      <FilterBar
        filters={[
          { key: "status", label: "Status", options: Object.keys(STATUS_BADGES).map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })) },
          { key: "type", label: "Type", options: Object.keys(TYPE_BADGES).map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by device code, supplier..."
      />

      {(() => {
        const filtered = warranties.filter((w) => {
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
                  <th className={thClass}>Device</th>
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
                      <span className="inline-flex items-center gap-1">
                        {w.device_code || "-"}
                        {w.device_code && <CopyButton text={w.device_code} label="device code" />}
                      </span>
                      {(w.device_name || w.component_name) && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {w.device_name}{w.component_name ? `${w.device_name ? " · " : ""}${w.component_name}` : ""}
                        </span>
                      )}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TYPE_BADGES[w.warranty_type] ?? "bg-secondary/500/10 text-muted-foreground ring-gray-500/20"}`}
                      >
                        {w.warranty_type_display ?? w.warranty_type}
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
                          {["expired", "active"].includes(w.status) && (
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
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
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
                    <select
                      id="device"
                      name="device"
                      required
                      defaultValue=""
                      className={inputClass}
                    >
                      <option value="">Select a device</option>
                      {devices.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.asset_code}{d.display_name ? ` — ${d.display_name}` : ""}
                        </option>
                      ))}
                    </select>
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
                  <select
                    id="warranty_type"
                    name="warranty_type"
                    defaultValue={selected?.warranty_type ?? "manufacturer"}
                    className={inputClass}
                  >
                    <option value="manufacturer">Manufacturer</option>
                    <option value="extended">Extended</option>
                    <option value="supplier">Supplier</option>
                    <option value="client">Client</option>
                  </select>
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
                    <option value="claimed">Claimed</option>
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
    </div>
  );
}
