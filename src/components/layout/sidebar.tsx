"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

const navigation = [
  { name: "Dashboard", href: "/", icon: Gauge },
  { name: "Devices", href: "/assets", icon: HardDrive },
  { name: "Sites", href: "/sites", icon: MapPin },
  { name: "Tickets", href: "/tickets", icon: Ticket },
  { name: "Teams", href: "/teams", icon: Users },
  { name: "Warranties", href: "/warranties", icon: Shield },
  { name: "Maintenance", href: "/maintenance", icon: Wrench },
  { name: "Infrastructure", href: "/infrastructure", icon: Zap },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Suppliers", href: "/suppliers", icon: Truck },
  { name: "Clients", href: "/clients", icon: Building2 },
  { name: "Procurement", href: "/procurement", icon: ShoppingCart },
  { name: "Finance", href: "/finance", icon: CreditCard },
  { name: "Warehouse", href: "/inventory?tab=warehouse", icon: Warehouse },
  { name: "Spares", href: "/inventory?tab=spares", icon: Box },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <ClipboardList className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-lg font-bold leading-none">DIGIX</h1>
          <p className="text-xs text-muted-foreground">Asset Management</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href.split("?")[0]));
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
