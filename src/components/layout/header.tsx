"use client";

import {
  AlertCircle,
  Bell,
  Calendar,
  Check,
  ChevronRight,
  Grid3X3,
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
import { Avatar } from "@/components/ui/avatar";
import { formatDateTime } from "@/lib/utils";

interface User {
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
  alert: { color: "bg-red-500", label: "Alert", icon: AlertCircle },
  maintenance_reminder: { color: "bg-emerald-500", label: "Maint.", icon: Wrench },
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
    if (!notif.is_read) onMarkRead(notif.id);
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
          <p className="text-[13px] font-medium leading-tight text-foreground">{notif.title}</p>
          {info && (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold text-white ${info.color}`}>
              {info.label}
            </span>
          )}
        </div>
        {notif.message && (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">
            {notif.message}
          </p>
        )}
        <div className="mt-1 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">{formatDateTime(notif.created_at)}</p>
          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </button>
  );
}

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { toggle } = useSidebar();
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
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Search className="h-4 w-4" />
        </button>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifications((prev) => !prev)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-[420px] rounded-xl border border-border bg-card shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      onClick={() => markAllRead()}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Check className="h-3 w-3" />
                      Mark all read
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-[480px] overflow-y-auto">
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
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
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
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                  className="block rounded-md py-1.5 text-center text-[12px] font-medium text-primary transition-colors hover:bg-primary/5"
                >
                  View all alerts
                </Link>
              </div>
            </div>
          )}
        </div>

        <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Calendar className="h-4 w-4" />
        </button>

        <button className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Grid3X3 className="h-4 w-4" />
        </button>

        <div className="mx-1 h-6 w-px bg-border" />

        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium leading-none text-foreground">
                {user.full_name || user.username}
              </p>
              <p className="mt-0.5 text-[11px] capitalize text-muted-foreground">
                {user.role.replace(/_/g, " ")}
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
