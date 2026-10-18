"use client";

import { AlertCircle, Bell, Check, ChevronRight, Pin, Ticket, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getNotificationRoute, useNotifications, type Notification } from "@/lib/notification-context";
import { formatDateTime } from "@/lib/utils";

const severityColors: Record<string, string> = {
  critical: "bg-red-500",
  error: "bg-orange-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

const typeConfig: Record<string, { color: string; label: string; icon: typeof Ticket }> = {
  ticket_assigned: { color: "bg-amber-500", label: "Ticket", icon: Ticket },
  ticket_update: { color: "bg-blue-500", label: "Update", icon: Ticket },
  ticket_review: { color: "bg-purple-500", label: "Review", icon: Ticket },
  ticket_escalated: { color: "bg-red-500", label: "Escalated", icon: Ticket },
  alert: { color: "bg-red-500", label: "Alert", icon: AlertCircle },
  maintenance_reminder: { color: "bg-emerald-500", label: "Maint.", icon: Wrench },
  installation_assigned: { color: "bg-amber-500", label: "Install", icon: Wrench },
  installation_escalated: { color: "bg-red-500", label: "Escalated", icon: AlertCircle },
  approval_requested: { color: "bg-amber-500", label: "Approve", icon: AlertCircle },
  approval_decided: { color: "bg-blue-500", label: "Decided", icon: AlertCircle },
  request_raised: { color: "bg-amber-500", label: "Request", icon: AlertCircle },
  request_answered: { color: "bg-blue-500", label: "Answered", icon: AlertCircle },
  work_assigned: { color: "bg-amber-500", label: "Assigned", icon: Wrench },
  workflow_update: { color: "bg-blue-500", label: "Update", icon: AlertCircle },
  digest: { color: "bg-slate-500", label: "Summary", icon: AlertCircle },
};

/** An alert takes the colour of its severity; anything else, of its kind. */
function colorOf(n: Notification) {
  if (n.notification_type === "alert") return severityColors[(n.data?.severity as string) || "info"] || "bg-blue-500";
  return typeConfig[n.notification_type]?.color ?? "bg-blue-500";
}

function NotificationItem({ notif, onMarkRead, onClose }: {
  notif: Notification;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const isPinned = notif.is_actionable && !notif.is_resolved;
  const info = typeConfig[notif.notification_type];
  const route = getNotificationRoute(notif);

  function handleClick() {
    // Opening a notice that waits on you only takes you there; it clears
    // when the job moves, or when you acknowledge it on the Alerts page.
    if (!notif.is_read && !isPinned) onMarkRead(notif.id);
    onClose();
    router.push(route);
  }

  return (
    <button
      onClick={handleClick}
      className={`group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/50 ${
        notif.is_read ? "" : "bg-primary/5"
      } ${isPinned ? "border-l-2 border-amber-500" : ""}`}
    >
      <div className="mt-1 flex flex-col items-center gap-1">
        {isPinned ? (
          <Pin className="h-3 w-3 text-amber-500" />
        ) : (
          <span className={`h-2 w-2 rounded-full ${notif.is_read ? "bg-transparent" : colorOf(notif)}`} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium leading-tight text-foreground">{notif.title}</p>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold ${
            isPinned ? "bg-amber-500/15 text-amber-700" : notif.is_actionable ? "bg-emerald-500/10 text-emerald-700" : "bg-secondary text-muted-foreground"
          }`}>
            {isPinned ? "Action required" : notif.is_actionable ? "Done" : "For info"}
          </span>
          {info && (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-2xs font-bold text-white ${info.color}`}>
              {info.label}
            </span>
          )}
        </div>
        {notif.message && (
          <p className="mt-0.5 text-2xs leading-snug text-muted-foreground line-clamp-2">{notif.message}</p>
        )}
        <div className="mt-1 flex items-center justify-between">
          <p className="text-2xs text-muted-foreground">{formatDateTime(notif.created_at)}</p>
          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </button>
  );
}

