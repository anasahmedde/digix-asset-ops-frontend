"use client";

import dynamic from "next/dynamic";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Monitor,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Qty } from "@/components/ui/qty";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { toast } from "sonner";
import { AssignedTicketsBanner } from "@/components/ui/assigned-tickets-banner";
import { StickyNotes } from "@/components/dashboard/sticky-notes";
import { DeskClock } from "@/components/dashboard/desk-clock";
import { ListTile } from "@/components/dashboard/list-tile";
import { StatCard } from "@/components/ui/stat-card";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { useUser } from "@/lib/user-context";
import { formatDate } from "@/lib/utils";

const StatusMap = dynamic(() => import("@/components/map/status-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[500px] items-center justify-center rounded-xl border border-border bg-card">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  ),
});

interface DashboardStats {
  total: number;
  working: number;
  installed: number;
  out_of_order: number;
  under_maintenance: number;
  in_stock: number;
  by_status: Record<string, number>;
  by_city: { city: string; count: number }[];
  by_region: { region: string; count: number }[];
  by_model_type: { screen_type: string; count: number }[];
}

interface MapDevice {
  id: string;
  asset_code: string;
  status: string;
  current_site__id: string;
  current_site__name: string;
  current_site__city: string;
  current_site__state_province: string;
  current_site__country: string;
  current_site__latitude: string;
  current_site__longitude: string;
}

interface MaintenanceSiteMap {
  id: string;
  title: string;
  maintenance_type: string;
  frequency: string;
  next_due: string | null;
  device: string | null;
  site__id: string;
  site__name: string;
  site__city: string;
  site__state_province: string;
  site__country: string;
  site__latitude: string;
  site__longitude: string;
}

interface AlertItem {
  id: string;
  title: string;
  severity: string;
  category: string;
  device_code: string | null;
  site_name: string | null;
  site_city: string | null;
  created_at: string;
}

interface MaintenanceStats {
  total: number;
  completed: number;
  in_progress: number;
  pending: number;
}

interface TicketLite {
  id: string;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  escalated: boolean;
  is_response_overdue: boolean;
  assigned_to: string | null;
  due_date: string | null;
}

interface ProjectLite {
  id: string;
  status: string;
  progress: number;
}

