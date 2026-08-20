"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileText,
  Layers,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Download,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { CopyButton } from "@/components/ui/copy-button";
import { DeviceImage } from "@/components/ui/device-image";
import { Modal } from "@/components/ui/modal";
import { SearchSelect } from "@/components/ui/search-select";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar } from "@/components/ui/filter-bar";
import { ProgressStepper } from "@/components/ui/progress-stepper";
import { formatDate } from "@/lib/utils";

interface Delay {
  id: string;
  step: string | null;
  step_type_display: string | null;
  cause: string;
  cause_display: string;
  description: string;
  reported_by_name: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface Installation {
  id: string;
  device: string;
  installed_by: string | null;
  zone: string | null;
  device_code: string;
  device_name: string;
  asset_name: string | null;
  device_image: string | null;
  device_status: string;
  client_names: string[];
  project_name: string | null;
  poc_name: string | null;
  poc_phone: string | null;
  site: string;
  site_name: string;
  site_city: string;
  position_label: string;
  notes: string;
  installed_at: string;
  installed_by_name: string | null;
  installed_by_phone: string | null;
  due_date: string | null;
  completed_at: string | null;
  progress: number;
  client_delays: number;
  steps: {
    id: string;
    step_type: string;
    step_type_display: string;
    step_number: number;
    status: string;
    status_display: string;
    assigned_team: string;
    description: string;
    started_at: string | null;
    completed_at: string | null;
  }[];
  photos: {
    id: string;
    photo_type: string;
    image: string;
    caption: string;
  }[];
  delays: Delay[];
}

interface InstallationListItem {
  id: string;
  device_code: string;
  asset_name: string | null;
  client_names: string[];
  site_name: string;
  installed_by_name: string | null;
  installed_by_phone: string | null;
  poc_name: string | null;
  installed_at: string;
  due_date: string | null;
  completed_at: string | null;
  progress: number;
  client_delays: number;
}

interface RelatedDocument {
  id: string;
  title: string;
  doc_type: string;
  file: string;
}

const DELAY_CAUSES = [
  { value: "client", label: "Client" },
  { value: "internal", label: "Internal" },
  { value: "vendor", label: "Vendor" },
  { value: "other", label: "Other" },
];

interface Option {
  id: string;
  label: string;
}

// Matches the input styling used by the other list pages' modals.
const createInputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const createLabelClass = "mb-1 block text-xs font-medium text-muted-foreground";

interface AssetInfo {
  asset_code: string;
  display_name: string | null;
  status: string;
  client_names: string[];
  site_name: string | null;
  current_site: string | null;
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

// ProgressStepper has no "not_started" style; map it to its "pending" look.
function stepperStatus(status: string): "completed" | "in_progress" | "pending" | "skipped" {
  if (status === "completed" || status === "in_progress" || status === "skipped") return status;
  return "pending";
}

function exportCsv(rows: InstallationListItem[]) {
  const header = ["Asset Code", "Asset Name", "Client(s)", "Site", "Installer", "POC", "Installed At", "Due Date", "Completed At", "Progress %", "Client Delays"];
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = rows.map((r) =>
    [
      r.device_code,
      r.asset_name ?? "",
      r.client_names.join("; "),
      r.site_name,
      r.installed_by_name ?? "",
      r.poc_name ?? "",
      r.installed_at ? formatDate(r.installed_at) : "",
      r.due_date ? formatDate(r.due_date) : "",
      r.completed_at ? formatDate(r.completed_at) : "",
      String(r.progress),
      String(r.client_delays),
    ].map(escape).join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `installation-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InstallationTrackerPage() {
  const { canWrite } = useUser();
  const [installations, setInstallations] = useState<InstallationListItem[]>([]);
  const [selected, setSelected] = useState<Installation | null>(null);
  const [documents, setDocuments] = useState<RelatedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStep, setUpdatingStep] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ client: "", site: "", installer: "" });
  const [delayFor, setDelayFor] = useState<{ stepId: string | null; label: string } | null>(null);
  const [delayCause, setDelayCause] = useState("client");
  const [delayNote, setDelayNote] = useState("");
  const [savingDelay, setSavingDelay] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deviceOptions, setDeviceOptions] = useState<Option[]>([]);
  const [siteOptions, setSiteOptions] = useState<Option[]>([]);
  const [installerOptions, setInstallerOptions] = useState<Option[]>([]);
  const [zoneOptions, setZoneOptions] = useState<Option[]>([]);
  const [createSite, setCreateSite] = useState("");
  const [createDevice, setCreateDevice] = useState("");
  const [createInstaller, setCreateInstaller] = useState("");
  const [assetInfo, setAssetInfo] = useState<AssetInfo | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editInstaller, setEditInstaller] = useState("");

  const isManager = canWrite("sites");

  useEffect(() => {
    async function fetchInstallations() {
      try {
        const { data } = await api.get("/sites/installations/", { params: { page_size: 1000, ordering: "-installed_at" } });
        setInstallations(data.results ?? []);
      } finally {
        setLoading(false);
      }
    }
    fetchInstallations();
  }, []);

  async function loadDetail(id: string) {
    try {
      const { data } = await api.get(`/sites/installations/${id}/`);
      setSelected(data);
      api
        .get("/infrastructure/documents/", { params: { installation: id, page_size: 100 } })
        .then((res) => setDocuments(res.data.results ?? []))
        .catch(() => setDocuments([]));
    } catch {
      // handled by error boundary
    }
  }

  async function refreshList() {
    try {
      const { data } = await api.get("/sites/installations/", { params: { page_size: 1000, ordering: "-installed_at" } });
      setInstallations(data.results ?? []);
    } catch {
      /* keep stale list */
    }
  }

  async function updateStep(stepId: string, status: string) {
    setUpdatingStep(stepId);
    try {
      await api.patch(`/sites/installation-steps/${stepId}/`, { status });
      if (selected) await loadDetail(selected.id);
      refreshList();
      toast.success("Step updated");
    } catch (err) {
      toast.error(getApiError(err, "Failed to update step"));
    } finally {
      setUpdatingStep(null);
    }
  }

  async function updateDueDate(value: string) {
    if (!selected) return;
    try {
      await api.patch(`/sites/installations/${selected.id}/`, { due_date: value || null });
      await loadDetail(selected.id);
      refreshList();
      toast.success("Due date updated");
    } catch (err) {
      toast.error(getApiError(err, "Failed to update due date"));
    }
  }

  async function submitDelay() {
    if (!selected || !delayFor) return;
    setSavingDelay(true);
    try {
      await api.post("/sites/installation-delays/", {
        installation: selected.id,
        step: delayFor.stepId,
        cause: delayCause,
        description: delayNote,
      });
      toast.success("Delay logged");
      setDelayFor(null);
      setDelayNote("");
      setDelayCause("client");
      await loadDetail(selected.id);
      refreshList();
    } catch (err) {
      toast.error(getApiError(err, "Failed to log delay"));
    } finally {
      setSavingDelay(false);
    }
  }

  async function loadFormOptions() {
    const [dev, sites, users] = await Promise.allSettled([
      api.get("/assets/devices/", { params: { page_size: 1000 } }),
      api.get("/sites/sites/", { params: { page_size: 1000 } }),
      api.get("/accounts/users/", { params: { is_field_staff: true, is_active: true, page_size: 200 } }),
    ]);
    if (dev.status === "fulfilled")
      setDeviceOptions((dev.value.data.results ?? []).map((d: { id: string; asset_code: string; display_name: string | null }) => ({
        id: d.id,
        label: d.display_name ? `${d.asset_code} — ${d.display_name}` : d.asset_code,
      })));
    if (sites.status === "fulfilled")
      setSiteOptions((sites.value.data.results ?? []).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })));
    if (users.status === "fulfilled")
      setInstallerOptions((users.value.data.results ?? []).map((u: { id: string; first_name: string; last_name: string; username: string }) => ({
        id: u.id,
        label: u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username,
      })));
  }

  function openCreate() {
    setCreateSite("");
    setCreateDevice("");
    setCreateInstaller("");
    setAssetInfo(null);
    setZoneOptions([]);
    setCreateOpen(true);
    loadFormOptions();
  }

  function openEdit() {
    if (!selected) return;
    setEditInstaller(selected.installed_by ?? "");
    setEditOpen(true);
    loadFormOptions();
    api
      .get("/sites/zones/", { params: { site: selected.site, page_size: 200 } })
      .then(({ data }) => setZoneOptions((data.results ?? []).map((z: { id: string; name: string }) => ({ id: z.id, label: z.name }))))
      .catch(() => setZoneOptions([]));
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setEditSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.patch(`/sites/installations/${selected.id}/`, {
        installed_by: fd.get("installed_by") || null,
        installed_at: new Date(String(fd.get("installed_at"))).toISOString(),
        due_date: fd.get("due_date") || null,
        zone: fd.get("zone") || null,
        position_label: fd.get("position_label") || "",
        notes: fd.get("notes") || "",
      });
      toast.success("Installation updated");
      setEditOpen(false);
      await loadDetail(selected.id);
      refreshList();
    } catch (err) {
      toast.error(getApiError(err, "Failed to update installation"));
    } finally {
      setEditSaving(false);
    }
  }

  // Choosing an asset pre-fills the site from where the asset currently lives
  // and shows its client/site context, mirroring the ticket-create flow.
  async function handleDeviceChange(id: string) {
    setCreateDevice(id);
    if (!id) {
      setAssetInfo(null);
      return;
    }
    try {
      const { data } = await api.get(`/assets/devices/${id}/`);
      setAssetInfo(data);
      if (data.current_site) setCreateSite(data.current_site);
    } catch {
      setAssetInfo(null);
    }
  }

  useEffect(() => {
    if (!createSite) {
      setZoneOptions([]);
      return;
    }
    api
      .get("/sites/zones/", { params: { site: createSite, page_size: 200 } })
      .then(({ data }) => setZoneOptions((data.results ?? []).map((z: { id: string; name: string }) => ({ id: z.id, label: z.name }))))
      .catch(() => setZoneOptions([]));
  }, [createSite]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    const fd = new FormData(e.currentTarget);
    try {
      const { data } = await api.post("/sites/installations/", {
        device: fd.get("device"),
        site: fd.get("site"),
        zone: fd.get("zone") || null,
        installed_by: fd.get("installed_by") || null,
        installed_at: new Date(String(fd.get("installed_at"))).toISOString(),
        due_date: fd.get("due_date") || null,
        position_label: fd.get("position_label") || "",
        notes: fd.get("notes") || "",
      });
      toast.success("Installation created");
      setCreateOpen(false);
      await refreshList();
      loadDetail(data.id);
    } catch (err) {
      toast.error(getApiError(err, "Failed to create installation"));
    } finally {
      setCreating(false);
    }
  }

  async function resolveDelay(delayId: string) {
    if (!selected) return;
    try {
      await api.patch(`/sites/installation-delays/${delayId}/`, { resolved_at: new Date().toISOString() });
      await loadDetail(selected.id);
      toast.success("Delay marked resolved");
    } catch (err) {
      toast.error(getApiError(err, "Failed to resolve delay"));
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (selected) {
    const stepperSteps = selected.steps.map((s) => ({
      key: s.id,
      label: s.step_type_display,
      status: stepperStatus(s.status),
    }));
    const delaysByStep = new Map<string, Delay[]>();
    selected.delays.forEach((d) => {
      if (!d.step) return;
      const list = delaysByStep.get(d.step) ?? [];
      list.push(d);
      delaysByStep.set(d.step, list);
    });
    const overdue = selected.due_date && !selected.completed_at && new Date(selected.due_date) < new Date();

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelected(null)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Asset Installation Tracker</h1>
            <p className="text-sm text-muted-foreground">Track installation progress in different stages</p>
          </div>
          {isManager && (
            <button
              onClick={openEdit}
              className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
          )}
        </div>

        {/* Asset Header Card */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex gap-5">
            <DeviceImage src={selected.device_image} alt={selected.device_code} size="xl" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/assets?device=${selected.device}`} className="text-sm font-medium text-primary hover:underline">
                  Asset ID: {selected.device_code}
                </Link>
                {selected.asset_name && <span className="text-sm font-semibold text-foreground">{selected.asset_name}</span>}
                <StatusBadge status={selected.device_status} />
                {selected.client_delays > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-500">
                    <AlertTriangle className="h-3 w-3" /> {selected.client_delays} client delay{selected.client_delays > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Site Name</p>
                  <Link href={`/sites?site=${selected.site}`} className="font-medium text-primary hover:underline">{selected.site_name}</Link>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Client(s)</p>
                  <p className="font-medium text-foreground">{selected.client_names.length > 0 ? selected.client_names.join(", ") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">POC</p>
                  <p className="font-medium text-foreground">
                    {selected.poc_name || "—"}
                    {selected.poc_phone && <span className="block text-xs text-muted-foreground">{selected.poc_phone}</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Installer</p>
                  <p className="font-medium text-foreground">
                    {selected.installed_by_name || "—"}
                    {selected.installed_by_phone && <span className="block text-xs text-muted-foreground">{selected.installed_by_phone}</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Location</p>
                  <p className="font-medium text-foreground">{selected.position_label || selected.site_city || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Installed At</p>
                  <p className="font-medium text-foreground">{formatDate(selected.installed_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  {isManager ? (
                    <input
                      type="date"
                      defaultValue={selected.due_date ?? ""}
                      onBlur={(e) => { if (e.target.value !== (selected.due_date ?? "")) updateDueDate(e.target.value); }}
                      className={`rounded-md border border-border bg-background px-2 py-0.5 text-sm font-medium focus:border-primary/50 focus:outline-none ${overdue ? "text-red-500" : "text-foreground"}`}
                    />
                  ) : (
                    <p className={`font-medium ${overdue ? "text-red-500" : "text-foreground"}`}>
                      {selected.due_date ? formatDate(selected.due_date) : "—"}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                  <p className="font-medium text-foreground">{selected.completed_at ? formatDate(selected.completed_at) : "—"}</p>
                </div>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">Overall Progress</p>
              <p className="text-3xl font-bold text-primary">{selected.progress}%</p>
              <div className="mt-2 h-2 w-32 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${selected.progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Installation Steps Pipeline */}
        {stepperSteps.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold text-foreground mb-6">Installation Steps</h2>
            <ProgressStepper steps={stepperSteps} />
          </div>
        )}

        {/* Step Detail Cards + Timeline */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {selected.steps.map((step) => {
                const stepDelays = delaysByStep.get(step.id) ?? [];
                return (
                  <div key={step.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        {step.step_number}. {step.step_type_display}
                      </h4>
                      <StatusBadge status={step.status} label={step.status_display} />
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Date</span>
                        <span className="text-foreground">
                          {step.completed_at ? formatDate(step.completed_at) : step.started_at ? formatDate(step.started_at) : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Team</span>
                        <span className="text-foreground">{step.assigned_team || "—"}</span>
                      </div>
                      {step.description && (
                        <p className="text-muted-foreground mt-2 pt-2 border-t border-border">{step.description}</p>
                      )}
                      {stepDelays.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1 border-t border-border pt-2">
                          {stepDelays.map((d) => (
                            <span
                              key={d.id}
                              title={d.description}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                d.resolved_at
                                  ? "bg-secondary text-muted-foreground line-through"
                                  : d.cause === "client"
                                  ? "bg-red-500/10 text-red-500"
                                  : "bg-amber-500/10 text-amber-600"
                              }`}
                            >
                              <AlertTriangle className="h-2.5 w-2.5" /> {d.cause_display} delay
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Advance actions */}
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                      {step.status !== "in_progress" && step.status !== "completed" && (
                        <button disabled={updatingStep === step.id} onClick={() => updateStep(step.id, "in_progress")} className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 disabled:opacity-50">
                          <Play className="h-3 w-3" /> Start
                        </button>
                      )}
                      {step.status !== "completed" && (
                        <button disabled={updatingStep === step.id} onClick={() => updateStep(step.id, "completed")} className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:opacity-50">
                          <Check className="h-3 w-3" /> Complete
                        </button>
                      )}
                      {step.status !== "not_started" && (
                        <button disabled={updatingStep === step.id} onClick={() => updateStep(step.id, "not_started")} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50">
                          <RotateCcw className="h-3 w-3" /> Reset
                        </button>
                      )}
                      <button onClick={() => setDelayFor({ stepId: step.id, label: `${step.step_number}. ${step.step_type_display}` })} className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-[11px] font-medium text-red-500 transition-colors hover:bg-red-500/20">
                        <AlertTriangle className="h-3 w-3" /> Flag Delay
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Photos */}
            {selected.photos.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-foreground mb-3">Installation Photos</h3>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {selected.photos.map((photo) => (
                    <div key={photo.id} className="shrink-0">
                      <img
                        src={photo.image}
                        alt={photo.caption || "Installation photo"}
                        className="h-32 w-44 rounded-lg object-cover border border-border"
                      />
                      {photo.caption && (
                        <p className="mt-1 text-[10px] text-muted-foreground max-w-44 truncate">{photo.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right rail */}
          <div className="space-y-4">
            {/* Delay Log */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Delay Log</h3>
                <button
                  onClick={() => setDelayFor({ stepId: null, label: "Whole installation" })}
                  className="text-[10px] font-medium text-red-500 hover:underline"
                >
                  + Flag Delay
                </button>
              </div>
              {selected.delays.length > 0 ? (
                <div className="space-y-3">
                  {selected.delays.map((d) => (
                    <div key={d.id} className="rounded-lg border border-border/60 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          d.cause === "client" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-600"
                        }`}>
                          <AlertTriangle className="h-2.5 w-2.5" /> {d.cause_display}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{formatDate(d.created_at)}</span>
                      </div>
                      <p className="mt-1 text-xs text-foreground">
                        {d.step_type_display ? `${d.step_type_display}: ` : ""}{d.description || "No details"}
                      </p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground">{d.reported_by_name || ""}</span>
                        {d.resolved_at ? (
                          <span className="text-[10px] font-medium text-emerald-600">Resolved {formatDate(d.resolved_at)}</span>
                        ) : (
                          isManager && (
                            <button onClick={() => resolveDelay(d.id)} className="text-[10px] font-medium text-primary hover:underline">
                              Mark resolved
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No delays logged</p>
              )}
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Installation Timeline</h3>
              <div className="space-y-4">
                {selected.steps
                  .filter((s) => s.status !== "not_started")
                  .map((step) => (
                    <div key={step.id} className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 h-3 w-3 shrink-0 rounded-full ${
                          step.status === "completed" ? "bg-primary" : "bg-amber-500"
                        }`}
                      />
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          {step.step_type_display} — {step.status_display}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {step.completed_at
                            ? formatDate(step.completed_at)
                            : step.started_at
                            ? formatDate(step.started_at)
                            : ""}
                        </p>
                        {step.assigned_team && (
                          <p className="text-[10px] text-muted-foreground">{step.assigned_team}</p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Related Documents</h3>
                <Link href="/documents" className="text-[10px] font-medium text-primary hover:underline">View All</Link>
              </div>
              {documents.length > 0 ? (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <a
                      key={doc.id}
                      href={doc.file}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 rounded-lg border border-border p-2 transition-colors hover:border-primary/40 hover:bg-primary/5"
                    >
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="truncate text-xs text-foreground">{doc.title}</span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No documents linked to this installation</p>
              )}
            </div>
          </div>
        </div>

        {/* Flag Delay modal */}
        {delayFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Flag Delay — {delayFor.label}</h3>
                <button onClick={() => setDelayFor(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Caused by</label>
                  <select
                    value={delayCause}
                    onChange={(e) => setDelayCause(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                  >
                    {DELAY_CAUSES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Details</label>
                  <textarea
                    value={delayNote}
                    onChange={(e) => setDelayNote(e.target.value)}
                    rows={3}
                    placeholder="e.g. Client did not grant site access"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                  />
                </div>
                <button
                  onClick={submitDelay}
                  disabled={savingDelay}
                  className="w-full rounded-lg bg-red-500 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                >
                  {savingDelay ? "Logging..." : "Log Delay"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit installation modal */}
        <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit Installation — ${selected.device_code}`} size="lg">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={createLabelClass}>Assigned Installer</label>
                <SearchSelect
                  options={installerOptions}
                  value={editInstaller}
                  onChange={setEditInstaller}
                  name="installed_by"
                  placeholder="Search installer…"
                />
              </div>
              <div>
                <label htmlFor="ei-zone" className={createLabelClass}>Zone</label>
                <select id="ei-zone" name="zone" defaultValue={selected.zone ?? ""} className={createInputClass} disabled={zoneOptions.length === 0}>
                  <option value="">{zoneOptions.length === 0 ? "No zones for this site" : "None"}</option>
                  {zoneOptions.map((z) => (
                    <option key={z.id} value={z.id}>{z.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ei-installed-at" className={createLabelClass}>Start / Installed At</label>
                <input
                  id="ei-installed-at"
                  name="installed_at"
                  type="datetime-local"
                  required
                  defaultValue={toLocalInputValue(selected.installed_at)}
                  className={createInputClass}
                />
              </div>
              <div>
                <label htmlFor="ei-due" className={createLabelClass}>Due Date</label>
                <input id="ei-due" name="due_date" type="date" defaultValue={selected.due_date ?? ""} className={createInputClass} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ei-position" className={createLabelClass}>Position / Location Label</label>
                <input id="ei-position" name="position_label" defaultValue={selected.position_label} placeholder="e.g. Main entrance, 2nd floor" className={createInputClass} />
              </div>
            </div>
            <div>
              <label htmlFor="ei-notes" className={createLabelClass}>Notes</label>
              <textarea id="ei-notes" name="notes" rows={2} defaultValue={selected.notes} className={`${createInputClass} h-auto py-2`} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setEditOpen(false)} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                Cancel
              </button>
              <button type="submit" disabled={editSaving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  const filtered = installations.filter((i) => {
    if (filterValues.client && !i.client_names.includes(filterValues.client)) return false;
    if (filterValues.site && i.site_name !== filterValues.site) return false;
    if (filterValues.installer && (i.installed_by_name || "") !== filterValues.installer) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !i.device_code.toLowerCase().includes(q) &&
        !(i.asset_name || "").toLowerCase().includes(q) &&
        !i.client_names.some((c) => c.toLowerCase().includes(q)) &&
        !(i.installed_by_name || "").toLowerCase().includes(q) &&
        !(i.poc_name || "").toLowerCase().includes(q) &&
        !i.site_name.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  const uniq = (vals: (string | null)[]) =>
    Array.from(new Set(vals.filter(Boolean) as string[])).sort().map((v) => ({ value: v, label: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Layers className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Installation Tracker</h1>
            <p className="text-sm text-muted-foreground">Track installation progress in different stages</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <button
              onClick={() => exportCsv(filtered)}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          )}
          {isManager && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all"
            >
              <Plus className="h-4 w-4" /> New Installation
            </button>
          )}
        </div>
      </div>

      <FilterBar
        filters={[
          { key: "client", label: "Client", options: uniq(installations.flatMap((i) => i.client_names)) },
          { key: "site", label: "Site", options: uniq(installations.map((i) => i.site_name)) },
          { key: "installer", label: "Installer", options: uniq(installations.map((i) => i.installed_by_name)) },
        ]}
        values={filterValues}
        onChange={(key, value) => setFilterValues((v) => ({ ...v, [key]: value }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search asset, client, installer, POC..."
      />

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            {installations.length === 0 ? "No installations yet" : "No matching installations"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {installations.length === 0
              ? "Installation records will appear here once devices are installed at sites."
              : "Try adjusting the search or filters."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Asset</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Client(s)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Site</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Installer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">POC</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Completed</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Progress</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inst) => {
                  const rowOverdue = inst.due_date && !inst.completed_at && new Date(inst.due_date) < new Date();
                  return (
                    <tr
                      key={inst.id}
                      onClick={() => loadDetail(inst.id)}
                      className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30"
                    >
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 font-mono font-medium text-primary">
                          {inst.device_code}
                          <CopyButton text={inst.device_code} label="asset code" />
                        </span>
                        {inst.asset_name && <span className="block text-xs text-muted-foreground">{inst.asset_name}</span>}
                      </td>
                      <td className="px-4 py-3.5 text-foreground">{inst.client_names.length > 0 ? inst.client_names.join(", ") : "—"}</td>
                      <td className="px-4 py-3.5 text-foreground">{inst.site_name}</td>
                      <td className="px-4 py-3.5 text-foreground">
                        {inst.installed_by_name || "—"}
                        {inst.installed_by_phone && <span className="block text-xs text-muted-foreground">{inst.installed_by_phone}</span>}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">{inst.poc_name || "—"}</td>
                      <td className={`px-4 py-3.5 ${rowOverdue ? "font-semibold text-red-500" : "text-muted-foreground"}`}>
                        {inst.due_date ? formatDate(inst.due_date) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {inst.completed_at ? formatDate(inst.completed_at) : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{inst.progress}%</span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${inst.progress}%` }}
                            />
                          </div>
                          {inst.client_delays > 0 && (
                            <span title={`${inst.client_delays} client delay(s)`} className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                              <AlertTriangle className="h-2.5 w-2.5" /> {inst.client_delays}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); loadDetail(inst.id); }}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Installation modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Installation" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={createLabelClass}>Asset</label>
                  <SearchSelect
                    options={deviceOptions}
                    value={createDevice}
                    onChange={handleDeviceChange}
                    name="device"
                    required
                    placeholder="Search asset by code or name…"
                  />
                  {assetInfo && (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs sm:grid-cols-4">
                      <span className="text-muted-foreground">Asset Name</span>
                      <span className="font-medium text-foreground">{assetInfo.display_name || assetInfo.asset_code}</span>
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-medium capitalize text-foreground">{assetInfo.status.replace(/_/g, " ")}</span>
                      <span className="text-muted-foreground">Client(s)</span>
                      <span className="font-medium text-foreground">{(assetInfo.client_names ?? []).join(", ") || "—"}</span>
                      <span className="text-muted-foreground">Current Site</span>
                      <span className="font-medium text-foreground">{assetInfo.site_name || "In warehouse"}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className={createLabelClass}>Site</label>
                  <SearchSelect
                    options={siteOptions}
                    value={createSite}
                    onChange={setCreateSite}
                    name="site"
                    required
                    placeholder="Search site…"
                  />
                </div>
                <div>
                  <label htmlFor="ci-zone" className={createLabelClass}>Zone (optional)</label>
                  <select id="ci-zone" name="zone" defaultValue="" className={createInputClass} disabled={zoneOptions.length === 0}>
                    <option value="">{zoneOptions.length === 0 ? "No zones for this site" : "None"}</option>
                    {zoneOptions.map((z) => (
                      <option key={z.id} value={z.id}>{z.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={createLabelClass}>Assigned Installer</label>
                  <SearchSelect
                    options={installerOptions}
                    value={createInstaller}
                    onChange={setCreateInstaller}
                    name="installed_by"
                    placeholder="Search installer…"
                  />
                </div>
                <div>
                  <label htmlFor="ci-installed-at" className={createLabelClass}>Start / Installed At</label>
                  <input
                    id="ci-installed-at"
                    name="installed_at"
                    type="datetime-local"
                    required
                    defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                    className={createInputClass}
                  />
                </div>
                <div>
                  <label htmlFor="ci-due" className={createLabelClass}>Due Date (optional)</label>
                  <input id="ci-due" name="due_date" type="date" className={createInputClass} />
                </div>
                <div>
                  <label htmlFor="ci-position" className={createLabelClass}>Position / Location Label</label>
                  <input id="ci-position" name="position_label" placeholder="e.g. Main entrance, 2nd floor" className={createInputClass} />
                </div>
              </div>
              <div>
                <label htmlFor="ci-notes" className={createLabelClass}>Notes</label>
                <textarea id="ci-notes" name="notes" rows={2} className={`${createInputClass} h-auto py-2`} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                The 6-step pipeline (Survey → Handover) is created automatically.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Installation"}
                </button>
              </div>
        </form>
      </Modal>
    </div>
  );
}
