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
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { ProjectRequirements } from "@/components/projects/project-requirements";
import { ProjectBudgetSummary } from "@/components/projects/project-budget-summary";
import { ProjectPlanning } from "@/components/projects/project-planning";
import { ProjectActuals } from "@/components/projects/project-actuals";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { CURRENCIES } from "@/lib/currency";
import { useUser } from "@/lib/user-context";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Modal } from "@/components/ui/modal";
import { SearchSelect } from "@/components/ui/search-select";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";

interface ClientOpt { id: string; name: string }
interface Option { id: string; label: string }

/** Sites read as "name · city": several can share a name, and the city is what
 *  tells them apart on a list. */
function siteLabels(rows: { id: string; name: string; city?: string }[]): Option[] {
  return rows.map((s) => ({ id: s.id, label: s.city ? `${s.name} · ${s.city}` : s.name }));
}
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
];
const OFF_RAMP_PHASES = [
  { value: "on_hold", label: "On Hold" },
  { value: "lost", label: "Order Lost" },
];
const CONTRACT_TYPES = [
  { value: "sold", label: "Sold Outright" },
  { value: "rental", label: "Rental" },
];
const emptyForm = {
  name: "", description: "", status: "planning", phase: "query",
  client: "", site: "", sites: [] as string[], manager: "", start_date: "", target_date: "",
  contract_type: "", rental_end_date: "",
};

