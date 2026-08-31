"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardCheck,
  FileText,
  Layers,
  Pause,
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
import { SegmentBar, StatTiles } from "@/components/ui/analytics-strip";
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

interface Handover {
  id: string;
  handover_date: string;
  accepted_by_name: string;
  acceptance_notes: string;
  signature: string | null;
  client: string;
  client_name: string;
  site_name: string;
  performed_by_name: string | null;
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
  vendor: string | null;
  vendor_name: string | null;
  due_date: string | null;
  completed_at: string | null;
  progress: number;
  client_delays: number;
  on_hold_steps: number;
  escalated: boolean;
  escalation_state: Record<string, string>;
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
  handover: Handover | null;
}

interface InstallationListItem {
  id: string;
  device_code: string;
  device_name: string | null;
  asset_name: string | null;
  client_names: string[];
  site_name: string;
  installed_by_name: string | null;
  installed_by_phone: string | null;
  vendor_name: string | null;
  poc_name: string | null;
  installed_at: string;
  due_date: string | null;
  completed_at: string | null;
  progress: number;
  client_delays: number;
  on_hold_steps: number;
  escalated: boolean;
  escalation_state: Record<string, string>;
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

const STEP_TYPES = [
  { value: "survey", label: "Survey" },
  { value: "wiring", label: "Wiring" },
  { value: "structure", label: "Metal Structure" },
  { value: "programming", label: "Programming" },
  { value: "testing", label: "Testing & Commissioning" },
  { value: "handover", label: "Handover" },
];

type TrackBucket = "not_started" | "in_progress" | "on_hold" | "completed" | "overdue";

function trackBucket(i: { progress: number; due_date: string | null; completed_at: string | null; on_hold_steps: number }): TrackBucket {
  if (i.completed_at) return "completed";
  if (i.on_hold_steps > 0) return "on_hold";
  if (i.due_date && new Date(i.due_date) < new Date()) return "overdue";
  return i.progress > 0 ? "in_progress" : "not_started";
}

// escalation_state maps "<trigger>:<stage>" -> fired-at timestamp; a ":2" key
// means the stage-2 (group head) escalation has fired.
function escalationLabel(state: Record<string, string> | null | undefined): string {
  return state && Object.keys(state).some((k) => k.endsWith(":2")) ? "Escalated — L2" : "Escalated";
}

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
  const header = ["Asset Code", "Device Name", "Asset Name", "Client(s)", "Site", "Installer", "POC", "Installed At", "Due Date", "Completed At", "Progress %", "Client Delays"];
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = rows.map((r) =>
    [
      r.device_code,
      r.device_name ?? "",
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
  const { user, canWrite } = useUser();
  const [installations, setInstallations] = useState<InstallationListItem[]>([]);
  const [selected, setSelected] = useState<Installation | null>(null);
  const [documents, setDocuments] = useState<RelatedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingStep, setUpdatingStep] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ client: "", site: "", installer: "" });
  const [exporting, setExporting] = useState(false);

  async function exportExcel() {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (trackFilter === "escalated") params.escalated = "true";
      else if (trackFilter) params.bucket = trackFilter;
      const res = await api.get("/sites/installations/export/", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `installation-tracker-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  }
  const [delayFor, setDelayFor] = useState<{ stepId: string | null; label: string; hold?: boolean } | null>(null);
  const [delayCause, setDelayCause] = useState("client");
  const [delayNote, setDelayNote] = useState("");
  const [savingDelay, setSavingDelay] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deviceOptions, setDeviceOptions] = useState<Option[]>([]);
  const [siteOptions, setSiteOptions] = useState<Option[]>([]);
  const [installerOptions, setInstallerOptions] = useState<Option[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<Option[]>([]);
  const [zoneOptions, setZoneOptions] = useState<Option[]>([]);
  const [createSite, setCreateSite] = useState("");
  const [createDevice, setCreateDevice] = useState("");
  const [createSteps, setCreateSteps] = useState<string[]>(STEP_TYPES.map((s) => s.value));
  const [customStep, setCustomStep] = useState("");
  const [createVendor, setCreateVendor] = useState("");
  const [editVendor, setEditVendor] = useState("");
  const [createInstaller, setCreateInstaller] = useState("");
  const [assetInfo, setAssetInfo] = useState<AssetInfo | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editInstaller, setEditInstaller] = useState("");
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverSaving, setHandoverSaving] = useState(false);
  const [clientOptions, setClientOptions] = useState<Option[]>([]);
  const [handoverClient, setHandoverClient] = useState("");

  const isManager = canWrite("sites");
  // Step actions on desktop are super-admin only; the assigned installer
  // works the steps from the mobile app (backend enforces both).
  const isSuperAdmin = user?.role === "super_admin";
  const [trackFilter, setTrackFilter] = useState("");
  // Server-filtered rows for the Escalated tile (?escalated=true); null while
  // the fetch is pending or the filter is off — we fall back to the client-side
  // `escalated` flag so the table never flashes empty.
  const [escalatedRows, setEscalatedRows] = useState<InstallationListItem[] | null>(null);

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

  useEffect(() => {
    if (trackFilter !== "escalated") {
      setEscalatedRows(null);
      return;
    }
    let cancelled = false;
    api
      .get("/sites/installations/", { params: { page_size: 1000, ordering: "-installed_at", escalated: true } })
      .then(({ data }) => { if (!cancelled) setEscalatedRows(data.results ?? []); })
      .catch(() => { if (!cancelled) setEscalatedRows(null); });
    return () => { cancelled = true; };
  }, [trackFilter]);

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
      if (delayFor.hold && delayFor.stepId) {
        await api.patch(`/sites/installation-steps/${delayFor.stepId}/`, { status: "on_hold" });
      }
      toast.success(delayFor.hold ? "Step put on hold" : "Delay logged");
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
      setInstallerOptions((users.value.data.results ?? []).map((u: { id: string; first_name: string; last_name: string; username: string }) => ({
        id: u.id,
        label: u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username,
      })));
    if (sups.status === "fulfilled")
      setSupplierOptions((sups.value.data.results ?? []).map((v: { id: string; name: string }) => ({ id: v.id, label: v.name })));
  }

  function openCreate() {
    setCreateSite("");
    setCreateDevice("");
    setCreateInstaller("");
    setAssetInfo(null);
    setZoneOptions([]);
    setCreateSteps(STEP_TYPES.map((s) => s.value));
    setCustomStep("");
    setCreateVendor("");
    setCreateOpen(true);
    loadFormOptions();
  }

  function openEdit() {
    if (!selected) return;
    setEditInstaller(selected.installed_by ?? "");
    setEditVendor(selected.vendor ?? "");
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
        vendor: fd.get("vendor") || null,
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
    if (createSteps.length === 0) {
      toast.error("Select at least one installation step.");
      return;
    }
    setCreating(true);
    const fd = new FormData(e.currentTarget);
    try {
      const { data } = await api.post("/sites/installations/", {
        device: fd.get("device"),
        site: fd.get("site"),
        zone: fd.get("zone") || null,
        installed_by: fd.get("installed_by") || null,
        vendor: fd.get("vendor") || null,
        installed_at: new Date(String(fd.get("installed_at"))).toISOString(),
        due_date: fd.get("due_date") || null,
        position_label: fd.get("position_label") || "",
        notes: fd.get("notes") || "",
        step_types: createSteps,
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

  function openHandover() {
    if (!selected) return;
    setHandoverClient("");
    setHandoverOpen(true);
    api
      .get("/clients/", { params: { page_size: 200 } })
      .then(({ data }) => setClientOptions((data.results ?? []).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name }))))
      .catch(() => setClientOptions([]));
    // Default the client select to the client the asset is already assigned to.
    api
      .get(`/assets/devices/${selected.device}/`)
      .then(({ data }) => setHandoverClient(data.assigned_client ?? ""))
      .catch(() => {});
  }

  async function handleHandoverSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || handoverSaving) return;
    const form = e.currentTarget;
    const fields = new FormData(form);
    const fd = new FormData();
    fd.append("accepted_by_name", String(fields.get("accepted_by_name") ?? "").trim());
    if (handoverClient) fd.append("client", handoverClient);
    if (fields.get("handover_date")) fd.append("handover_date", String(fields.get("handover_date")));
    if (fields.get("acceptance_notes")) fd.append("acceptance_notes", String(fields.get("acceptance_notes")));
    const signature = (form.elements.namedItem("signature") as HTMLInputElement | null)?.files?.[0];
    if (signature) fd.append("signature", signature);
    const photoFiles = (form.elements.namedItem("photos") as HTMLInputElement | null)?.files;
    if (photoFiles) Array.from(photoFiles).forEach((f) => fd.append("photos", f));
    setHandoverSaving(true);
    try {
      const { data } = await api.post(`/sites/installations/${selected.id}/handover/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Handover recorded — asset is now active");
      setHandoverOpen(false);
      setSelected(data);
      refreshList();
    } catch (err) {
      const resp = (err as { response?: { data?: { detail?: string; client?: string | string[] } } }).response;
      const clientErr = resp?.data?.client;
      toast.error(
        clientErr
          ? Array.isArray(clientErr) ? clientErr[0] : clientErr
          : getApiError(err, "Failed to record handover")
      );
    } finally {
      setHandoverSaving(false);
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
    // Handover unlocks once every non-handover step is completed or skipped
    // (mirrors the backend gate); the button is for admin/ops/supervisor
    // roles or the assigned installer (mirrors the backend role check).
    const stepsReadyForHandover = selected.steps
      .filter((s) => s.step_type !== "handover")
      .every((s) => s.status === "completed" || s.status === "skipped");
    const canHandover =
      !selected.handover &&
      stepsReadyForHandover &&
      user != null &&
      (["super_admin", "group_head", "ops_manager", "supervisor"].includes(user.role) ||
        user.id === selected.installed_by);

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
          <div className="ml-auto flex items-center gap-2">
            {canHandover && (
              <button
                onClick={openHandover}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
              >
                <ClipboardCheck className="h-4 w-4" /> Handover
              </button>
            )}
            {isManager && (
              <button
                onClick={openEdit}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
          </div>
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
                {selected.handover && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                    <ClipboardCheck className="h-3 w-3" /> Handed over
                  </span>
                )}
                {selected.escalated && (
                  <span
                    title="This installation breached its due date and escalation notifications have fired"
                    className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-500"
                  >
                    <AlertTriangle className="h-3 w-3" /> {escalationLabel(selected.escalation_state)}
                  </span>
                )}
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
                  <p className="text-xs text-muted-foreground">Vendor</p>
                  <p className="font-medium text-foreground">{selected.vendor_name || "—"}</p>
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
                        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
                          {stepDelays.map((d) => (
                            <div
                              key={d.id}
                              className={`rounded-md px-2 py-1.5 ${
                                d.resolved_at
                                  ? "bg-secondary/60"
                                  : d.cause === "client"
                                  ? "bg-red-500/5"
                                  : "bg-amber-500/5"
                              }`}
                            >
                              <p className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                                d.resolved_at ? "text-muted-foreground line-through" : d.cause === "client" ? "text-red-500" : "text-amber-600"
                              }`}>
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {step.status === "on_hold" && !d.resolved_at ? "On hold" : "Delay"} — caused by {d.cause_display}
                              </p>
                              {d.cause === "client" && selected.client_names.length > 0 && (
                                <p className="text-[10px] text-muted-foreground">Client: {selected.client_names.join(", ")}</p>
                              )}
                              {d.description && <p className="text-[10px] text-foreground">{d.description}</p>}
                              <p className="text-[10px] text-muted-foreground">
                                {d.reported_by_name ? `By ${d.reported_by_name} · ` : ""}{formatDate(d.created_at)}
                                {d.resolved_at ? ` · resolved ${formatDate(d.resolved_at)}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Advance actions — desktop: super admin only (installer works via mobile) */}
                    {isSuperAdmin && (
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
                        {step.status !== "on_hold" && step.status !== "completed" && (
                          <button onClick={() => { setDelayCause("client"); setDelayFor({ stepId: step.id, label: `${step.step_number}. ${step.step_type_display}`, hold: true }); }} className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-1 text-[11px] font-medium text-orange-500 transition-colors hover:bg-orange-500/20">
                            <Pause className="h-3 w-3" /> Hold
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
                    )}
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
            {/* Handover record */}
            {selected.handover && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                <div className="mb-3 flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-sm font-semibold text-foreground">Handover</h3>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-medium text-foreground">{formatDate(selected.handover.handover_date)}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Accepted by</span>
                    <span className="font-medium text-foreground">{selected.handover.accepted_by_name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Client</span>
                    <span className="font-medium text-foreground">{selected.handover.client_name}</span>
                  </div>
                  {selected.handover.performed_by_name && (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Performed by</span>
                      <span className="font-medium text-foreground">{selected.handover.performed_by_name}</span>
                    </div>
                  )}
                  {selected.handover.acceptance_notes && (
                    <p className="border-t border-emerald-500/20 pt-2 text-muted-foreground">{selected.handover.acceptance_notes}</p>
                  )}
                  {selected.handover.signature && (
                    <div className="border-t border-emerald-500/20 pt-2">
                      <p className="mb-1 text-muted-foreground">Signature</p>
                      <img
                        src={selected.handover.signature}
                        alt={`Signature — ${selected.handover.accepted_by_name}`}
                        className="h-20 rounded-lg border border-border bg-white object-contain p-1"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Delay Log */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Delay Log</h3>
                {isSuperAdmin && (
                  <button
                    onClick={() => setDelayFor({ stepId: null, label: "Whole installation" })}
                    className="text-[10px] font-medium text-red-500 hover:underline"
                  >
                    + Flag Delay
                  </button>
                )}
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
                <label className={createLabelClass}>Vendor</label>
                <SearchSelect
                  options={supplierOptions}
                  value={editVendor}
                  onChange={setEditVendor}
                  name="vendor"
                  placeholder="Search vendor…"
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

        {/* Handover modal */}
        <Modal open={handoverOpen} onClose={() => setHandoverOpen(false)} title={`Handover — ${selected.device_code}`} size="lg">
          <form onSubmit={handleHandoverSubmit} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Recording the handover assigns the asset to the client, completes the handover step and moves the asset to Active.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="ho-accepted-by" className={createLabelClass}>Accepted By (client-side name) *</label>
                <input
                  id="ho-accepted-by"
                  name="accepted_by_name"
                  required
                  placeholder="e.g. Ali Raza — Facilities Manager"
                  className={createInputClass}
                />
              </div>
              <div>
                <label className={createLabelClass}>Client *</label>
                <SearchSelect
                  options={clientOptions}
                  value={handoverClient}
                  onChange={setHandoverClient}
                  name="client"
                  placeholder="Search client…"
                />
              </div>
              <div>
                <label htmlFor="ho-date" className={createLabelClass}>Handover Date</label>
                <input
                  id="ho-date"
                  name="handover_date"
                  type="date"
                  defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
                  className={createInputClass}
                />
              </div>
              <div>
                <label htmlFor="ho-signature" className={createLabelClass}>Signature (image)</label>
                <input
                  id="ho-signature"
                  name="signature"
                  type="file"
                  accept="image/*"
                  className={`${createInputClass} h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground`}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ho-photos" className={createLabelClass}>Additional Photos</label>
                <input
                  id="ho-photos"
                  name="photos"
                  type="file"
                  accept="image/*"
                  multiple
                  className={`${createInputClass} h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground`}
                />
              </div>
            </div>
            <div>
              <label htmlFor="ho-notes" className={createLabelClass}>Acceptance Notes</label>
              <textarea
                id="ho-notes"
                name="acceptance_notes"
                rows={2}
                placeholder="e.g. Accepted with minor snag list attached"
                className={`${createInputClass} h-auto py-2`}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setHandoverOpen(false)}
                className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={handoverSaving}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                <ClipboardCheck className="h-4 w-4" />
                {handoverSaving ? "Recording..." : "Record Handover"}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  // Escalated uses the server-side ?escalated=true filter; until that response
  // lands, fall back to the escalated flag already present on the loaded rows.
  const baseRows =
    trackFilter === "escalated"
      ? escalatedRows ?? installations.filter((i) => i.escalated)
      : installations;

  const filtered = baseRows.filter((i) => {
    if (trackFilter === "delayed") {
      if (i.client_delays === 0) return false;
    } else if (trackFilter && trackFilter !== "escalated" && trackBucket(i) !== trackFilter) {
      return false;
    }
    if (filterValues.client && !i.client_names.includes(filterValues.client)) return false;
    if (filterValues.site && i.site_name !== filterValues.site) return false;
    if (filterValues.installer && (i.installed_by_name || "") !== filterValues.installer) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !i.device_code.toLowerCase().includes(q) &&
        !(i.asset_name || "").toLowerCase().includes(q) &&
        !(i.device_name || "").toLowerCase().includes(q) &&
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
          <button
            onClick={exportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
          </button>
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

      {(() => {
        const counts = { not_started: 0, in_progress: 0, on_hold: 0, completed: 0, overdue: 0 };
        installations.forEach((i) => { counts[trackBucket(i)] += 1; });
        const delayed = installations.filter((i) => i.client_delays > 0).length;
        const escalatedCount = installations.filter((i) => i.escalated).length;
        const toggle = (key: string) => setTrackFilter((v) => (v === key ? "" : key));
        return (
          <div className="space-y-3">
            <StatTiles
              tiles={[
                { key: "total", label: "Total", value: installations.length, tone: "default", active: false, onClick: () => setTrackFilter("") },
                { key: "not_started", label: "Not Started", value: counts.not_started, tone: "violet", active: trackFilter === "not_started", onClick: () => toggle("not_started") },
                { key: "in_progress", label: "In Progress", value: counts.in_progress, tone: "amber", active: trackFilter === "in_progress", onClick: () => toggle("in_progress") },
                { key: "on_hold", label: "On Hold", value: counts.on_hold, tone: "amber", active: trackFilter === "on_hold", onClick: () => toggle("on_hold") },
                { key: "completed", label: "Completed", value: counts.completed, tone: "emerald", active: trackFilter === "completed", onClick: () => toggle("completed") },
                { key: "overdue", label: "Overdue", value: counts.overdue, tone: "red", active: trackFilter === "overdue", onClick: () => toggle("overdue") },
                { key: "escalated", label: "Escalated", value: escalatedCount, tone: "red", active: trackFilter === "escalated", onClick: () => toggle("escalated") },
                { key: "delayed", label: "Client Delays", value: delayed, tone: "red", active: trackFilter === "delayed", onClick: () => toggle("delayed") },
              ]}
            />
            <SegmentBar
              segments={[
                { key: "not_started", label: "Not Started", count: counts.not_started, color: "#8b5cf6" },
                { key: "in_progress", label: "In Progress", count: counts.in_progress, color: "#f59e0b" },
                { key: "on_hold", label: "On Hold", count: counts.on_hold, color: "#f97316" },
                { key: "completed", label: "Completed", count: counts.completed, color: "#10b981" },
                { key: "overdue", label: "Overdue", count: counts.overdue, color: "#ef4444" },
              ]}
              active={trackFilter || undefined}
              onSelect={(key) => toggle(key)}
            />
          </div>
        );
      })()}

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
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Asset ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Device Name</th>
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
                      </td>
                      <td className="px-4 py-3.5 text-foreground">
                        {inst.asset_name || inst.device_name || "—"}
                        {inst.asset_name && inst.device_name && (
                          <span className="block text-xs text-muted-foreground">{inst.device_name}</span>
                        )}
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
                        {inst.escalated && (
                          <span
                            title="Due date breached — escalation notifications have fired"
                            className="mt-1 flex w-fit items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-500"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" /> {escalationLabel(inst.escalation_state)}
                          </span>
                        )}
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
                  <label className={createLabelClass}>Vendor (optional)</label>
                  <SearchSelect
                    options={supplierOptions}
                    value={createVendor}
                    onChange={setCreateVendor}
                    name="vendor"
                    placeholder="Search vendor…"
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
              <div>
                <label className={createLabelClass}>Installation Steps (customize the pipeline for this asset)</label>
                <div className="flex flex-wrap gap-2">
                  {STEP_TYPES.map((s) => {
                    const on = createSteps.includes(s.value);
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() =>
                          setCreateSteps((cur) => {
                            if (on) return cur.filter((v) => v !== s.value);
                            const customs = cur.filter((v) => !STEP_TYPES.some((t) => t.value === v));
                            const knowns = STEP_TYPES.map((t) => t.value).filter((v) => cur.includes(v) || v === s.value);
                            return [...knowns, ...customs];
                          })
                        }
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          on
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {on && <Check className="h-3 w-3" />}
                        {s.label}
                      </button>
                    );
                  })}
                  {createSteps
                    .filter((v) => !STEP_TYPES.some((t) => t.value === v))
                    .map((custom) => (
                      <button
                        key={custom}
                        type="button"
                        onClick={() => setCreateSteps((cur) => cur.filter((v) => v !== custom))}
                        title="Click to remove this custom step"
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 border-dashed bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                      >
                        <Check className="h-3 w-3" />
                        {custom}
                        <X className="h-3 w-3" />
                      </button>
                    ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={customStep}
                    onChange={(e) => setCustomStep(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const v = customStep.trim();
                        if (v && !createSteps.includes(v)) setCreateSteps((cur) => [...cur, v]);
                        setCustomStep("");
                      }
                    }}
                    placeholder="Add a custom step (e.g. Crane lift)"
                    className={`${createInputClass} h-9 max-w-xs`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = customStep.trim();
                      if (v && !createSteps.includes(v)) setCreateSteps((cur) => [...cur, v]);
                      setCustomStep("");
                    }}
                    className="inline-flex h-9 items-center gap-1 rounded-lg border border-border px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Step
                  </button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Untick steps that don&apos;t apply, or add your own with the + button — pipelines can be 3 steps or 10.
                </p>
              </div>
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
