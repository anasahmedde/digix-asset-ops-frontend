"use client";

import { Package, Pencil, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface InventoryItem {
  id: string;
  material_type: string;
  material_name: string | null;
  sku: string;
  quantity: number;
  min_stock_level: number;
  location: string;
  site: string | null;
  site_name: string | null;
  unit_cost: string | null;
  notes: string;
  is_low_stock: boolean;
  created_at: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors";
const labelClass = "text-xs font-medium text-gray-600";
const thClass =
  "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400";
const tdClass = "px-5 py-3.5";

const LOCATION_BADGES: Record<string, string> = {
  warehouse: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  site: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  in_transit: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
};

const LOCATION_LABELS: Record<string, string> = {
  warehouse: "Warehouse",
  site: "On Site",
  in_transit: "In Transit",
};

const TABS = [
  { key: "all", label: "All Items", href: "/inventory" },
  { key: "warehouse", label: "Warehouse", href: "/inventory?tab=warehouse" },
  { key: "spares", label: "Spares (On Site)", href: "/inventory?tab=spares" },
] as const;

export default function InventoryPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("inventory");
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "all";

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ location: "", lowStock: "" });
  const [search, setSearch] = useState("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/inventory/items/";
      if (activeTab === "warehouse") url += "?location=warehouse";
      else if (activeTab === "spares") url += "?location=site";
      const { data } = await api.get(url);
      setItems(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load inventory"));
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      sku: fd.get("sku"),
      material_type: fd.get("material_type"),
      quantity: Number(fd.get("quantity")),
      min_stock_level: Number(fd.get("min_stock_level")),
      location: fd.get("location"),
      unit_cost: fd.get("unit_cost") || null,
      notes: fd.get("notes"),
    };
    try {
      if (modalMode === "create") {
        await api.post("/inventory/items/", payload);
        toast.success("Item created");
      } else if (selected) {
        await api.patch(`/inventory/items/${selected.id}/`, payload);
        toast.success("Item updated");
      }
      closeModal();
      fetchItems();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save item"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: InventoryItem) {
    if (!confirm(`Delete item "${item.sku}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/inventory/items/${item.id}/`);
      toast.success("Item deleted");
      fetchItems();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — item may have linked records"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
            <p className="text-gray-500">
              Manage stock levels across warehouse and sites
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setSelected(null);
              setModalMode("create");
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30"
          >
            <Plus className="h-4 w-4" /> Add Item
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-teal-50 text-teal-700"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <FilterBar
        filters={[
          { key: "location", label: "Location", options: Object.entries(LOCATION_LABELS).map(([v, l]) => ({ value: v, label: l })) },
          { key: "lowStock", label: "Stock Level", options: [{ value: "low", label: "Low Stock" }, { value: "ok", label: "OK" }] },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by SKU, material..."
      />

      {(() => {
        const filtered = items.filter((item) => {
          if (filterValues.location && item.location !== filterValues.location) return false;
          if (filterValues.lowStock === "low" && !item.is_low_stock) return false;
          if (filterValues.lowStock === "ok" && item.is_low_stock) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!item.sku.toLowerCase().includes(q) && !(item.material_name || "").toLowerCase().includes(q) && !item.material_type.toLowerCase().includes(q) && !(item.site_name || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No items found</h3>
          <p className="mt-2 text-sm text-gray-500">{items.length > 0 ? "Try adjusting your filters." : "Add items to start tracking your stock levels."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={thClass}>SKU</th>
                  <th className={thClass}>Material</th>
                  <th className={thClass}>Location</th>
                  <th className={thClass}>Quantity</th>
                  <th className={thClass}>Min Stock</th>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Unit Cost</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => { setSelected(item); setModalMode("edit"); }}
                    className="border-b border-gray-200 cursor-pointer transition-colors hover:bg-teal-50/40"
                  >
                    <td className={`${tdClass} font-medium text-gray-900`}>
                      {item.sku}
                    </td>
                    <td className={`${tdClass} text-gray-600`}>
                      {item.material_name || item.material_type}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                          LOCATION_BADGES[item.location] ??
                          "bg-gray-500/10 text-gray-600 ring-gray-500/20"
                        }`}
                      >
                        {LOCATION_LABELS[item.location] ?? item.location}
                      </span>
                    </td>
                    <td
                      className={`${tdClass} font-medium ${
                        item.is_low_stock ? "text-red-600" : "text-gray-900"
                      }`}
                    >
                      {item.quantity}
                    </td>
                    <td className={`${tdClass} text-gray-600`}>
                      {item.min_stock_level}
                    </td>
                    <td className={`${tdClass} text-gray-600`}>
                      {item.site_name || item.site || "-"}
                    </td>
                    <td className={`${tdClass} text-gray-600`}>
                      {item.unit_cost ? `$${item.unit_cost}` : "-"}
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setSelected(item); setModalMode("edit"); }}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-400"
                            title="Delete"
                          >
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
              <h2 className="text-lg font-semibold text-gray-900">
                {modalMode === "create" ? "Add New Item" : "Edit Item"}
              </h2>
              <button
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="sku" className={labelClass}>
                    SKU
                  </label>
                  <input
                    id="sku"
                    name="sku"
                    required
                    defaultValue={selected?.sku ?? ""}
                    className={inputClass}
                    placeholder="e.g. INV-001"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="material_type" className={labelClass}>
                    Material Type
                  </label>
                  <input
                    id="material_type"
                    name="material_type"
                    defaultValue={selected?.material_type ?? ""}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="quantity" className={labelClass}>
                    Quantity
                  </label>
                  <input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min={0}
                    defaultValue={selected?.quantity ?? 0}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="min_stock_level" className={labelClass}>
                    Min Stock Level
                  </label>
                  <input
                    id="min_stock_level"
                    name="min_stock_level"
                    type="number"
                    min={0}
                    defaultValue={selected?.min_stock_level ?? 0}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="location" className={labelClass}>
                    Location
                  </label>
                  <select
                    id="location"
                    name="location"
                    defaultValue={selected?.location ?? "warehouse"}
                    className={inputClass}
                  >
                    <option value="warehouse">Warehouse</option>
                    <option value="site">On Site</option>
                    <option value="in_transit">In Transit</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="unit_cost" className={labelClass}>
                    Unit Cost
                  </label>
                  <input
                    id="unit_cost"
                    name="unit_cost"
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={selected?.unit_cost ?? ""}
                    className={inputClass}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="notes" className={labelClass}>
                  Notes
                </label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={2}
                  defaultValue={selected?.notes ?? ""}
                  className={`${inputClass} h-auto py-2`}
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-transparent px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : modalMode === "create"
                      ? "Create Item"
                      : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