function ContractBadge({ contractType, rentalEndDate, compact = false }: { contractType: string; rentalEndDate: string | null; compact?: boolean }) {
  if (!contractType) return null;
  const isRental = contractType === "rental";
  const label = compact
    ? (isRental ? "Rental" : "Sold")
    : isRental
      ? `Rental${rentalEndDate ? ` until ${rentalEndDate}` : ""}`
      : "Sold Outright";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${compact ? "px-2 py-0.5 text-2xs" : "px-3 py-1 text-xs"} ${
      isRental ? "bg-blue-500/10 text-blue-600 ring-1 ring-blue-500/20" : "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20"
    }`}>
      {label}
    </span>
  );
}

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
  /** Item 4: a project can cover several sites. */
  sites: string[];
  site_names: string[];
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
  contract_type: string;
  rental_end_date: string | null;
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

interface BOMAllocationRow {
  id: string;
  bom_line: string;
  device: string | null;
  device_code: string | null;
  device_serial: string | null;
  inventory_item: string | null;
  item_name: string | null;
  quantity: number;
  status: string; // allocated | issued | cancelled
  allocated_by_name: string | null;
  created_at: string;
}

interface BOMLine {
  id: string;
  project: string;
  asset_type: string | null;
  asset_type_name: string | null;
  device_model: string | null;
  device_model_name: string | null;
  material_type: string | null;
  material_type_name: string | null;
  description: string;
  quantity: number;
  unit_price: string;
  allocated_quantity: number;
  issued_quantity: number;
  shortage: number;
  allocations: BOMAllocationRow[];
}

interface BOMTotals {
  required: number;
  allocated: number;
  issued: number;
  shortage: number;
}

interface InventoryItemOpt {
  id: string;
  material_name: string | null;
  sku: string;
  quantity: number;
  unit: string | null;
}

interface SupplierOpt {
  id: string;
  name: string;
}

/** Wave-2 endpoints return field-keyed 400s ({"quantity": "..."}); flatten the first message. */
function bomApiError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "response" in err) {
    const data = (err as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === "object") {
      for (const value of Object.values(data as Record<string, unknown>)) {
        if (typeof value === "string") return value;
        if (Array.isArray(value) && typeof value[0] === "string") return value[0];
      }
    }
  }
  return getApiError(err, fallback);
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
  site_name?: string | null;
  site_names?: string[];
  location: string;
  image: string | null;
  status: string;
  status_display: string;
  phase: string;
  phase_display: string;
  progress: number;
  start_date: string | null;
  target_date: string | null;
  contract_type: string;
  rental_end_date: string | null;
  bottleneck_count: number;
}

export default function ProjectsPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("devices");
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  // Search by name, client or site. The server does the matching, so it finds
  // projects beyond the first page and in any status.
  const [query, setQuery] = useState("");
  const queryRef = useRef("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // Opening a site from inside the project form, so the flow is not broken to
  // go and define one under Sites first.
  const [newSiteOpen, setNewSiteOpen] = useState(false);
  const [newSite, setNewSite] = useState({ name: "", address: "", city: "" });
  const [savingSite, setSavingSite] = useState(false);
  const [managerOptions, setManagerOptions] = useState<Option[]>([]);
  const [scopeDevice, setScopeDevice] = useState("");
  const [scopeComponents, setScopeComponents] = useState<Option[]>([]);
  const [addingScope, setAddingScope] = useState(false);
  const [contractFilter, setContractFilter] = useState("");
  // Planning (estimate + budget approval) comes first; execution (stock,
  // procurement, delivery) follows once the budget is signed off.
  const [projectTab, setProjectTab] = useState<"planning" | "execution">("planning");

  // BOM tab (WF-02 / WF-03)
  const [bomLines, setBomLines] = useState<BOMLine[]>([]);
  const [bomTotals, setBomTotals] = useState<BOMTotals | null>(null);
  const [allocLine, setAllocLine] = useState<BOMLine | null>(null);
  const [allocMode, setAllocMode] = useState<"device" | "stock">("device");
  const [allocDevice, setAllocDevice] = useState("");
  const [allocDeviceOptions, setAllocDeviceOptions] = useState<Option[]>([]);
  const [allocItems, setAllocItems] = useState<InventoryItemOpt[]>([]);
  const [allocItem, setAllocItem] = useState("");
  const [allocQty, setAllocQty] = useState("1");
  const [allocSaving, setAllocSaving] = useState(false);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [poModalOpen, setPoModalOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [poSupplier, setPoSupplier] = useState("");
  const [poCurrency, setPoCurrency] = useState("PKR");
  const [poSaving, setPoSaving] = useState(false);

  async function loadDetail(id: string) {
    try {
      const { data } = await api.get(`/teams/projects/${id}/`);
      setDetail(data);
      api.get("/teams/bom-lines/", { params: { project: id, page_size: 500 } })
        .then((r) => setBomLines(r.data.results ?? r.data ?? []))
        .catch(() => setBomLines([]));
      api.get(`/teams/projects/${id}/bom-summary/`)
        .then((r) => setBomTotals(r.data?.totals ?? null))
        .catch(() => setBomTotals(null));
      // Assets reach a project either by their own project field or through a
      // Scope row; the requirements endpoint already returns that union, so it
      // is the one source both this list and Build Requirements agree on.
      api.get(`/teams/projects/${id}/requirements/`)
        .then((r) => setLinkedAssets(
          (r.data.assets ?? []).map((a: { id: string; asset_code: string; display_name: string; status: string }) => ({
            id: a.id, asset_code: a.asset_code, display_name: a.display_name, status: a.status,
          })),
        ))
        .catch(() => setLinkedAssets([]));
      if (deviceOptions.length === 0) {
        api.get("/assets/devices/", { params: { page_size: 1000 } })
          .then((r) => setDeviceOptions((r.data.results ?? []).map((d: { id: string; asset_code: string; display_name: string | null }) => ({
            id: d.id,
            label: d.display_name ? `${d.asset_code} — ${d.display_name}` : d.asset_code,
          }))))
          .catch(() => {});
        api.get("/sites/sites/", { params: { page_size: 1000 } })
          .then((r) => setSiteOptions(siteLabels(r.data.results ?? [])))
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
        component: null,
        quantity: 1,
        site: fd.get("scope_site") || null,
        start_date: null,
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

  const [editingScope, setEditingScope] = useState<string | null>(null);
  const [scopeEdit, setScopeEdit] = useState({ site: "", notes: "" });

  async function saveScopeItem(id: string) {
    try {
      await api.patch(`/teams/scope-items/${id}/`, { site: scopeEdit.site || null, notes: scopeEdit.notes });
      setEditingScope(null);
      if (detail) await loadDetail(detail.id);
      toast.success("Scope updated");
    } catch (err) {
      toast.error(getApiError(err, "Failed to update the scope item"));
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

  /* ─── BOM (WF-02 / WF-03) ─── */
  function openAllocate(line: BOMLine) {
    setAllocLine(line);
    setAllocMode(line.material_type && !line.device_model ? "stock" : "device");
    setAllocDevice("");
    setAllocItem("");
    setAllocQty(String(Math.max(1, line.shortage || 1)));
    api.get("/assets/devices/", {
      params: {
        status: "in_stock",
        page_size: 1000,
        ...(line.device_model ? { device_model: line.device_model } : {}),
      },
    })
      .then((r) => setAllocDeviceOptions((r.data.results ?? []).map((d: { id: string; asset_code: string; display_name: string | null }) => ({
        id: d.id,
        label: d.display_name ? `${d.asset_code} — ${d.display_name}` : d.asset_code,
      }))))
      .catch(() => setAllocDeviceOptions([]));
    api.get("/inventory/items/", {
      params: {
        page_size: 1000,
        ...(line.material_type ? { material_type: line.material_type } : {}),
      },
    })
      .then((r) => setAllocItems(r.data.results ?? []))
      .catch(() => setAllocItems([]));
  }

  async function submitAllocate(e: React.FormEvent) {
    e.preventDefault();
    if (!allocLine || !detail) return;
    if (allocMode === "device" && !allocDevice) { toast.error("Pick a device to allocate"); return; }
    if (allocMode === "stock" && !allocItem) { toast.error("Pick a stock item to allocate"); return; }
    setAllocSaving(true);
    try {
      if (allocMode === "device") {
        await api.post(`/teams/bom-lines/${allocLine.id}/allocate/`, { device: allocDevice });
      } else {
        await api.post(`/teams/bom-lines/${allocLine.id}/allocate/`, {
          inventory_item: allocItem,
          quantity: Number(allocQty || 0),
        });
      }
      toast.success(allocMode === "device" ? "Device allocated to BOM line" : "Stock allocated to BOM line");
      setAllocLine(null);
      loadDetail(detail.id);
    } catch (err) {
      toast.error(bomApiError(err, "Failed to allocate"));
    } finally {
      setAllocSaving(false);
    }
  }

  async function issueAllocation(line: BOMLine, allocationId: string) {
    if (!detail) return;
    setIssuingId(allocationId);
    try {
      await api.post(`/teams/bom-lines/${line.id}/issue/`, { allocation: allocationId });
      toast.success("Stock issued to project");
      loadDetail(detail.id);
    } catch (err) {
      toast.error(bomApiError(err, "Failed to issue stock"));
    } finally {
      setIssuingId(null);
    }
  }

  function openPoModal() {
    setPoSupplier("");
    setPoCurrency("PKR");
    setPoModalOpen(true);
    if (suppliers.length === 0) {
      api.get("/suppliers/", { params: { page_size: 200 } })
        .then((r) => setSuppliers((r.data.results ?? r.data ?? []).map((s: SupplierOpt) => ({ id: s.id, name: s.name }))))
        .catch(() => {});
    }
  }

  async function raisePoForShortages(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    if (!poSupplier) { toast.error("Pick a supplier"); return; }
    setPoSaving(true);
    try {
      const { data } = await api.post<{ po_number?: string }>("/procurement/purchase-orders/from-shortage/", {
        project: detail.id,
        supplier: poSupplier,
        currency: poCurrency,
      });
      setPoModalOpen(false);
      toast.success(
        <span>
          Draft PO {data?.po_number ?? ""} raised —{" "}
          <Link href="/procurement" className="font-medium underline">open Procurement</Link>
        </span>,
      );
      loadDetail(detail.id);
    } catch (err) {
      toast.error(bomApiError(err, "Failed to raise purchase order"));
    } finally {
      setPoSaving(false);
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

  async function deleteProject(p: ProjectDetail) {
    const sure = window.confirm(
      `Delete project "${p.name}"?\n\nIts scope, milestones, requirements and budget go with it. ` +
      "Assets and stock stay where they are. A project with stock issued, orders or work orders cannot be deleted.",
    );
    if (!sure) return;
    try {
      await api.delete(`/teams/projects/${p.id}/`);
      toast.success(`Project "${p.name}" deleted`);
      setDetail(null);
      fetchAll();
    } catch (err) {
      toast.error(getApiError(err, "Could not delete the project"));
    }
  }

  function openEdit(p: ProjectDetail) {
    setForm({
      name: p.name,
      description: p.description ?? "",
      status: p.status,
      phase: p.phase,
      client: p.client ?? "",
      site: p.site ?? "",
      sites: (p.sites ?? []).map(String),
      manager: p.manager ?? "",
      start_date: p.start_date ?? "",
      target_date: p.target_date ?? "",
      contract_type: p.contract_type ?? "",
      rental_end_date: p.rental_end_date ?? "",
    });
    setEditingId(p.id);
    setModalOpen(true);
  }

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, projectsRes] = await Promise.allSettled([
        api.get("/teams/projects/dashboard_stats/"),
        api.get("/teams/projects/", {
          params: { page_size: 100, ordering: "-created_at", ...(queryRef.current ? { search: queryRef.current } : {}) },
        }),
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
      .then((r) => setSiteOptions(siteLabels(r.data.results ?? [])))
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
      sites: form.sites,
      description: form.description,
      status: form.status,
      phase: form.phase,
      client: form.client || null,
      // The project's own site is the first of the ones the order covers.
      site: form.sites[0] ?? null,
      manager: form.manager || null,
      start_date: form.start_date || null,
      target_date: form.target_date || null,
      contract_type: form.contract_type,
      rental_end_date: form.contract_type === "rental" && form.rental_end_date ? form.rental_end_date : null,
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

  /** Open a site here and put the project on it. */
  async function createSite() {
    const name = newSite.name.trim();
    const address = newSite.address.trim();
    if (!name || !address) {
      toast.error("A site needs a name and an address.");
      return;
    }
    setSavingSite(true);
    try {
      const { data } = await api.post("/sites/sites/", {
        name,
        address,
        city: newSite.city.trim(),
        client: form.client || null,
      });
      const [option] = siteLabels([data]);
      setSiteOptions((prev) => [...prev, option].sort((a, b) => a.label.localeCompare(b.label)));
      setForm((f) => ({ ...f, sites: [...f.sites, data.id] }));
      setNewSite({ name: "", address: "", city: "" });
      setNewSiteOpen(false);
      toast.success(`${data.name} added and put on this project`);
    } catch (err) {
      toast.error(getApiError(err, "Could not add the site"));
    } finally {
      setSavingSite(false);
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
          <label htmlFor="project_site" className="mb-1 block text-xs font-medium text-muted-foreground">
            Sites (one order can span several)
          </label>
          <div className="flex gap-2">
            <select
              id="project_site"
              value=""
              onChange={(e) => {
                const id = e.target.value;
                if (id) setForm((f) => (f.sites.includes(id) ? f : { ...f, sites: [...f.sites, id] }));
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            >
              <option value="">
                {siteOptions.every((st) => form.sites.includes(st.id)) ? "Every site is on this project" : "Add a site…"}
              </option>
              {siteOptions
                .filter((st) => !form.sites.includes(st.id))
                .map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setNewSiteOpen((open) => !open)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Add site
            </button>
          </div>

          {form.sites.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {form.sites.map((id) => {
                const site = siteOptions.find((st) => st.id === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-2xs font-medium text-foreground"
                  >
                    {site?.label ?? "Site"}
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, sites: f.sites.filter((x) => x !== id) }))}
                      aria-label={`Take ${site?.label ?? "this site"} off the project`}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {newSiteOpen && (
            <div className="mt-2 space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
              <p className="text-2xs text-muted-foreground">
                A new location for the register. It joins this project and stays available under Sites.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  id="new_site_name"
                  value={newSite.name}
                  onChange={(e) => setNewSite((n) => ({ ...n, name: e.target.value }))}
                  placeholder="Site name *"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                />
                <input
                  id="new_site_city"
                  value={newSite.city}
                  onChange={(e) => setNewSite((n) => ({ ...n, city: e.target.value }))}
                  placeholder="City"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                />
              </div>
              <input
                id="new_site_address"
                value={newSite.address}
                onChange={(e) => setNewSite((n) => ({ ...n, address: e.target.value }))}
                placeholder="Address *"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setNewSiteOpen(false); setNewSite({ name: "", address: "", city: "" }); }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createSite}
                  disabled={savingSite || !newSite.name.trim() || !newSite.address.trim()}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all disabled:opacity-50"
                >
                  {savingSite ? "Adding…" : "Add site"}
                </button>
              </div>
            </div>
          )}
          <p className="mt-1 text-2xs text-muted-foreground">
            Pick each site the order covers. Locations are kept under Sites.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Contract Type</label>
            <select
              value={form.contract_type}
              onChange={(e) => setForm((f) => ({ ...f, contract_type: e.target.value, rental_end_date: e.target.value === "rental" ? f.rental_end_date : "" }))}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
            >
              <option value="">—</option>
              {CONTRACT_TYPES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          {form.contract_type === "rental" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Rental end date</label>
              <input type="date" value={form.rental_end_date} onChange={(e) => setForm((f) => ({ ...f, rental_end_date: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none" />
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Project Manager</label>
          <select value={form.manager} onChange={(e) => setForm((f) => ({ ...f, manager: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none">
            <option value="">—</option>
            {managerOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
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
              {d.client_name ? `${d.client_name} · ` : ""}{(d.site_names ?? []).join(", ") || d.site_name || ""}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ContractBadge contractType={d.contract_type} rentalEndDate={d.rental_end_date} />
            <StatusBadge status={d.status} label={d.status_display} />
            {canEdit && (
              <button onClick={() => openEdit(d)} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            {canEdit && (
              <button
                onClick={() => deleteProject(d)}
                title="Delete this project — only while nothing has been issued, ordered or placed on it"
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            )}
          </div>
        </div>

        {/* Phase pipeline */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Project Phase</h2>
            {offRamp && (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${d.phase === "lost" ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"}`}>
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
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</p>
              <p className="text-sm font-medium text-foreground">{f.value}</p>
            </div>
          ))}
        </div>

        {/* What was signed off against what it has cost so far. */}
        <ProjectBudgetSummary projectId={detail.id} />

        {/* Two halves of running a project: work out and agree what it will
            cost, then deliver it within that. */}
        <div className="grid gap-2 rounded-xl border border-border bg-card p-1.5 sm:grid-cols-2">
          {([
            { key: "planning", step: "1", label: "Planning", hint: "Estimate, overheads, contingency & budget approval" },
            { key: "execution", step: "2", label: "Execution", hint: "Inventory vs procurement, quantities & delivery" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setProjectTab(t.key)}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                projectTab === t.key ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-secondary"
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                projectTab === t.key ? "bg-primary text-white" : "bg-secondary text-muted-foreground"
              }`}>
                {t.step}
              </span>
              <span>
                <span className={`block text-sm font-semibold ${projectTab === t.key ? "text-primary" : "text-foreground"}`}>{t.label}</span>
                <span className="block text-2xs text-muted-foreground">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {projectTab === "planning" && (
              <>
            {/* Scope */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Scope — assets, sites & notes</h3>
              {d.scope_items.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Asset</th>
                        <th className="px-3 py-2 font-medium">Site</th>
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
                          <td className="px-3 py-2 text-muted-foreground">
                            {editingScope === it.id ? (
                              <select
                                value={scopeEdit.site}
                                onChange={(e) => setScopeEdit((v) => ({ ...v, site: e.target.value }))}
                                className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:outline-none"
                              >
                                <option value="">No site</option>
                                {siteOptions.map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
                              </select>
                            ) : (it.site_name || "—")}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {editingScope === it.id ? (
                              <input
                                value={scopeEdit.notes}
                                onChange={(e) => setScopeEdit((v) => ({ ...v, notes: e.target.value }))}
                                className="h-8 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:outline-none"
                              />
                            ) : (it.notes || "—")}
                          </td>
                          {canEdit && (
                            <td className="px-3 py-2 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                {editingScope === it.id ? (
                                  <>
                                    <button onClick={() => saveScopeItem(it.id)} className="text-emerald-600 transition-colors hover:text-emerald-700" title="Save">
                                      <Check className="h-3.5 w-3.5" />
                                    </button>
                                    <button onClick={() => setEditingScope(null)} className="text-muted-foreground transition-colors hover:text-foreground" title="Cancel">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => { setEditingScope(it.id); setScopeEdit({ site: it.site ?? "", notes: it.notes ?? "" }); }} className="text-muted-foreground transition-colors hover:text-foreground" title="Edit">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button onClick={() => deleteScopeItem(it.id)} className="text-muted-foreground transition-colors hover:text-destructive" title="Remove">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
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
                  <p className="text-2xs text-muted-foreground">
                    Every asset has its own ID: add each one once. An asset already on another project cannot be added.
                  </p>
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
                    <select name="scope_site" defaultValue="" title="Site" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground focus:outline-none">
                      <option value="">Site: none</option>
                      {siteOptions
                        .filter((st) => !d.sites || d.sites.length === 0 || d.sites.map(String).includes(String(st.id)))
                        .map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
                    </select>
                  </div>
                  <input name="scope_notes" placeholder="Notes" className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
                  <button type="submit" disabled={addingScope} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
                    <Plus className="h-3.5 w-3.5" /> Add to Scope
                  </button>
                </form>
              )}
            </div>

            {/* The cost plan reads the scope above it, so it follows it. */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Cost Plan — estimate &amp; budget approval</h3>
              <ProjectPlanning projectId={detail.id} refreshKey={d.scope_items.map((it) => it.id).join(",")} onGoToExecution={() => setProjectTab("execution")} onChanged={() => loadDetail(detail.id)} />
            </div>

              </>
            )}

            {projectTab === "execution" && (
              <>
            {/* Build requirements: every asset's components, gathered here so
                the user can decide stock-vs-procure per line. */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                Build Requirements — what each asset needs
              </h3>
              <ProjectRequirements projectId={detail.id} />
            </div>

            {/* What it is actually costing, against what was approved. */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Actual Cost — what the project is costing</h3>
              <ProjectActuals projectId={detail.id} />
            </div>

            {/* BOM (WF-02 / WF-03) */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-foreground">BOM — bill of materials & fulfilment</h3>
                {canEdit && (
                  <button
                    onClick={openPoModal}
                    disabled={!bomLines.some((l) => l.shortage > 0)}
                    title={bomLines.some((l) => l.shortage > 0) ? "Raise a draft purchase order covering shortage lines" : "No shortages to cover"}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> Raise PO for shortages
                  </button>
                )}
              </div>
              {bomTotals && (
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Required", value: bomTotals.required, alert: false },
                    { label: "Allocated", value: bomTotals.allocated, alert: false },
                    { label: "Issued", value: bomTotals.issued, alert: false },
                    { label: "Shortage", value: bomTotals.shortage, alert: bomTotals.shortage > 0 },
                  ].map((t) => (
                    <div key={t.label} className="rounded-lg border border-border/70 px-3 py-2">
                      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{t.label}</p>
                      <p className={`text-sm font-semibold ${t.alert ? "text-red-500" : "text-foreground"}`}>{t.value}</p>
                    </div>
                  ))}
                </div>
              )}
              {bomLines.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 font-medium">Model / Material</th>
                        <th className="px-3 py-2 font-medium">Qty</th>
                        <th className="px-3 py-2 font-medium">Unit Price</th>
                        <th className="px-3 py-2 font-medium">Allocated</th>
                        <th className="px-3 py-2 font-medium">Issued</th>
                        <th className="px-3 py-2 font-medium">Shortage</th>
                        {canEdit && <th className="px-3 py-2" />}
                      </tr>
                    </thead>
                    <tbody>
                      {bomLines.map((l) => {
                        const activeAllocations = l.allocations.filter((a) => a.status !== "cancelled");
                        return (
                          <Fragment key={l.id}>
                            <tr className="border-b border-border/60 last:border-0">
                              <td className="px-3 py-2 font-medium text-foreground">{l.description}</td>
                              <td className="px-3 py-2 text-muted-foreground">{l.device_model_name || l.material_type_name || l.asset_type_name || "—"}</td>
                              <td className="px-3 py-2 text-foreground">×{l.quantity}</td>
                              <td className="px-3 py-2 text-muted-foreground">{Number(l.unit_price).toLocaleString()}</td>
                              <td className="px-3 py-2 text-foreground">{l.allocated_quantity}</td>
                              <td className="px-3 py-2 text-foreground">{l.issued_quantity}</td>
                              <td className={`px-3 py-2 font-semibold ${l.shortage > 0 ? "text-red-500" : "text-muted-foreground"}`}>{l.shortage}</td>
                              {canEdit && (
                                <td className="px-3 py-2 text-right">
                                  <button
                                    onClick={() => openAllocate(l)}
                                    className="rounded-md border border-border px-2 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                  >
                                    Allocate
                                  </button>
                                </td>
                              )}
                            </tr>
                            {activeAllocations.length > 0 && (
                              <tr className="border-b border-border/60 bg-secondary/20 last:border-0">
                                <td colSpan={canEdit ? 8 : 7} className="px-3 py-2">
                                  <div className="flex flex-wrap gap-2">
                                    {activeAllocations.map((a) => (
                                      <span key={a.id} className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-2.5 py-1">
                                        <span className="font-medium text-foreground">{a.device_code || a.item_name || "—"}</span>
                                        <span className="text-muted-foreground">×{a.quantity}</span>
                                        <span className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold capitalize ${
                                          a.status === "issued" ? "bg-emerald-500/10 text-emerald-600" : "bg-blue-500/10 text-blue-600"
                                        }`}>{a.status}</span>
                                        {canEdit && a.inventory_item && a.status === "allocated" && (
                                          <button
                                            onClick={() => issueAllocation(l, a.id)}
                                            disabled={issuingId === a.id}
                                            title="Issue this stock out of the warehouse to the project"
                                            className="rounded-md bg-primary px-2 py-0.5 text-2xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                                          >
                                            {issuingId === a.id ? "Issuing…" : "Issue"}
                                          </button>
                                        )}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No BOM lines yet — they are created when a quotation is accepted.</p>
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
                <p className="text-xs text-muted-foreground">No assets on this project yet — add one in the Scope section above.</p>
              )}
            </div>
              </>
            )}
          </div>

          {/* Right rail: milestones + bottlenecks */}
          <div className="space-y-4">
            {projectTab === "execution" && (
              <>
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
                        <p className="text-2xs text-muted-foreground">
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
                      <span className={`rounded-full px-2 py-0.5 text-2xs font-semibold capitalize ${
                        b.severity === "critical" || b.severity === "high" ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"
                      }`}>{b.severity}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No bottlenecks.</p>
              )}
            </div>

              </>
            )}

            {d.description && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-2 text-sm font-semibold text-foreground">Description</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">{d.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Allocate modal (device or stock) */}
        <Modal open={!!allocLine} onClose={() => setAllocLine(null)} title={allocLine ? `Allocate — ${allocLine.description}` : "Allocate"} size="md">
          {allocLine && (
            <form onSubmit={submitAllocate} className="space-y-4">
              <div className="flex gap-1 rounded-lg border border-border p-1">
                {(["device", "stock"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAllocMode(m)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      allocMode === m ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {m === "device" ? "Device (unique asset)" : "Stock (warehouse)"}
                  </button>
                ))}
              </div>
              {allocMode === "device" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    In-stock device{allocLine.device_model_name ? ` — ${allocLine.device_model_name}` : ""}
                  </label>
                  <SearchSelect options={allocDeviceOptions} value={allocDevice} onChange={setAllocDevice} placeholder="Search in-stock devices…" />
                  {allocDeviceOptions.length === 0 && (
                    <p className="mt-1 text-2xs text-muted-foreground">
                      No in-stock devices{allocLine.device_model_name ? ` of model ${allocLine.device_model_name}` : ""} available.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Inventory item{allocLine.material_type_name ? ` — ${allocLine.material_type_name}` : ""}
                    </label>
                    <select
                      value={allocItem}
                      onChange={(e) => setAllocItem(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                    >
                      <option value="">Select stock item…</option>
                      {allocItems.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.material_name || it.sku || "Item"}{it.sku ? ` (${it.sku})` : ""} — {it.quantity} {it.unit || "pcs"} in stock
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">Quantity</label>
                    <input
                      type="number"
                      min={1}
                      value={allocQty}
                      onChange={(e) => setAllocQty(e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                    />
                  </div>
                </>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setAllocLine(null)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary">Cancel</button>
                <button type="submit" disabled={allocSaving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-60">
                  {allocSaving ? "Allocating…" : "Allocate"}
                </button>
              </div>
            </form>
          )}
        </Modal>

        {/* Raise PO for shortages modal */}
        <Modal open={poModalOpen} onClose={() => setPoModalOpen(false)} title="Raise PO for Shortages" size="sm">
          <form onSubmit={raisePoForShortages} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Creates a draft purchase order with one line per BOM shortage
              {" "}({bomLines.filter((l) => l.shortage > 0).length} line{bomLines.filter((l) => l.shortage > 0).length !== 1 ? "s" : ""}, {bomTotals?.shortage ?? 0} unit(s) total).
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Supplier *</label>
              <select
                value={poSupplier}
                onChange={(e) => setPoSupplier(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              >
                <option value="">Select supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Currency</label>
              <select
                value={poCurrency}
                onChange={(e) => setPoCurrency(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              >
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setPoModalOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary">Cancel</button>
              <button type="submit" disabled={poSaving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-60">
                {poSaving ? "Raising…" : "Raise Draft PO"}
              </button>
            </div>
          </form>
        </Modal>

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

  const searching = query.trim().length > 0;
  const ongoing = projects.filter(
    (p) => (searching || !["completed", "on_hold"].includes(p.status)) && (!contractFilter || p.contract_type === contractFilter),
  );

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
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="project_search"
              type="search"
              value={query}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
                queryRef.current = v.trim();
                if (searchTimer.current) clearTimeout(searchTimer.current);
                searchTimer.current = setTimeout(() => { fetchAll(); }, 300);
              }}
              placeholder="Search projects by name, client or site…"
              className="h-10 w-80 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <h2 className="text-base font-semibold text-foreground">
            {searching ? `Projects matching "${query.trim()}"` : "Ongoing Projects"}
            {searching && <span className="ml-2 text-xs font-normal text-muted-foreground">{ongoing.length} found · all statuses</span>}
          </h2>
          <div className="flex items-center gap-3">
            <FilterBar
              filters={[{ key: "contract", label: "Contract", options: CONTRACT_TYPES }]}
              values={{ contract: contractFilter }}
              onChange={(_, v) => setContractFilter(v)}
            />
            <Link href="/projects" className="text-xs font-medium text-primary hover:underline">
              View All Projects
            </Link>
          </div>
        </div>
        {ongoing.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Project / Sites</th>
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
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{project.name}</p>
                          <ContractBadge contractType={project.contract_type} rentalEndDate={project.rental_end_date} compact />
                        </div>
                        <p className="text-xs text-muted-foreground">{(project.site_names ?? []).join(", ") || project.site_name || ""}</p>
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
                        <p className="text-2xs text-muted-foreground">{daysLeft(project.target_date)}</p>
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
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-semibold text-amber-500">
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
                    <span className="text-2xs text-muted-foreground">
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
