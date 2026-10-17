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
  GripVertical,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { SegmentBar, StatTiles } from "@/components/ui/analytics-strip";
import { Pagination, pageSlice } from "@/components/ui/pagination";
import { CopyButton } from "@/components/ui/copy-button";
import { DeviceImage } from "@/components/ui/device-image";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import { SearchSelect } from "@/components/ui/search-select";
import { StatusBadge } from "@/components/ui/badge";
import { FilterBar } from "@/components/ui/filter-bar";
import { ProgressStepper } from "@/components/ui/progress-stepper";
import { ActivityPanel } from "@/components/activity-panel";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import { confirmAction } from "@/components/ui/confirm";
import { formatDate, deadlineMin, todayIso } from "@/lib/utils";

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
  /** The certificate the client signed, uploaded back after the visit. */
  signed_document?: string | null;
  client: string;
  client_name: string;
  site_name: string;
  performed_by_name: string | null;
}

interface Installation {
  id: string;
  device: string;
  installed_by: string | null;
  /** Whether this reader may advance the checklist. The server decides — the
   *  screen used to infer it from the role name and got it wrong both ways. */
  can_advance?: boolean;
  zone: string | null;
  device_code: string;
  device_name: string;
  asset_name: string | null;
  asset_type_name: string | null;
  device_image: string | null;
  device_status: string;
  /** When the asset went live, from the registry. */
  device_activated_at: string | null;
  /** Who marked it live — the registry's record, not the booked installer. */
  device_activated_by?: string | null;
  /** How the asset is made — it decides who installs it. */
  device_source?: string | null;
  device_source_display?: string | null;
  client_names: string[];
  /** The client this asset belongs to, from the project or the site. */
  client_id?: string | null;
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
  /** More hands on the job: they check in and out; the installer works the steps. */
  helpers?: string[];
  helper_names?: string[];
  installed_by_employee_id: string | null;
  installed_by_job_title: string | null;
  vendor: string | null;
  vendor_name: string | null;
  external_vendor_name: string;
  external_vendor_contact: string;
  vendor_display: string | null;
  due_date: string | null;
  completed_at: string | null;
  progress: number;
  client_delays: number;
  on_hold_steps: number;
  escalated: boolean;
  escalation_state: Record<string, string>;
  health: string;
  health_display: string;
  health_reason: string;
  step_template_available: boolean;
  steps: {
    id: string;
    step_type: string;
    step_type_display: string;
    step_number: number;
    status: string;
    status_display: string;
    description: string;
    started_at: string | null;
    completed_at: string | null;
    /** Who pressed Start, and who pressed Complete - on the phone, on site. */
    started_by_name?: string | null;
    completed_by_name?: string | null;
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
  removed_at?: string | null;
  /** The asset this job is for. */
  device?: string;
  id: string;
  device_code: string;
  device_name: string | null;
  asset_name: string | null;
  client_names: string[];
  /** The order this installation belongs to. */
  project_name: string | null;
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
  health: string;
  health_display: string;
  health_reason: string;
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
  { value: "other", label: "Other" },
];

type TrackBucket = "not_started" | "in_progress" | "on_hold" | "completed" | "overdue" | "handover_pending";

function trackBucket(i: { progress: number; due_date: string | null; completed_at: string | null; on_hold_steps: number; health?: string }): TrackBucket {
  // Checklist done, client not yet signed: the server says so, and it was
  // being counted as Completed — so a job with one thing left to do was
  // nowhere to be found.
  if (i.completed_at && i.health === "handover_pending") return "handover_pending";
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

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/** How each health verdict is drawn. A job sitting on hold must not read as
 *  healthy, so the progress bar takes its colour from here too. */
const HEALTH_STYLES: Record<string, { badge: string; bar: string; text: string }> = {
  on_hold: {
    badge: "bg-red-500/10 text-red-600 ring-red-500/20",
    bar: "bg-red-500",
    text: "text-red-600",
  },
  delayed: {
    badge: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
    bar: "bg-amber-500",
    text: "text-amber-600",
  },
  overdue: {
    badge: "bg-red-500/10 text-red-600 ring-red-500/20",
    bar: "bg-red-500",
    text: "text-red-600",
  },
  at_risk: {
    badge: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
    bar: "bg-amber-500",
    text: "text-amber-600",
  },
  on_time: {
    badge: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
    bar: "bg-emerald-500",
    text: "text-emerald-600",
  },
  handover_pending: {
    badge: "bg-sky-500/10 text-sky-700 ring-sky-500/20",
    bar: "bg-sky-500",
    text: "text-sky-700",
  },
  completed: {
    badge: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
    bar: "bg-emerald-500",
    text: "text-emerald-600",
  },
  not_started: {
    badge: "bg-secondary text-muted-foreground ring-border",
    bar: "bg-muted-foreground/40",
    text: "text-muted-foreground",
  },
};

function healthStyle(health: string) {
  return HEALTH_STYLES[health] ?? HEALTH_STYLES.not_started;
}

// The timeline shows the step's real status; only "not_started" is renamed,
// because the stepper calls that state "pending".
function stepperStatus(status: string): "completed" | "in_progress" | "on_hold" | "pending" | "skipped" {
  if (status === "completed" || status === "in_progress" || status === "skipped" || status === "on_hold") {
    return status;
  }
  return "pending";
}

function exportCsv(rows: InstallationListItem[]) {
  const header = ["Asset Code", "Asset Name", "Status", "Client(s)", "Project", "Site", "Installer", "POC", "Assigned", "Due Date", "Installed On", "Progress %", "Client Delays"];
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = rows.map((r) =>
    [
      r.device_code,
      r.asset_name || r.device_name || "",
      r.health_display ?? "",
      r.client_names.join("; "),
      r.project_name ?? "",
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
  const { user, can } = useUser();
  const [installations, setInstallations] = useState<InstallationListItem[]>([]);
  const [installPage, setInstallPage] = useState(1);
  const sort = useSortState();
  const [selected, setSelected] = useState<Installation | null>(null);
  // The open job lives in the address bar. It used to live only in React
  // state, so the URL read /installation-tracker whatever was on screen:
  // a reload went back to the list, Back from a project landed on the list,
  // and "Open" on a project's asset arrived with ?device= in the URL and
  // was shown the home page because nothing read it.
  const router = useRouter();
  const params = useSearchParams();
  const openInstallation = params.get("installation");
  const openDevice = params.get("device");
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
  const [installerOptions, setInstallerOptions] = useState<Option[]>([]);
  // A vendor is either a registered supplier or one named by hand.
  const [editVendorManual, setEditVendorManual] = useState(false);
  const [supplierOptions, setSupplierOptions] = useState<Option[]>([]);
  const [editVendor, setEditVendor] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editInstaller, setEditInstaller] = useState("");
  const [editHelpers, setEditHelpers] = useState<string[]>([]);
  const [templateBusy, setTemplateBusy] = useState(false);
  // The step currently being dragged, and the position it would drop into.
  const [dragStep, setDragStep] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [newStepType, setNewStepType] = useState("survey");
  const [newStepLabel, setNewStepLabel] = useState("");
  const [activateOpen, setActivateOpen] = useState(false);
  const [activateSaving, setActivateSaving] = useState(false);
  const [activatePhotos, setActivatePhotos] = useState<File[]>([]);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [handoverSaving, setHandoverSaving] = useState(false);
  const [clientOptions, setClientOptions] = useState<Option[]>([]);
  const [handoverClient, setHandoverClient] = useState("");

  const isManager = can("assign_installation");
  // Step actions on desktop are super-admin only; the assigned installer
  // works the steps from the mobile app (backend enforces both).
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

  // The address bar decides what is on screen. A link can name the job, or
  // just the asset — a project knows its assets, not their jobs — in which
  // case the asset's live job is looked up and opened.
  useEffect(() => {
    let cancelled = false;
    if (openInstallation) {
      if (selected?.id !== openInstallation) loadDetail(openInstallation);
      return;
    }
    if (openDevice) {
      if (selected?.device === openDevice) return;
      api.get("/sites/installations/", { params: { device: openDevice, page_size: 5 } })
        .then(({ data }) => {
          if (cancelled) return;
          const rows: InstallationListItem[] = data.results ?? data ?? [];
          const live = rows.find((r) => !r.removed_at) ?? rows[0];
          if (live) {
            // Settle the URL on the job itself so Back and reload are exact.
            router.replace(`/installation-tracker?installation=${live.id}`, { scroll: false });
          } else {
            toast.error("That asset is not on the Installation Tracker yet.");
            router.replace("/installation-tracker", { scroll: false });
          }
        })
        .catch(() => { if (!cancelled) toast.error("Could not find that asset's installation."); });
      return () => { cancelled = true; };
    }
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInstallation, openDevice]);

  function openJob(id: string) {
    // push, not replace: Back should come out of the job.
    router.push(`/installation-tracker?installation=${id}`);
  }

  function closeJob() {
    router.push("/installation-tracker");
  }

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

  async function stepTemplate(action: "save" | "apply") {
    if (!selected || templateBusy) return;
    setTemplateBusy(true);
    try {
      const { data } = await api.post(
        `/sites/installations/${selected.id}/${action}-step-template/`, {},
      );
      toast.success(
        action === "save"
          ? data.detail ?? "Saved as the standard checklist"
          : `${data.applied} step(s) loaded from the saved checklist`,
      );
      await loadDetail(selected.id);
      refreshList();
    } catch (err) {
      toast.error(getApiError(err, "That did not work"));
    } finally {
      setTemplateBusy(false);
    }
  }

  async function addStep(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || !newStepType) return;
    setTemplateBusy(true);
    try {
      await api.post("/sites/installation-steps/", {
        installation: selected.id,
        step_type: newStepType,
        custom_label: newStepLabel.trim(),
        // Numbered in the order they are laid out.
        step_number: (selected.steps[selected.steps.length - 1]?.step_number ?? 0) + 1,
      });
      setNewStepLabel("");
      await loadDetail(selected.id);
      toast.success("Step added");
    } catch (err) {
      toast.error(getApiError(err, "Could not add the step"));
    } finally {
      setTemplateBusy(false);
    }
  }

  /** Move the step being dragged to the position it was dropped on. */
  async function moveStepTo(target: number) {
    const held = dragStep;
    setDragStep(null);
    setDropAt(null);
    if (!selected || !held) return;
    const ids = selected.steps.filter((s) => s.step_type !== "handover").map((s) => s.id);
    const from = ids.indexOf(held);
    if (from < 0 || from === target) return;
    ids.splice(target, 0, ids.splice(from, 1)[0]);
    // Handover is done last, whatever order the rest are in.
    const last = selected.steps.filter((s) => s.step_type === "handover").map((s) => s.id);
    try {
      await api.post(`/sites/installations/${selected.id}/reorder-steps/`, { steps: [...ids, ...last] });
      await loadDetail(selected.id);
      toast.success("Step moved");
    } catch (err) {
      toast.error(getApiError(err, "Could not move the step"));
    }
  }

  async function removeStep(stepId: string) {
    if (!selected || !(await confirmAction("Remove this step from the checklist?"))) return;
    try {
      await api.delete(`/sites/installation-steps/${stepId}/`);
      await loadDetail(selected.id);
      toast.success("Step removed");
    } catch (err) {
      toast.error(getApiError(err, "Could not remove the step"));
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
    const [users, sups] = await Promise.allSettled([
      api.get("/accounts/users/", { params: { is_field_staff: true, is_active: true, page_size: 200 } }),
      api.get("/suppliers/", { params: { page_size: 1000 } }),
    ]);
    if (users.status === "fulfilled")
      // Technicians come from the manpower records — show enough of each to
      // tell two same-named people apart (employee ID, job title).
      setInstallerOptions((users.value.data.results ?? []).map((u: {
        id: string; first_name: string; last_name: string; username: string;
        employee_id?: string | null; job_title?: string | null; phone?: string | null;
      }) => {
        const name = u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username;
        const detail = [u.employee_id, u.job_title].filter(Boolean).join(" · ");
        return { id: u.id, label: detail ? `${name} · ${detail}` : name };
      }));
    if (sups.status === "fulfilled")
      setSupplierOptions((sups.value.data.results ?? []).map((v: { id: string; name: string }) => ({ id: v.id, label: v.name })));
  }

  function openEdit() {
    if (!selected) return;
    setEditInstaller(selected.installed_by ?? "");
    setEditHelpers(selected.helpers ?? []);
    setEditVendor(selected.vendor ?? "");
    setEditOpen(true);
    loadFormOptions();
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    setEditSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.patch(`/sites/installations/${selected.id}/`, {
        installed_by: fd.get("installed_by") || null,
        helpers: editHelpers.filter((h) => h !== (fd.get("installed_by") || "")),
        // Only a Vendor Supplied & Installed asset has an outside crew; on the
        // other routes our own technician installs it and there is no vendor.
        ...(selected.device_source === "vendor_turnkey"
          ? {
              vendor: fd.get("vendor") || null,
              external_vendor_name: fd.get("external_vendor_name") || "",
              external_vendor_contact: fd.get("external_vendor_contact") || "",
            }
          : { vendor: null, external_vendor_name: "", external_vendor_contact: "" }),
        installed_at: new Date(String(fd.get("installed_at"))).toISOString(),
        due_date: fd.get("due_date") || null,
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


  /** The handover certificate, to take to site and have signed. */
  async function downloadHandoverDocument() {
    if (!selected) return;
    try {
      const res = await api.get(`/sites/installations/${selected.id}/handover-document/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `handover-${selected.device_code}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiError(err, "Could not produce the handover document"));
    }
  }

  function openHandover() {
    if (!selected) return;
    // The installation already worked out whose asset this is, from the asset,
    // the project it is scoped to or the site it stands on. Nobody re-types it.
    setHandoverClient(selected.client_id ?? "");
    setHandoverOpen(true);
    api
      .get("/clients/", { params: { page_size: 200 } })
      .then(({ data }) => setClientOptions((data.results ?? []).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name }))))
      .catch(() => setClientOptions([]));
  }

  async function handleActivateSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || activateSaving) return;
    if (activatePhotos.length === 0) {
      toast.error("Add a photo of the installed asset first");
      return;
    }
    const fields = new FormData(e.currentTarget);
    const fd = new FormData();
    activatePhotos.forEach((f) => fd.append("photos", f));
    const notes = String(fields.get("notes") ?? "").trim();
    if (notes) fd.append("notes", notes);
    setActivateSaving(true);
    try {
      const { data } = await api.post(`/sites/installations/${selected.id}/activate/`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Asset marked Active — the photo is on the asset too");
      setActivateOpen(false);
      setActivatePhotos([]);
      setSelected(data);
      refreshList();
    } catch (err) {
      toast.error(getApiError(err, "Failed to activate the asset"));
    } finally {
      setActivateSaving(false);
    }
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
    const signed = (form.elements.namedItem("signed_document") as HTMLInputElement | null)?.files?.[0];
    if (!signed) {
      toast.error("Upload the handover document the client signed — that signature is the handover");
      return;
    }
    fd.append("signed_document", signed);
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
    // Handover is the last stage of every job and is shown once, at the end:
    // it completes when the signed handover is recorded. A Handover item in
    // the checklist was shown here as an ordinary step as well, so the
    // desktop listed Handover twice and numbered the list differently from
    // the phone. The checklist is the work before it, numbered 1..n on both.
    const workSteps = selected.steps.filter((s) => s.step_type !== "handover");
    const stepperSteps = workSteps.map((s) => ({
      key: s.id,
      label: s.step_type_display,
      status: stepperStatus(s.status),
      meta: s.completed_at
        ? formatDate(s.completed_at)
        : s.started_at
          ? `Started ${formatDate(s.started_at)}`
          : undefined,
    }));
    // Once the asset is live or handed over the installation is history, and
    // history is not edited: no step is added, moved, reset or re-done.
    const closedOut =
      !!selected.handover ||
      ["active", "under_maintenance", "client_property", "decommissioned"].includes(selected.device_status);
    // Once a step has been started the checklist is a record, not a draft.
    const editableChecklist = !closedOut && selected.steps.every((st) => st.status === "not_started");
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
    // The last two steps of every installation, after whatever the
    // technician laid out: the asset goes live, then it is handed over.
    const customDone = workSteps.length > 0 && stepsReadyForHandover;
    const activeDone =
      ["active", "under_maintenance", "client_property", "decommissioned"].includes(selected.device_status) ||
      !!selected.handover;
    // Going live follows the checklist, not the word in the registry. This
    // used to wait for the asset to read "Installed", and an asset still
    // "In Production" never did — so every step was complete, the hint said
    // "available once every step is complete", and no button came. The
    // server moves it through Installed itself now; only an asset that has
    // left the install path (out of service, written off, the client's) is
    // not something this screen can take live.
    const offPath = ["under_maintenance", "client_property", "decommissioned", "lost_stolen", "rma"]
      .includes(selected.device_status);
    // The installer records their own work from the phone, at the asset,
    // after scanning its label. The desktop offers them nothing to press.
    const fieldOnly = user?.role === "technician";
    const canActivate =
      customDone &&
      !activeDone &&
      !offPath &&
      user != null &&
      !fieldOnly &&
      (can("activate_asset") || user.id === selected.installed_by);
    const activeStatus = activeDone ? "completed" : customDone && !offPath ? "in_progress" : "not_started";
    const handoverDone = !!selected.handover;
    const handoverStatus = handoverDone ? "completed" : activeDone ? "in_progress" : "not_started";
    const canHandover =
      !selected.handover &&
      stepsReadyForHandover &&
      activeDone &&
      user != null &&
      can("close_installation");
    const fixedSteps = [
      {
        key: "active",
        number: workSteps.length + 1,
        label: "Active",
        status: activeStatus,
        statusLabel: activeDone ? "Completed" : activeStatus === "in_progress" ? "Ready" : "Pending",
        date: activeDone ? selected.device_activated_at ?? selected.handover?.handover_date ?? null : null,
        hint: activeDone
          ? "The asset is live."
          : activeStatus === "in_progress"
            ? "Mark the asset live, with a photo of it running."
            : offPath
              ? "The asset has left the installation path — see its status in the registry."
              : "Available once every step above is complete.",
        action: canActivate && !activeDone
          ? { label: "Mark Active", onClick: () => { setActivatePhotos([]); setActivateOpen(true); } }
          : null,
      },
      {
        key: "handover",
        number: workSteps.length + 2,
        label: "Handover",
        status: handoverStatus,
        statusLabel: handoverDone ? "Completed" : handoverStatus === "in_progress" ? "Ready" : "Pending",
        date: selected.handover?.handover_date ?? null,
        hint: handoverDone
          ? `Accepted by ${selected.handover?.accepted_by_name ?? "the client"}.`
          : handoverStatus === "in_progress"
            ? "Upload the signed handover document."
            : "Available once the asset is active.",
        action: canHandover
          ? { label: "Hand over", onClick: openHandover }
          : null,
      },
    ];

    return (
      <div className="space-y-6">
        {/* On a phone the actions drop under the title instead of running
            off the right edge. */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={closeJob}
            aria-label="Back to all installations"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">Asset Installation Tracker</h1>
            <p className="text-sm text-muted-foreground">Track installation progress in different stages</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {/* Printed first, signed on site, then uploaded on the Handover
                step at the end of the checklist. */}
            <button
              onClick={downloadHandoverDocument}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Download className="h-4 w-4" /> Handover Document
            </button>
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
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          {/* Picture, facts, progress side by side where there is room;
              stacked on a phone, where side by side left the facts a column
              too narrow for a single word. */}
          <div className="flex flex-col gap-5 sm:flex-row">
            <DeviceImage src={selected.device_image} alt={selected.device_code} size="xl" className="h-32 w-32 shrink-0 sm:h-40 sm:w-40" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/assets?device=${selected.device}`} className="text-sm font-medium text-primary hover:underline">
                  Asset ID: {selected.device_code}
                </Link>
                {selected.asset_name && <span className="text-sm font-semibold text-foreground">{selected.asset_name}</span>}
                {/* How the asset is made, worded as the register words it —
                    the same tag the project's Execution tab carries. */}
                {selected.device_source_display && (
                  <span
                    title="Manufacturing route"
                    className={`rounded-full px-2.5 py-0.5 text-2xs font-medium ring-1 ${
                      selected.device_source === "inhouse"
                        ? "bg-primary/10 text-primary ring-primary/20"
                        : "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20"
                    }`}
                  >
                    {selected.device_source_display}
                  </span>
                )}
                <StatusBadge status={selected.device_status} />
                <span
                  title={selected.health_reason || undefined}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-2xs font-semibold ring-1 ${healthStyle(selected.health).badge}`}
                >
                  {(selected.health === "on_hold" || selected.health === "overdue" || selected.health === "delayed") && (
                    <AlertTriangle className="h-3 w-3" />
                  )}
                  {selected.health_display}
                </span>
                {selected.handover && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-2xs font-semibold text-emerald-600">
                    <ClipboardCheck className="h-3 w-3" /> Handed over
                  </span>
                )}
                {selected.escalated && (
                  <span
                    title="This installation breached its due date and escalation notifications have fired"
                    className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-2xs font-semibold text-red-500"
                  >
                    <AlertTriangle className="h-3 w-3" /> {escalationLabel(selected.escalation_state)}
                  </span>
                )}
                {selected.client_delays > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-2xs font-semibold text-red-500">
                    <AlertTriangle className="h-3 w-3" /> {selected.client_delays} client delay{selected.client_delays > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              {/* As many columns as fit, never one narrower than a name. */}
              <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4 break-words text-sm [&>div]:min-w-0">
                <div>
                  <p className="text-xs text-muted-foreground">Site Name</p>
                  <Link href={`/sites?site=${selected.site}`} className="font-medium text-primary hover:underline">{selected.site_name}</Link>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Client(s)</p>
                  <p className="font-medium text-foreground">{selected.client_names.length > 0 ? selected.client_names.join(", ") : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Project</p>
                  <p className="font-medium text-foreground">{selected.project_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">POC</p>
                  <p className="font-medium text-foreground">
                    {selected.poc_name || "—"}
                    {selected.poc_phone && <span className="block text-xs text-muted-foreground">{selected.poc_phone}</span>}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Technician</p>
                  <p className="font-medium text-foreground">
                    {selected.installed_by_name || "—"}
                    {/* Pulled from the manpower record, not retyped here. */}
                    {(selected.installed_by_employee_id || selected.installed_by_job_title) && (
                      <span className="block text-xs text-muted-foreground">
                        {[selected.installed_by_employee_id, selected.installed_by_job_title].filter(Boolean).join(" · ")}
                      </span>
                    )}
                    {selected.installed_by_phone && <span className="block text-xs text-muted-foreground">{selected.installed_by_phone}</span>}
                  </p>
                  {(selected.helper_names ?? []).length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Helpers: <span className="text-foreground">{selected.helper_names!.join(", ")}</span>
                    </p>
                  )}
                </div>
                <div>
                  {/* Only a turnkey asset is installed by a vendor. On the
                      other two routes our own technician does it, so there is
                      no vendor to name rather than one nobody filled in. */}
                  <p className="text-xs text-muted-foreground">Vendor</p>
                  {selected.device_source === "vendor_turnkey" ? (
                    <p className="font-medium text-foreground">
                      {selected.vendor_display || "Not chosen yet"}
                      <span className="block text-xs text-muted-foreground">
                        Installing this asset
                        {!selected.vendor && selected.external_vendor_name ? " · entered manually" : ""}
                      </span>
                    </p>
                  ) : (
                    <p className="font-medium text-foreground">
                      N/A
                      <span className="block text-xs text-muted-foreground">
                        Installed by our own technician
                      </span>
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Location at site</p>
                  <p className="font-medium text-foreground">{selected.position_label || selected.site_city || "—"}</p>
                </div>
                <div>
                  {/* The day somebody took the job on, not the day it went in. */}
                  <p className="text-xs text-muted-foreground">Assigned</p>
                  <p className="font-medium text-foreground">{formatDate(selected.installed_at)}</p>
                </div>
                <div>
                  {/* Agreed with the technician when the supervisor handed the
                      job out, on the asset. Changing it here would move a date
                      somebody already committed to. */}
                  <p className="text-xs text-muted-foreground">Due Date</p>
                  <p className={`font-medium ${overdue ? "text-red-500" : "text-foreground"}`}>
                    {selected.due_date ? formatDate(selected.due_date) : "Not agreed"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Installed On</p>
                  <p className="font-medium text-foreground">
                    {selected.completed_at ? formatDate(selected.completed_at) : "Not yet installed"}
                  </p>
                </div>
              </div>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-xs text-muted-foreground">Overall Progress</p>
              {/* Green on a job that is on hold would be a lie, so the bar
                  reads the same verdict as the badge. */}
              <p className={`text-3xl font-bold ${healthStyle(selected.health).text}`}>{selected.progress}%</p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary sm:w-32">
                <div
                  className={`h-full rounded-full transition-all ${healthStyle(selected.health).bar}`}
                  style={{ width: `${selected.progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Nothing about a blocked job should need hunting for. */}
        {["on_hold", "delayed", "overdue"].includes(selected.health) && (
          <div className={`flex items-start gap-3 rounded-xl border p-4 ${
            selected.health === "delayed"
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-red-500/30 bg-red-500/5"
          }`}>
            <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${healthStyle(selected.health).text}`} />
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${healthStyle(selected.health).text}`}>
                {selected.health_display}
              </p>
              {selected.health_reason && (
                <p className="mt-0.5 text-xs text-muted-foreground">{selected.health_reason}</p>
              )}
            </div>
          </div>
        )}

        {/* Installation Steps Pipeline */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">Installation Steps</h2>
              <p className="text-2xs text-muted-foreground">
                {editableChecklist
                  ? "Lay out what this installation actually involves, then save it as the standard for this asset type."
                  : "The checklist this installation is being run through."}
              </p>
            </div>
            {isManager && selected.asset_type_name && (
              <div className="flex items-center gap-2">
                {editableChecklist && selected.step_template_available && (
                  <button
                    onClick={() => stepTemplate("apply")}
                    disabled={templateBusy}
                    title={`Load the saved checklist for ${selected.asset_type_name}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  >
                    <Layers className="h-3 w-3" /> Use saved checklist
                  </button>
                )}
                {selected.steps.length > 0 && (
                  <button
                    onClick={() => stepTemplate("save")}
                    disabled={templateBusy}
                    title={`Save this checklist as the standard for ${selected.asset_type_name}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  >
                    <ClipboardCheck className="h-3 w-3" /> Save as standard checklist
                  </button>
                )}
              </div>
            )}
          </div>

          {stepperSteps.length > 0 ? (
            <ProgressStepper
              steps={[
                ...stepperSteps,
                ...fixedSteps.map((f) => ({
                  key: f.key,
                  label: f.label,
                  status: stepperStatus(f.status),
                  meta: f.date ? formatDate(f.date) : undefined,
                })),
              ]}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No steps yet — add the ones this installation involves below.
            </p>
          )}

          {/* Editable only until the crew starts working it; after that the
              checklist is a record of what was done. */}
          {isManager && editableChecklist && (
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-2xs text-muted-foreground">
                Drag a step to move it. They run in the order shown.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {workSteps.map((step, i) => (
                  <span
                    key={step.id}
                    draggable
                    onDragStart={() => setDragStep(step.id)}
                    onDragEnd={() => { setDragStep(null); setDropAt(null); }}
                    onDragOver={(e) => { e.preventDefault(); setDropAt(i); }}
                    onDrop={(e) => { e.preventDefault(); moveStepTo(i); }}
                    title="Drag to move this step"
                    className={`inline-flex cursor-grab items-center gap-1 rounded-lg border px-2 py-1 text-2xs text-foreground transition-colors active:cursor-grabbing ${
                      dragStep === step.id
                        ? "border-primary bg-primary/10 opacity-60"
                        : dropAt === i && dragStep
                          ? "border-primary bg-primary/5"
                          : "border-border"
                    }`}
                  >
                    <GripVertical className="h-3 w-3 text-muted-foreground" />
                    {i + 1}. {step.step_type_display}
                    <button
                      onClick={() => removeStep(step.id)}
                      title="Remove step"
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
              <form onSubmit={addStep} className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={newStepType}
                  onChange={(e) => setNewStepType(e.target.value)}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                >
                  {STEP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <input
                  value={newStepLabel}
                  onChange={(e) => setNewStepLabel(e.target.value)}
                  placeholder="Name it (optional)"
                  className="h-8 w-52 rounded-lg border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground"
                />
                <button
                  type="submit"
                  disabled={templateBusy}
                  className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Step
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Step Detail Cards + Activity */}
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            {/* As many cards a row as fit at 12rem each: three on a wide
                screen, one on a phone. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4">
              {workSteps.map((step, idx) => {
                const stepDelays = delaysByStep.get(step.id) ?? [];
                return (
                  <div key={step.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                      <h4 className="min-w-0 text-sm font-semibold text-foreground">
                        {idx + 1}. {step.step_type_display}
                      </h4>
                      <StatusBadge status={step.status} label={step.status_display} />
                    </div>
                    <div className="space-y-1.5 text-xs">
                      {/* Who pressed Start and who pressed Complete, on site from
                          the field app, and when. A step not reached yet has
                          neither, and says so rather than showing a date. */}
                      {([
                        ["Started by", step.status === "not_started" ? null : step.started_at, step.started_by_name],
                        ["Completed by", step.status === "completed" ? step.completed_at : null, step.completed_by_name],
                      ] as const).map(([what, when, who]) => (
                        <div key={what} className="flex justify-between gap-2">
                          <span className="shrink-0 text-muted-foreground">{what}</span>
                          <span className="min-w-0 text-right text-foreground">
                            {when ? (
                              <>
                                {who || "—"}
                                <span className="block text-2xs text-muted-foreground">{formatDate(when)}</span>
                              </>
                            ) : "—"}
                          </span>
                        </div>
                      ))}
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
                              <p className={`inline-flex items-center gap-1 text-2xs font-semibold ${
                                d.resolved_at ? "text-muted-foreground line-through" : d.cause === "client" ? "text-red-500" : "text-amber-600"
                              }`}>
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {step.status === "on_hold" && !d.resolved_at ? "On hold" : "Delay"} — caused by {d.cause_display}
                              </p>
                              {d.cause === "client" && selected.client_names.length > 0 && (
                                <p className="text-2xs text-muted-foreground">Client: {selected.client_names.join(", ")}</p>
                              )}
                              {d.description && <p className="text-2xs text-foreground">{d.description}</p>}
                              <p className="text-2xs text-muted-foreground">
                                {d.reported_by_name ? `By ${d.reported_by_name} · ` : ""}{formatDate(d.created_at)}
                                {d.resolved_at ? ` · resolved ${formatDate(d.resolved_at)}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* The installer, their supervisor, or a platform admin. */}
                    {selected.can_advance && !closedOut && user?.role !== "technician" && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                        {step.status !== "in_progress" && step.status !== "completed" && (
                          <button disabled={updatingStep === step.id} onClick={() => updateStep(step.id, "in_progress")} className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-2xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 disabled:opacity-50">
                            <Play className="h-3 w-3" /> Start
                          </button>
                        )}
                        {step.status !== "completed" && (() => {
                          // Work that was never started cannot be finished:
                          // the step was being ticked straight from Not
                          // Started to Completed, and the dates on the card
                          // then had nothing behind them.
                          const notBegun = step.status !== "in_progress";
                          return (
                            <button
                              disabled={updatingStep === step.id || notBegun}
                              title={
                                step.status === "on_hold"
                                  ? "On hold — start it again before marking it complete"
                                  : notBegun ? "Start this step before completing it" : undefined
                              }
                              onClick={() => updateStep(step.id, "completed")}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-2xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-500/10"
                            >
                              <Check className="h-3 w-3" /> Complete
                            </button>
                          );
                        })()}
                        {step.status !== "on_hold" && step.status !== "completed" && (
                          <button onClick={() => { setDelayCause("client"); setDelayFor({ stepId: step.id, label: `${idx + 1}. ${step.step_type_display}`, hold: true }); }} className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-1 text-2xs font-medium text-orange-500 transition-colors hover:bg-orange-500/20">
                            <Pause className="h-3 w-3" /> Hold
                          </button>
                        )}
                        {step.status !== "not_started" && (
                          <button disabled={updatingStep === step.id} onClick={() => updateStep(step.id, "not_started")} className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary/70 disabled:opacity-50">
                            <RotateCcw className="h-3 w-3" /> Reset
                          </button>
                        )}
                        <button onClick={() => setDelayFor({ stepId: step.id, label: `${idx + 1}. ${step.step_type_display}` })} className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-2xs font-medium text-red-500 transition-colors hover:bg-red-500/20">
                          <AlertTriangle className="h-3 w-3" /> Flag Delay
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {/* Compulsory and last, in this order: the asset goes live, then
                  it is handed over. Done from here, like any other step. */}
              {fixedSteps.map((f) => (
                <div
                  key={f.key}
                  className={`rounded-xl border p-4 ${
                    f.status === "completed"
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : f.status === "in_progress"
                        ? "border-primary/40 bg-primary/5"
                        : "border-dashed border-border bg-card"
                  }`}
                >
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                    <h4 className="min-w-0 text-sm font-semibold text-foreground">
                      {f.number}. {f.label}
                    </h4>
                    <StatusBadge status={f.status} label={f.statusLabel} />
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <span className="text-foreground">{f.date ? formatDate(f.date) : "—"}</span>
                    </div>
                    <p className="text-muted-foreground">{f.hint}</p>
                  </div>
                  {f.action && (
                    <div className="mt-3 border-t border-border pt-3">
                      <button
                        onClick={f.action.onClick}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${
                          f.key === "active" ? "bg-primary hover:bg-primary/90" : "bg-emerald-600 hover:bg-emerald-700"
                        }`}
                      >
                        {f.key === "active" ? <Play className="h-3.5 w-3.5" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                        {f.action.label}
                      </button>
                    </div>
                  )}
                </div>
              ))}
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
                        <p className="mt-1 text-2xs text-muted-foreground max-w-44 truncate">{photo.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right rail */}
          <div className="space-y-4">
            {/* Every act on this installation, from the server's own log: who
                did it, and the date and time. First in the column, where the
                eye lands. */}
            <ActivityPanel
              endpoint={`/sites/installations/${selected.id}/activity/`}
              refreshKey={JSON.stringify(selected)}
            />
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
                  {selected.handover.signed_document && (
                    <div className="border-t border-emerald-500/20 pt-2">
                      <a
                        href={selected.handover.signed_document}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:underline"
                      >
                        <Download className="h-3.5 w-3.5" /> Signed handover document
                      </a>
                    </div>
                  )}
                  {!selected.handover.signed_document && selected.handover.signature && (
                    <div className="border-t border-emerald-500/20 pt-2">
                      <p className="mb-1 text-muted-foreground">Signature</p>
                      {/* Records made before the signed document was asked for. */}
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
                {selected.can_advance && (
                  <button
                    onClick={() => setDelayFor({ stepId: null, label: "Whole installation" })}
                    className="text-2xs font-medium text-red-500 hover:underline"
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
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold ${
                          d.cause === "client" ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"
                        }`}>
                          <AlertTriangle className="h-2.5 w-2.5" /> {d.cause_display}
                        </span>
                        <span className="text-2xs text-muted-foreground">{formatDate(d.created_at)}</span>
                      </div>
                      {d.step_type_display && (
                        <p className="mt-1 text-2xs font-medium text-foreground">{d.step_type_display}</p>
                      )}
                      {/* Remarks get their own row: they are the part someone
                          actually needs to read, not a suffix on the step. */}
                      <div className="mt-1.5 rounded-md bg-secondary/50 px-2 py-1.5">
                        <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Remarks</p>
                        <p className="mt-0.5 whitespace-pre-wrap text-xs text-foreground">
                          {d.description || "No details recorded"}
                        </p>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-2xs text-muted-foreground">{d.reported_by_name || ""}</span>
                        {d.resolved_at ? (
                          <span className="text-2xs font-medium text-emerald-600">Resolved {formatDate(d.resolved_at)}</span>
                        ) : (
                          isManager && (
                            <button onClick={() => resolveDelay(d.id)} className="text-2xs font-medium text-primary hover:underline">
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
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Related Documents</h3>
                <Link href="/documents" className="text-2xs font-medium text-primary hover:underline">View All</Link>
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
          <Modal open onClose={() => setDelayFor(null)}
              title={`Flag Delay — ${delayFor.label}`} size="xs">
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
        </Modal>
        )}

        {/* Edit installation modal */}
        <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit Installation — ${selected.device_code}`} size="lg">
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className={selected.device_source === "vendor_turnkey" ? "" : "sm:col-span-2"}>
                <label className={createLabelClass}>
                  {selected.device_source === "vendor_turnkey" ? "Assigned to (overseeing)" : "Assigned Installer"}
                </label>
                <SearchSelect
                  options={installerOptions}
                  value={editInstaller}
                  onChange={setEditInstaller}
                  name="installed_by"
                  placeholder="Search installer…"
                />
              </div>
              <div className="sm:col-span-2">
                <label className={createLabelClass}>Helpers</label>
                <MultiSelect
                  options={installerOptions.filter((o) => o.id !== editInstaller)}
                  values={editHelpers.filter((h) => h !== editInstaller)}
                  onChange={setEditHelpers}
                  placeholder="More hands on this installation (optional)"
                />
                <p className="mt-1 text-2xs text-muted-foreground">
                  Helpers check in and check out at the site from the field app. The installer works the steps.
                </p>
              </div>
              {selected.device_source === "vendor_turnkey" && (
              <div>
                <div className="flex items-center justify-between">
                  <label className={createLabelClass}>Vendor</label>
                  <button
                    type="button"
                    onClick={() => { setEditVendorManual((v) => !v); setEditVendor(""); }}
                    className="text-2xs font-medium text-primary hover:underline"
                  >
                    {editVendorManual ? "Pick a registered vendor" : "Not registered? Enter manually"}
                  </button>
                </div>
                {editVendorManual ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      name="external_vendor_name"
                      defaultValue={selected?.external_vendor_name ?? ""}
                      placeholder="Vendor name"
                      className={createInputClass}
                    />
                    <input
                      name="external_vendor_contact"
                      defaultValue={selected?.external_vendor_contact ?? ""}
                      placeholder="Contact person / phone"
                      className={createInputClass}
                    />
                  </div>
                ) : (
                <SearchSelect
                  options={supplierOptions}
                  value={editVendor}
                  onChange={setEditVendor}
                  name="vendor"
                  placeholder="Search vendor…"
                />
                )}
              </div>
              )}
              <div>
                <label htmlFor="ei-installed-at" className={createLabelClass}>Assigned</label>
                <input
                  id="ei-installed-at"
                  name="installed_at"
                  type="datetime-local"
                  required
                  max={toLocalInputValue(new Date().toISOString())}
                  defaultValue={toLocalInputValue(selected.installed_at)}
                  className={createInputClass}
                />
              </div>
              <div>
                <label htmlFor="ei-due" className={createLabelClass}>Due Date</label>
                <input id="ei-due" name="due_date" type="date" min={deadlineMin(selected.due_date)} defaultValue={selected.due_date ?? ""} className={createInputClass} />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ei-position" className={createLabelClass}>Location at site</label>
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

        {/* Mark Active — the technician's own status change, with the photo
            that proves the asset is up and running. */}
        <Modal
          open={activateOpen}
          onClose={() => setActivateOpen(false)}
          title={`Mark Active — ${selected.device_code}`}
        >
          <form onSubmit={handleActivateSubmit} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Confirms the asset is installed and running. The photo you add is filed against this
              installation and on the asset itself, and the registry status follows automatically.
            </p>
            <div>
              <label htmlFor="activate-photos" className={createLabelClass}>
                Photo of the installed asset *
              </label>
              <input
                id="activate-photos"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setActivatePhotos(Array.from(e.target.files ?? []))}
                className={createInputClass}
              />
              {activatePhotos.length > 0 && (
                <p className="mt-1 text-2xs text-muted-foreground">
                  {activatePhotos.length} photo{activatePhotos.length > 1 ? "s" : ""} ready to upload.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="activate-notes" className={createLabelClass}>Notes</label>
              <textarea
                id="activate-notes"
                name="notes"
                rows={2}
                placeholder="e.g. Powered on, content playing, client shown the controls"
                className={`${createInputClass} h-auto py-2`}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setActivateOpen(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={activateSaving || activatePhotos.length === 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {activateSaving ? "Saving…" : "Mark Active"}
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
                {/* The client was settled when the project was raised. Letting
                    it be changed here would hand the asset to somebody the
                    project never named. */}
                {selected.client_id ? (
                  <div
                    id="ho-client"
                    className={`${createInputClass} flex items-center justify-between gap-2`}
                  >
                    <span className="truncate text-foreground">
                      {selected.client_names[0] ?? "Client on the project"}
                    </span>
                    <span className="shrink-0 text-2xs text-muted-foreground">from the project</span>
                  </div>
                ) : (
                  <SearchSelect
                    options={clientOptions}
                    value={handoverClient}
                    onChange={setHandoverClient}
                    name="client"
                    placeholder="Search client…"
                  />
                )}
              </div>
              <div>
                <label htmlFor="ho-date" className={createLabelClass}>Handover Date</label>
                <input
                  id="ho-date"
                  name="handover_date"
                  type="date"
                  max={todayIso()}
                  defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)}
                  className={createInputClass}
                />
              </div>
              <div>
                <label htmlFor="ho-document" className={createLabelClass}>Signed handover document *</label>
                <input
                  id="ho-document"
                  name="signed_document"
                  type="file"
                  required
                  accept="application/pdf,image/*,.doc,.docx"
                  className={`${createInputClass} h-auto py-2 file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-xs file:font-medium file:text-foreground`}
                />
                <p className="mt-1 text-2xs text-muted-foreground">
                  The signature is the handover, so this is required. Download the certificate above,
                  take it to site, upload the signed copy here — a scan or a photograph both count.
                </p>
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
        </div>
      </div>

      {(() => {
        const counts = { not_started: 0, in_progress: 0, on_hold: 0, handover_pending: 0, completed: 0, overdue: 0 };
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
                { key: "handover_pending", label: "Handover Pending", value: counts.handover_pending, tone: "primary", active: trackFilter === "handover_pending", onClick: () => toggle("handover_pending") },
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
                { key: "handover_pending", label: "Handover Pending", count: counts.handover_pending, color: "#0ea5e9" },
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
                  <SortTh sort={sort} k="device_code" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Asset ID</SortTh>
                  <SortTh sort={sort} k="asset_name" className="min-w-[11rem] px-4 py-3 text-left text-xs font-medium text-muted-foreground">Asset Name</SortTh>
                  <SortTh sort={sort} k="clients" className="min-w-[10rem] px-4 py-3 text-left text-xs font-medium text-muted-foreground">Client(s)</SortTh>
                  <SortTh sort={sort} k="project_name" className="min-w-[10rem] px-4 py-3 text-left text-xs font-medium text-muted-foreground">Project</SortTh>
                  <SortTh sort={sort} k="site_name" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Site</SortTh>
                  <SortTh sort={sort} k="installed_by_name" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Installer</SortTh>
                  <SortTh sort={sort} k="poc_name" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">POC</SortTh>
                  <SortTh sort={sort} k="due_date" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Due Date</SortTh>
                  <SortTh sort={sort} k="completed_at" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Installed On</SortTh>
                  <SortTh sort={sort} k="health_display" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Status</SortTh>
                  <SortTh sort={sort} k="progress" className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Progress</SortTh>
                </tr>
              </thead>
              <tbody>
                {pageSlice(sortRows(filtered, sort, { asset_name: (i) => i.asset_name || i.device_name, clients: (i) => (i.client_names ?? []).join(", ") }), installPage).map((inst) => {
                  const rowOverdue = inst.due_date && !inst.completed_at && new Date(inst.due_date) < new Date();
                  return (
                    <tr
                      key={inst.id}
                      onClick={() => openJob(inst.id)}
                      className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30"
                    >
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center gap-1 font-mono font-medium text-primary">
                          {inst.device_code}
                          <CopyButton text={inst.device_code} label="asset code" />
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-foreground">
                        {/* Falls back to the asset code, which the ID column
                            already shows — no point printing it twice. */}
                        {inst.asset_name
                          || (inst.device_name !== inst.device_code ? inst.device_name : null)
                          || "—"}
                      </td>
                      <td className="px-4 py-3.5 text-foreground">{inst.client_names.length > 0 ? inst.client_names.join(", ") : "—"}</td>
                      {/* Which order the installation belongs to — the question
                          asked of every other list in the system. */}
                      <td className="px-4 py-3.5 text-foreground">{inst.project_name || "Not on a project"}</td>
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
                            className="mt-1 flex w-fit items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-2xs font-semibold text-red-500"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" /> {escalationLabel(inst.escalation_state)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {inst.completed_at ? formatDate(inst.completed_at) : "—"}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          title={inst.health_reason || undefined}
                          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-2xs font-semibold ring-1 ${healthStyle(inst.health).badge}`}
                        >
                          {["on_hold", "overdue", "delayed"].includes(inst.health) && (
                            <AlertTriangle className="h-2.5 w-2.5" />
                          )}
                          {inst.health_display}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {/* The bar agrees with the status beside it. */}
                          <span className={`text-sm font-semibold ${healthStyle(inst.health).text}`}>{inst.progress}%</span>
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full rounded-full ${healthStyle(inst.health).bar}`}
                              style={{ width: `${inst.progress}%` }}
                            />
                          </div>
                          {inst.client_delays > 0 && (
                            <span title={`${inst.client_delays} client delay(s)`} className="inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-2xs font-semibold text-red-500">
                              <AlertTriangle className="h-2.5 w-2.5" /> {inst.client_delays}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={installPage} total={filtered.length} onPage={setInstallPage} noun="installations" />
          </div>
        </div>
      )}

    </div>
  );
}
