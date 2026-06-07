"use client";

import { Bell, LogOut, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { getCurrentUser, logout, type User } from "@/lib/auth";

export function Header() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => {});
  }, []);

  const initials = user
    ? `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`.toUpperCase() ||
      user.username[0].toUpperCase()
    : "";

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-white dark:bg-[hsl(222,20%,9%)] px-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search anything..."
          className="h-9 w-72 rounded-lg border border-border bg-gray-50 dark:bg-white/5 pl-9 pr-3 text-sm text-foreground placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors"
        />
      </div>

      <div className="flex items-center gap-3">
        <button className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-gray-50 dark:bg-white/5 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-700 dark:hover:text-gray-300">
          <Bell className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-teal-500" />
        </button>

        <div className="mx-1 h-6 w-px bg-border" />

        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium leading-none text-gray-900 dark:text-gray-100">
                {user.full_name || user.username}
              </p>
              <p className="mt-0.5 text-[11px] capitalize text-gray-400 dark:text-gray-500">
                {user.role.replace("_", " ")}
              </p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-xs font-bold text-white">
              {initials}
            </div>
          </div>
        )}

        <button
          onClick={logout}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-gray-50 dark:bg-white/5 text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:hover:border-red-500/30 dark:hover:bg-red-500/10"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