// Escalated installations (?escalated=true) shown in the Escalation Alerts card.
interface EscalatedInstallLite {
  id: string;
  device_code: string;
  site_name: string;
  due_date: string | null;
  escalation_state: Record<string, string>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [mapDevices, setMapDevices] = useState<MapDevice[]>([]);
  const [maintSites, setMaintSites] = useState<MaintenanceSiteMap[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceStats>({ total: 0, completed: 0, in_progress: 0, pending: 0 });
  const [tickets, setTickets] = useState<TicketLite[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [escalatedInstalls, setEscalatedInstalls] = useState<EscalatedInstallLite[]>([]);
  // Item 1: the components the user has chosen to watch as in-hand stock —
  // unique products by their units, generic items by their quantity.
  const { canWrite, user } = useUser();
  // The page greets the person by the hour, the way a desk does.
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.first_name || user?.full_name?.split(" ")[0] || user?.username || "";
  const canWatch = canWrite("inventory");
  const [highValue, setHighValue] = useState<{ id: string; name: string; type_code: string; in_stock_count: number; unit_cost: string | null }[]>([]);
  const [watchedItems, setWatchedItems] = useState<{ id: string; sku: string; material_name: string | null; quantity: number; unit: string | null; unit_cost: string | null; total_value: number | null }[]>([]);
  const [watchOptions, setWatchOptions] = useState<{ products: { id: string; name: string; type_code: string; is_high_value: boolean }[]; items: { id: string; sku: string; material_name: string | null; watch_on_dashboard: boolean }[] }>({ products: [], items: [] });

  const loadWatched = useCallback(() => {
    api.get("/inventory/products/", { params: { is_high_value: true, page_size: 100 } })
      .then((r) => setHighValue(r.data.results ?? r.data))
      .catch(() => {});
    api.get("/inventory/items/", { params: { watch_on_dashboard: true, page_size: 100 } })
      .then((r) => setWatchedItems(r.data.results ?? r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canWatch) return;
    Promise.all([
      api.get("/inventory/products/", { params: { page_size: 500 } }),
      api.get("/inventory/items/", { params: { page_size: 500 } }),
    ])
      .then(([p, i]) => setWatchOptions({ products: p.data.results ?? p.data, items: i.data.results ?? i.data }))
      .catch(() => {});
  }, [canWatch]);

  /** Add a component to the in-hand watchlist, or take it off again. */
  async function setWatch(kind: "product" | "item", id: string, on: boolean) {
    try {
      if (kind === "product") await api.patch(`/inventory/products/${id}/`, { is_high_value: on });
      else await api.patch(`/inventory/items/${id}/`, { watch_on_dashboard: on });
      const named = kind === "product"
        ? watchOptions.products.find((p) => p.id === id)?.name
        : watchOptions.items.find((it) => it.id === id)?.material_name;
      toast.success(on ? `${named ?? "Component"} added to In-Hand Stock` : `${named ?? "Component"} removed from the watchlist`);
      loadWatched();
      setWatchOptions((prev) => ({
        products: prev.products.map((p) => (p.id === id ? { ...p, is_high_value: on } : p)),
        items: prev.items.map((it) => (it.id === id ? { ...it, watch_on_dashboard: on } : it)),
      }));
    } catch (err) {
      toast.error(getApiError(err, "Could not update the watchlist"));
    }
  }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, mapRes, alertsRes, maintRes, maintMapRes, ticketsRes, projectsRes, escInstRes] = await Promise.allSettled([
          api.get("/assets/devices/dashboard_stats/"),
          api.get("/assets/devices/map_data/"),
          api.get("/analytics/alerts/", { params: { page_size: 5, ordering: "-created_at", is_dismissed: false } }),
          api.get("/maintenance/schedules/", { params: { page_size: 1000 } }),
          api.get("/maintenance/schedules/map_data/"),
          api.get("/tickets/", { params: { page_size: 1000 } }),
          api.get("/teams/projects/", { params: { page_size: 1000 } }),
          api.get("/sites/installations/", { params: { escalated: true, page_size: 5 } }),
        ]);

        if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
        if (mapRes.status === "fulfilled") setMapDevices(mapRes.value.data);
        if (maintMapRes.status === "fulfilled") setMaintSites(maintMapRes.value.data);
        if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value.data.results ?? []);
        loadWatched();
        if (ticketsRes.status === "fulfilled") setTickets(ticketsRes.value.data.results ?? []);
        if (projectsRes.status === "fulfilled") setProjects(projectsRes.value.data.results ?? []);
        if (escInstRes.status === "fulfilled") setEscalatedInstalls(escInstRes.value.data.results ?? []);

        if (maintRes.status === "fulfilled") {
          const schedules = maintRes.value.data.results ?? [];
          const today = new Date().toISOString().split("T")[0];
          setMaintenance({
            total: schedules.length,
            completed: schedules.filter((s: { is_active: boolean; next_due: string }) => !s.is_active).length,
            in_progress: schedules.filter((s: { is_active: boolean; next_due: string }) => s.is_active && s.next_due <= today).length,
            pending: schedules.filter((s: { is_active: boolean; next_due: string }) => s.is_active && s.next_due > today).length,
          });
        }
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [loadWatched]);

  const total = stats?.total ?? 0;
  const byStatus = stats?.by_status ?? {};
  const sum = (...keys: string[]) => keys.reduce((acc, k) => acc + (byStatus[k] ?? 0), 0);

  // Complete, non-overlapping breakdown — these six always sum to `total`.
  const working = sum("active", "installed");
  const inStock = sum("in_stock");
  const pipeline = sum("procured", "in_transit", "assigned");
  const underMaint = sum("under_maintenance");
  const clientProperty = sum("client_property");
  const outOfService = sum("decommissioned", "lost_stolen", "rma");


