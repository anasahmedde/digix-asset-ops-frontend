"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
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

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
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

/** The menu in the order the Administrator set: pages by address, top to
 *  bottom. A page the saved order does not name yet goes after the rest. */
function arrange(items: NavItem[], order: string[]): NavItem[] {
  // ponytail: a new module lands at the bottom until the order is saved again.
  const rank = (item: NavItem, n: number) => {
    const at = order.indexOf(item.href);
    return at >= 0 ? at : order.length + n;
  };
  return items.map((item, n) => ({ item, r: rank(item, n) })).sort((a, b) => a.r - b.r).map((x) => x.item);
}

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, mobileOpen, closeMobile, goHome } = useSidebar();
  const { theme, setTheme } = useTheme();
  const { totalUnread } = useChatUnread();
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  // The rail unfolds while the pointer (or keyboard focus) is on it. Pinned
  // open, or open as a drawer on a phone, it stays unfolded.
  const [hovered, setHovered] = useState(false);
  const { can } = useUser();
  // The order of the modules: the same for everyone, arranged by the
  // Administrator with the up and down arrows.
  const [order, setOrder] = useState<string[]>([]);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const arranging = draft !== null;
  const mayArrange = can("manage_setup");
  useEffect(() => {
    api.get("/accounts/menu-order/").then((r) => setOrder(r.data.order ?? [])).catch(() => {});
  }, []);
  const open = !collapsed || hovered || mobileOpen || arranging;

  // The menu reads the same rule as the server: a capability. Rights are
  // editable per role and per person, so a menu that read role names went
  // stale the moment somebody's were adjusted.
  const show = (item: NavItem) => !item.capability || can(item.capability);

  const visibleNav = arrange(navigation, draft ?? order)
    .filter(show)
    .map((item) => (item.children ? { ...item, children: item.children.filter(show) } : item))
    .map((item) =>
      item.name === "Chat" ? { ...item, badge: totalUnread } : item
    );

  /** One place up or down among the modules this person sees. */
  function move(href: string, by: -1 | 1) {
    setDraft((d) => {
      const all = arrange(navigation, d ?? order).map((i) => i.href);
      const seen = arrange(navigation, d ?? order).filter(show).map((i) => i.href);
      const other = seen[seen.indexOf(href) + by];
      if (!other) return d;
      const a = all.indexOf(href);
      const b = all.indexOf(other);
      [all[a], all[b]] = [all[b], all[a]];
      return all;
    });
  }

  async function saveOrder(next: string[]) {
    setSaving(true);
    try {
      const { data } = await api.put("/accounts/menu-order/", { order: next });
      setOrder(data.order ?? []);
      setDraft(null);
      toast.success(next.length ? "Menu order saved" : "Menu back to the default order");
    } catch (err) {
      toast.error(getApiError(err, "Could not save the menu order"));
    } finally {
      setSaving(false);
    }
  }

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

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(false); }}
      className={cn(
        "glass-pane fixed bottom-3 left-3 top-3 z-50 flex flex-col overflow-hidden rounded-2xl border shadow-float",
        "transition-[width,transform] duration-200 ease-out",
        // A drawer on phones, full width; a rail on desktop that unfolds over the page.
        "max-lg:w-64",
        open ? "lg:w-64" : "lg:w-[72px]",
        // Off-canvas on mobile unless opened; always visible on desktop.
        mobileOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]",
        "lg:translate-x-0"
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-center px-4">
        {/* The wordmark, centred: dark ink on the light theme, the light
            original on dark. Folded to a rail, its D stands in for it. */}
        {!open ? (
          <>
            <Image src="/branding/digix-d-dark.png" alt="DIGIX" width={114} height={133} priority className="h-6 w-auto dark:hidden" />
            <Image src="/branding/digix-d-light.png" alt="DIGIX" width={114} height={133} priority className="hidden h-6 w-auto dark:block" />
          </>
        ) : (
          <>
            <Image src="/branding/digix-dark.png" alt="DIGIX" width={553} height={133} priority className="h-6 w-auto dark:hidden" />
            <Image src="/branding/digix-light.png" alt="DIGIX" width={553} height={133} priority className="hidden h-6 w-auto dark:block" />
          </>
        )}
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {arranging ? (
          <ul className="space-y-0.5" aria-label="Arrange the menu">
            {visibleNav.map((item, i) => (
              <li key={item.name} className="flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-sidebar-foreground ring-1 ring-border/60">
                <item.icon className="h-[18px] w-[18px] shrink-0" />
                <span className="flex-1 truncate">{item.name}</span>
                <button type="button" onClick={() => move(item.href, -1)} disabled={i === 0}
                  title={`Move ${item.name} up`} aria-label={`Move ${item.name} up`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(item.href, 1)} disabled={i === visibleNav.length - 1}
                  title={`Move ${item.name} down`} aria-label={`Move ${item.name} down`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
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
                      title={open ? undefined : item.name}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                        childActive
                          ? "text-primary"
                          : "text-sidebar-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {open && (
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
                    {isExpanded && open && (
                      <ul className="mt-0.5 space-y-0.5 pl-4">
                        {item.children!.map((child) => {
                          const childIsActive = checkActive(child.href);
                          return (
                            <li key={child.name}>
                              <Link
                                href={child.href}
                                onClick={closeMobile}
                                className={cn(
                                  "flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-medium transition-all duration-150",
                                  childIsActive
                                    ? "bg-primary text-primary-foreground shadow-glow"
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
                    title={open ? undefined : item.name}
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                      // The section you are in is a filled pill; the rest wait quietly.
                      isActive
                        ? "bg-primary text-primary-foreground shadow-glow"
                        : "text-sidebar-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" />
                    {open ? (
                      <>
                        <span className="flex-1 whitespace-nowrap">{item.name}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className={cn(
                            "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-2xs font-bold",
                            isActive ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground",
                          )}>
                            {item.badge > 99 ? "99+" : item.badge}
                          </span>
                        )}
                      </>
                    ) : (
                      item.badge !== undefined && item.badge > 0 && (
                        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" />
                      )
                    )}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        )}
      </nav>

      <div className="shrink-0 space-y-1 border-t border-border/60 p-3">
        {arranging ? (
          <>
            <p className="px-3 pb-1 text-2xs text-muted-foreground">The same order for everyone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDraft(null)} disabled={saving}
                className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-border hover:bg-secondary">
                Cancel
              </button>
              <button onClick={() => saveOrder(draft ?? [])} disabled={saving}
                className="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                {saving ? "Saving…" : "Save order"}
              </button>
            </div>
            {order.length > 0 && (
              <button onClick={() => saveOrder([])} disabled={saving}
                className="w-full rounded-xl px-3 py-1.5 text-2xs font-medium text-muted-foreground hover:text-foreground">
                Reset to the default order
              </button>
            )}
          </>
        ) : mayArrange && (
          <button
            onClick={() => setDraft(arrange(navigation, order).map((i) => i.href))}
            title={open ? undefined : "Arrange menu"}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowUpDown className="h-[18px] w-[18px] shrink-0" />
            {open && <span className="whitespace-nowrap">Arrange menu</span>}
          </button>
        )}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          title={open ? undefined : "Theme"}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {theme === "dark" ? (
            <Sun className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <Moon className="h-[18px] w-[18px] shrink-0" />
          )}
          {open && <span className="whitespace-nowrap">{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
          {open && (
            <ChevronRight className="ml-auto h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </aside>
  );
}
