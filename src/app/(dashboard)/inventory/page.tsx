"use client";

import { Download, Info, Package, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { IssuanceLog } from "@/components/inventory/issuance-log";
import { IssuanceRequests } from "@/components/inventory/issuance-requests";
import { LowStock } from "@/components/inventory/low-stock";
import { PriceApprovals } from "@/components/procurement/price-approvals";
import { PendingInspection } from "@/components/inventory/pending-inspection";
import { ReceivingLog } from "@/components/inventory/receiving-log";
import { UniqueItems } from "@/components/inventory/unique-items";
import { StockPlace, StockStatus, money, tdClass, tdCode, tdNum, thClass, thNum } from "@/components/inventory/stock-table";
import { CopyButton } from "@/components/ui/copy-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Modal } from "@/components/ui/modal";
import { Qty } from "@/components/ui/qty";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import { confirmAction } from "@/components/ui/confirm";
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
  unit: string | null;
  unit_cost: string | null;
  notes: string;
  is_low_stock: boolean;
  created_at: string;
}
interface Ref { id: string; name: string }
/** A unit of measure as maintained under Setup. */
interface UnitRef { id: string; name: string; symbol: string; is_active: boolean }
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
const LOCATION_LABELS: Record<string, string> = { warehouse: "Warehouse", in_transit: "In Transit" };