  const statusDistData = [
    { name: "Active", value: working, color: "#10b981" },
    { name: "In Stock", value: inStock, color: "#6366f1" },
    { name: "Pipeline", value: pipeline, color: "#8b5cf6" },
    { name: "Under Maintenance", value: underMaint, color: "#f59e0b" },
    { name: "Client Property", value: clientProperty, color: "#5c8aa3" },
    { name: "Out of Service", value: outOfService, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const escalatedTickets = tickets.filter((t) => t.escalated || t.is_response_overdue);
  const countOf = (list: { status: string }[], ...statuses: string[]) =>
    list.filter((x) => statuses.includes(x.status)).length;
  // The same six tiles the Tickets screen shows, counted the same way.
  const ticketActive = (t: TicketLite) => !["closed", "approved", "rejected", "cancelled"].includes(t.status);
  const todayIso = new Date().toLocaleDateString("en-CA");
  const TICKET_TILES: { key: string; label: string; value: number; cls: string }[] = [
    { key: "unassigned", label: "Unassigned", value: tickets.filter((t) => ticketActive(t) && !t.assigned_to).length, cls: "bg-amber-500/10 text-amber-600" },
    { key: "in_progress", label: "In Progress", value: countOf(tickets, "in_progress"), cls: "bg-amber-500/10 text-amber-600" },
    { key: "in_review", label: "In Review", value: countOf(tickets, "pending_review", "pending_ops_approval", "pending_client_approval"), cls: "bg-purple-500/10 text-purple-600" },
    { key: "closed", label: "Closed", value: countOf(tickets, "closed"), cls: "bg-emerald-500/10 text-emerald-600" },
    { key: "overdue", label: "Past Due Date", value: tickets.filter((t) => ticketActive(t) && !!t.due_date && t.due_date < todayIso).length, cls: "bg-red-500/10 text-red-600" },
  ];
  const ticketSummary = {
    openWorkload: tickets.filter(ticketActive).length,
    escalated: escalatedTickets.length,
  };

  // The same statuses the Projects module uses.
  const PROJECT_STATUSES: { key: string; label: string; cls: string }[] = [
    { key: "planning", label: "Planning", cls: "bg-sky-500/10 text-sky-600" },
    { key: "on_track", label: "On Track", cls: "bg-emerald-500/10 text-emerald-600" },
    { key: "at_risk", label: "At Risk", cls: "bg-amber-500/10 text-amber-600" },
    { key: "delayed", label: "Delayed", cls: "bg-red-500/10 text-red-600" },
    { key: "on_hold", label: "On Hold", cls: "bg-slate-500/10 text-slate-600" },
    { key: "completed", label: "Completed", cls: "bg-primary/10 text-primary" },
  ];
  const projectSummary = {
    total: projects.length,
    completed: countOf(projects, "completed"),
    avgProgress: projects.length > 0 ? Math.round(projects.reduce((a, p) => a + (p.progress ?? 0), 0) / projects.length) : 0,
  };

  const cityData = (stats?.by_city ?? [])
    .slice(0, 6)
    .map((c) => ({ name: c.city || "Unknown", value: c.count }));

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AssignedTicketsBanner />

      <div>
        <h1 className="text-2xl font-bold text-foreground">{greeting}{firstName ? `, ${firstName}` : ""} 👋</h1>
        <p className="text-sm text-muted-foreground">Here is how your assets, projects and tickets stand right now.</p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">

      {ticketSummary.escalated > 0 && (
        <Link href="/tickets" className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 transition-colors hover:bg-red-500/10">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm font-medium text-red-600">
            {ticketSummary.escalated} ticket{ticketSummary.escalated > 1 ? "s" : ""} under-performance / unsatisfactory — response SLA breached
          </p>
          <span className="ml-auto text-xs font-semibold text-red-500">View →</span>
        </Link>
      )}

      {/* Top stat cards — four plain-language tiles. The full status breakdown
          lives in the Status chart below and on the Assets page. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/assets" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard label="Total Assets" value={total} subtitle="across Pakistan" icon={<Monitor className="h-5 w-5" />} />
        </Link>
        <Link href="/assets" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard label="Active" value={working} subtitle="installed & live at client sites" icon={<CheckCircle className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=in_stock" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard label="In Stock" value={inStock} subtitle="ready to install" variant="highlighted" icon={<Clock className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=under_maintenance" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard
            label="Needs Attention"
            value={underMaint + outOfService}
            subtitle={underMaint + outOfService === 0 ? "all clear" : "maintenance or out of service"}
            icon={<Wrench className="h-5 w-5" />}
          />
        </Link>
      </div>

      {/* Map (squeezed to half) + summaries column */}
      {/* items-start: each column keeps its own height. The map used to
          stretch to match the alerts column, so every new escalation made
          the map taller. */}
      <div className="grid gap-4 2xl:grid-cols-[3fr_2fr] [&>*]:min-w-0">
        <div className="h-full">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Screen Status Map</h2>
                <p className="text-xs text-muted-foreground">Live status of screens across Pakistan</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-2xs font-medium text-emerald-700 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            {/* The map fills whatever the summaries beside it leave: Leaflet
                needs a definite height, which the absolutely placed inner box
                takes from the flex item once it is laid out. */}
            <div className="relative min-h-[22rem] flex-1 border-t border-border">
              <div className="absolute inset-0">
                <StatusMap devices={mapDevices} totalDevices={stats?.total} maintenanceSites={maintSites} height="100%" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Escalation Alerts — always on top of the summaries column */}
          <ListTile
            title="Escalation Alerts"
            icon={<AlertCircle className="h-4 w-4" />}
            tone="alert"
            count={escalatedTickets.length + escalatedInstalls.length}
            preview={3}
            empty="No escalations — all tickets and installations within SLA"
            rows={[
              ...escalatedTickets.map((t) => (
                <Link key={`t-${t.id}`} href={`/tickets?open=${t.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 transition-colors hover:bg-red-500/10">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{t.ticket_number} — {t.title}</p>
                    <p className="text-2xs text-red-500">
                      {t.escalated ? "Escalated" : "Response overdue"}{t.priority ? ` · ${t.priority}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-2xs font-semibold text-red-500">→</span>
                </Link>
              )),
              ...escalatedInstalls.map((inst) => (
                <Link key={`i-${inst.id}`} href={`/installation-tracker?installation=${inst.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 transition-colors hover:bg-red-500/10">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{inst.device_code} — {inst.site_name}</p>
                    <p className="text-2xs text-red-500">
                      Installation {Object.keys(inst.escalation_state ?? {}).some((k) => k.endsWith(":2")) ? "escalated — L2" : "escalated"}
                      {inst.due_date ? ` · due ${formatDate(inst.due_date)}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-2xs font-semibold text-red-500">→</span>
                </Link>
              )),
            ]}
          />

          {/* Quick Summary */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick Summary</h3>
            <DonutChart
              data={statusDistData.length > 0 ? statusDistData : [{ name: "No Data", value: 1, color: "#94a3b8" }]}
              centerValue={total}
              centerLabel="Total"
              size={120}
              showLegend={true}
            />
            <Link
              href="/analytics"
              className="mt-4 block rounded-lg border border-primary/30 py-2 text-center text-xs font-medium text-primary transition-colors hover:bg-primary/5"
            >
              View Detailed Report →
            </Link>
          </div>

          {/* Recent Alerts */}
          <ListTile
            title="Recent Alerts"
            count={alerts.length}
            preview={4}
            empty="No recent alerts"
            action={<Link href="/alerts" className="text-2xs font-medium text-muted-foreground hover:underline">Alerts page</Link>}
            rows={alerts.map((alert) => (
              <div key={alert.id} className="flex items-start gap-2.5 rounded-lg px-1 py-1">
                <AlertCircle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  style={{
                    color:
                      alert.severity === "critical" ? "#ef4444" :
                      alert.severity === "error" ? "#f97316" :
                      alert.severity === "warning" ? "#f59e0b" : "#3b82f6",
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">
                    {alert.device_code ? `Screen ID: ${alert.device_code}` : alert.title}
                  </p>
                  {alert.device_code && <p className="truncate text-2xs text-muted-foreground">{alert.title}</p>}
                  {alert.site_name && (
                    <p className="text-2xs text-muted-foreground">{alert.site_name}{alert.site_city ? `, ${alert.site_city}` : ""}</p>
                  )}
                </div>
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {new Date(alert.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              </div>
            ))}
          />
        </div>
      </div>

      {/* Project and ticket summaries, and the stock being watched */}      {/* Project and ticket summaries, and the stock being watched */}
      {/* items-start: each card is as tall as its own content. A long notes
          board used to stretch the row and leave the summaries hanging in
          empty space; the board scrolls inside its own cap instead. */}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-[1fr_1fr_1.4fr] [&>*]:min-w-0">
        {/* Project Summary */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Project Summary</h3>
            <Link href="/projects" className="text-2xs font-medium text-primary hover:underline">View All</Link>
          </div>
          <div className="mb-3 flex items-end justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Active Projects</p>
              <p className="text-lg font-bold text-foreground">{projectSummary.total - projectSummary.completed}</p>
            </div>
            <div className="text-right text-2xs text-muted-foreground">
              <p>{projectSummary.total} total · {projectSummary.completed} completed</p>
              <p>avg progress {projectSummary.avgProgress}%</p>
            </div>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${projectSummary.avgProgress}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PROJECT_STATUSES.map((row) => (
              <Link key={row.key} href={`/projects?status=${row.key}`} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5">
                <span className="min-w-0 truncate text-xs font-medium text-foreground">{row.label}</span>
                <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums ${row.cls}`}>{countOf(projects, row.key)}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Ticket Summary */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Ticket Summary</h3>
            <Link href="/tickets" className="text-2xs font-medium text-primary hover:underline">View All</Link>
          </div>
          <div className="mb-3 flex items-end justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Open Workload</p>
              <p className="text-lg font-bold text-foreground">{ticketSummary.openWorkload}</p>
            </div>
            <div className="text-right text-2xs text-muted-foreground">
              <p>{tickets.length} total tickets</p>
              {ticketSummary.escalated > 0 && <p className="font-semibold text-red-500">{ticketSummary.escalated} escalated</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {TICKET_TILES.map((row) => (
              <Link key={row.key} href="/tickets" className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5">
                <span className="min-w-0 truncate text-xs font-medium text-foreground">{row.label}</span>
                <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums ${row.cls}`}>{row.value}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* In-hand stock: the components the user has chosen to watch,
            with what they are worth on the shelf. */}
        {(() => {
          // Highest value in hand first, unique and generic together; what
          // has no price yet sits at the bottom.
          const rowsAll = [
            ...highValue.map((p) => ({
              key: `p-${p.id}`, name: p.name, code: `${p.type_code} · unique`, qty: <Qty value={p.in_stock_count} unit="piece" />,
              unit: p.unit_cost ? Number(p.unit_cost).toLocaleString() : "—",
              value: p.unit_cost ? Number(p.unit_cost) * p.in_stock_count : null,
              unwatch: () => setWatch("product", p.id, false),
            })),
            ...watchedItems.map((it) => ({
              key: `i-${it.id}`, name: it.material_name ?? it.sku, code: `${it.sku} · generic`, qty: <Qty value={it.quantity} unit={it.unit} />,
              unit: it.unit_cost ? Number(it.unit_cost).toLocaleString() : "—",
              value: it.total_value != null ? Number(it.total_value) : null,
              unwatch: () => setWatch("item", it.id, false),
            })),
          ]
            .sort((a, b) => (b.value ?? -1) - (a.value ?? -1))
            .map((r) => ({ ...r, amount: r.value != null ? r.value.toLocaleString() : "—" }));
          const totalValue = highValue.reduce((sum, p) => sum + Number(p.unit_cost ?? 0) * p.in_stock_count, 0)
            + watchedItems.reduce((sum, it) => sum + Number(it.total_value ?? 0), 0);
          return (
            <ListTile
              fill
              title="In-Hand Stock"
              subtitle={`${inStock} asset${inStock === 1 ? "" : "s"} ready to install${rowsAll.length > 0 ? ", plus the components you are watching" : ""}`}
              count={rowsAll.length}
              preview={6}
              empty="No components on the watchlist yet. Pick one from “Watch…” to see its quantity and value here."
              footer={rowsAll.length > 0 ? <>Total value in hand: <span className="font-semibold text-foreground">{totalValue.toLocaleString()}</span></> : undefined}
              action={canWatch ? (
                <select
                  value=""
                  onChange={(e) => {
                    const [kind, id] = e.target.value.split(":");
                    if (kind === "product" || kind === "item") setWatch(kind, id, true);
                  }}
                  aria-label="Add a component to in-hand stock"
                  className="h-7 max-w-[11rem] rounded-lg border border-border bg-background px-2 text-2xs text-foreground focus:border-primary/50 focus:outline-none"
                >
                  <option value="">+ Watch…</option>
                  <optgroup label="Unique components">
                    {watchOptions.products.filter((p) => !p.is_high_value).map((p) => (
                      <option key={p.id} value={`product:${p.id}`}>{p.name} · {p.type_code}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Generic components">
                    {watchOptions.items.filter((it) => !it.watch_on_dashboard).map((it) => (
                      <option key={it.id} value={`item:${it.id}`}>{it.material_name ?? it.sku} · {it.sku}</option>
                    ))}
                  </optgroup>
                </select>
              ) : undefined}
              rows={rowsAll.map((r) => (
                <div key={r.key} className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-1.5">
                  <div className="min-w-0 flex-1 truncate text-xs">
                    <span className="font-medium text-foreground">{r.name}</span>
                    <span className="ml-2 font-mono text-2xs text-muted-foreground">{r.code}</span>
                  </div>
                  <div className="shrink-0 whitespace-nowrap text-right text-xs">
                    <span className="font-medium text-foreground">{r.qty}</span>
                    <span className="ml-2 text-muted-foreground" title="Unit cost → value in hand">{r.unit} → <span className="font-medium text-foreground">{r.amount}</span></span>
                  </div>
                  {canWatch && (
                    <button onClick={r.unwatch} title="Stop watching" className="shrink-0 text-xs text-muted-foreground hover:text-destructive">×</button>
                  )}
                </div>
              ))}
            />
          );
        })()}
      </div>

      </div>

      {/* The desk and the notes: the right-hand column on a wide screen, coming along
          as the page scrolls - a pad on the desk, not a card in the grid. */}
      <aside className="order-first grid gap-4 self-start md:grid-cols-2 xl:order-none xl:flex xl:flex-col desk:sticky desk:top-[5.5rem] desk:h-[calc(100dvh-10.5rem-var(--bottom-gap))] desk:overflow-y-auto desk:[scrollbar-width:thin]">
        <DeskClock />
        <StickyNotes />
      </aside>
      </div>

    </div>
  );
}
