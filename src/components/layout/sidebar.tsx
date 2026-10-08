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
  ReceiptText,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sun,
  Ticket,
  Truck,
  Users,
  Wrench,
  Fingerprint,
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
  /** Shown to anyone holding this capability; without one, to everybody. */
  capability?: string;
  badge?: number;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: Gauge },
  { name: "Assets", href: "/assets", icon: HardDrive, capability: "view_assets" },
  { name: "Installation Tracker", href: "/installation-tracker", icon: Layers, capability: "view_installations" },
  { name: "Maintenance", href: "/maintenance", icon: Wrench, capability: "view_maintenance" },
  { name: "Warranties", href: "/warranties", icon: ShieldCheck, capability: "view_warranties" },
  { name: "Projects", href: "/projects", icon: ClipboardList, capability: "view_projects" },
  { name: "Sites", href: "/sites", icon: MapPin, capability: "view_installations" },
  { name: "Tickets", href: "/tickets", icon: Ticket, capability: "view_tickets" },
  { name: "Quotations", href: "/quotations", icon: ReceiptText, capability: "view_quotations" },
  { name: "Work Orders", href: "/work-orders", icon: ScrollText, capability: "view_work_orders" },
  { name: "Inventory", href: "/inventory", icon: Package, capability: "view_stock" },
  { name: "Procurement", href: "/procurement", icon: ShoppingCart, capability: "view_procurement" },
  {
    name: "Reports", href: "/analytics", icon: BarChart3, capability: "view_reports",
    children: [
      { name: "Reports", href: "/reports", icon: BarChart3 },
      { name: "Analytics", href: "/analytics", icon: BarChart3 },
      { name: "Finance", href: "/finance", icon: CreditCard, capability: "view_finance" },
    ],
  },
  { name: "Alerts", href: "/alerts", icon: AlertCircle, capability: "receive_alerts" },
  { name: "Documents", href: "/documents", icon: FileText, capability: "view_assets" },
  { name: "Attendance", href: "/attendance", icon: Fingerprint, capability: "view_attendance" },
  { name: "Teams", href: "/teams", icon: Users, capability: "view_team" },
  { name: "Vendors", href: "/suppliers", icon: Truck, capability: "view_suppliers" },
  { name: "Clients", href: "/clients", icon: Building2, capability: "view_clients" },
  { name: "Chat", href: "/chat", icon: MessageSquare },
  { name: "Setup", href: "/setup", icon: SlidersHorizontal, capability: "manage_setup" },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, mobileOpen, closeMobile, goHome } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { totalUnread } = useChatUnread();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());

  const { can } = useUser();
  // The menu reads the same rule as the server: a capability. Rights are
  // editable per role and per person, so a menu that read role names went
  // stale the moment somebody's were adjusted.
  const show = (item: NavItem) => !item.capability || can(item.capability);

  const visibleNav = navigation
    .filter(show)
    .map((item) => (item.children ? { ...item, children: item.children.filter(show) } : item))
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
        "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar/80 backdrop-blur-xl backdrop-saturate-150 transition-transform duration-200",
        // Always full-width (labels visible) as a drawer on phones; honour collapse on desktop.
        "max-lg:w-64",
        sidebarWidth,
        // Off-canvas on mobile unless opened; always visible on desktop.
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        "lg:translate-x-0"
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
                        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
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
                                onClick={closeMobile}
                                className={cn(
                                  "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150",
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
                    onClick={() => {
                      closeMobile();
                      // Already in this section: go back to its list.
                      if (isActive) goHome();
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
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
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-2xs font-bold text-primary-foreground">
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
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
