"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle,
  ChevronRight,
  ClipboardList,
  Eye,
  Pencil,
  Plus,
  Trash2,
  Truck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Modal } from "@/components/ui/modal";
import { SearchSelect } from "@/components/ui/search-select";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";

interface ClientOpt { id: string; name: string }
interface Option { id: string; label: string }
const STATUS_OPTIONS = [
  { value: "planning", label: "Planning" },
  { value: "on_track", label: "On Track" },
  { value: "at_risk", label: "At Risk" },
  { value: "delayed", label: "Delayed" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
];
// Commercial lifecycle, in order. "On Hold" and "Lost" are off-ramp phases.
const PHASES = [
  { value: "query", label: "Query" },
  { value: "quotation", label: "Quotation" },
  { value: "negotiation", label: "Negotiation" },
  { value: "order_confirmation", label: "Order Confirmation" },
  { value: "production", label: "Production" },
  { value: "delivery", label: "Delivery" },
  { value: "installation", label: "Installation" },
  { value: "handover", label: "Handing Over" },
  { value: "under_warranty", label: "Under Warranty" },
  { value: "extended_warranty", label: "Extended Warranty" },
  { value: "decommissioned", label: "De-Commissioned" },
];
const OFF_RAMP_PHASES = [
  { value: "on_hold", label: "On Hold" },
  { value: "lost", label: "Lost" },
];
const emptyForm = {
  name: "", location: "", description: "", status: "planning", phase: "query",
  client: "", site: "", manager: "", start_date: "", target_date: "", budget: "",
};

interface ScopeItem {
  id: string;
  device: string;
  device_code: string;
  device_name: string | null;
  component: string | null;
  component_name: string | null;
  quantity: number;
  site: string | null;
  site_name: string | null;
  start_date: string | null;
  notes: string;
}

interface Milestone {
  id: string;
  title: string;
  due_date: string | null;
  completed_at: string | null;
  order: number;
}

interface ProjectDetail {
  id: string;
  name: string;
  description: string;
  location: string;
  client: string | null;
  client_name: string | null;
  site: string | null;
  site_name: string | null;
  status: string;
  status_display: string;
  phase: string;
  phase_display: string;
  progress: number;
  start_date: string | null;
  target_date: string | null;
  completed_date: string | null;
  manager: string | null;
  manager_name: string | null;
  budget: string | null;
  notes: string;
  scope_items: ScopeItem[];
  milestones: Milestone[];
  bottlenecks: { id: string; title: string; severity: string; is_resolved: boolean }[];
}

interface LinkedAsset {
  id: string;
  asset_code: string;
  display_name: string | null;
  status: string;
  site_name: string | null;
}

interface ProjectStats {
  total: number;
  on_track: number;
  at_risk: number;
  delayed: number;
  completed: number;
  flagged_projects: {
    id: string;
    name: string;
    progress: number;
    status: string;
    bottleneck_count: number;
  }[];
  top_bottlenecks: { title: string; project_count: number }[];
}

interface Project {
  id: string;
  name: string;
  location: string;
  image: string | null;
  status: string;
  status_display: string;
  phase: string;
  phase_display: string;
  progress: number;
  start_date: string | null;
  target_date: string | null;
  bottleneck_count: number;
}

export default function ProjectsPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("devices");
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [linkedAssets, setLinkedAssets] = useState<LinkedAsset[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<Option[]>([]);
  const [siteOptions, setSiteOptions] = useState<Option[]>([]);
  const [managerOptions, setManagerOptions] = useState<Option[]>([]);
  const [scopeDevice, setScopeDevice] = useState("");
  const [scopeComponents, setScopeComponents] = useState<Option[]>([]);
  const [addingScope, setAddingScope] = useState(false);

  async function loadDetail(id: string) {
    try {
      const { data } = await api.get(`/teams/projects/${id}/`);
      setDetail(data);
      api.get("/assets/devices/", { params: { project: id, page_size: 1000 } })
        .then((r) => setLinkedAssets(r.data.results ?? []))
        .catch(() => setLinkedAssets([]));
      if (deviceOptions.length === 0) {
        api.get("/assets/devices/", { params: { page_size: 1000 } })
          .then((r) => setDeviceOptions((r.data.results ?? []).map((d: { id: string; asset_code: string; display_name: string | null }) => ({
            id: d.id,
            label: d.display_name ? `${d.asset_code} — ${d.display_name}` : d.asset_code,
          }))))
          .catch(() => {});
        api.get("/sites/sites/", { params: { page_size: 1000 } })
          .then((r) => setSiteOptions((r.data.results ?? []).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name }))))
          .catch(() => {});
      }
    } catch (err) {
      toast.error(getApiError(err, "Failed to load project"));
    }
  }

  async function setPhase(phase: string) {
    if (!detail) return;
    try {
      await api.patch(`/teams/projects/${detail.id}/`, { phase });
      await loadDetail(detail.id);
      fetchAll();
      toast.success("Project phase updated");
    } catch (err) {
      toast.error(getApiError(err, "Failed to update phase"));
    }
  }

  async function handleScopeDeviceChange(id: string) {
    setScopeDevice(id);
    setScopeComponents([]);
    if (!id) return;
    try {
      const { data } = await api.get(`/assets/devices/${id}/`);
      setScopeComponents((data.components ?? []).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })));
    } catch { /* leave empty */ }
  }

  async function addScopeItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;
    setAddingScope(true);
    const fd = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    try {
      await api.post("/teams/scope-items/", {
        project: detail.id,
        device: fd.get("scope_device"),
        component: fd.get("scope_component") || null,
        quantity: Number(fd.get("scope_qty") || 1),
        site: fd.get("scope_site") || null,
        start_date: fd.get("scope_start") || null,
        notes: fd.get("scope_notes") || "",
      });
      formEl.reset();
      setScopeDevice("");
      setScopeComponents([]);
      toast.success("Scope item added");
      loadDetail(detail.id);
    } catch (err) {
      toast.error(getApiError(err, "Failed to add scope item"));
    } finally {
      setAddingScope(false);
    }
  }

  async function deleteScopeItem(id: string) {
    if (!detail) return;
    try {
      await api.delete(`/teams/scope-items/${id}/`);
      loadDetail(detail.id);
    } catch (err) {
      toast.error(getApiError(err, "Failed to remove scope item"));
    }
  }

  async function addMilestone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;
    const fd = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    try {
      await api.post("/teams/milestones/", {
        project: detail.id,
        title: fd.get("ms_title"),
        due_date: fd.get("ms_due") || null,
        order: detail.milestones.length + 1,
      });
      formEl.reset();
      toast.success("Milestone added");
      loadDetail(detail.id);
    } catch (err) {
      toast.error(getApiError(err, "Failed to add milestone"));
    }
  }

  async function toggleMilestone(m: Milestone) {
    if (!detail) return;
    try {
      await api.patch(`/teams/milestones/${m.id}/`, {
        completed_at: m.completed_at ? null : new Date().toISOString(),
      });
      loadDetail(detail.id);
    } catch (err) {
      toast.error(getApiError(err, "Failed to update milestone"));
    }
  }

  async function deleteMilestone(id: string) {
    if (!detail) return;
    try {
      await api.delete(`/teams/milestones/${id}/`);
      loadDetail(detail.id);
    } catch (err) {
      toast.error(getApiError(err, "Failed to remove milestone"));
    }
  }

  function openEdit(p: ProjectDetail) {
    setForm({
      name: p.name,
      location: p.location ?? "",
      description: p.description ?? "",
      status: p.status,
      phase: p.phase,
      client: p.client ?? "",
      site: p.site ?? "",
      manager: p.manager ?? "",
      start_date: p.start_date ?? "",
      target_date: p.target_date ?? "",
      budget: p.budget ? String(p.budget) : "",
    });
    setEditingId(p.id);
    setModalOpen(true);
  }

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, projectsRes] = await Promise.allSettled([
        api.get("/teams/projects/dashboard_stats/"),
        api.get("/teams/projects/", { params: { page_size: 50, ordering: "-created_at" } }),
      ]);
      if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
      if (projectsRes.status === "fulfilled") setProjects(projectsRes.value.data.results ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    api.get("/clients/", { params: { page_size: 200 } })
      .then((r) => setClients((r.data.results ?? r.data).map((c: ClientOpt) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
    api.get("/sites/sites/", { params: { page_size: 1000 } })
      .then((r) => setSiteOptions((r.data.results ?? []).map((st: { id: string; name: string }) => ({ id: st.id, label: st.name }))))
      .catch(() => {});
    api.get("/accounts/users/", { params: { is_active: true, page_size: 200 } })
      .then((r) => setManagerOptions((r.data.results ?? []).map((u: { id: string; first_name: string; last_name: string; username: string }) => ({
        id: u.id,
        label: u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username,
      }))))
      .catch(() => {});
  }, [fetchAll]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { toast.error("Project name is required"); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      location: form.location,
      description: form.description,
      status: form.status,
      phase: form.phase,
      client: form.client || null,
      site: form.site || null,
      manager: form.manager || null,
      start_date: form.start_date || null,
      target_date: form.target_date || null,
      budget: form.budget ? Number(form.budget) : null,
    };
    try {
      if (editingId) {
        await api.patch(`/teams/projects/${editingId}/`, payload);
        toast.success("Project updated");
        loadDetail(editingId);
      } else {
        await api.post("/teams/projects/", payload);
        toast.success("Project created");
      }
      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchAll();
    } catch (err) {
      toast.error(getApiError(err, "Failed to save project"));
    } finally {
      setSaving(false);
    }
  }

  const projectFormModal = (
    <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingId(null); }} title={editingId ? "Edit Project" : "New Project"} size="md">
      <form onSubmit={createProject} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Project name *</label>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Lucky One Mall rollout"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Client</label>
            <select value={form.client} onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none">
              <option value="">—</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Status</label>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none">
              {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Location</label>
          <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="City / mall / area" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Start date</label>
            <input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Target date</label>
            <input type="date" value={form.target_date} onChange={(e) => setForm((f) => ({ ...f, target_date: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Budget (optional)</label>
          <input type="number" min="0" value={form.budget} onChange={(e) => setForm((f) => ({ ...f, budget: e.target.value }))} placeholder="0" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Description</label>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => setModalOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-60">
            {saving ? "Saving…" : editingId ? "Save Changes" : "Create Project"}
          </button>
        </div>
      </form>
    </Modal>
  );

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  /* ─── PROJECT DETAIL VIEW ─── */
  if (detail) {
    const d = detail;
    const phaseIdx = PHASES.findIndex((ph) => ph.value === d.phase);
    const offRamp = OFF_RAMP_PHASES.find((ph) => ph.value === d.phase);
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDetail(null)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
              {d.name}
              <CopyButton text={d.name} label="project name" />
            </h1>
            <p className="text-sm text-muted-foreground">
              {d.client_name ? `${d.client_name} · ` : ""}{d.location || d.site_name || ""}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <StatusBadge status={d.status} label={d.status_display} />
            {canEdit && (
              <button onClick={() => openEdit(d)} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
          </div>
        </div>

        {/* Phase pipeline */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Project Phase</h2>
            {offRamp && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${d.phase === "lost" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-600"}`}>
                {offRamp.label}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PHASES.map((ph, i) => {
              const isCurrent = ph.value === d.phase;
              const isDone = phaseIdx >= 0 && i < phaseIdx;
              return (
                <button
                  key={ph.value}
                  onClick={() => canEdit && setPhase(ph.value)}
                  disabled={!canEdit}
                  title={canEdit ? `Move project to ${ph.label}` : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isCurrent
                      ? "border-primary bg-primary text-white"
                      : isDone
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground"
                  } ${canEdit ? "cursor-pointer hover:border-primary/50" : "cursor-default"}`}
                >
                  {isDone && <Check className="h-3 w-3" />}
                  {ph.label}
                </button>
              );
            })}
            {OFF_RAMP_PHASES.map((ph) => (
              <button
                key={ph.value}
                onClick={() => canEdit && setPhase(ph.value)}
                disabled={!canEdit}
                className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  d.phase === ph.value
                    ? ph.value === "lost" ? "border-red-500 bg-red-500 text-white" : "border-amber-500 bg-amber-500 text-white"
                    : "border-dashed border-border bg-card text-muted-foreground"
                } ${canEdit ? "cursor-pointer hover:border-red-400" : "cursor-default"}`}
              >
                {ph.label}
              </button>
            ))}
          </div>
        </div>

        {/* Info strip */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Manager", value: d.manager_name || "—" },
            { label: "Start Date", value: d.start_date || "—" },
            { label: "Target Date", value: d.target_date || "—" },
            { label: "Budget", value: d.budget ? `PKR ${Number(d.budget).toLocaleString()}` : "—" },
            { label: "Progress", value: `${d.progress}%` },
          ].map((f) => (
            <div key={f.label} className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</p>
              <p className="text-sm font-medium text-foreground">{f.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Scope */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Scope — assets, components, quantities & locations</h3>
              {d.scope_items.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Asset</th>
                        <th className="px-3 py-2 font-medium">Component</th>
                        <th className="px-3 py-2 font-medium">Qty</th>
                        <th className="px-3 py-2 font-medium">Location</th>
                        <th className="px-3 py-2 font-medium">Start</th>
                        <th className="px-3 py-2 font-medium">Notes</th>
                        {canEdit && <th className="px-3 py-2" />}
                      </tr>
                    </thead>
                    <tbody>
                      {d.scope_items.map((it) => (
                        <tr key={it.id} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2">
                            <Link href={`/assets?device=${it.device}`} className="font-medium text-primary hover:underline">
                              {it.device_code}
                            </Link>
                            {it.device_name && <span className="block text-muted-foreground">{it.device_name}</span>}
                          </td>
                          <td className="px-3 py-2 text-foreground">{it.component_name || "Whole asset"}</td>
                          <td className="px-3 py-2 text-foreground">×{it.quantity}</td>
                          <td className="px-3 py-2 text-muted-foreground">{it.site_name || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{it.start_date || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{it.notes || "—"}</td>
                          {canEdit && (
                            <td className="px-3 py-2 text-right">
                              <button onClick={() => deleteScopeItem(it.id)} className="text-muted-foreground transition-colors hover:text-destructive" title="Remove">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No scope items yet.</p>
              )}
              {canEdit && (
                <form onSubmit={addScopeItem} className="mt-3 space-y-2 rounded-lg border border-border/70 p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <SearchSelect
                        options={deviceOptions}
                        value={scopeDevice}
                        onChange={handleScopeDeviceChange}
                        name="scope_device"
                        required
                        placeholder="Search asset…"
                      />
                    </div>
                    <select name="scope_component" defaultValue="" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground focus:outline-none" disabled={scopeComponents.length === 0}>
                      <option value="">{scopeComponents.length === 0 ? "Whole asset" : "Component: whole asset"}</option>
                      {scopeComponents.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <input name="scope_qty" type="number" min={1} defaultValue={1} title="Quantity" placeholder="Qty" className="h-10 w-20 shrink-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:outline-none" />
                    <select name="scope_site" defaultValue="" title="Deployment location" className="h-10 min-w-40 flex-1 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground focus:outline-none">
                      <option value="">Location: none</option>
                      {siteOptions.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
                    </select>
                    <input name="scope_start" type="date" title="Start date at this location" className="h-10 w-40 shrink-0 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground focus:outline-none" />
                    <input name="scope_notes" placeholder="Notes" className="h-10 min-w-40 flex-1 rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
                  </div>
                  <button type="submit" disabled={addingScope} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
                    <Plus className="h-3.5 w-3.5" /> Add to Scope
                  </button>
                </form>
              )}
            </div>

            {/* Linked assets */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Assets on this Project ({linkedAssets.length})</h3>
              {linkedAssets.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {linkedAssets.map((a) => (
                    <Link key={a.id} href={`/assets?device=${a.id}`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5">
                      <span className="font-mono font-medium text-primary">{a.asset_code}</span>
                      {a.display_name && <span className="text-foreground">{a.display_name}</span>}
                      <StatusBadge status={a.status} />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No assets linked — set this project on an asset from the Asset Registry.</p>
              )}
            </div>
          </div>

          {/* Right rail: milestones + bottlenecks */}
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Milestones</h3>
              {d.milestones.length > 0 ? (
                <div className="space-y-2">
                  {d.milestones.map((m) => (
                    <div key={m.id} className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2">
                      <button
                        onClick={() => canEdit && toggleMilestone(m)}
                        disabled={!canEdit}
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          m.completed_at ? "border-primary bg-primary text-white" : "border-border"
                        } ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                        title={m.completed_at ? "Mark as not done" : "Mark as done"}
                      >
                        {m.completed_at && <Check className="h-3 w-3" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-medium ${m.completed_at ? "text-muted-foreground line-through" : "text-foreground"}`}>{m.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {m.due_date ? `Due ${m.due_date}` : ""}
                          {m.completed_at ? `${m.due_date ? " · " : ""}done ${new Date(m.completed_at).toLocaleDateString()}` : ""}
                        </p>
                      </div>
                      {canEdit && (
                        <button onClick={() => deleteMilestone(m.id)} className="text-muted-foreground transition-colors hover:text-destructive" title="Remove milestone">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No milestones yet.</p>
              )}
              {canEdit && (
                <form onSubmit={addMilestone} className="mt-3 flex gap-2">
                  <input name="ms_title" required placeholder="New milestone" className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none" />
                  <input name="ms_due" type="date" className="h-9 w-32 rounded-lg border border-border bg-card px-2 text-xs text-muted-foreground focus:outline-none" />
                  <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/90">Add</button>
                </form>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Bottlenecks</h3>
              {d.bottlenecks.length > 0 ? (
                <div className="space-y-2">
                  {d.bottlenecks.map((b) => (
                    <div key={b.id} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                      <span className={`text-xs font-medium ${b.is_resolved ? "text-muted-foreground line-through" : "text-foreground"}`}>{b.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
                        b.severity === "critical" || b.severity === "high" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-600"
                      }`}>{b.severity}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No bottlenecks.</p>
              )}
            </div>

            {d.description && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Description</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{d.description}</p>
              </div>
            )}
          </div>
        </div>
        {projectFormModal}
      </div>
    );
  }

  const total = stats?.total ?? 0;
  const onTrack = stats?.on_track ?? 0;
  const atRisk = stats?.at_risk ?? 0;
  const delayed = stats?.delayed ?? 0;
  const completed = stats?.completed ?? 0;

  const progressData = [
    { name: `On Track (${onTrack})`, value: onTrack, color: "#10b981" },
    { name: `At Risk (${atRisk})`, value: atRisk, color: "#f59e0b" },
    { name: `Delayed (${delayed})`, value: delayed, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const healthData = [
    { name: "On Track", value: onTrack },
    { name: "At Risk", value: atRisk },
    { name: "Delayed", value: delayed },
  ];

  const ongoing = projects.filter((p) => !["completed", "on_hold"].includes(p.status));

  function daysLeft(targetDate: string | null): string {
    if (!targetDate) return "—";
    const diff = Math.ceil((new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return `${Math.abs(diff)} days overdue`;
    return `${diff} days left`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Projects Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of all ongoing projects and their progress</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setEditingId(null); setForm(emptyForm); setModalOpen(true); }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New Project
          </button>
        </div>
      </div>

      {/* Top stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total Projects" value={total} subtitle="Ongoing Projects" icon={<ClipboardList className="h-5 w-5" />} />
        <StatCard label="On Track" value={onTrack} subtitle={total > 0 ? `${((onTrack / total) * 100).toFixed(1)}%` : "0%"} icon={<CheckCircle className="h-5 w-5" />} />
        <StatCard label="At Risk" value={atRisk} subtitle={total > 0 ? `${((atRisk / total) * 100).toFixed(1)}%` : "0%"} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label="Delayed" value={delayed} subtitle={total > 0 ? `${((delayed / total) * 100).toFixed(1)}%` : "0%"} icon={<XCircle className="h-5 w-5" />} />
        <StatCard label="Completed" value={completed} subtitle="This Month" icon={<Truck className="h-5 w-5" />} />
      </div>

      {/* Ongoing Projects Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-base font-semibold text-foreground">Ongoing Projects</h2>
          <Link href="/projects" className="text-xs font-medium text-primary hover:underline">
            View All Projects
          </Link>
        </div>
        {ongoing.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Project / Location</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Phase</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Progress</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Health</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Start Date</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Target Date</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Bottlenecks</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {ongoing.map((project) => (
                  <tr key={project.id} onClick={() => loadDetail(project.id)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="font-medium text-foreground">{project.name}</p>
                        <p className="text-xs text-muted-foreground">{project.location}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/20">
                        {project.phase_display || "Query"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">{project.progress}%</span>
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${project.progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={project.status} label={project.status_display} />
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground">{project.start_date || "—"}</td>
                    <td className="px-5 py-3.5">
                      <div>
                        <p className="text-foreground">{project.target_date || "—"}</p>
                        <p className="text-[10px] text-muted-foreground">{daysLeft(project.target_date)}</p>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {project.bottleneck_count > 0 ? (
                        <span className="text-xs text-destructive font-medium">
                          {project.bottleneck_count} issue{project.bottleneck_count > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-500">None</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => loadDetail(project.id)} className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                        <Eye className="h-3 w-3" /> View Details <ChevronRight className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <p className="mt-3 text-sm text-muted-foreground">No ongoing projects</p>
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Projects by Progress</h3>
          <DonutChart
            data={progressData.length > 0 ? progressData : [{ name: "No Data", value: 1, color: "#94a3b8" }]}
            centerValue={total}
            centerLabel="Total"
            size={140}
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Projects by Health</h3>
          <BarChart data={healthData} height={180} />
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Top Bottlenecks</h3>
          <div className="space-y-3">
            {(stats?.top_bottlenecks ?? []).map((b, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{b.title}</span>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                  {b.project_count} Project{b.project_count !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
            {(stats?.top_bottlenecks ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">No bottlenecks</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Projects on Map</h3>
          <p className="text-xs text-muted-foreground">Map view coming soon</p>
        </div>
      </div>

      {/* Flagged Projects */}
      {(stats?.flagged_projects ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">
            Flagged Projects — <span className="text-destructive">{stats!.flagged_projects.length} Projects</span> require immediate attention
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {stats!.flagged_projects.map((fp) => (
              <div key={fp.id} className="flex-shrink-0 rounded-lg border border-border bg-secondary/30 p-4 w-56">
                <p className="text-sm font-medium text-foreground truncate">{fp.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-destructive font-semibold">{fp.progress}%</span>
                  {fp.bottleneck_count > 0 && (
                    <span className="text-[10px] text-muted-foreground">
                      ▸ {fp.bottleneck_count} Critical Flag{fp.bottleneck_count > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {projectFormModal}
    </div>
  );
}