/** Every notification, in a panel that slides in from the left. */
export function NotificationsPanel() {
  const { notifications, unreadCount, markRead, markAllRead, panelOpen, closePanel } = useNotifications();

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, closePanel]);

  if (!panelOpen) return null;

  const pinned = notifications.filter((n) => n.is_actionable && !n.is_resolved);
  const other = notifications.filter((n) => !(n.is_actionable && !n.is_resolved));

  return (
    <>
      <div onClick={closePanel} className="fixed inset-0 z-[60] bg-black/40 animate-in fade-in duration-200" aria-hidden />
      <aside
        role="dialog"
        aria-label="Notifications"
        className="fixed bottom-3 left-3 top-3 z-[61] flex w-[calc(100vw-1.5rem)] max-w-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-float animate-in slide-in-from-left duration-200"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-destructive px-1.5 py-0.5 text-2xs font-bold text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-2xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Check className="h-3 w-3" />
                Mark all read
              </button>
            )}
            <button onClick={closePanel} aria-label="Close notifications" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Bell className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="mt-2 text-xs text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <>
              {pinned.length > 0 && (
                <>
                  <div className="flex items-center gap-2 bg-amber-500/5 px-4 py-2">
                    <Ticket className="h-3 w-3 text-amber-500" />
                    <span className="text-2xs font-semibold uppercase tracking-wider text-amber-600">
                      Active Tickets ({pinned.length})
                    </span>
                  </div>
                  {pinned.map((n) => <NotificationItem key={n.id} notif={n} onMarkRead={markRead} onClose={closePanel} />)}
                </>
              )}
              {other.length > 0 && (
                <>
                  {pinned.length > 0 && (
                    <div className="flex items-center gap-2 bg-secondary/30 px-4 py-2">
                      <Bell className="h-3 w-3 text-muted-foreground" />
                      <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Other</span>
                    </div>
                  )}
                  {other.map((n) => <NotificationItem key={n.id} notif={n} onMarkRead={markRead} onClose={closePanel} />)}
                </>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border px-4 py-2">
          <Link href="/alerts" onClick={closePanel} className="block rounded-md py-1.5 text-center text-xs font-medium text-primary transition-colors hover:bg-primary/5">
            View all alerts
          </Link>
        </div>
      </aside>
    </>
  );
}

function IncomingCard({ notif }: { notif: Notification }) {
  const { dismissIncoming, openPanel } = useNotifications();
  const Icon = typeConfig[notif.notification_type]?.icon ?? Bell;
  const waiting = notif.is_actionable && !notif.is_resolved;

  // Something waiting on this person stays up longer than news.
  useEffect(() => {
    const t = setTimeout(() => dismissIncoming(notif.id), waiting ? 10000 : 8000);
    return () => clearTimeout(t);
  }, [notif.id, waiting, dismissIncoming]);

  return (
    <div className="pointer-events-auto flex overflow-hidden rounded-2xl border border-border bg-card shadow-float animate-in slide-in-from-left fade-in duration-300">
      <span className={`w-1 shrink-0 ${colorOf(notif)}`} aria-hidden />
      <button onClick={openPanel} className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left">
        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white ${colorOf(notif)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-sm font-semibold leading-tight text-foreground">{notif.title}</span>
            {waiting && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-2xs font-semibold text-amber-700">Action required</span>}
          </span>
          {notif.message && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground line-clamp-3">{notif.message}</span>}
          <span className="mt-1 block text-2xs text-muted-foreground">{formatDateTime(notif.created_at)} · Click to see all notifications</span>
        </span>
      </button>
      <button onClick={() => dismissIncoming(notif.id)} aria-label="Dismiss" className="flex h-8 w-8 shrink-0 items-center justify-center self-start text-muted-foreground transition-colors hover:text-foreground">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** A notification as it arrives: a card from the top left. */
export function IncomingNotices() {
  const { incoming } = useNotifications();
  if (incoming.length === 0) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed left-3 top-3 z-[70] flex w-[calc(100vw-1.5rem)] max-w-[380px] flex-col gap-2">
      {incoming.map((n) => <IncomingCard key={n.id} notif={n} />)}
    </div>
  );
}
