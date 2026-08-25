"use client";

import dynamic from "next/dynamic";
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Monitor,
  MonitorCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import api from "@/lib/api";
import { AssignedTicketsBanner } from "@/components/ui/assigned-tickets-banner";
import { StatCard } from "@/components/ui/stat-card";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";

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
}

interface ProjectLite {
  id: string;
  status: string;
  progress: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [mapDevices, setMapDevices] = useState<MapDevice[]>([]);
  const [maintSites, setMaintSites] = useState<MaintenanceSiteMap[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceStats>({ total: 0, completed: 0, in_progress: 0, pending: 0 });
  const [tickets, setTickets] = useState<TicketLite[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [stock, setStock] = useState<{ id: string; sku: string; material_name: string | null; category_name: string | null; quantity: number; unit: string | null; total_value: number | null; is_low_stock: boolean }[]>([]);
  const [stockSummary, setStockSummary] = useState<{ total_value: number; total_quantity: number; items: number; low_stock: number; unpriced_items: number } | null>(null);
  const [stockSortField, setStockSortField] = useState<"quantity" | "total_value" | "material_type__name">("quantity");
  const [stockSortDesc, setStockSortDesc] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, mapRes, alertsRes, maintRes, maintMapRes, stockSummaryRes, ticketsRes, projectsRes] = await Promise.allSettled([
          api.get("/assets/devices/dashboard_stats/"),
          api.get("/assets/devices/map_data/"),
          api.get("/analytics/alerts/", { params: { page_size: 5, ordering: "-created_at", is_dismissed: false } }),
          api.get("/maintenance/schedules/", { params: { page_size: 1000 } }),
          api.get("/maintenance/schedules/map_data/"),
          api.get("/inventory/items/summary/"),
          api.get("/tickets/", { params: { page_size: 1000 } }),
          api.get("/teams/projects/", { params: { page_size: 1000 } }),
        ]);

        if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
        if (mapRes.status === "fulfilled") setMapDevices(mapRes.value.data);
        if (maintMapRes.status === "fulfilled") setMaintSites(maintMapRes.value.data);
        if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value.data.results ?? []);
        if (stockSummaryRes.status === "fulfilled") setStockSummary(stockSummaryRes.value.data);
        if (ticketsRes.status === "fulfilled") setTickets(ticketsRes.value.data.results ?? []);
        if (projectsRes.status === "fulfilled") setProjects(projectsRes.value.data.results ?? []);

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
  }, []);

  useEffect(() => {
    const ordering = `${stockSortDesc ? "-" : ""}${stockSortField}`;
    api
      .get("/inventory/items/", { params: { page_size: 6, ordering } })
      .then(({ data }) => setStock(data.results ?? []))
      .catch(() => {});
  }, [stockSortField, stockSortDesc]);

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

  const pct = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "0%");

  const statusDistData = [
    { name: "Working", value: working, color: "#10b981" },
    { name: "In Stock", value: inStock, color: "#6366f1" },
    { name: "Pipeline", value: pipeline, color: "#8b5cf6" },
    { name: "Under Maintenance", value: underMaint, color: "#f59e0b" },
    { name: "Client Property", value: clientProperty, color: "#14b8a6" },
    { name: "Out of Service", value: outOfService, color: "#ef4444" },
  ].filter((d) => d.value > 0);

  const escalatedTickets = tickets.filter((t) => t.escalated || t.is_response_overdue);
  const openStatuses = ["open"];
  const workingStatuses = ["in_progress", "blocked", "on_hold", "alignment_pending"];
  const reviewStatuses = ["pending_review", "pending_ops_approval", "pending_client_approval"];
  const ticketSummary = {
    open: tickets.filter((t) => openStatuses.includes(t.status)).length,
    inProgress: tickets.filter((t) => workingStatuses.includes(t.status)).length,
    review: tickets.filter((t) => reviewStatuses.includes(t.status)).length,
    closed: tickets.filter((t) => ["closed", "approved"].includes(t.status)).length,
    escalated: escalatedTickets.length,
  };

  const projectSummary = {
    total: projects.length,
    onTrack: projects.filter((p) => p.status === "on_track").length,
    atRisk: projects.filter((p) => p.status === "at_risk").length,
    delayed: projects.filter((p) => p.status === "delayed").length,
    completed: projects.filter((p) => p.status === "completed").length,
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
    <div className="space-y-6">
      <AssignedTicketsBanner />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Main Dashboard</h1>
        <p className="text-sm text-muted-foreground">Asset Overview</p>
      </div>

      {ticketSummary.escalated > 0 && (
        <Link href="/tickets" className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 transition-colors hover:bg-red-500/10">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm font-medium text-red-600">
            {ticketSummary.escalated} ticket{ticketSummary.escalated > 1 ? "s" : ""} under-performance / unsatisfactory — response SLA breached
          </p>
          <span className="ml-auto text-xs font-semibold text-red-500">View →</span>
        </Link>
      )}

      {/* Top stat cards — a complete breakdown: the six tiles sum to Total */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <Link href="/assets" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard label="Total Assets" value={total} subtitle="All Over Pakistan" icon={<Monitor className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=active" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard label="Working" value={working} subtitle={`${pct(working)} · active + installed`} icon={<CheckCircle className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=in_stock" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard label="In Stock" value={inStock} subtitle={pct(inStock)} variant="highlighted" icon={<Clock className="h-5 w-5" />} />
        </Link>
        <Link href="/assets" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard label="Pipeline" value={pipeline} subtitle={`${pct(pipeline)} · procured / transit / assigned`} icon={<MonitorCheck className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=under_maintenance" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard label="Under Maintenance" value={underMaint} subtitle={pct(underMaint)} icon={<Wrench className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=client_property" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard label="Client Property" value={clientProperty} subtitle={pct(clientProperty)} icon={<MonitorCheck className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=decommissioned" className="block rounded-xl transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md">
          <StatCard label="Out of Service" value={outOfService} subtitle={`${pct(outOfService)} · decom / lost / RMA`} icon={<XCircle className="h-5 w-5" />} />
        </Link>
      </div>

      {/* Map (squeezed to half) + summaries column */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="rounded-xl border border-border bg-card overflow-hidden h-full flex flex-col">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Screen Status Map</h2>
                <p className="text-xs text-muted-foreground">Live status of screens across Pakistan</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <div className="border-t border-border flex-1 min-h-[400px]">
              <StatusMap devices={mapDevices} maintenanceSites={maintSites} height="100%" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Escalation Alerts — always on top of the summaries column */}
          <div className="rounded-xl border border-red-500/30 bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-red-500">
                <AlertCircle className="h-4 w-4" /> Escalation Alerts
              </h3>
              <Link href="/tickets" className="text-[11px] font-medium text-primary hover:underline">View All</Link>
            </div>
            {escalatedTickets.length > 0 ? (
              <div className="space-y-2">
                {escalatedTickets.slice(0, 5).map((t) => (
                  <Link key={t.id} href="/tickets" className="flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 transition-colors hover:bg-red-500/10">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{t.ticket_number} — {t.title}</p>
                      <p className="text-[10px] text-red-500">
                        {t.escalated ? "Escalated" : "Response overdue"}{t.priority ? ` · ${t.priority}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold text-red-500">→</span>
                  </Link>
                ))}
                {escalatedTickets.length > 5 && (
                  <p className="text-center text-[10px] text-muted-foreground">+{escalatedTickets.length - 5} more</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No escalations — all tickets within SLA</p>
            )}
          </div>

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
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Recent Alerts</h3>
              <Link href="/alerts" className="text-[11px] font-medium text-primary hover:underline">
                View All
              </Link>
            </div>
            {alerts.length > 0 ? (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-2.5">
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
                      <p className="text-xs font-medium text-foreground truncate">
                        {alert.device_code && `Screen ID: ${alert.device_code}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{alert.title}</p>
                      {alert.site_name && (
                        <p className="text-[10px] text-muted-foreground">{alert.site_name}{alert.site_city ? `, ${alert.site_city}` : ""}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {new Date(alert.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No recent alerts</p>
            )}
          </div>
        </div>
      </div>

      {/* Project / Ticket summaries + In-Hand Stock */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Project Summary */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Project Summary</h3>
            <Link href="/projects" className="text-[11px] font-medium text-primary hover:underline">View All</Link>
          </div>
          <div className="mb-3 flex items-end justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active Projects</p>
              <p className="text-lg font-bold text-foreground">{projectSummary.total - projectSummary.completed}</p>
            </div>
            <div className="text-right text-[10px] text-muted-foreground">
              <p>{projectSummary.total} total · {projectSummary.completed} completed</p>
              <p>avg progress {projectSummary.avgProgress}%</p>
            </div>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${projectSummary.avgProgress}%` }} />
          </div>
          <div className="space-y-2">
            {[
              { label: "On Track", value: projectSummary.onTrack, cls: "bg-emerald-500/10 text-emerald-600" },
              { label: "At Risk", value: projectSummary.atRisk, cls: "bg-amber-500/10 text-amber-600" },
              { label: "Delayed", value: projectSummary.delayed, cls: "bg-red-500/10 text-red-500" },
              { label: "Completed", value: projectSummary.completed, cls: "bg-primary/10 text-primary" },
            ].map((row) => (
              <Link key={row.label} href="/projects" className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5">
                <span className="text-xs font-medium text-foreground">{row.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.cls}`}>{row.value}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Ticket Summary */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Ticket Summary</h3>
            <Link href="/tickets" className="text-[11px] font-medium text-primary hover:underline">View All</Link>
          </div>
          <div className="mb-3 flex items-end justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Open Workload</p>
              <p className="text-lg font-bold text-foreground">{ticketSummary.open + ticketSummary.inProgress + ticketSummary.review}</p>
            </div>
            <div className="text-right text-[10px] text-muted-foreground">
              <p>{tickets.length} total tickets</p>
              {ticketSummary.escalated > 0 && <p className="font-semibold text-red-500">{ticketSummary.escalated} escalated</p>}
            </div>
          </div>
          <div className="space-y-2">
            {[
              { label: "Open", value: ticketSummary.open, href: "/tickets?status=open", cls: "bg-blue-500/10 text-blue-500" },
              { label: "In Progress", value: ticketSummary.inProgress, href: "/tickets?status=in_progress", cls: "bg-amber-500/10 text-amber-600" },
              { label: "Pending Review / Approval", value: ticketSummary.review, href: "/tickets?status=pending_review", cls: "bg-purple-500/10 text-purple-500" },
              { label: "Closed / Approved", value: ticketSummary.closed, href: "/tickets?status=closed", cls: "bg-emerald-500/10 text-emerald-600" },
            ].map((row) => (
              <Link key={row.label} href={row.href} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5">
                <span className="text-xs font-medium text-foreground">{row.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${row.cls}`}>{row.value}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* In-Hand Stock */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">In-Hand Stock</h3>
            <Link href="/inventory" className="text-[11px] font-medium text-primary hover:underline">
              View All
            </Link>
          </div>
          {stockSummary && (
            <Link href="/inventory" className="mb-3 flex items-end justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 transition-colors hover:bg-primary/10">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Stock Value</p>
                <p className="text-lg font-bold text-foreground">PKR {Number(stockSummary.total_value).toLocaleString()}</p>
                {stockSummary.unpriced_items > 0 && (
                  <p className="text-[10px] text-muted-foreground">{stockSummary.unpriced_items} unpriced item{stockSummary.unpriced_items > 1 ? "s" : ""} excluded</p>
                )}
              </div>
              <div className="text-right text-[10px] text-muted-foreground">
                <p>{stockSummary.total_quantity.toLocaleString()} units · {stockSummary.items} items</p>
                {stockSummary.low_stock > 0 && <p className="font-semibold text-red-500">{stockSummary.low_stock} low stock</p>}
              </div>
            </Link>
          )}
          <div className="mb-2 flex items-center gap-1.5">
            <select
              value={stockSortField}
              onChange={(e) => setStockSortField(e.target.value as typeof stockSortField)}
              className="h-6 rounded-md border border-border bg-background px-1.5 text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              aria-label="Sort stock by"
            >
              <option value="quantity">Sort: Quantity</option>
              <option value="total_value">Sort: Value</option>
              <option value="material_type__name">Sort: Name</option>
            </select>
            <button
              onClick={() => setStockSortDesc((v) => !v)}
              className="flex h-6 items-center gap-1 rounded-md border border-border bg-background px-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              title={stockSortDesc ? "Descending — click for ascending" : "Ascending — click for descending"}
            >
              {stockSortDesc ? "↓ Desc" : "↑ Asc"}
            </button>
          </div>
          {stock.length > 0 ? (
            <div className="space-y-2">
              {stock.map((item) => {
                const low = item.is_low_stock;
                return (
                  <Link key={item.id} href="/inventory" className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 transition-colors hover:border-primary/40 hover:bg-primary/5">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-foreground">{item.material_name || item.sku}</p>
                      <p className="text-[10px] text-muted-foreground">{item.sku}{item.category_name ? ` · ${item.category_name}` : ""}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${low ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-600"}`}>
                        {item.quantity} {item.unit}
                      </span>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {item.total_value != null ? `PKR ${Number(item.total_value).toLocaleString()}` : "unpriced"}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="py-4 text-center text-xs text-muted-foreground">No stock items</p>
          )}
        </div>
      </div>

    </div>
  );
}
