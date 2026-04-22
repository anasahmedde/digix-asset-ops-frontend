"use client";

import { Pencil, Plus, Trash2, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface MaintenanceSchedule {
  id: string;
  title: string;
  maintenance_type: string;
  frequency: string;
  device: string | null;
  device_code: string | null;
  site: string | null;
  site_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  next_due: string;
  instructions: string;
  is_active: boolean;
  created_at: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors";
const labelClass = "text-xs font-medium text-gray-600";
const thClass =
  "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400";
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
  const { canWrite } = useUser();
  const canEdit = canWrite("maintenance");
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<MaintenanceSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ type: "", frequency: "", active: "" });
  const [search, setSearch] = useState("");

  const fetchSchedules = useCallback(async () => {
    try {
      const { data } = await api.get("/maintenance/schedules/");
      setSchedules(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load maintenance schedules"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

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
      next_due: fd.get("next_due"),
      instructions: fd.get("instructions"),
      is_active: fd.has("is_active"),
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
            <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
            <p className="text-gray-500">
              Manage preventive and corrective maintenance schedules
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setSelected(null);
              setModalMode("create");
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30"
          >
            <Plus className="h-4 w-4" /> Add Schedule
          </button>
        )}
      </div>

      <FilterBar
        filters={[
          { key: "type", label: "Type", options: Object.keys(TYPE_BADGES).map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })) },
          { key: "frequency", label: "Frequency", options: Object.entries(FREQ_LABEL).map(([v, l]) => ({ value: v, label: l })) },
          { key: "active", label: "Active", options: [{ value: "yes", label: "Active" }, { value: "no", label: "Inactive" }] },
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
          if (filterValues.active === "yes" && !s.is_active) return false;
          if (filterValues.active === "no" && s.is_active) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!s.title.toLowerCase().includes(q) && !(s.site_name || "").toLowerCase().includes(q) && !(s.device_code || "").toLowerCase().includes(q) && !(s.assigned_to_name || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Wrench className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No schedules found</h3>
          <p className="mt-2 text-sm text-gray-500">{schedules.length > 0 ? "Try adjusting your filters." : "Add a schedule to start tracking maintenance activities."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={thClass}>Title</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Frequency</th>
                  <th className={thClass}>Next Due</th>
                  <th className={thClass}>Device</th>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Assigned To</th>
                  <th className={thClass}>Active</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => { setSelected(s); setModalMode("edit"); }}
                    className="border-b border-gray-200 cursor-pointer transition-colors hover:bg-teal-50/40"
                  >
                    <td className={`${tdClass} font-medium text-gray-900`}>
                      {s.title}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TYPE_BADGES[s.maintenance_type] ?? "bg-gray-500/10 text-gray-400 ring-gray-500/20"}`}
                      >
                        {s.maintenance_type}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className="inline-flex rounded-full bg-gray-500/10 px-2.5 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-500/20">
                        {FREQ_LABEL[s.frequency] ?? s.frequency}
                      </span>
                    </td>
                    <td className={`${tdClass} text-gray-600`}>
                      {s.next_due
                        ? new Date(s.next_due).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className={`${tdClass} text-gray-600`}>
                      {s.device_code || "-"}
                    </td>
                    <td className={`${tdClass} text-gray-600`}>
                      {s.site_name || "-"}
                    </td>
                    <td className={`${tdClass} text-gray-600`}>
                      {s.assigned_to_name || "-"}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${s.is_active ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20" : "bg-red-500/10 text-red-400 ring-red-500/20"}`}
                      >
                        {s.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setSelected(s); setModalMode("edit"); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(s)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-400"
                            title="Delete"
                          >
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                {modalMode === "create"
                  ? "Add New Schedule"
                  : "Edit Schedule"}
              </h2>
              <button
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
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
              <div className="flex items-center gap-2">
                <input
                  id="is_active"
                  name="is_active"
                  type="checkbox"
                  defaultChecked={selected?.is_active ?? true}
                  className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="is_active" className={labelClass}>
                  Active
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-transparent px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 disabled:opacity-50"
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
    </div>
  );
}
