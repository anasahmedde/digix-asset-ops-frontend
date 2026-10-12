"use client";

import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  ChevronRight,
  LogOut,
  Menu,
  Pin,
  Search,
  Ticket,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { getCurrentUser, logout } from "@/lib/auth";
import {
  getNotificationRoute,
  useNotifications,
  type Notification,
} from "@/lib/notification-context";
import { useSidebar } from "@/lib/sidebar-context";
import { GlobalSearch } from "@/components/layout/global-search";
import { Avatar } from "@/components/ui/avatar";
import { formatDateTime } from "@/lib/utils";

interface User {
  role_label?: string;
  full_name: string;
  username: string;
  role: string;
  avatar: string | null;
}

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

function NotificationItem({
  notif,
  onMarkRead,
  onClose,
}: {
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
          <span
            className={`h-2 w-2 rounded-full ${
              notif.is_read
                ? "bg-transparent"
                : severityColors[(notif.data?.severity as string) || "info"] || "bg-blue-500"
            }`}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
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
          <p className="mt-0.5 text-2xs leading-snug text-muted-foreground line-clamp-2">
            {notif.message}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between">
          <p className="text-2xs text-muted-foreground">{formatDateTime(notif.created_at)}</p>
          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </button>
  );
}

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  // One search over everything: the button, Ctrl/Cmd+K, or "/" outside a field.
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable]");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setSearchOpen(true); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { collapsed, toggle, openMobile } = useSidebar();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const closeDropdown = () => setShowNotifications(false);

  const pinnedNotifs = notifications.filter((n) => n.is_actionable && !n.is_resolved);
  const otherNotifs = notifications.filter((n) => !(n.is_actionable && !n.is_resolved));

  return (
    <header className="glass-pane sticky top-3 z-40 mx-4 mt-3 flex h-14 items-center justify-between rounded-2xl border px-4 shadow-float sm:mx-6">
      <div className="flex items-center gap-4">
        {/* Mobile: open the drawer */}
        <button
          onClick={openMobile}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        {/* Desktop: collapse the sidebar */}
        <button
          onClick={toggle}
          aria-label={collapsed ? "Pin the menu open" : "Fold the menu to a rail"}
          className="hidden h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:flex"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => setSearchOpen(true)} aria-label="Search everything (Ctrl+K)" title="Search everything (Ctrl+K)" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Search className="h-4 w-4" />
        </button>
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

        {/* On a phone the panel hangs off the header itself, full width; from sm up it hangs off the bell. */}
        <div className="sm:relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifications((prev) => !prev)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-bold text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-full rounded-xl sm:w-[420px] border border-border bg-card shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllRead()}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-2xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Check className="h-3 w-3" />
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto sm:max-h-[480px]">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Bell className="mx-auto h-8 w-8 text-muted-foreground/30" />
                    <p className="mt-2 text-xs text-muted-foreground">No notifications yet</p>
                  </div>
                ) : (
                  <>
                    {pinnedNotifs.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 bg-amber-500/5 px-4 py-2">
                          <Ticket className="h-3 w-3 text-amber-500" />
                          <span className="text-2xs font-semibold uppercase tracking-wider text-amber-600">
                            Active Tickets ({pinnedNotifs.length})
                          </span>
                        </div>
                        {pinnedNotifs.map((notif) => (
                          <NotificationItem key={notif.id} notif={notif} onMarkRead={markRead} onClose={closeDropdown} />
                        ))}
                      </>
                    )}
                    {otherNotifs.length > 0 && (
                      <>
                        {pinnedNotifs.length > 0 && (
                          <div className="flex items-center gap-2 bg-secondary/30 px-4 py-2">
                            <Bell className="h-3 w-3 text-muted-foreground" />
                            <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                              Other
                            </span>
                          </div>
                        )}
                        {otherNotifs.map((notif) => (
                          <NotificationItem key={notif.id} notif={notif} onMarkRead={markRead} onClose={closeDropdown} />
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="border-t border-border px-4 py-2">
                <Link
                  href="/alerts"
                  onClick={closeDropdown}
                  className="block rounded-md py-1.5 text-center text-xs font-medium text-primary transition-colors hover:bg-primary/5"
                >
                  View all alerts
                </Link>
              </div>
            </div>
          )}
        </div>

        <Link href="/?date=today" aria-label="Calendar" title="Calendar" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Calendar className="h-4 w-4" />
        </Link>


        <div className="mx-1 h-6 w-px bg-border" />

        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium leading-none text-foreground">
                {user.full_name || user.username}
              </p>
              <p className="mt-0.5 text-2xs text-muted-foreground">
                {user.role_label ?? user.role.replace(/_/g, " ")}
              </p>
            </div>
            <Avatar src={user.avatar} name={user.full_name || user.username} size="md" />
          </div>
        )}

        <button
          onClick={logout}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
