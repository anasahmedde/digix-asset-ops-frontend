"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  AlertCircle,
  BarChart3,
  Box,
  Building2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  Gauge,
  HardDrive,
  Layers,
  MapPin,
  MessageSquare,
  Moon,
  Package,
  Settings,
  Sun,
  Ticket,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

import { useChatUnread } from "@/lib/chat-context";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import { useTheme } from "@/lib/theme-context";
import { useUser } from "@/lib/user-context";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  badge?: number;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: Gauge },
  { name: "Assets", href: "/assets", icon: HardDrive, roles: ["super_admin", "ops_manager", "technician"] },
  { name: "Installation Tracker", href: "/installation-tracker", icon: Layers, roles: ["super_admin", "ops_manager", "technician"] },
  { name: "Maintenance", href: "/maintenance", icon: Wrench, roles: ["super_admin", "ops_manager", "technician"] },
  { name: "Projects", href: "/projects", icon: ClipboardList, roles: ["super_admin", "ops_manager"] },
  {
    name: "Sites", href: "/sites", icon: MapPin, roles: ["super_admin", "ops_manager", "technician"],
  },
  { name: "Work Orders", href: "/work-orders", icon: Ticket, roles: ["super_admin", "ops_manager", "technician"] },
  { name: "Inventory", href: "/inventory", icon: Package, roles: ["super_admin", "ops_manager", "warehouse"] },
  {
    name: "Reports", href: "/analytics", icon: BarChart3, roles: ["super_admin", "ops_manager", "finance"],
    children: [
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Finance", href: "/finance", icon: CreditCard },
    ],
  },
  { name: "Alerts", href: "/alerts", icon: AlertCircle, roles: ["super_admin", "ops_manager"] },
  { name: "Documents", href: "/documents", icon: FileText, roles: ["super_admin", "ops_manager"] },
  { name: "Teams", href: "/teams", icon: Users, roles: ["super_admin"] },
  { name: "Vendors", href: "/suppliers", icon: Truck, roles: ["super_admin", "ops_manager"] },
  { name: "Clients", href: "/clients", icon: Building2, roles: ["super_admin", "ops_manager", "client_viewer"] },
  { name: "Chat", href: "/chat", icon: MessageSquare },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed } = useSidebar();
  const { user } = useUser();
  const { theme, setTheme } = useTheme();
  const { totalUnread } = useChatUnread();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  const role = user?.role ?? "";

  const visibleNav = navigation
    .filter((item) => {
      if (!item.roles) return true;
      if (!role) return false;
      return item.roles.includes(role);
    })
    .map((item) =>
      item.name === "Chat" ? { ...item, badge: totalUnread } : item
    );

  function checkActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  function toggleExpand(name: string) {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const sidebarWidth = collapsed ? "w-[72px]" : "w-64";

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar transition-all duration-200",
        sidebarWidth
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Box className="h-5 w-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-none tracking-tight text-foreground">
              DIGIX
            </h1>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {visibleNav.map((item) => {
            const isActive = checkActive(item.href);
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedMenus.has(item.name);
            const childActive = hasChildren && item.children!.some((c) => checkActive(c.href));

            return (
              <li key={item.name}>
                {hasChildren ? (
                  <>
                    <button
                      onClick={() => toggleExpand(item.name)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                        childActive
                          ? "text-primary"
                          : "text-sidebar-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 text-left">{item.name}</span>
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </>
                      )}
                    </button>
                    {isExpanded && !collapsed && (
                      <ul className="mt-0.5 space-y-0.5 pl-4">
                        {item.children!.map((child) => {
                          const childIsActive = checkActive(child.href);
                          return (
                            <li key={child.name}>
                              <Link
                                href={child.href}
                                className={cn(
                                  "flex items-center gap-3 rounded-lg px-3 py-2 text-[12px] font-medium transition-all duration-150",
                                  childIsActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-sidebar-foreground hover:bg-secondary hover:text-foreground"
                                )}
                              >
                                <child.icon className="h-4 w-4 shrink-0" />
                                {child.name}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <item.icon
                      className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-primary" : "")}
                    />
                    {!collapsed && (
                      <>
                        <span className="flex-1">{item.name}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                            {item.badge > 99 ? "99+" : item.badge}
                          </span>
                        )}
                        {isActive && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </>
                    )}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {theme === "dark" ? (
            <Sun className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <Moon className="h-[18px] w-[18px] shrink-0" />
          )}
          {!collapsed && <span>Theme</span>}
          {!collapsed && (
            <ChevronRight className="ml-auto h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </aside>
  );
}
