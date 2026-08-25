"use client";

import { Check, Pencil, Play, Plus, Trash2, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import { MultiSelect } from "@/components/ui/multi-select";
import { SearchSelect } from "@/components/ui/search-select";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface MaintenanceSchedule {
  id: string;
  title: string;
  maintenance_type: string;
  frequency: string;
  priority: string;
  device: string | null;
  device_code: string | null;
  device_name: string | null;
  site: string | null;
  site_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  vendors: string[];
  vendor_names: string[];
  next_due: string;
  instructions: string;
  status: string;
  status_display: string;
  effective_status: string;
  is_active: boolean;
  created_at: string;
}

interface Option { id: string; label: string }

const PRIORITY_BADGES: Record<string, string> = {
  low: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
  medium: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  high: "bg-red-500/10 text-red-500 ring-red-500/20",
};

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass =
  "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const TYPE_BADGES: Record<string, string> = {
  preventive: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  corrective: "bg-red-500/10 text-red-400 ring-red-500/20",
  predictive: "bg-purple-500/10 text-purple-400 ring-purple-500/20",
};

const FREQ_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  one_time: "One-time",
};

export default function MaintenancePage() {
  const { user, canWrite } = useUser();
  const canEdit = canWrite("maintenance");
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<MaintenanceSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ type: "", frequency: "", active: "" });
  const [search, setSearch] = useState("");
  const [deviceOptions, setDeviceOptions] = useState<Option[]>([]);
  const [siteOptions, setSiteOptions] = useState<Option[]>([]);
  const [userOptions, setUserOptions] = useState<Option[]>([]);
  const [formDevice, setFormDevice] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  const [formVendors, setFormVendors] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<Option[]>([]);
  const [formAssetInfo, setFormAssetInfo] = useState<{
    components: { name: string; quantity: number }[];
    dims: string | null;
  } | null>(null);
  const [completeFor, setCompleteFor] = useState<MaintenanceSchedule | null>(null);
  const [completeComponents, setCompleteComponents] = useState<{ id: string; name: string }[]>([]);
  const [usedComponents, setUsedComponents] = useState<string[]>([]);
  const [completePhotos, setCompletePhotos] = useState<File[]>([]);
  const [completing, setCompleting] = useState(false);
  const searchParams = useSearchParams();
  const autoOpenedRef = useRef(false);

  const fetchSchedules = useCallback(async () => {
    try {
      const { data } = await api.get("/maintenance/schedules/", { params: { page_size: 1000 } });
      setSchedules(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load maintenance schedules"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    const [dev, sites, users, sups] = await Promise.allSettled([
      api.get("/assets/devices/", { params: { page_size: 1000 } }),
      api.get("/sites/sites/", { params: { page_size: 1000 } }),
      api.get("/accounts/users/", { params: { is_field_staff: true, is_active: true, page_size: 200 } }),
      api.get("/suppliers/", { params: { page_size: 1000 } }),
    ]);
    if (dev.status === "fulfilled")
      setDeviceOptions((dev.value.data.results ?? []).map((d: { id: string; asset_code: string; display_name: string | null }) => ({
        id: d.id,
        label: d.display_name ? `${d.asset_code} — ${d.display_name}` : d.asset_code,
      })));
    if (sites.status === "fulfilled")
      setSiteOptions((sites.value.data.results ?? []).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })));
    if (users.status === "fulfilled")
      setUserOptions((users.value.data.results ?? []).map((u: { id: string; first_name: string; last_name: string; username: string }) => ({
        id: u.id,
        label: u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username,
      })));
    if (sups.status === "fulfilled")
      setSupplierOptions((sups.value.data.results ?? []).map((v: { id: string; name: string }) => ({ id: v.id, label: v.name })));
  }, []);

  useEffect(() => {
    fetchSchedules();
    loadOptions();
  }, [fetchSchedules, loadOptions]);

  async function handleFormDeviceChange(id: string) {
    setFormDevice(id);
    setFormAssetInfo(null);
    if (!id) return;
    try {
      const { data } = await api.get(`/assets/devices/${id}/`);
      const dims = data.length_in && data.width_in
        ? `${data.length_in} × ${data.width_in}${data.depth_in ? ` × ${data.depth_in}` : ""} in`
        : data.diagonal_inches
          ? `${data.diagonal_inches}"`
          : null;
      setFormAssetInfo({
        components: (data.components ?? []).map((c: { name: string; quantity: number }) => ({ name: c.name, quantity: c.quantity })),
        dims,
      });
    } catch { /* card stays hidden */ }
  }

  async function startWork(s: MaintenanceSchedule) {
    try {
      await api.patch(`/maintenance/schedules/${s.id}/`, { status: "in_process" });
      toast.success("Maintenance started");
      fetchSchedules();
    } catch (err) {
      toast.error(getApiError(err, "Failed to start maintenance"));
    }
  }

  async function openComplete(s: MaintenanceSchedule) {
    setCompleteFor(s);
    setUsedComponents([]);
    setCompletePhotos([]);
    setCompleteComponents([]);
    if (s.device) {
      try {
        const { data } = await api.get(`/assets/devices/${s.device}/`);
        setCompleteComponents((data.components ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
      } catch { /* components stay empty */ }
    }
  }

  async function submitComplete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!completeFor) return;
    setCompleting(true);
    const fd = new FormData(e.currentTarget);
    try {
      const { data: record } = await api.post("/maintenance/records/", {
        schedule: completeFor.id,
        performed_at: new Date().toISOString(),
        status: "completed",
        notes: fd.get("notes") || "",
        cost: fd.get("cost") || null,
        components_used: usedComponents,
      });
      for (const photo of completePhotos) {
        const photoForm = new FormData();
        photoForm.append("record", record.id);
        photoForm.append("image", photo);
        await api.post("/maintenance/record-photos/", photoForm, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      toast.success("Maintenance completed — schedule rolled to next cycle");
      setCompleteFor(null);
      fetchSchedules();
    } catch (err) {
      toast.error(getApiError(err, "Failed to complete maintenance"));
    } finally {
      setCompleting(false);
    }
  }

  useEffect(() => {
    if (autoOpenedRef.current || loading) return;
    const scheduleId = searchParams.get("schedule");
    if (!scheduleId) return;
    autoOpenedRef.current = true;
    const found = schedules.find((s) => s.id === scheduleId);
    if (found) {
      setSelected(found);
      handleFormDeviceChange(found.device ?? "");
      setFormAssignee(found.assigned_to ?? "");
      setFormVendors(found.vendors ?? []);
      setModalMode("edit");
    }
  }, [searchParams, loading, schedules]);

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      title: fd.get("title"),
      maintenance_type: fd.get("maintenance_type"),
      frequency: fd.get("frequency"),
      priority: fd.get("priority"),
      device: fd.get("device") || null,
      site: fd.get("site") || null,
      assigned_to: fd.get("assigned_to") || null,
      vendors: fd.getAll("vendors"),
      next_due: fd.get("next_due"),
      instructions: fd.get("instructions"),
      status: fd.get("status"),
    };
    try {
      if (modalMode === "create") {
        await api.post("/maintenance/schedules/", payload);
        toast.success("Schedule created");
      } else if (selected) {
        await api.patch(`/maintenance/schedules/${selected.id}/`, payload);
        toast.success("Schedule updated");
      }
      closeModal();
      fetchSchedules();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save schedule"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(schedule: MaintenanceSchedule) {
    if (!confirm(`Delete schedule "${schedule.title}"? This cannot be undone.`))
      return;
    try {
      await api.delete(`/maintenance/schedules/${schedule.id}/`);
      toast.success("Schedule deleted");
      fetchSchedules();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — schedule may have linked records"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-600">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Maintenance</h1>
            <p className="text-muted-foreground">
              Manage preventive and corrective maintenance schedules
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setSelected(null);
              setFormDevice("");
              setFormAssetInfo(null);
              setFormAssignee("");
              setFormVendors([]);
              setModalMode("create");
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all"
          >
            <Plus className="h-4 w-4" /> Add Schedule
          </button>
        )}
      </div>

      <FilterBar
        filters={[
          { key: "type", label: "Type", options: Object.keys(TYPE_BADGES).map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })) },
          { key: "frequency", label: "Frequency", options: Object.entries(FREQ_LABEL).map(([v, l]) => ({ value: v, label: l })) },
          { key: "status", label: "Status", options: [["active", "Active"], ["pending", "Pending"], ["in_process", "In Process"], ["on_hold", "On Hold"], ["overdue", "Over Due"], ["completed", "Completed"]].map(([v, l]) => ({ value: v, label: l })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by title, site, device..."
      />

      {(() => {
        const filtered = schedules.filter((s) => {
          if (filterValues.type && s.maintenance_type !== filterValues.type) return false;
          if (filterValues.frequency && s.frequency !== filterValues.frequency) return false;
          if (filterValues.status && (s.effective_status || s.status) !== filterValues.status) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!s.title.toLowerCase().includes(q) && !(s.site_name || "").toLowerCase().includes(q) && !(s.device_code || "").toLowerCase().includes(q) && !(s.assigned_to_name || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Wrench className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No schedules found</h3>
          <p className="mt-2 text-sm text-muted-foreground">{schedules.length > 0 ? "Try adjusting your filters." : "Add a schedule to start tracking maintenance activities."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Title</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Frequency</th>
                  <th className={thClass}>Priority</th>
                  <th className={thClass}>Next Due</th>
                  <th className={thClass}>Device</th>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Assigned To</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => { setSelected(s); handleFormDeviceChange(s.device ?? ""); setFormAssignee(s.assigned_to ?? ""); setFormVendors(s.vendors ?? []); setModalMode("edit"); }}
                    className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30"
                  >
                    <td className={`${tdClass} font-medium text-foreground`}>
                      {s.title}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TYPE_BADGES[s.maintenance_type] ?? "bg-secondary/500/10 text-muted-foreground ring-gray-500/20"}`}
                      >
                        {s.maintenance_type}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className="inline-flex rounded-full bg-secondary/500/10 px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-gray-500/20">
                        {FREQ_LABEL[s.frequency] ?? s.frequency}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ${PRIORITY_BADGES[s.priority] ?? PRIORITY_BADGES.medium}`}>
                        {s.priority || "medium"}
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {s.next_due
                        ? new Date(s.next_due).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {s.device_code || "-"}
                      {s.device_name && <span className="block text-xs">{s.device_name}</span>}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {s.site_name || "-"}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {s.assigned_to_name || "-"}
                      {(s.vendor_names ?? []).length > 0 && (
                        <span className="block text-xs">Vendors: {s.vendor_names.join(", ")}</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      {(() => {
                        const st = s.effective_status || s.status || "active";
                        const styles: Record<string, string> = {
                          active: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
                          pending: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
                          in_process: "bg-cyan-500/10 text-cyan-400 ring-cyan-500/20",
                          on_hold: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
                          overdue: "bg-red-500/10 text-red-400 ring-red-500/20",
                          completed: "bg-gray-500/10 text-gray-400 ring-gray-500/20",
                        };
                        const labels: Record<string, string> = { in_process: "In Process", on_hold: "On Hold", overdue: "Over Due" };
                        const text = labels[st] || st.charAt(0).toUpperCase() + st.slice(1);
                        return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${styles[st] || styles.active}`}>{text}</span>;
                      })()}
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {(canEdit || user?.id === s.assigned_to) ? (
                        <div className="flex items-center gap-1">
                          {["active", "pending", "overdue"].includes(s.effective_status || s.status) && (
                            <button
                              onClick={() => startWork(s)}
                              className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20"
                              title="Start maintenance"
                            >
                              <Play className="h-3 w-3" /> Start
                            </button>
                          )}
                          {(s.effective_status || s.status) !== "completed" && (
                            <button
                              onClick={() => openComplete(s)}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20"
                              title="Complete this cycle"
                            >
                              <Check className="h-3 w-3" /> Complete
                            </button>
                          )}
                          {canEdit && (
                          <button
                            onClick={() => { setSelected(s); handleFormDeviceChange(s.device ?? ""); setFormAssignee(s.assigned_to ?? ""); setFormVendors(s.vendors ?? []); setModalMode("edit"); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          )}
                          {canEdit && (
                          <button
                            onClick={() => handleDelete(s)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          )}
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
                  ? "Add New Schedule"
                  : "Edit Schedule"}
              </h2>
              <button
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="title" className={labelClass}>
                  Title
                </label>
                <input
                  id="title"
                  name="title"
                  required
                  defaultValue={selected?.title ?? ""}
                  className={inputClass}
                  placeholder="e.g. Monthly HVAC Filter Replacement"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="maintenance_type" className={labelClass}>
                    Maintenance Type
                  </label>
                  <select
                    id="maintenance_type"
                    name="maintenance_type"
                    defaultValue={selected?.maintenance_type ?? "preventive"}
                    className={inputClass}
                  >
                    <option value="preventive">Preventive</option>
                    <option value="corrective">Corrective</option>
                    <option value="predictive">Predictive</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="frequency" className={labelClass}>
                    Frequency
                  </label>
                  <select
                    id="frequency"
                    name="frequency"
                    defaultValue={selected?.frequency ?? "monthly"}
                    className={inputClass}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                    <option value="one_time">One-time</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={labelClass}>Asset</label>
                  <SearchSelect
                    options={deviceOptions}
                    value={formDevice}
                    onChange={handleFormDeviceChange}
                    name="device"
                    placeholder="Search asset…"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="m-site" className={labelClass}>Site</label>
                  <select id="m-site" name="site" defaultValue={selected?.site ?? ""} className={inputClass}>
                    <option value="">None</option>
                    {siteOptions.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Assign To</label>
                  <SearchSelect
                    options={userOptions}
                    value={formAssignee}
                    onChange={setFormAssignee}
                    name="assigned_to"
                    placeholder="Search person…"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={labelClass}>Vendors (can be multiple)</label>
                  <MultiSelect
                    options={supplierOptions}
                    values={formVendors}
                    onChange={setFormVendors}
                    name="vendors"
                    placeholder="Select vendors…"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="m-priority" className={labelClass}>Priority</label>
                  <select id="m-priority" name="priority" defaultValue={selected?.priority ?? "medium"} className={inputClass}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              {formAssetInfo && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                  <p className="mb-1 font-semibold text-foreground">
                    Asset components: {formAssetInfo.components.length}
                    {formAssetInfo.dims ? ` · dimensions ${formAssetInfo.dims}` : ""}
                  </p>
                  {formAssetInfo.components.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {formAssetInfo.components.map((c, i) => (
                        <span key={i} className="rounded-full bg-card px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
                          {c.name} ×{c.quantity}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Single-unit asset — no components recorded.</p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="next_due" className={labelClass}>
                  Next Due Date
                </label>
                <input
                  id="next_due"
                  name="next_due"
                  type="date"
                  required
                  defaultValue={selected?.next_due?.split("T")[0] ?? ""}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="instructions" className={labelClass}>
                  Instructions
                </label>
                <textarea
                  id="instructions"
                  name="instructions"
                  rows={3}
                  defaultValue={selected?.instructions ?? ""}
                  className={`${inputClass} h-auto py-2`}
                  placeholder="Step-by-step maintenance instructions..."
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="status" className={labelClass}>Status</label>
                <select id="status" name="status" defaultValue={selected?.status ?? "active"} className={inputClass}>
                  <option value="active">Active</option>
                  <option value="pending">Pending</option>
                  <option value="in_process">In Process</option>
                  <option value="on_hold">On Hold</option>
                  <option value="overdue">Over Due</option>
                  <option value="completed">Completed</option>
                </select>
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
                      ? "Create Schedule"
                      : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete-maintenance modal */}
      {completeFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Complete — {completeFor.title}</h2>
              <button onClick={() => setCompleteFor(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitComplete} className="space-y-4">
              {completeComponents.length > 0 && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Components used / serviced</label>
                  <div className="flex flex-wrap gap-2">
                    {completeComponents.map((c) => {
                      const on = usedComponents.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setUsedComponents((cur) => (on ? cur.filter((v) => v !== c.id) : [...cur, c.id]))}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            on ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {on && <Check className="h-3 w-3" />}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="mc-notes" className={labelClass}>Work done / notes</label>
                <textarea id="mc-notes" name="notes" rows={3} className={`${inputClass} h-auto py-2`} placeholder="What was done, parts replaced, observations…" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="mc-cost" className={labelClass}>Cost (optional)</label>
                  <input id="mc-cost" name="cost" type="number" step="0.01" className={inputClass} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="mc-photos" className={labelClass}>Photos</label>
                  <input
                    id="mc-photos"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setCompletePhotos(Array.from(e.target.files ?? []))}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary"
                  />
                  {completePhotos.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">{completePhotos.length} photo{completePhotos.length > 1 ? "s" : ""} selected</p>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Completing logs a maintenance record and rolls the schedule to its next {FREQ_LABEL[completeFor.frequency]?.toLowerCase() ?? ""} cycle{completeFor.frequency === "one_time" ? " (one-time schedules close out)" : ""}.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCompleteFor(null)} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  Cancel
                </button>
                <button type="submit" disabled={completing} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                  {completing ? "Saving..." : "Complete Maintenance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
