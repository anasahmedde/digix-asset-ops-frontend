"use client";

import { Bell, Calendar, LogOut, Menu, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getCurrentUser, logout } from "@/lib/auth";
import { useNotifications } from "@/lib/notification-context";
import { useSidebar } from "@/lib/sidebar-context";
import { GlobalSearch } from "@/components/layout/global-search";
import { Avatar } from "@/components/ui/avatar";

interface User {
  role_label?: string;
  full_name: string;
  username: string;
  role: string;
  avatar: string | null;
}

export function Header() {
  const [user, setUser] = useState<User | null>(null);
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
  const { collapsed, toggle, openMobile } = useSidebar();
  const { unreadCount, openPanel } = useNotifications();

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => {});
  }, []);

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

        <button
          onClick={openPanel}
          aria-label="Notifications"
          title="Notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-2xs font-bold text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

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
