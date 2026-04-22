"use client";

import {
  AlertTriangle,
  Building2,
  CreditCard,
  HardDrive,
  MapPin,
  Package,
  Shield,
  Ticket,
  TrendingUp,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import api from "@/lib/api";
import { getCurrentUser, type User } from "@/lib/auth";
import { formatCurrency } from "@/lib/currency";

interface DashboardData {
  devices: number;
  sites: number;
  users: number;
  clients: number;
  suppliers: number;
  openTickets: number;
  underMaintenance: number;
  overdueTickets: number;
  activeWarranties: number;
  lowStockItems: number;
  totalReceivable: number;
  totalPayable: number;
  recentTickets: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    site_name: string | null;
    assigned_to_name: string | null;
    created_at: string;
  }>;
  deviceStatuses: Array<{ status: string; count: number }>;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-gray-100 text-gray-600",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  on_hold: "bg-gray-100 text-gray-600",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-slate-100 text-slate-600",
};

const DEVICE_STATUS_COLORS: Record<string, string> = {
  active: "#10b981",
  installed: "#06b6d4",
  in_stock: "#6366f1",
  under_maintenance: "#f59e0b",
  procured: "#8b5cf6",
  assigned: "#3b82f6",
  decommissioned: "#94a3b8",
  in_transit: "#ec4899",
};

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<DashboardData>({
    devices: 0, sites: 0, users: 0, clients: 0, suppliers: 0,
    openTickets: 0, underMaintenance: 0, overdueTickets: 0,
    activeWarranties: 0, lowStockItems: 0,
    totalReceivable: 0, totalPayable: 0,
    recentTickets: [], deviceStatuses: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [
          devicesRes, sitesRes, usersRes, clientsRes, suppliersRes,
          ticketsRes, openTicketsRes, allOpenTicketsRes, maintenanceRes, warrantiesRes,
          inventoryRes, receivableRes, payableRes, deviceStatusRes,
        ] = await Promise.allSettled([
          api.get("/assets/devices/", { params: { page_size: 1 } }),
          api.get("/sites/sites/", { params: { page_size: 1 } }),
          api.get("/accounts/users/", { params: { page_size: 1 } }),
          api.get("/clients/", { params: { page_size: 1 } }),
          api.get("/suppliers/", { params: { page_size: 1 } }),
          api.get("/tickets/", { params: { page_size: 5, ordering: "-created_at" } }),
          api.get("/tickets/", { params: { page_size: 1, status: "open" } }),
          api.get("/tickets/", { params: { page_size: 200 } }),
          api.get("/assets/devices/", { params: { page_size: 1, status: "under_maintenance" } }),
          api.get("/warranties/", { params: { page_size: 1, status: "active" } }),
          api.get("/inventory/items/", { params: { page_size: 200 } }),
          api.get("/finance/invoices/", { params: { invoice_type: "receivable", page_size: 200 } }),
          api.get("/finance/invoices/", { params: { invoice_type: "payable", page_size: 200 } }),
          api.get("/assets/devices/status_summary/"),
        ]);

        const count = (r: PromiseSettledResult<{ data: { count?: number } }>) =>
          r.status === "fulfilled" ? (r.value.data?.count ?? 0) : 0;

        const recentTickets = ticketsRes.status === "fulfilled" ? ticketsRes.value.data.results ?? [] : [];
        const allTickets = allOpenTicketsRes.status === "fulfilled" ? allOpenTicketsRes.value.data.results ?? [] : [];
        const overdueCount = allTickets.filter((t: { due_date: string | null; status: string }) =>
          t.due_date && new Date(t.due_date) < new Date() && !["resolved", "closed"].includes(t.status)
        ).length;

        const invItems = inventoryRes.status === "fulfilled" ? (inventoryRes.value.data.results ?? []) : [];
        const lowStock = invItems.filter((i: { is_low_stock: boolean }) => i.is_low_stock).length;

        const recInvoices = receivableRes.status === "fulfilled" ? (receivableRes.value.data.results ?? []) : [];
        const payInvoices = payableRes.status === "fulfilled" ? (payableRes.value.data.results ?? []) : [];
        const totalRec = recInvoices.reduce((sum: number, inv: { balance_due: string }) => sum + parseFloat(inv.balance_due || "0"), 0);
        const totalPay = payInvoices.reduce((sum: number, inv: { balance_due: string }) => sum + parseFloat(inv.balance_due || "0"), 0);

        const deviceStatuses = deviceStatusRes.status === "fulfilled" ? deviceStatusRes.value.data : [];

        setData({
          devices: count(devicesRes as PromiseSettledResult<{ data: { count: number } }>),
          sites: count(sitesRes as PromiseSettledResult<{ data: { count: number } }>),
          users: count(usersRes as PromiseSettledResult<{ data: { count: number } }>),
          clients: count(clientsRes as PromiseSettledResult<{ data: { count: number } }>),
          suppliers: count(suppliersRes as PromiseSettledResult<{ data: { count: number } }>),
          openTickets: openTicketsRes.status === "fulfilled" ? openTicketsRes.value.data.count : 0,
          underMaintenance: maintenanceRes.status === "fulfilled" ? maintenanceRes.value.data.count : 0,
          overdueTickets: overdueCount,
          activeWarranties: warrantiesRes.status === "fulfilled" ? warrantiesRes.value.data.count : 0,
          lowStockItems: lowStock,
          totalReceivable: totalRec,
          totalPayable: totalPay,
          recentTickets: recentTickets.slice(0, 5),
          deviceStatuses,
        });
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const topCards = [
    { label: "Total Devices", value: data.devices, icon: HardDrive, gradient: "from-teal-500 to-emerald-600", href: "/assets" },
    { label: "Active Sites", value: data.sites, icon: MapPin, gradient: "from-blue-500 to-cyan-600", href: "/sites" },
    { label: "Team Members", value: data.users, icon: Users, gradient: "from-indigo-500 to-purple-600", href: "/teams" },
    { label: "Clients", value: data.clients, icon: Building2, gradient: "from-orange-500 to-amber-600", href: "/clients" },
  ];

  const secondaryCards = [
    { label: "Open Tickets", value: data.openTickets, icon: Ticket, color: "text-amber-500", href: "/tickets" },
    { label: "Under Maintenance", value: data.underMaintenance, icon: Wrench, color: "text-rose-500", href: "/maintenance" },
    { label: "Active Warranties", value: data.activeWarranties, icon: Shield, color: "text-emerald-500", href: "/warranties" },
    { label: "Low Stock Items", value: data.lowStockItems, icon: Package, color: "text-indigo-500", href: "/inventory" },
  ];

  const financeCards = [
    { label: "Receivable", value: data.totalReceivable, icon: TrendingUp, color: "border-l-emerald-500 text-emerald-600", href: "/finance" },
    { label: "Payable", value: data.totalPayable, icon: CreditCard, color: "border-l-red-500 text-red-500", href: "/finance" },
    { label: "Overdue Tickets", value: data.overdueTickets, icon: AlertTriangle, color: "border-l-amber-500 text-amber-500", href: "/tickets" },
    { label: "Suppliers", value: data.suppliers, icon: Truck, color: "border-l-cyan-500 text-cyan-600", href: "/suppliers" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back, {user?.first_name || "Admin"}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {topCards.map((card) => (
          <Link key={card.label} href={card.href} className="stat-card group block">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500">{card.label}</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {loading ? <span className="inline-block h-7 w-16 animate-pulse rounded bg-gray-100" /> : card.value.toLocaleString()}
                </p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${card.gradient} shadow-lg`}>
                <card.icon className="h-5 w-5 text-white" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {secondaryCards.map((card) => (
          <Link key={card.label} href={card.href} className="stat-card block">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">{card.label}</p>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="mt-2 text-2xl font-bold text-gray-900">
              {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-gray-100" /> : card.value}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {financeCards.map((card) => (
          <Link key={card.label} href={card.href} className={`block rounded-xl border border-gray-200 bg-white p-5 shadow-sm border-l-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-gray-300 ${card.color.split(" ")[0]}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">{card.label}</p>
              <card.icon className={`h-4 w-4 ${card.color.split(" ")[1]}`} />
            </div>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {loading ? (
                <span className="inline-block h-6 w-20 animate-pulse rounded bg-gray-100" />
              ) : typeof card.value === "number" && card.label !== "Overdue Tickets" && card.label !== "Suppliers" ? (
                formatCurrency(card.value)
              ) : (
                card.value
              )}
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Recent Tickets</h2>
            <Link href="/tickets" className="rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-600 hover:bg-teal-100 transition-colors">
              View All
            </Link>
          </div>
          {data.recentTickets.length > 0 ? (
            <div className="mt-4 space-y-3">
              {data.recentTickets.map((t) => (
                <Link key={t.id} href="/tickets" className="flex items-center justify-between rounded-lg border border-gray-100 p-3 cursor-pointer transition-all hover:border-gray-200 hover:bg-gray-50/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{t.title}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {t.site_name || "No site"} {t.assigned_to_name ? `· ${t.assigned_to_name}` : ""}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_COLORS[t.priority] || "bg-gray-100 text-gray-600"}`}>
                      {t.priority}
                    </span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[t.status] || "bg-gray-100 text-gray-600"}`}>
                      {t.status.replace("_", " ")}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
              <Ticket className="h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">No tickets yet</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">Device Status</h2>
            <Link href="/assets" className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-100 transition-colors">
              View All
            </Link>
          </div>
          {data.deviceStatuses.length > 0 ? (
            <div className="mt-4 space-y-1">
              {data.deviceStatuses.map((s: { status: string; count: number }) => (
                <Link key={s.status} href="/assets" className="flex items-center justify-between rounded-lg px-2 py-2 cursor-pointer transition-all hover:bg-gray-50">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: DEVICE_STATUS_COLORS[s.status] || "#94a3b8" }} />
                    <span className="text-sm capitalize text-gray-600">{s.status.replace("_", " ")}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{s.count}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
              <HardDrive className="h-10 w-10 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">No devices registered</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
