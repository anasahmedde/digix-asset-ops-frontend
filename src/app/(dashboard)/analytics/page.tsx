"use client";

import { useCallback, useEffect, useState } from "react";

import {
  BarChart3,
  HardDrive,
  Ticket,
  Shield,
  PackageOpen,
  ShoppingCart,
  Receipt,
  Wrench,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import api from "@/lib/api";
import { formatCurrency } from "@/lib/currency";

interface DeviceStatusMap {
  [status: string]: number;
}

interface TicketStatusMap {
  open: number;
  in_progress: number;
  resolved: number;
  closed: number;
  [key: string]: number;
}

interface OrderStatusMap {
  [status: string]: number;
}

interface AnalyticsData {
  devices: { total: number; byStatus: DeviceStatusMap };
  tickets: { total: number; byStatus: TicketStatusMap };
  schedules: { total: number; overdue: number };
  inventory: { totalItems: number; totalQuantity: number; lowStockCount: number };
  orders: { total: number; byStatus: OrderStatusMap };
  invoices: { total: number; totalReceivable: number; totalPayable: number; totalPaid: number };
  warranties: { active: number; expired: number };
}

const initialData: AnalyticsData = {
  devices: { total: 0, byStatus: {} },
  tickets: { total: 0, byStatus: { open: 0, in_progress: 0, resolved: 0, closed: 0 } },
  schedules: { total: 0, overdue: 0 },
  inventory: { totalItems: 0, totalQuantity: 0, lowStockCount: 0 },
  orders: { total: 0, byStatus: {} },
  invoices: { total: 0, totalReceivable: 0, totalPayable: 0, totalPaid: 0 },
  warranties: { active: 0, expired: 0 },
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500",
  inactive: "bg-gray-400",
  maintenance: "bg-amber-500",
  decommissioned: "bg-red-500",
  in_storage: "bg-blue-400",
  deployed: "bg-teal-500",
  open: "bg-blue-500",
  in_progress: "bg-amber-500",
  resolved: "bg-emerald-500",
  closed: "bg-gray-400",
  draft: "bg-gray-400",
  submitted: "bg-blue-500",
  approved: "bg-emerald-500",
  rejected: "bg-red-500",
  ordered: "bg-indigo-500",
  received: "bg-teal-500",
  cancelled: "bg-red-400",
  partially_received: "bg-amber-400",
  pending: "bg-amber-500",
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[status.toLowerCase()] ?? "bg-gray-400";
}

function formatLabel(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function countByField<T extends Record<string, unknown>>(items: T[], field: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) {
    const key = String(item[field] ?? "unknown");
    map[key] = (map[key] || 0) + 1;
  }
  return map;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData>(initialData);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [devices, tickets, schedules, inventory, orders, invoices, warranties] =
        await Promise.allSettled([
          api.get("/assets/devices/", { params: { page_size: 1000 } }),
          api.get("/tickets/", { params: { page_size: 1000 } }),
          api.get("/maintenance/schedules/", { params: { page_size: 1000 } }),
          api.get("/inventory/items/", { params: { page_size: 1000 } }),
          api.get("/procurement/orders/", { params: { page_size: 1000 } }),
          api.get("/finance/invoices/", { params: { page_size: 1000 } }),
          api.get("/warranties/", { params: { page_size: 1000 } }),
        ]);

      const deviceList = devices.status === "fulfilled"
        ? (devices.value.data.results ?? devices.value.data) : [];
      const ticketList = tickets.status === "fulfilled"
        ? (tickets.value.data.results ?? tickets.value.data) : [];
      const scheduleList = schedules.status === "fulfilled"
        ? (schedules.value.data.results ?? schedules.value.data) : [];
      const inventoryList = inventory.status === "fulfilled"
        ? (inventory.value.data.results ?? inventory.value.data) : [];
      const orderList = orders.status === "fulfilled"
        ? (orders.value.data.results ?? orders.value.data) : [];
      const invoiceList = invoices.status === "fulfilled"
        ? (invoices.value.data.results ?? invoices.value.data) : [];
      const warrantyList = warranties.status === "fulfilled"
        ? (warranties.value.data.results ?? warranties.value.data) : [];

      const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

      const dList = arr(deviceList) as Record<string, unknown>[];
      const tList = arr(ticketList) as Record<string, unknown>[];
      const sList = arr(scheduleList) as Record<string, unknown>[];
      const iList = arr(inventoryList) as Record<string, unknown>[];
      const oList = arr(orderList) as Record<string, unknown>[];
      const invList = arr(invoiceList) as Record<string, unknown>[];
      const wList = arr(warrantyList) as Record<string, unknown>[];

      const today = new Date().toISOString().split("T")[0];
      const overdueSchedules = sList.filter(
        (s) => s.next_due && String(s.next_due) < today
      ).length;

      const totalQuantity = iList.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0), 0
      );
      const lowStockCount = iList.filter((item) => item.is_low_stock === true).length;

      const totalReceivable = invList
        .filter((inv) => String(inv.invoice_type) === "receivable")
        .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
      const totalPayable = invList
        .filter((inv) => String(inv.invoice_type) === "payable")
        .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);
      const totalPaid = invList
        .filter((inv) => String(inv.status) === "paid")
        .reduce((sum, inv) => sum + (Number(inv.total_amount) || 0), 0);

      const activeWarranties = wList.filter((w) => String(w.status) === "active").length;
      const expiredWarranties = wList.filter((w) => String(w.status) === "expired").length;

      const ticketStatuses = countByField(tList, "status") as TicketStatusMap;

      setData({
        devices: { total: dList.length, byStatus: countByField(dList, "status") },
        tickets: {
          total: tList.length,
          byStatus: {
            open: ticketStatuses.open || 0,
            in_progress: ticketStatuses.in_progress || 0,
            resolved: ticketStatuses.resolved || 0,
            closed: ticketStatuses.closed || 0,
          },
        },
        schedules: { total: sList.length, overdue: overdueSchedules },
        inventory: { totalItems: iList.length, totalQuantity, lowStockCount },
        orders: { total: oList.length, byStatus: countByField(oList, "status") },
        invoices: { total: invList.length, totalReceivable, totalPayable, totalPaid },
        warranties: { active: activeWarranties, expired: expiredWarranties },
      });
    } catch {
      toast.error("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openTickets = data.tickets.byStatus.open + data.tickets.byStatus.in_progress;

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600">
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-sm text-gray-500">Platform overview and key metrics</p>
        </div>
      </div>

      {/* Top stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-gray-900">{data.devices.total.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">Total Devices</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600">
              <HardDrive className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-gray-900">{openTickets.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">Open Tickets</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
              <Ticket className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-gray-900">{data.warranties.active.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">Active Warranties</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-600">
              <Shield className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-gray-900">{data.inventory.lowStockCount.toLocaleString()}</p>
              <p className="text-sm text-gray-500 mt-1">Low Stock Items</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600">
              <PackageOpen className="h-6 w-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Device Status Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Device Status Breakdown</h2>
          <div className="space-y-3">
            {Object.entries(data.devices.byStatus).length === 0 ? (
              <p className="text-sm text-gray-400">No device data</p>
            ) : (
              Object.entries(data.devices.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${getStatusColor(status)}`} />
                    <span className="text-sm text-gray-700">{formatLabel(status)}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ticket Status Breakdown */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Ticket Status Breakdown</h2>
          <div className="space-y-3">
            {Object.entries(data.tickets.byStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${getStatusColor(status)}`} />
                  <span className="text-sm text-gray-700">{formatLabel(status)}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Purchase Orders */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Purchase Orders</h2>
          <div className="space-y-3">
            {Object.entries(data.orders.byStatus).length === 0 ? (
              <p className="text-sm text-gray-400">No order data</p>
            ) : (
              Object.entries(data.orders.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${getStatusColor(status)}`} />
                    <span className="text-sm text-gray-700">{formatLabel(status)}</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{count}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Financial & Maintenance row */}
      <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
        {/* Financial Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="h-5 w-5 text-indigo-500" />
            <h2 className="text-base font-semibold text-gray-900">Financial Summary</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Total Receivable</span>
              <span className="text-lg font-semibold text-emerald-600">
                {formatCurrency(data.invoices.totalReceivable)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Total Payable</span>
              <span className="text-lg font-semibold text-red-500">
                {formatCurrency(data.invoices.totalPayable)}
              </span>
            </div>
            <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">Total Paid</span>
              <span className="text-lg font-semibold text-gray-900">
                {formatCurrency(data.invoices.totalPaid)}
              </span>
            </div>
          </div>
        </div>

        {/* Maintenance Overview */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="h-5 w-5 text-amber-500" />
            <h2 className="text-base font-semibold text-gray-900">Maintenance Overview</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Total Schedules</span>
              <span className="text-lg font-semibold text-gray-900">
                {data.schedules.total.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Overdue</span>
              <span className={`text-lg font-semibold ${data.schedules.overdue > 0 ? "text-red-500" : "text-gray-900"}`}>
                {data.schedules.overdue.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
