"use client";

import { AlertCircle, Bell, Check, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/utils";

interface Alert {
  id: string;
  title: string;
  message: string;
  severity: string;
  category: string;
  device_code: string | null;
  site_name: string | null;
  site_city: string | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string;
}

const severityColors: Record<string, string> = {
  critical: "text-red-500",
  error: "text-orange-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ severity: "", category: "" });
  const [search, setSearch] = useState("");

  const fetchAlerts = useCallback(async () => {
    try {
      const { data } = await api.get("/analytics/alerts/", { params: { page_size: 100, ordering: "-created_at" } });
      setAlerts(data.results ?? []);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load alerts"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  async function dismissAlert(id: string) {
    try {
      await api.post(`/analytics/alerts/${id}/dismiss/`);
      toast.success("Alert dismissed");
      fetchAlerts();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to dismiss"));
    }
  }

  async function markAllRead() {
    try {
      await api.post("/analytics/alerts/mark_all_read/");
      toast.success("All alerts marked as read");
      fetchAlerts();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed"));
    }
  }

  const filtered = alerts.filter((a) => {
    if (a.is_dismissed) return false;
    if (filterValues.severity && a.severity !== filterValues.severity) return false;
    if (filterValues.category && a.category !== filterValues.category) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!a.title.toLowerCase().includes(q) && !(a.device_code || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
            <Bell className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Alerts</h1>
            <p className="text-sm text-muted-foreground">System alerts and notifications</p>
          </div>
        </div>
        <button onClick={markAllRead} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
          <Check className="h-4 w-4" /> Mark All Read
        </button>
      </div>

      <FilterBar
        filters={[
          { key: "severity", label: "Severity", options: ["critical", "error", "warning", "info"].map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })) },
          { key: "category", label: "Category", options: ["device_status", "maintenance_due", "warranty_expiry", "inventory_low", "ticket_overdue"].map((c) => ({ value: c, label: c.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search alerts..."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Bell className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No alerts</h3>
          <p className="mt-2 text-sm text-muted-foreground">All clear! No active alerts at this time.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
                alert.is_read ? "border-border bg-card" : "border-primary/20 bg-primary/5"
              }`}
            >
              <AlertCircle className={`mt-0.5 h-5 w-5 shrink-0 ${severityColors[alert.severity] || "text-muted-foreground"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{alert.title}</p>
                {alert.message && <p className="mt-0.5 text-xs text-muted-foreground">{alert.message}</p>}
                <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                  {alert.device_code && <span>Device: {alert.device_code}</span>}
                  {alert.site_name && <span>{alert.site_name}{alert.site_city ? `, ${alert.site_city}` : ""}</span>}
                  <span>{formatDateTime(alert.created_at)}</span>
                </div>
              </div>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
