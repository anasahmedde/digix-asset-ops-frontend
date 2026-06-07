"use client";

import { HardDrive, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface Device {
  id: string;
  asset_code: string;
  serial_number: string;
  device_model: string;
  device_model_name: string;
  status: string;
  current_site: string | null;
  site_name: string | null;
  assigned_client: string | null;
  client_name: string | null;
  installation_date: string | null;
  created_at: string;
}

interface DeviceDetail extends Device {
  mobile_id: string;
  mac_address: string;
  imei: string;
  firmware_version: string;
  hardware_revision: string;
  purchase_date: string | null;
  purchase_price: string | null;
  supplier: string | null;
  invoice_reference: string;
  batch_number: string;
  assigned_technician: string | null;
  notes: string;
}

interface Option { id: string; label: string; }

const STATUSES = [
  { value: "procured", label: "Procured" },
  { value: "in_stock", label: "In Stock" },
  { value: "assigned", label: "Assigned" },
  { value: "installed", label: "Installed" },
  { value: "active", label: "Active" },
  { value: "under_maintenance", label: "Under Maintenance" },
  { value: "decommissioned", label: "Decommissioned" },
  { value: "lost_stolen", label: "Lost/Stolen" },
  { value: "rma", label: "RMA" },
  { value: "in_transit", label: "In Transit" },
];

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  installed: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  in_stock: "bg-teal-500/10 text-teal-600 ring-teal-500/20",
  procured: "bg-cyan-500/10 text-cyan-400 ring-cyan-500/20",
  under_maintenance: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  decommissioned: "bg-gray-500/10 text-gray-400 ring-gray-500/20",
  lost_stolen: "bg-red-500/10 text-red-400 ring-red-500/20",
  rma: "bg-orange-500/10 text-orange-400 ring-orange-500/20",
  in_transit: "bg-indigo-500/10 text-indigo-400 ring-indigo-500/20",
  assigned: "bg-teal-500/10 text-teal-400 ring-teal-500/20",
};

const inputClass =
  "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors";
const labelClass = "text-xs font-medium text-gray-600";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400";
const tdClass = "px-5 py-3.5";

