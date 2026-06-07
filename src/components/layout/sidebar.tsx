"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Box,
  Building2,
  ClipboardList,
  CreditCard,
  Gauge,
  HardDrive,
  MapPin,
  Package,
  Settings,
  Shield,
  ShoppingCart,
  Ticket,
  Truck,
  Users,
  Warehouse,
  Wrench,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useUser } from "@/lib/user-context";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tab?: string;
  roles?: string[];
}

const navigation: NavItem[] = [
  { name: "Dashboard", href: "/", icon: Gauge },
  { name: "Devices", href: "/assets", icon: HardDrive, roles: ["super_admin", "ops_manager", "technician"] },
  { name: "Sites", href: "/sites", icon: MapPin, roles: ["super_admin", "ops_manager", "technician"] },
  { name: "Tickets", href: "/tickets", icon: Ticket, roles: ["super_admin", "ops_manager", "technician"] },
  { name: "Teams", href: "/teams", icon: Users, roles: ["super_admin"] },
  { name: "Warranties", href: "/warranties", icon: Shield, roles: ["super_admin", "ops_manager"] },
  { name: "Maintenance", href: "/maintenance", icon: Wrench, roles: ["super_admin", "ops_manager", "technician"] },
  { name: "Infrastructure", href: "/infrastructure", icon: Zap, roles: ["super_admin", "ops_manager"] },
  { name: "Inventory", href: "/inventory", icon: Package, roles: ["super_admin", "ops_manager", "warehouse"] },
  { name: "Warehouse", href: "/inventory?tab=warehouse", icon: Warehouse, tab: "warehouse", roles: ["super_admin", "ops_manager", "warehouse"] },
  { name: "Spares", href: "/inventory?tab=spares", icon: Box, tab: "spares", roles: ["super_admin", "ops_manager", "warehouse"] },
  { name: "Suppliers", href: "/suppliers", icon: Truck, roles: ["super_admin", "ops_manager"] },
  { name: "Clients", href: "/clients", icon: Building2, roles: ["super_admin", "ops_manager", "client_viewer"] },
  { name: "Procurement", href: "/procurement", icon: ShoppingCart, roles: ["super_admin", "ops_manager", "finance"] },
  { name: "Finance", href: "/finance", icon: CreditCard, roles: ["super_admin", "ops_manager", "finance"] },
  { name: "Analytics", href: "/analytics", icon: BarChart3, roles: ["super_admin", "ops_manager", "finance"] },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
  const { user } = useUser();

  const role = user?.role ?? "";

  const visibleNav = navigation.filter((item) => {
    if (!item.roles) return true;
    if (!role) return false;
    return item.roles.includes(role);
  });

  function checkActive(item: NavItem): boolean {
    const basePath = item.href.split("?")[0];

    if (item.tab) {
      return pathname === basePath && currentTab === item.tab;
    }

    if (basePath === "/inventory" && !item.tab) {
      return pathname === "/inventory" && !currentTab;
    }

    if (item.href === "/") {
      return pathname === "/";
    }

    return pathname === basePath || pathname.startsWith(basePath + "/");
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-white dark:bg-[hsl(222,20%,9%)]">
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600">
          <ClipboardList className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-none tracking-tight text-gray-900 dark:text-gray-100">
            DIGIX
          </h1>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">Asset Management</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-0.5">
          {visibleNav.map((item) => {
            const isActive = checkActive(item);
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-150",
                    item.tab && "pl-9",
                    isActive
                      ? "bg-teal-500/10 text-teal-400 dark:bg-teal-500/15 dark:text-teal-400"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-200"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isActive ? "text-teal-500" : ""
                    )}
                  />
                  {item.name}
                  {isActive && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-teal-500" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-4">
        <div className="rounded-lg bg-teal-50 p-3 dark:bg-teal-500/10">
          <p className="text-xs font-medium text-teal-700 dark:text-teal-400">DIGIX Platform</p>
          <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
            v1.0.0 &middot; Wave 1
          </p>
        </div>
      </div>
    </aside>
  );
}
