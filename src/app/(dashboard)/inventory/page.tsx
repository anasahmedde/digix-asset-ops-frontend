"use client";

import { ArrowDownToLine, ArrowUpFromLine, Download, Info, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { IssuanceLog } from "@/components/inventory/issuance-log";
import { IssuanceRequests } from "@/components/inventory/issuance-requests";
import { PendingInspection } from "@/components/inventory/pending-inspection";
import { UniqueItems } from "@/components/inventory/unique-items";
import { CopyButton } from "@/components/ui/copy-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Modal } from "@/components/ui/modal";
import { SelectOrCreate } from "@/components/ui/select-or-create";
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
  storage_location: string;
  unit_cost: string | null;
  notes: string;
  is_low_stock: boolean;
  created_at: string;
}
interface Ref { id: string; name: string }
/** One in/out against a stock line, with the delivery it arrived on. */
interface StockMovement {
  id: string;
  movement_type: string;
  quantity: number;
  reference: string;
  notes: string;
  batch_number: string;
  grn_number: string | null;
  po_number: string | null;
  supplier_name: string | null;
  performed_by_name: string | null;
  created_at: string;
}

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
  // Where a line's stock came from — asked for on demand, not shown in the list.
  const [detailsFor, setDetailsFor] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ location: "", category: "", lowStock: "" });
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  // Two kinds of inventory: generic stock tracked by quantity, and unique
  // (serialized) units tracked one row per physical item.
  const [tab, setTab] = useState<
    "generic" | "unique" | "inspection" | "requests" | "issuance"
  >("generic");
  const [pendingCount, setPendingCount] = useState(0);
  const [formMaterial, setFormMaterial] = useState("");
  const [formCategory, setFormCategory] = useState("");

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

  const refreshPendingCount = useCallback(async () => {
    try {
      const { data } = await api.get("/inventory/receipt-lines/", {
        params: { inspection_status: "pending", page_size: 1 },
      });
      setPendingCount(data.count ?? (data.results ?? data).length ?? 0);
    } catch {
      /* the badge is a nicety — never block the page on it */
    }
  }, []);

  useEffect(() => { refreshPendingCount(); }, [refreshPendingCount]);

  useEffect(() => {
    fetchItems();
    api.get("/inventory/categories/").then((r) => setCategories(r.data.results ?? r.data)).catch(() => {});
    api.get("/assets/material-types/").then((r) => setMaterialTypes(r.data.results ?? r.data)).catch(() => {});
    // The collection is /sites/sites/ — /sites/ is the router root, and the
    // object it returns has no rows to map over.
    api.get("/sites/sites/", { params: { page_size: 1000 } }).then((r) => setSites(r.data.results ?? r.data)).catch(() => {});
  }, [fetchItems]);

  function closeItemModal() { setItemModal(null); setSelected(null); }

  function openItemModal(mode: "create" | "edit", item: InventoryItem | null) {
    setSelected(item);
    setFormMaterial(item?.material_type ?? "");
    setFormCategory(item?.category ?? "");
    setItemModal(mode);
  }

  async function openDetails(item: InventoryItem) {
    setDetailsFor(item);
    setMovements([]);
    setMovementsLoading(true);
    try {
      const { data } = await api.get("/inventory/movements/", {
        params: { item: item.id, page_size: 200, ordering: "-created_at" },
      });
      const rows: StockMovement[] = data.results ?? data;
      setMovements([...rows].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (err) {
      toast.error(getApiError(err, "Could not load the stock history"));
    } finally {
      setMovementsLoading(false);
    }
  }

  async function handleItemSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      material_type: formMaterial || null,
      category: formCategory || null,
      quantity: Number(fd.get("quantity")),
      min_stock_level: Number(fd.get("min_stock_level")),
      location: fd.get("location"),
      storage_location: fd.get("storage_location"),
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
        {tab === "generic" && (
          <div className="flex items-center gap-2">
            <button onClick={exportExcel} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60">
              <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
            </button>
            {canEdit && (
              <button onClick={() => openItemModal("create", null)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
                <Plus className="h-4 w-4" /> Add Item
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          { key: "generic", label: "Generic Items" },
          { key: "unique", label: "Unique Items" },
          { key: "inspection", label: "Pending Inspection" },
          { key: "requests", label: "Issue Requests" },
          { key: "issuance", label: "Issuance Log" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.key === "inspection" && pendingCount > 0 && (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 ring-1 ring-amber-500/20">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "unique" && <UniqueItems />}

      {tab === "requests" && <IssuanceRequests onIssued={fetchItems} />}

      {tab === "issuance" && <IssuanceLog />}

      {tab === "inspection" && (
        <PendingInspection
          onStocked={() => { refreshPendingCount(); fetchItems(); }}
        />
      )}

      {tab === "generic" && (
      <>
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
        searchPlaceholder="Search by item code, material, category..."
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
                  <th className={thClass}>Item Code</th>
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
                  <tr key={item.id} onClick={() => openItemModal("edit", item)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-mono text-foreground`}>
                      <span className="inline-flex items-center gap-1">
                        {item.sku}
                        <CopyButton text={item.sku} label="item code" />
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
                      <div className="flex items-center gap-1">
                        {/* Where this stock came from — open to everyone who can see the line. */}
                        <button onClick={() => openDetails(item)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Details">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                        {canEdit && (
                          <>
                            <button onClick={() => setStockModal({ type: "receive", item })} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600" title="Receive stock">
                              <ArrowDownToLine className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setStockModal({ type: "issue", item })} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-amber-500/10 hover:text-amber-600" title="Issue stock">
                              <ArrowUpFromLine className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => openItemModal("edit", item)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDelete(item)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {/* Add / edit item */}
      {itemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="max-h-[88vh] overflow-y-auto w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{itemModal === "create" ? "Add New Item" : "Edit Item"}</h2>
              <button onClick={closeItemModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleItemSubmit} className="space-y-4">
              {itemModal === "edit" && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Item Code (auto-generated)</label>
                  <p className="flex h-10 items-center rounded-lg border border-border bg-secondary/40 px-3 font-mono text-sm text-foreground">{selected?.sku}</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectOrCreate
                  id="material_type"
                  label="Material Type"
                  required
                  emptyLabel="Select…"
                  value={formMaterial}
                  onChange={setFormMaterial}
                  options={materialTypes}
                  onCreated={(created) => setMaterialTypes((prev) => [...prev, created])}
                  endpoint="/assets/material-types/"
                  extraCreateFields={{ unit: "piece" }}
                  createPlaceholder="e.g. HDMI Cable 5m"
                />
                <SelectOrCreate
                  id="category"
                  label="Category"
                  value={formCategory}
                  onChange={setFormCategory}
                  options={categories}
                  onCreated={(created) => setCategories((prev) => [...prev, created])}
                  endpoint="/inventory/categories/"
                  createPlaceholder="e.g. Consumables"
                />
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
                <label htmlFor="storage_location" className={labelClass}>Placed At</label>
                <input
                  id="storage_location"
                  name="storage_location"
                  defaultValue={selected?.storage_location ?? ""}
                  className={inputClass}
                  placeholder="Where it is put, e.g. Rack A3"
                />
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

      {/* Where the stock came from: every receipt and issue against this line */}
      <Modal
        open={detailsFor !== null}
        onClose={() => setDetailsFor(null)}
        title={detailsFor ? `${detailsFor.material_name ?? "Item"} — stock history` : "Stock history"}
      >
        {detailsFor && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-mono text-foreground">{detailsFor.sku}</span> · in stock{" "}
              <strong className="text-foreground">{detailsFor.quantity}</strong>
              {detailsFor.category_name ? ` · ${detailsFor.category_name}` : ""}
            </p>
            {movementsLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              </div>
            ) : movements.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No movements recorded against this line yet.
              </p>
            ) : (
              <div className="max-h-96 overflow-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary/80 backdrop-blur">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Movement</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Source</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">
                          {new Date(m.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2 text-foreground">
                          {m.movement_type === "in" ? "Received" : m.movement_type === "out" ? "Issued" : m.movement_type}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">{m.quantity}</td>
                        <td className="px-3 py-2">
                          {m.po_number || m.grn_number ? (
                            <span>
                              <span className="font-mono text-foreground">{m.po_number ?? m.grn_number}</span>
                              {m.supplier_name && (
                                <span className="block text-[11px] text-muted-foreground">{m.supplier_name}</span>
                              )}
                              {m.po_number && m.grn_number && (
                                <span className="block text-[11px] text-muted-foreground">GRN {m.grn_number}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {m.reference || "Entered by hand"}
                            </span>
                          )}
                          {m.batch_number && (
                            <span className="block text-[11px] text-muted-foreground">Batch {m.batch_number}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{m.performed_by_name ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
