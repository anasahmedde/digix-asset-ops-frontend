"use client";

import { Pencil, Plus, Ticket, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface TicketItem {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  category: string;
  device: string | null;
  device_code: string | null;
  site: string | null;
  site_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  reported_by: string | null;
  reported_by_name: string | null;
  due_date: string | null;
  resolved_at: string | null;
  resolution_notes: string;
  created_at: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors";
const labelClass = "text-xs font-medium text-gray-600";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400";
const tdClass = "px-5 py-3.5";

const priorityBadge: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 ring-red-500/20",
  high: "bg-orange-500/10 text-orange-400 ring-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 ring-yellow-500/20",
  low: "bg-gray-500/10 text-gray-400 ring-gray-500/20",
};

const statusBadge: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  on_hold: "bg-gray-500/10 text-gray-400 ring-gray-500/20",
  resolved: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  closed: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TicketsPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("tickets");
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<TicketItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formStatus, setFormStatus] = useState("open");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "", priority: "", category: "" });
  const [search, setSearch] = useState("");

  const fetchTickets = useCallback(async () => {
    try {
      const { data } = await api.get("/tickets/");
      setTickets(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load tickets"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  function openCreate() {
    setSelected(null);
    setFormStatus("open");
    setModalMode("create");
  }

  function openEdit(t: TicketItem) {
    setSelected(t);
    setFormStatus(t.status);
    setModalMode("edit");
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
      title: fd.get("title"),
      description: fd.get("description"),
      priority: fd.get("priority"),
      status: fd.get("status"),
      category: fd.get("category"),
      due_date: fd.get("due_date") || null,
      resolution_notes: fd.get("resolution_notes") ?? "",
    };
    try {
      if (modalMode === "create") {
        await api.post("/tickets/", payload);
        toast.success("Ticket created");
      } else if (selected) {
        await api.patch(`/tickets/${selected.id}/`, payload);
        toast.success("Ticket updated");
      }
      closeModal();
      fetchTickets();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save ticket"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(t: TicketItem) {
    if (!confirm(`Delete ticket "${t.title}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/tickets/${t.id}/`);
      toast.success("Ticket deleted");
      fetchTickets();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — ticket may have linked records"));
    }
  }

  const showResolution = formStatus === "resolved" || formStatus === "closed";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600">
            <Ticket className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
            <p className="text-gray-500">Track and resolve field issues</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30">
            <Plus className="h-4 w-4" /> Add Ticket
          </button>
        )}
      </div>

      <FilterBar
        filters={[
          { key: "status", label: "Status", options: Object.keys(statusBadge).map((s) => ({ value: s, label: formatLabel(s) })) },
          { key: "priority", label: "Priority", options: Object.keys(priorityBadge).map((p) => ({ value: p, label: formatLabel(p) })) },
          { key: "category", label: "Category", options: ["hardware", "software", "network", "electrical", "installation", "deinstallation", "general"].map((c) => ({ value: c, label: formatLabel(c) })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by title, site..."
      />

      {(() => {
        const filtered = tickets.filter((t) => {
          if (filterValues.status && t.status !== filterValues.status) return false;
          if (filterValues.priority && t.priority !== filterValues.priority) return false;
          if (filterValues.category && t.category !== filterValues.category) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!t.title.toLowerCase().includes(q) && !(t.site_name || "").toLowerCase().includes(q) && !(t.assigned_to_name || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Ticket className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No tickets found</h3>
          <p className="mt-2 text-sm text-gray-500">{tickets.length > 0 ? "Try adjusting your filters." : "Create a ticket to start tracking field issues."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={thClass}>Title</th>
                  <th className={thClass}>Priority</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Category</th>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Assigned To</th>
                  <th className={thClass}>Due Date</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} onClick={() => openEdit(t)} className="border-b border-gray-200 cursor-pointer transition-colors hover:bg-teal-50/40">
                    <td className={`${tdClass} font-medium text-gray-900`}>{t.title}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${priorityBadge[t.priority] ?? priorityBadge.low}`}>
                        {formatLabel(t.priority)}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusBadge[t.status] ?? statusBadge.open}`}>
                        {formatLabel(t.status)}
                      </span>
                    </td>
                    <td className={`${tdClass} text-gray-600`}>{formatLabel(t.category)}</td>
                    <td className={`${tdClass} text-gray-600`}>{t.site_name || "-"}</td>
                    <td className={`${tdClass} text-gray-600`}>{t.assigned_to_name || "-"}</td>
                    <td className={`${tdClass} text-gray-600`}>{t.due_date || "-"}</td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(t)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(t)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-400" title="Delete">
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
              <h2 className="text-lg font-semibold text-gray-900">{modalMode === "create" ? "Create Ticket" : "Edit Ticket"}</h2>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="title" className={labelClass}>Title</label>
                <input id="title" name="title" required defaultValue={selected?.title ?? ""} className={inputClass} placeholder="Brief summary of the issue" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="description" className={labelClass}>Description</label>
                <textarea id="description" name="description" rows={3} defaultValue={selected?.description ?? ""} className={`${inputClass} h-auto py-2`} placeholder="Detailed description of the issue" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="priority" className={labelClass}>Priority</label>
                  <select id="priority" name="priority" defaultValue={selected?.priority ?? "medium"} className={inputClass}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="status" className={labelClass}>Status</label>
                  <select id="status" name="status" defaultValue={selected?.status ?? "open"} className={inputClass} onChange={(e) => setFormStatus(e.target.value)}>
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="on_hold">On Hold</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="category" className={labelClass}>Category</label>
                  <select id="category" name="category" defaultValue={selected?.category ?? "other"} className={inputClass}>
                    <option value="installation">Installation</option>
                    <option value="repair">Repair</option>
                    <option value="replacement">Replacement</option>
                    <option value="inspection">Inspection</option>
                    <option value="relocation">Relocation</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="due_date" className={labelClass}>Due Date</label>
                <input id="due_date" name="due_date" type="date" defaultValue={selected?.due_date ?? ""} className={inputClass} />
              </div>
              {showResolution && (
                <div className="space-y-1.5">
                  <label htmlFor="resolution_notes" className={labelClass}>Resolution Notes</label>
                  <textarea id="resolution_notes" name="resolution_notes" rows={3} defaultValue={selected?.resolution_notes ?? ""} className={`${inputClass} h-auto py-2`} placeholder="How was this issue resolved?" />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-transparent px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Create Ticket" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
