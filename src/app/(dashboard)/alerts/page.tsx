"use client";

import { AlertCircle, Bell, Check, Pin, X, CheckCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import { Tabs } from "@/components/ui/tabs";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { getNotificationRoute, useNotifications, type Notification } from "@/lib/notification-context";
import { formatDateTime } from "@/lib/utils";

/** What each notification is, in a word - the same labels the bell uses. */
const TYPE_LABELS: Record<string, string> = {
  ticket_assigned: "Ticket", ticket_update: "Update", ticket_review: "Review", ticket_escalated: "Escalated",
  alert: "Alert", maintenance_reminder: "Maintenance", installation_assigned: "Install",
  installation_escalated: "Escalated", approval_requested: "Approve", approval_decided: "Decided",
  request_raised: "Request", request_answered: "Answered", work_assigned: "Assigned",
  workflow_update: "Update", digest: "Summary",
};

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
  const router = useRouter();
  // The bell's "View all" lands here, so the page lists what the bell lists
  // - every notification sent to this person - and the system alerts beside.
  const [tab, setTab] = useState<"notifications" | "system">("notifications");
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(true);
  const { markRead, markAllRead: markAllNotifsRead, refresh: refreshBell } = useNotifications();
  const fetchNotifs = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications/notifications/", { params: { page_size: 100, ordering: "-created_at" } });
      setNotifs(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load notifications"));
    } finally {
      setNotifsLoading(false);
    }
  }, []);
  useEffect(() => { fetchNotifs(); }, [fetchNotifs]);
  async function acknowledge(n: Notification) {
    await markRead(n.id);
    setNotifs((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
    refreshBell();
  }
  async function openNotif(n: Notification) {
    // A notice that waits on an action stays until the job moves or it is
    // acknowledged; opening it only takes you there.
    if (!n.is_read && !(n.is_actionable && !n.is_resolved)) await acknowledge(n);
    router.push(getNotificationRoute(n));
  }
  async function readAll() {
    await markAllNotifsRead();
    setNotifs((prev) => prev.map((x) => ({ ...x, is_read: true })));
    refreshBell();
  }
  const unread = notifs.filter((n) => !n.is_read).length;
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
        <button onClick={tab === "notifications" ? readAll : markAllRead} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary">
          <Check className="h-4 w-4" /> Mark All Read
        </button>
      </div>

      <Tabs
        tabs={[
          { key: "notifications", label: unread > 0 ? `Notifications (${unread} unread)` : "Notifications" },
          { key: "system", label: "System alerts" },
        ]}
        active={tab}
        onChange={(k) => setTab(k as "notifications" | "system")}
      />

      {tab === "notifications" && (
        notifsLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : notifs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">Nothing for you yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">Approvals, requests and assignments that need you will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifs.map((n) => {
              const pinned = n.is_actionable && !n.is_resolved;
              return (
                <div key={n.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => openNotif(n)}
                  className={`flex min-w-0 flex-1 items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-secondary/40 ${
                    n.is_read ? "border-border bg-card" : "border-primary/20 bg-primary/5"
                  } ${pinned ? "border-l-2 border-l-amber-500" : ""}`}
                >
                  <span className="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center">
                    {pinned ? <Pin className="h-3 w-3 text-amber-500" /> : !n.is_read ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{n.title}</span>
                      {TYPE_LABELS[n.notification_type] && (
                        <span className="rounded bg-secondary px-1.5 py-0.5 text-2xs font-semibold text-muted-foreground">
                          {TYPE_LABELS[n.notification_type]}
                        </span>
                      )}
                      <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${
                        pinned ? "bg-amber-500/15 text-amber-700" : n.is_actionable ? "bg-emerald-500/10 text-emerald-700" : "bg-secondary text-muted-foreground"
                      }`}>
                        {pinned ? "Action required" : n.is_actionable ? "Done" : "For info"}
                      </span>
                    </span>
                    {n.message && <span className="mt-0.5 block text-xs text-muted-foreground">{n.message}</span>}
                    <span className="mt-1 block text-2xs text-muted-foreground">{formatDateTime(n.created_at)}</span>
                  </span>
                </button>
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={() => acknowledge(n)}
                    title="Acknowledge - clear this notification"
                    aria-label="Acknowledge"
                    className="flex w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                )}
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === "system" && (<>

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
                <div className="mt-1 flex items-center gap-3 text-2xs text-muted-foreground">
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
      </>)}
    </div>
  );
}
