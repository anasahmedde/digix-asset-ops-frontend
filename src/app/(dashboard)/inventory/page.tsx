"use client";

import { ArrowDownToLine, ArrowUpFromLine, Download, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/ui/copy-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface InventoryItem {
  id: string;
  material_type: string;
  material_name: string | null;
  category: string | null;
  category_name: string | null;
  sku: string;
  quantity: number;
  min_stock_level: number;
  location: string;
  unit_cost: string | null;
  notes: string;
  is_low_stock: boolean;
  created_at: string;
}
interface Ref { id: string; name: string }

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const LOCATION_BADGES: Record<string, string> = {
  warehouse: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  in_transit: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
};
const LOCATION_LABELS: Record<string, string> = { warehouse: "Warehouse", in_transit: "In Transit" };

export default function InventoryPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("inventory");

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [materialTypes, setMaterialTypes] = useState<Ref[]>([]);
  const [sites, setSites] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemModal, setItemModal] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [stockModal, setStockModal] = useState<{ type: "receive" | "issue"; item: InventoryItem } | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ location: "", category: "", lowStock: "" });
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);

  async function exportExcel() {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterValues.location) params.location = filterValues.location;
      if (filterValues.category) params.category = filterValues.category;
      if (filterValues.lowStock === "low") params.low_stock = "true";
      else if (filterValues.lowStock === "ok") params.low_stock = "false";
      const res = await api.get("/inventory/items/export/", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inventory-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiError(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  }

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/items/");
      setItems(data.results ?? data);
    } catch (err) {
      toast.error(getApiError(err, "Failed to load inventory"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    api.get("/inventory/categories/").then((r) => setCategories(r.data.results ?? r.data)).catch(() => {});
    api.get("/assets/material-types/").then((r) => setMaterialTypes(r.data.results ?? r.data)).catch(() => {});
    api.get("/sites/").then((r) => setSites(r.data.results ?? r.data)).catch(() => {});
  }, [fetchItems]);

  function closeItemModal() { setItemModal(null); setSelected(null); }

  async function handleItemSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      material_type: fd.get("material_type"),
      category: fd.get("category") || null,
      quantity: Number(fd.get("quantity")),
      min_stock_level: Number(fd.get("min_stock_level")),
      location: fd.get("location"),
      unit_cost: fd.get("unit_cost") || null,
      notes: fd.get("notes"),
    };
    try {
      if (itemModal === "create") {
        await api.post("/inventory/items/", payload);
        toast.success("Item created");
      } else if (selected) {
        await api.patch(`/inventory/items/${selected.id}/`, payload);
        toast.success("Item updated");
      }
      closeItemModal();
      fetchItems();
    } catch (err) {
      toast.error(getApiError(err, "Failed to save item"));
    } finally {
      setSaving(false);
    }
  }

  async function handleStockSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stockModal) return;
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const qty = Number(fd.get("quantity"));
    try {
      if (stockModal.type === "receive") {
        await api.post("/inventory/receipts/", { item: stockModal.item.id, quantity: qty, reference: fd.get("reference") || "" });
        toast.success(`Received ${qty} into stock`);
      } else {
        await api.post("/inventory/issuances/", {
          item: stockModal.item.id, quantity: qty,
          issued_to_site: fd.get("issued_to_site") || null,
          reason: fd.get("reason") || "",
        });
        toast.success(`Issued ${qty} from stock`);
      }
      setStockModal(null);
      fetchItems();
    } catch (err) {
      toast.error(getApiError(err, "Stock movement failed"));
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
    } catch (err) {
      toast.error(getApiError(err, "Cannot delete — item may have linked records"));
    }
  }

  const filtered = useMemo(() => items.filter((item) => {
    if (filterValues.location && item.location !== filterValues.location) return false;
    if (filterValues.category && item.category !== filterValues.category) return false;
    if (filterValues.lowStock === "low" && !item.is_low_stock) return false;
    if (filterValues.lowStock === "ok" && item.is_low_stock) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!item.sku.toLowerCase().includes(q) && !(item.material_name || "").toLowerCase().includes(q) && !(item.category_name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [items, filterValues, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600">
            <Package className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Inventory</h1>
            <p className="text-muted-foreground">Warehouse stock — receive against work orders, issue to sites</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportExcel} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60">
            <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
          </button>
          {canEdit && (
            <button onClick={() => { setSelected(null); setItemModal("create"); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
              <Plus className="h-4 w-4" /> Add Item
            </button>
          )}
        </div>
      </div>

      <FilterBar
        filters={[
          { key: "location", label: "Location", options: Object.entries(LOCATION_LABELS).map(([v, l]) => ({ value: v, label: l })) },
          { key: "category", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })) },
          { key: "lowStock", label: "Stock Level", options: [{ value: "low", label: "Low Stock" }, { value: "ok", label: "OK" }] },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by SKU, material, category..."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No items found</h3>
          <p className="mt-2 text-sm text-muted-foreground">{items.length > 0 ? "Try adjusting your filters." : "Add items to start tracking stock."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>SKU</th>
                  <th className={thClass}>Material</th>
                  <th className={thClass}>Category</th>
                  <th className={thClass}>Location</th>
                  <th className={thClass}>Quantity</th>
                  <th className={thClass}>Min</th>
                  <th className={thClass}>Unit Cost</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} onClick={() => { setSelected(item); setItemModal("edit"); }} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-mono text-foreground`}>
                      <span className="inline-flex items-center gap-1">
                        {item.sku}
                        <CopyButton text={item.sku} label="SKU" />
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{item.material_name || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{item.category_name || "-"}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${LOCATION_BADGES[item.location] ?? "text-muted-foreground ring-gray-500/20"}`}>
                        {LOCATION_LABELS[item.location] ?? item.location}
                      </span>
                    </td>
                    <td className={`${tdClass} font-medium ${item.is_low_stock ? "text-red-600" : "text-foreground"}`}>{item.quantity}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{item.min_stock_level}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{item.unit_cost ? item.unit_cost : "-"}</td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setStockModal({ type: "receive", item })} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600" title="Receive stock">
                            <ArrowDownToLine className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => setStockModal({ type: "issue", item })} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-600" title="Issue stock">
                            <ArrowUpFromLine className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => { setSelected(item); setItemModal("edit"); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(item)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / edit item */}
      {itemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{itemModal === "create" ? "Add New Item" : "Edit Item"}</h2>
              <button onClick={closeItemModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleItemSubmit} className="space-y-4">
              {itemModal === "edit" && (
                <div className="space-y-1.5">
                  <label className={labelClass}>SKU (auto-generated)</label>
                  <p className="flex h-10 items-center rounded-lg border border-border bg-secondary/40 px-3 font-mono text-sm text-foreground">{selected?.sku}</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="material_type" className={labelClass}>Material Type</label>
                  <select id="material_type" name="material_type" required defaultValue={selected?.material_type ?? ""} className={inputClass}>
                    <option value="">Select…</option>
                    {materialTypes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="category" className={labelClass}>Category</label>
                  <select id="category" name="category" defaultValue={selected?.category ?? ""} className={inputClass}>
                    <option value="">—</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="quantity" className={labelClass}>Quantity</label>
                  <input id="quantity" name="quantity" type="number" min={0} defaultValue={selected?.quantity ?? 0} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="min_stock_level" className={labelClass}>Min Stock Level</label>
                  <input id="min_stock_level" name="min_stock_level" type="number" min={0} defaultValue={selected?.min_stock_level ?? 5} className={inputClass} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="location" className={labelClass}>Location</label>
                  <select id="location" name="location" defaultValue={selected?.location ?? "warehouse"} className={inputClass}>
                    <option value="warehouse">Warehouse</option>
                    <option value="in_transit">In Transit</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="unit_cost" className={labelClass}>Unit Cost</label>
                  <input id="unit_cost" name="unit_cost" type="number" step="0.01" min={0} defaultValue={selected?.unit_cost ?? ""} className={inputClass} placeholder="0.00" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="notes" className={labelClass}>Notes</label>
                <textarea id="notes" name="notes" rows={2} defaultValue={selected?.notes ?? ""} className={`${inputClass} h-auto py-2`} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeItemModal} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">{saving ? "Saving..." : itemModal === "create" ? "Create Item" : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receive / issue stock */}
      <Modal open={stockModal !== null} onClose={() => setStockModal(null)} title={stockModal?.type === "receive" ? "Receive Stock" : "Issue Stock"} size="sm">
        {stockModal && (
          <form onSubmit={handleStockSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {stockModal.item.material_name} <span className="font-mono">({stockModal.item.sku})</span> · in stock: <strong className="text-foreground">{stockModal.item.quantity}</strong>
            </p>
            <div className="space-y-1.5">
              <label htmlFor="quantity" className={labelClass}>Quantity</label>
              <input id="quantity" name="quantity" type="number" min={1} max={stockModal.type === "issue" ? stockModal.item.quantity : undefined} required className={inputClass} />
            </div>
            {stockModal.type === "receive" ? (
              <div className="space-y-1.5">
                <label htmlFor="reference" className={labelClass}>Reference (e.g. WO / GRN)</label>
                <input id="reference" name="reference" className={inputClass} />
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="issued_to_site" className={labelClass}>Issue to Site</label>
                  <select id="issued_to_site" name="issued_to_site" className={inputClass}>
                    <option value="">—</option>
                    {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="reason" className={labelClass}>Reason</label>
                  <input id="reason" name="reason" className={inputClass} placeholder="e.g. site installation" />
                </div>
              </>
            )}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setStockModal(null)} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
              <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">{saving ? "Saving..." : stockModal.type === "receive" ? "Receive" : "Issue"}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