export default function AssetsPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("devices");

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<DeviceDetail | null>(null);
  const [saving, setSaving] = useState(false);

  const [deviceModels, setDeviceModels] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "", site: "", client: "" });
  const [search, setSearch] = useState("");

  const fetchDevices = useCallback(async () => {
    try {
      const { data } = await api.get("/assets/devices/");
      setDevices(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load devices"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  async function loadOptions() {
    const [dm, st, cl, su] = await Promise.allSettled([
      api.get("/assets/device-models/", { params: { page_size: 200 } }),
      api.get("/sites/sites/", { params: { page_size: 200 } }),
      api.get("/clients/", { params: { page_size: 200 } }),
      api.get("/suppliers/", { params: { page_size: 200 } }),
    ]);
    if (dm.status === "fulfilled") setDeviceModels((dm.value.data.results ?? dm.value.data).map((m: { id: string; name: string; brand_name?: string }) => ({ id: m.id, label: m.brand_name ? `${m.brand_name} ${m.name}` : m.name })));
    if (st.status === "fulfilled") setSites((st.value.data.results ?? st.value.data).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })));
    if (cl.status === "fulfilled") setClients((cl.value.data.results ?? cl.value.data).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })));
    if (su.status === "fulfilled") setSuppliers((su.value.data.results ?? su.value.data).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })));
  }

  function openCreate() {
    setSelected(null);
    setModalMode("create");
    loadOptions();
  }

  async function openEdit(device: Device) {
    try {
      const { data } = await api.get(`/assets/devices/${device.id}/`);
      setSelected(data);
      setModalMode("edit");
      loadOptions();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load device details"));
    }
  }

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      serial_number: fd.get("serial_number"),
      status: fd.get("status"),
      device_model: fd.get("device_model") || undefined,
      mobile_id: fd.get("mobile_id"),
      mac_address: fd.get("mac_address"),
      imei: fd.get("imei"),
      firmware_version: fd.get("firmware_version"),
      notes: fd.get("notes"),
      current_site: fd.get("current_site") || null,
      assigned_client: fd.get("assigned_client") || null,
      supplier: fd.get("supplier") || null,
      purchase_date: fd.get("purchase_date") || null,
      purchase_price: fd.get("purchase_price") || null,
      installation_date: fd.get("installation_date") || null,
    };
    try {
      if (modalMode === "create") {
        await api.post("/assets/devices/", payload);
        toast.success("Device registered");
      } else if (selected) {
        await api.patch(`/assets/devices/${selected.id}/`, payload);
        toast.success("Device updated");
      }
      closeModal();
      fetchDevices();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save device"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(device: Device) {
    if (!confirm(`Delete device "${device.asset_code}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/assets/devices/${device.id}/`);
      toast.success("Device deleted");
      fetchDevices();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — device has linked records"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600">
            <HardDrive className="h-5 w-5 text-gray-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Device Registry</h1>
            <p className="text-gray-500">Manage all devices from procurement to retirement</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-medium text-gray-900 shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30">
            <Plus className="h-4 w-4" /> Add Device
          </button>
        )}
      </div>

      <FilterBar
        filters={[
          { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s.value, label: s.label })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by asset code, serial #..."
      />

      {(() => {
        const filtered = devices.filter((d) => {
          if (filterValues.status && d.status !== filterValues.status) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!d.asset_code.toLowerCase().includes(q) && !d.serial_number.toLowerCase().includes(q) && !(d.device_model_name || "").toLowerCase().includes(q) && !(d.site_name || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-500" />
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <HardDrive className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No devices registered</h3>
          <p className="mt-2 text-sm text-gray-500">Register your first device to start tracking your asset fleet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={thClass}>Asset Code</th>
                  <th className={thClass}>Serial #</th>
                  <th className={thClass}>Model</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Client</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} onClick={() => openEdit(d)} className="border-b border-gray-200 cursor-pointer transition-colors hover:bg-teal-50/40">
                    <td className={`${tdClass} font-mono font-medium text-teal-600`}>{d.asset_code}</td>
                    <td className={`${tdClass} text-gray-600`}>{d.serial_number}</td>
                    <td className={`${tdClass} text-gray-600`}>{d.device_model_name || "-"}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ${statusColors[d.status] || "bg-gray-500/10 text-gray-400 ring-gray-500/20"}`}>
                        {d.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className={`${tdClass} text-gray-600`}>{d.site_name || "-"}</td>
                    <td className={`${tdClass} text-gray-600`}>{d.client_name || "-"}</td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-400" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
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
          <div className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{modalMode === "create" ? "Register New Device" : "Edit Device"}</h2>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
              {modalMode === "edit" && selected && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Asset Code</label>
                  <input type="text" value={selected.asset_code} disabled className="flex h-10 w-full rounded-lg border border-gray-200 bg-gray-100 px-3 text-sm font-mono text-teal-600" />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="serial_number" className={labelClass}>Serial Number *</label>
                  <input id="serial_number" name="serial_number" required defaultValue={selected?.serial_number ?? ""} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="device_model" className={labelClass}>Device Model *</label>
                  <select id="device_model" name="device_model" required defaultValue={selected?.device_model ?? ""} className={inputClass}>
                    <option value="">Select model</option>
                    {deviceModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="status" className={labelClass}>Status</label>
                  <select id="status" name="status" defaultValue={selected?.status ?? "procured"} className={inputClass}>
                    {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="mac_address" className={labelClass}>MAC Address</label>
                  <input id="mac_address" name="mac_address" defaultValue={selected?.mac_address ?? ""} className={inputClass} placeholder="AA:BB:CC:DD:EE:FF" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="imei" className={labelClass}>IMEI</label>
                  <input id="imei" name="imei" defaultValue={selected?.imei ?? ""} className={inputClass} />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="mobile_id" className={labelClass}>CMS Device ID</label>
                  <input id="mobile_id" name="mobile_id" defaultValue={selected?.mobile_id ?? ""} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="firmware_version" className={labelClass}>Firmware Version</label>
                  <input id="firmware_version" name="firmware_version" defaultValue={selected?.firmware_version ?? ""} className={inputClass} />
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Assignment</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label htmlFor="current_site" className={labelClass}>Site</label>
                    <select id="current_site" name="current_site" defaultValue={selected?.current_site ?? ""} className={inputClass}>
                      <option value="">None</option>
                      {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="assigned_client" className={labelClass}>Client</label>
                    <select id="assigned_client" name="assigned_client" defaultValue={selected?.assigned_client ?? ""} className={inputClass}>
                      <option value="">None</option>
                      {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="installation_date" className={labelClass}>Installation Date</label>
                    <input id="installation_date" name="installation_date" type="date" defaultValue={selected?.installation_date ?? ""} className={inputClass} />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Procurement</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label htmlFor="supplier" className={labelClass}>Supplier</label>
                    <select id="supplier" name="supplier" defaultValue={selected?.supplier ?? ""} className={inputClass}>
                      <option value="">None</option>
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="purchase_date" className={labelClass}>Purchase Date</label>
                    <input id="purchase_date" name="purchase_date" type="date" defaultValue={selected?.purchase_date ?? ""} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="purchase_price" className={labelClass}>Purchase Price</label>
                    <input id="purchase_price" name="purchase_price" type="number" step="0.01" defaultValue={selected?.purchase_price ?? ""} className={inputClass} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="notes" className={labelClass}>Notes</label>
                <textarea id="notes" name="notes" rows={2} defaultValue={selected?.notes ?? ""} className={`${inputClass} h-auto py-2`} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-transparent px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-5 text-sm font-medium text-gray-900 shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Register Device" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
