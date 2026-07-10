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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [mapDevices, setMapDevices] = useState<MapDevice[]>([]);
  const [maintSites, setMaintSites] = useState<MaintenanceSiteMap[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceStats>({ total: 0, completed: 0, in_progress: 0, pending: 0 });
  const [slaBreached, setSlaBreached] = useState(0);
  const [stock, setStock] = useState<{ id: string; sku: string; material_name: string | null; category_name: string | null; quantity: number; unit: string; reorder_level: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [statsRes, mapRes, alertsRes, maintRes, maintMapRes, stockRes, ticketsRes] = await Promise.allSettled([
          api.get("/assets/devices/dashboard_stats/"),
          api.get("/assets/devices/map_data/"),
          api.get("/analytics/alerts/", { params: { page_size: 5, ordering: "-created_at", is_dismissed: false } }),
          api.get("/maintenance/schedules/", { params: { page_size: 1000 } }),
          api.get("/maintenance/schedules/map_data/"),
          api.get("/inventory/items/", { params: { page_size: 6, ordering: "-quantity" } }),
          api.get("/tickets/", { params: { page_size: 100 } }),
        ]);

        if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
        if (mapRes.status === "fulfilled") setMapDevices(mapRes.value.data);
        if (maintMapRes.status === "fulfilled") setMaintSites(maintMapRes.value.data);
        if (alertsRes.status === "fulfilled") setAlerts(alertsRes.value.data.results ?? []);
        if (stockRes.status === "fulfilled") setStock(stockRes.value.data.results ?? []);
        if (ticketsRes.status === "fulfilled") {
          const ts = ticketsRes.value.data.results ?? [];
          setSlaBreached(ts.filter((t: { escalated: boolean; is_response_overdue: boolean }) => t.escalated || t.is_response_overdue).length);
        }

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

  const total = stats?.total ?? 0;
  const working = stats?.working ?? 0;
  const outOfOrder = stats?.out_of_order ?? 0;
  const underMaint = stats?.under_maintenance ?? 0;
  const inStock = stats?.in_stock ?? 0;
  const installed = stats?.installed ?? 0;

  const installedPct = total > 0 ? (installed / total) * 100 : 0;
  const workingPct = total > 0 ? (working / total) * 100 : 0;
  const outPct = total > 0 ? (outOfOrder / total) * 100 : 0;
  const maintPct = total > 0 ? (underMaint / total) * 100 : 0;
  const inStockPct = total > 0 ? (inStock / total) * 100 : 0;

  const assetHealth = total > 0 ? Math.round((working / total) * 100) : 0;

  const statusDistData = [
    { name: "Active", value: working, color: "#10b981" },
    { name: "Decommissioned", value: outOfOrder, color: "#ef4444" },
    { name: "Under Maintenance", value: underMaint, color: "#f59e0b" },
    { name: "In Stock", value: inStock, color: "#6366f1" },
  ].filter((d) => d.value > 0);

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

      {slaBreached > 0 && (
        <Link href="/tickets" className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 transition-colors hover:bg-red-500/10">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm font-medium text-red-600">
            {slaBreached} ticket{slaBreached > 1 ? "s" : ""} past the response SLA — needs attention
          </p>
          <span className="ml-auto text-xs font-semibold text-red-500">View →</span>
        </Link>
      )}

      {/* Top stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Link href="/assets" className="block">
          <StatCard label="Total Screens" value={total} subtitle="All Over Pakistan" icon={<Monitor className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=installed" className="block">
          <StatCard label="Installed" value={installed} subtitle={`${installedPct.toFixed(1)}% deployed`} icon={<MonitorCheck className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=active" className="block">
          <StatCard label="Working" value={working} subtitle={`${workingPct.toFixed(1)}%`} icon={<CheckCircle className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=decommissioned" className="block">
          <StatCard label="Out of Order" value={outOfOrder} subtitle={`${outPct.toFixed(1)}%`} icon={<XCircle className="h-5 w-5" />} />
        </Link>
        <Link href="/maintenance" className="block">
          <StatCard label="Under Maintenance" value={underMaint} subtitle={`${maintPct.toFixed(1)}%`} icon={<Wrench className="h-5 w-5" />} />
        </Link>
        <Link href="/assets?status=in_stock" className="block">
          <StatCard label="In Stock" value={inStock} subtitle={`${inStockPct.toFixed(1)}%`} variant="highlighted" icon={<Clock className="h-5 w-5" />} />
        </Link>
      </div>

      {/* Map + Legend + Quick Summary + Alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
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

          {/* In-Hand Stock */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">In-Hand Stock</h3>
              <Link href="/inventory" className="text-[11px] font-medium text-primary hover:underline">
                View All
              </Link>
            </div>
            {stock.length > 0 ? (
              <div className="space-y-2">
                {stock.map((item) => {
                  const low = item.quantity <= item.reorder_level;
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-foreground">{item.material_name || item.sku}</p>
                        <p className="text-[10px] text-muted-foreground">{item.sku}{item.category_name ? ` · ${item.category_name}` : ""}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${low ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-600"}`}>
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-muted-foreground">No stock items</p>
            )}
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

    </div>
  );
}
