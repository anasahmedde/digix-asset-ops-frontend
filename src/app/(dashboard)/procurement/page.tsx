"use client";

import { Pencil, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatCurrency } from "@/lib/currency";
import { useUser } from "@/lib/user-context";

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier: string;
  supplier_name: string | null;
  status: string;
  order_date: string | null;
  expected_delivery: string | null;
  total_amount: string;
  notes: string;
  ordered_by_name: string | null;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unit_price: string;
    received_quantity: number;
    line_total: string;
  }>;
  created_at: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors";
const labelClass = "text-xs font-medium text-gray-600";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400";
const tdClass = "px-5 py-3.5";

const STATUS_BADGES: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 ring-gray-500/20",
  pending_approval: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
  approved: "bg-blue-500/10 text-blue-500 ring-blue-500/20",
  ordered: "bg-indigo-500/10 text-indigo-500 ring-indigo-500/20",
  partially_received: "bg-purple-500/10 text-purple-500 ring-purple-500/20",
  received: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 ring-red-500/20",
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProcurementPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("procurement");
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "" });
  const [search, setSearch] = useState("");

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/procurement/orders/");
      setOrders(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load purchase orders"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      po_number: fd.get("po_number"),
      supplier: fd.get("supplier"),
      status: fd.get("status"),
      order_date: fd.get("order_date") || null,
      expected_delivery: fd.get("expected_delivery") || null,
      notes: fd.get("notes"),
    };
    try {
      if (modalMode === "create") {
        await api.post("/procurement/orders/", payload);
        toast.success("Purchase order created");
      } else if (selected) {
        await api.patch(`/procurement/orders/${selected.id}/`, payload);
        toast.success("Purchase order updated");
      }
      closeModal();
      fetchOrders();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save purchase order"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(po: PurchaseOrder) {
    if (!confirm(`Delete PO "${po.po_number}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/procurement/orders/${po.id}/`);
      toast.success("Purchase order deleted");
      fetchOrders();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — purchase order may have linked records"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600">
            <ShoppingCart className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Procurement</h1>
            <p className="text-gray-500">Manage purchase orders and vendor procurement</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={() => { setSelected(null); setModalMode("create"); }} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30">
            <Plus className="h-4 w-4" /> Add Purchase Order
          </button>
        )}
      </div>

      <FilterBar
        filters={[
          { key: "status", label: "Status", options: Object.keys(STATUS_BADGES).map((s) => ({ value: s, label: statusLabel(s) })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by PO#, supplier..."
      />

      {(() => {
        const filtered = orders.filter((po) => {
          if (filterValues.status && po.status !== filterValues.status) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!po.po_number.toLowerCase().includes(q) && !(po.supplier_name || "").toLowerCase().includes(q) && !(po.ordered_by_name || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No orders found</h3>
          <p className="mt-2 text-sm text-gray-500">{orders.length > 0 ? "Try adjusting your filters." : "Create a purchase order to start managing procurement."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={thClass}>PO Number</th>
                  <th className={thClass}>Supplier</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Order Date</th>
                  <th className={thClass}>Expected Delivery</th>
                  <th className={thClass}>Total Amount</th>
                  <th className={thClass}>Ordered By</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((po) => (
                  <tr key={po.id} onClick={() => { setSelected(po); setModalMode("edit"); }} className="border-b border-gray-200 cursor-pointer transition-colors hover:bg-teal-50/40">
                    <td className={`${tdClass} font-medium text-gray-900`}>{po.po_number}</td>
                    <td className={`${tdClass} text-gray-600`}>{po.supplier_name || po.supplier || "-"}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGES[po.status] ?? "bg-gray-500/10 text-gray-500 ring-gray-500/20"}`}>
                        {statusLabel(po.status)}
                      </span>
                    </td>
                    <td className={`${tdClass} text-gray-600`}>{po.order_date || "-"}</td>
                    <td className={`${tdClass} text-gray-600`}>{po.expected_delivery || "-"}</td>
                    <td className={`${tdClass} font-medium text-gray-900`}>{formatCurrency(po.total_amount)}</td>
                    <td className={`${tdClass} text-gray-600`}>{po.ordered_by_name || "-"}</td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSelected(po); setModalMode("edit"); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(po)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-400" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
      })()}

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{modalMode === "create" ? "Add New Purchase Order" : "Edit Purchase Order"}</h2>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="po_number" className={labelClass}>PO Number</label>
                  <input id="po_number" name="po_number" required defaultValue={selected?.po_number ?? ""} className={inputClass} placeholder="e.g. PO-001" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="status" className={labelClass}>Status</label>
                  <select id="status" name="status" defaultValue={selected?.status ?? "draft"} className={inputClass}>
                    <option value="draft">Draft</option>
                    <option value="pending_approval">Pending Approval</option>
                    <option value="approved">Approved</option>
                    <option value="ordered">Ordered</option>
                    <option value="partially_received">Partially Received</option>
                    <option value="received">Received</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="supplier" className={labelClass}>Supplier</label>
                <input id="supplier" name="supplier" defaultValue={selected?.supplier ?? ""} className={inputClass} placeholder="Supplier name or ID" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="order_date" className={labelClass}>Order Date</label>
                  <input id="order_date" name="order_date" type="date" defaultValue={selected?.order_date ?? ""} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="expected_delivery" className={labelClass}>Expected Delivery</label>
                  <input id="expected_delivery" name="expected_delivery" type="date" defaultValue={selected?.expected_delivery ?? ""} className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="notes" className={labelClass}>Notes</label>
                <textarea id="notes" name="notes" rows={3} defaultValue={selected?.notes ?? ""} className={`${inputClass} h-auto py-2`} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-transparent px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Create Order" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