export default function InventoryPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("inventory");

  const [items, setItems] = useState<InventoryItem[]>([]);
  const sort = useSortState();
  const [categories, setCategories] = useState<Ref[]>([]);
  const [materialTypes, setMaterialTypes] = useState<Ref[]>([]);
  const [units, setUnits] = useState<UnitRef[]>([]);
  const [sites, setSites] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemModal, setItemModal] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  // The unit picked in the form, so Opening Stock and Unit Cost can say what they count.
  const [unitChoice, setUnitChoice] = useState("piece");
  // Where a line's stock came from — asked for on demand, not shown in the list.
  const [detailsFor, setDetailsFor] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ location: "", category: "", lowStock: "" });
  const [search, setSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  // The Add button for the unique tab lives in the page header with the
  // generic one; the tab opens its dialog when this ticks.
  const [uniqueOpenTick, setUniqueOpenTick] = useState(0);
  // Two kinds of inventory: generic stock tracked by quantity, and unique
  // (serialized) units tracked one row per physical item.
  const [tab, setTab] = useState<
    "generic" | "unique" | "low_stock" | "inspection" | "receiving_log" | "requests" | "issuance"
  >("generic");
  // A notification lands on the tab it is about.
  const params = useSearchParams();
  useEffect(() => {
    const t = params.get("tab");
    if (t && ["generic", "unique", "low_stock", "inspection", "receiving_log", "requests", "issuance"].includes(t)) {
      setTab(t as typeof tab);
    }
  }, [params]);
  const [pendingCount, setPendingCount] = useState(0);
  // Components at or below their reorder level with no request raised yet.
  const [lowCount, setLowCount] = useState(0);
  const refreshLowCount = useCallback(async () => {
    try {
      const { data } = await api.get("/inventory/low-stock/");
      setLowCount(data.unrequested ?? 0);
    } catch {
      /* the badge is a nicety — never block the page on it */
    }
  }, []);
  useEffect(() => { refreshLowCount(); }, [refreshLowCount]);

  async function exportExcel() {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterValues.location) params.location = filterValues.location;
      if (filterValues.category) params.category = filterValues.category;
      if (filterValues.lowStock === "low") params.low_stock = "true";
      else if (filterValues.lowStock === "ok") params.low_stock = "false";
      const path = tab === "unique" ? "/inventory/units/export/" : "/inventory/items/export/";
      const res = await api.get(path, { params: tab === "unique" ? {} : params, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tab === "unique" ? "unique-components" : "generic-components"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
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
    api.get("/setup/units/", { params: { is_active: true, page_size: 200 } }).then((r) => setUnits(r.data.results ?? r.data)).catch(() => {});
    // The collection is /sites/sites/ — /sites/ is the router root, and the
    // object it returns has no rows to map over.
    api.get("/sites/sites/", { params: { page_size: 1000 } }).then((r) => setSites(r.data.results ?? r.data)).catch(() => {});
  }, [fetchItems]);

  function closeItemModal() { setItemModal(null); setSelected(null); }

  function openItemModal(mode: "create" | "edit", item: InventoryItem | null) {
    setSelected(item);
    setUnitChoice(item?.unit ?? "piece");
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
    const componentName = String(fd.get("component_name") || "").trim();
    const unit = String(fd.get("unit") || "piece").trim() || "piece";
    const categoryId = String(fd.get("category") || "");
    if (!componentName) {
      toast.error("Give the component a name.");
      setSaving(false);
      return;
    }
    // The component definition lives in Setup (Components). Reuse it by name;
    // open it if it is new, so the stock row always points at a definition.
    let materialTypeId = materialTypes.find((m) => m.name.trim().toLowerCase() === componentName.toLowerCase())?.id ?? null;
    try {
      if (!materialTypeId) {
        const { data } = await api.post("/assets/material-types/", {
          name: componentName, category: categoryId || null, unit,
        });
        materialTypeId = data.id;
        setMaterialTypes((prev) => [...prev, { id: data.id, name: data.name }]);
      } else {
        await api.patch(`/assets/material-types/${materialTypeId}/`, { category: categoryId || null, unit });
      }
    } catch (err) {
      toast.error(getApiError(err, "Could not save the component definition"));
      setSaving(false);
      return;
    }
    const payload = {
      material_type: materialTypeId,
      category: categoryId || null,
      quantity: Number(fd.get("quantity")),
      min_stock_level: Number(fd.get("min_stock_level")),
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


  async function handleDelete(item: InventoryItem) {
    if (!(await confirmAction(`Delete item "${item.sku}"? This cannot be undone.`))) return;
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
        {(tab === "generic" || tab === "unique") && (
          <div className="flex items-center gap-2">
            <button onClick={exportExcel} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60">
              <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
            </button>
            {canEdit && (
              <button
                onClick={() => (tab === "unique" ? setUniqueOpenTick((t) => t + 1) : openItemModal("create", null))}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all"
              >
                <Plus className="h-4 w-4" /> {tab === "unique" ? "Add Unique Component" : "Add Generic Component"}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          { key: "generic", label: "Generic Components" },
          { key: "unique", label: "Unique Components" },
          { key: "low_stock", label: "Low Stock" },
          { key: "inspection", label: "Receiving" },
          { key: "receiving_log", label: "Receiving Log" },
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
            {t.key === "low_stock" && lowCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-2xs font-semibold text-red-600">
                {lowCount}
              </span>
            )}
            {t.key === "inspection" && pendingCount > 0 && (
              <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-2xs font-semibold text-amber-600 ring-1 ring-amber-500/20">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "unique" && <UniqueItems openTick={uniqueOpenTick} />}

      {tab === "requests" && <IssuanceRequests onIssued={fetchItems} />}

      {tab === "issuance" && <IssuanceLog />}
      {tab === "low_stock" && (
        <div className="space-y-6">
          {/* A reorder the store raised, coming back priced over the last
              purchase. The store owns that figure, so the store agrees it. */}
          <PriceApprovals showWhenEmpty={false} />
          <LowStock onChanged={refreshLowCount} />
        </div>
      )}
      {tab === "receiving_log" && <ReceivingLog />}

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
        searchPlaceholder="Search by code, name, category…"
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No generic components</h3>
          <p className="mt-2 text-sm text-muted-foreground">{items.length > 0 ? "Try adjusting your filters." : "Add one to start tracking stock."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <SortTh sort={sort} k="sku" className={thClass}>Code</SortTh>
                  <SortTh sort={sort} k="material_name" className={thClass}>Component</SortTh>
                  <SortTh sort={sort} k="category_name" className={thClass}>Category</SortTh>
                  <SortTh sort={sort} k="storage_location" className={thClass}>Storage Location</SortTh>
                  <SortTh sort={sort} k="quantity" className={thNum}>On Hand</SortTh>
                  <SortTh sort={sort} k="min_stock_level" className={thNum}>Reorder Level</SortTh>
                  <SortTh sort={sort} k="unit_cost" className={thNum}>Unit Cost (PKR)</SortTh>
                  <SortTh sort={sort} k="stock" className={thClass}>Status</SortTh>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortRows(filtered, sort, { stock: (i) => (i.quantity <= 0 ? 0 : i.quantity <= i.min_stock_level ? 1 : 2) }).map((item) => (
                  // A click views the line, as it does on unique components;
                  // changing it is the pencil's job.
                  <tr key={item.id} onClick={() => openDetails(item)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={tdCode}>
                      <span className="inline-flex items-center gap-1">
                        {item.sku}
                        <CopyButton text={item.sku} label="component code" />
                      </span>
                    </td>
                    <td className={`${tdClass} font-medium text-foreground`}>{item.material_name || "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{item.category_name || "—"}</td>
                    <td className={tdClass}>
                      <StockPlace
                        places={item.storage_location ? [item.storage_location] : []}
                        note={LOCATION_LABELS[item.location] ?? item.location}
                      />
                    </td>
                    <td className={`${tdNum} font-semibold text-foreground`}><Qty value={item.quantity} unit={item.unit} /></td>
                    <td className={`${tdNum} text-muted-foreground`}>{item.min_stock_level}</td>
                    <td className={`${tdNum} text-muted-foreground`}>{money(item.unit_cost)}</td>
                    <td className={tdClass}><StockStatus onHand={item.quantity} reorderAt={item.min_stock_level} /></td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {/* Where this stock came from — open to everyone who can see the line. */}
                        <button onClick={() => openDetails(item)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Details">
                          <Info className="h-3.5 w-3.5" />
                        </button>
                        {canEdit && (
                          <>
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
      <Modal
        open={itemModal !== null}
        onClose={closeItemModal}
        title={itemModal === "create" ? "Add Generic Component" : "Edit Generic Component"}
        size="lg"
      >
            <form onSubmit={handleItemSubmit} className="space-y-4">
              {itemModal === "edit" && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Component Code</label>
                  <p className="flex h-10 items-center rounded-lg border border-border bg-secondary/40 px-3 font-mono text-sm text-foreground">{selected?.sku}</p>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="component_name" className={labelClass}>Component Name *</label>
                  <input
                    id="component_name"
                    name="component_name"
                    list="component-names"
                    required
                    defaultValue={selected?.material_name ?? ""}
                    className={inputClass}
                    placeholder="e.g. HDMI Cable 5m"
                  />
                  <datalist id="component-names">
                    {materialTypes.map((m) => <option key={m.id} value={m.name} />)}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="unit" className={labelClass}>Unit of Measure</label>
                  <select id="unit" name="unit" value={unitChoice} onChange={(e) => setUnitChoice(e.target.value)} className={inputClass}>
                    {/* The units opened under Setup; a legacy unit on an existing component stays selectable. */}
                    {units.map((u) => <option key={u.id} value={u.name}>{u.name}{u.symbol ? ` (${u.symbol})` : ""}</option>)}
                    {unitChoice && !units.some((u) => u.name === unitChoice) && <option value={unitChoice}>{unitChoice}</option>}
                  </select>
                  <p className="text-2xs text-muted-foreground">Units are maintained under Setup › Units of Measure.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="category" className={labelClass}>Category</label>
                <select key={categories.length} id="category" name="category" defaultValue={selected?.category ?? ""} className={inputClass}>
                  <option value="">Select a category…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <p className="text-2xs text-muted-foreground">Categories are maintained under Setup.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="quantity" className={labelClass}>{itemModal === "create" ? "Opening Stock" : "Quantity on Hand"}</label>
                  <input id="quantity" name="quantity" type="number" min={0} defaultValue={selected?.quantity ?? 0} className={inputClass} placeholder="0" />
                  <p className="text-2xs text-muted-foreground">
                    {itemModal === "create"
                      ? `What is on hand today, in ${unitChoice}. From here stock moves only through receipts, issues and returns.`
                      : `Counted in ${unitChoice}.`}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="min_stock_level" className={labelClass}>Min Stock Level</label>
                  <input id="min_stock_level" name="min_stock_level" type="number" min={0} defaultValue={selected?.min_stock_level ?? 5} className={inputClass} />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="unit_cost" className={labelClass}>Unit Cost (rate per {unitChoice})</label>
                  <input id="unit_cost" name="unit_cost" type="number" step="0.01" min={0} defaultValue={selected?.unit_cost ?? ""} className={inputClass} placeholder="0.00" />
                  <p className="text-2xs text-muted-foreground">The component&apos;s rate for BOQs and budgets until a purchase sets a newer price.</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="storage_location" className={labelClass}>Storage location</label>
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
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">{saving ? "Saving..." : itemModal === "create" ? "Add Component" : "Save Changes"}</button>
              </div>
            </form>
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
                          {m.movement_type === "in" ? "Received" : m.movement_type === "out" ? "Issued" : m.movement_type === "opening" ? "Opening stock" : m.movement_type}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">{m.quantity}</td>
                        <td className="px-3 py-2">
                          {m.po_number || m.grn_number ? (
                            <span>
                              <span className="font-mono text-foreground">{m.po_number ?? m.grn_number}</span>
                              {m.supplier_name && (
                                <span className="block text-2xs text-muted-foreground">{m.supplier_name}</span>
                              )}
                              {m.po_number && m.grn_number && (
                                <span className="block text-2xs text-muted-foreground">GRN {m.grn_number}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {m.movement_type === "opening" ? (m.notes || "Opening balance") : (m.reference || "Entered by hand")}
                            </span>
                          )}
                          {m.batch_number && (
                            <span className="block text-2xs text-muted-foreground">Batch {m.batch_number}</span>
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
