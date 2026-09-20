"use client";

import { ChevronDown, ChevronRight, Fingerprint, Pencil, Plus, Trash2, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/ui/copy-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Modal } from "@/components/ui/modal";
import { Qty } from "@/components/ui/qty";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

/** A unique product as opened in inventory — details now, serials later. */
export interface UniqueProduct {
  id: string;
  type_code: string;
  name: string;
  material_type: string | null;
  material_name: string | null;
  category: string | null;
  category_name: string | null;
  brand: string | null;
  brand_name: string | null;
  model_name: string;
  specifications: Record<string, string>;
  unit: string;
  unit_cost: string | null;
  min_stock_level: number;
  /** Counted in the dashboard's in-hand stock figure (chosen on the dashboard). */
  is_high_value: boolean;
  default_has_warranty: boolean;
  default_warranty_type: string;
  default_warranty_months: number | null;
  supplier: string | null;
  supplier_name: string | null;
  in_stock_count: number;
  notes: string;
  is_active: boolean;
}

interface UnitRow {
  id: string;
  unit_code: string;
  serial_number: string;
  status: string;
  batch_number: string;
  grn_number: string | null;
  po_number: string | null;
  supplier_name: string | null;
  warranty_state: "none" | "active" | "expired";
  warranty_end: string | null;
  /** Free text on the unit; opening-stock units carry "Opening stock." */
  notes?: string;
}
interface Ref { id: string; name: string }
/** A unit of measure as maintained under Setup. */
interface UnitRef { id: string; name: string; symbol: string; is_active: boolean }
interface SpecRow { key: string; value: string }

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const STATUS_LABELS: Record<string, string> = {
  in_stock: "In Stock", reserved: "Reserved", issued: "Issued", returned: "Returned",
  damaged: "Damaged", scrapped: "Scrapped", converted: "Registered as Asset",
};
const WARRANTY_BADGES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  expired: "bg-red-500/10 text-red-600 ring-red-500/20",
  none: "bg-secondary text-muted-foreground ring-border",
};
export function UniqueItems() {
  const { canWrite } = useUser();
  const canEdit = canWrite("inventory");

  const [products, setProducts] = useState<UniqueProduct[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [brands, setBrands] = useState<Ref[]>([]);
  const [uoms, setUoms] = useState<UnitRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState<"open" | "edit" | null>(null);
  const [selected, setSelected] = useState<UniqueProduct | null>(null);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  // Opening stock: how many units are on the shelf, and the serial of each.
  const [openingQty, setOpeningQty] = useState(0);
  const [openingSerials, setOpeningSerials] = useState<string[]>([]);
  useEffect(() => {
    if (modal === "open") { setOpeningQty(0); setOpeningSerials([]); }
  }, [modal]);
  const trimmedSerials = openingSerials.map((sn) => sn.trim());
  const serialsEntered = trimmedSerials.filter(Boolean).length;
  const serialsRepeated = new Set(trimmedSerials.filter(Boolean).map((sn) => sn.toLowerCase())).size !== serialsEntered;
  // Stock on the shelf needs every serial before the item can be opened.
  const openingBlocked = modal === "open" && openingQty > 0 && (serialsEntered < openingQty || serialsRepeated);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [units, setUnits] = useState<Record<string, UnitRow[]>>({});
  // A serial is text until its pencil is clicked; nothing changes by accident.
  const [editingSerial, setEditingSerial] = useState<string | null>(null);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ stock: "", category: "" });
  const [search, setSearch] = useState("");

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/products/", { params: { page_size: 500 } });
      setProducts(data.results ?? data);
    } catch (err) {
      toast.error(getApiError(err, "Failed to load unique products"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    api.get("/inventory/categories/").then((r) => setCategories(r.data.results ?? r.data)).catch(() => {});
    api.get("/assets/brands/").then((r) => setBrands(r.data.results ?? r.data)).catch(() => {});
    api.get("/setup/units/", { params: { is_active: true, page_size: 200 } }).then((r) => setUoms(r.data.results ?? r.data)).catch(() => {});
  }, [fetchProducts]);

  async function toggleUnits(productId: string) {
    if (expanded === productId) { setExpanded(null); return; }
    setExpanded(productId);
    if (units[productId]) return;
    try {
      const { data } = await api.get(`/inventory/products/${productId}/units/`, {
        // The shelf only. A unit that has been issued left the store; the
        // Issuance Log says where it went and who took it.
        params: { page_size: 200, in_store: 1 },
      });
      setUnits((prev) => ({ ...prev, [productId]: data.results ?? data }));
    } catch (err) {
      toast.error(getApiError(err, "Failed to load serials"));
    }
  }

  function openNew() {
    setSelected(null);
    setSpecs([{ key: "", value: "" }]);
    setModal("open");
  }
  async function saveSerial(productId: string, unit: UnitRow, value: string) {
    const next = value.trim();
    if (!next || next === unit.serial_number) return;
    try {
      await api.patch(`/inventory/units/${unit.id}/`, { serial_number: next });
      setUnits((current) => ({
        ...current,
        [productId]: (current[productId] ?? []).map((row) =>
          row.id === unit.id ? { ...row, serial_number: next } : row),
      }));
      toast.success("Serial number updated");
    } catch (err) {
      toast.error(getApiError(err, "Could not update the serial number"));
    }
  }

  function openEdit(product: UniqueProduct) {
    setSelected(product);
    const entries = Object.entries(product.specifications ?? {});
    setSpecs(entries.length ? entries.map(([key, value]) => ({ key, value: String(value) })) : [{ key: "", value: "" }]);
    setModal("edit");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const specifications: Record<string, string> = {};
    specs.forEach((s) => { if (s.key.trim()) specifications[s.key.trim()] = s.value; });

    const payload: Record<string, unknown> = {
      name: fd.get("name"),
      category: fd.get("category") || null,
      brand: fd.get("brand") || null,
      model_name: fd.get("model_name") || "",
      unit: fd.get("unit") || "piece",
      unit_cost: fd.get("unit_cost") || null,
      min_stock_level: Number(fd.get("min_stock_level") || 0),
      // Only meaningful on the way in; the API ignores it on an edit.
      ...(selected ? {} : { opening_quantity: openingQty, opening_serials: trimmedSerials }),
      specifications,
      notes: fd.get("notes") || "",
    };
    try {
      if (modal === "open") {
        await api.post("/inventory/products/", payload);
        toast.success(openingQty > 0 ? `Unique item opened with ${openingQty} unit${openingQty === 1 ? "" : "s"} on the shelf` : "Unique item opened — stock starts at zero");
      } else if (selected) {
        await api.patch(`/inventory/products/${selected.id}/`, payload);
        toast.success("Product updated");
      }
      setModal(null);
      fetchProducts();
    } catch (err) {
      toast.error(getApiError(err, "Failed to save the product"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: UniqueProduct) {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/inventory/products/${product.id}/`);
      toast.success("Product deleted");
      fetchProducts();
    } catch (err) {
      toast.error(getApiError(err, "Cannot delete — units may already be registered"));
    }
  }

  const filtered = useMemo(() => products.filter((p) => {
    if (filterValues.category && p.category !== filterValues.category) return false;
    if (filterValues.stock === "in_stock" && p.in_stock_count === 0) return false;
    if (filterValues.stock === "empty" && p.in_stock_count > 0) return false;
    if (filterValues.stock === "low" && p.in_stock_count > p.min_stock_level) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = [p.type_code, p.name, p.model_name, p.brand_name ?? "", p.material_name ?? ""];
      if (!hay.some((v) => v.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [products, filterValues, search]);

  const totalUnits = products.reduce((sum, p) => sum + p.in_stock_count, 0);
  const awaitingStock = products.filter((p) => p.in_stock_count === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Unique products are opened here with their technical details — empty, with serials arriving at
          goods inspection, or with the stock already on the shelf and a serial typed for each unit.
        </p>
        {canEdit && (
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all"
          >
            <Plus className="h-4 w-4" /> Open Unique Component
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Products Opened", value: products.length },
          { label: "Units In Stock", value: totalUnits },
          { label: "Awaiting Stock", value: awaitingStock },
          { label: "Below Min Level", value: products.filter((p) => p.in_stock_count <= p.min_stock_level && p.min_stock_level > 0).length },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{tile.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{tile.value}</p>
          </div>
        ))}
      </div>

      <FilterBar
        filters={[
          {
            key: "stock", label: "Stock",
            options: [
              { value: "in_stock", label: "Has stock" },
              { value: "empty", label: "No stock yet" },
              { value: "low", label: "At/below min" },
            ],
          },
          { key: "category", label: "Category", options: categories.map((c) => ({ value: c.id, label: c.name })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by code, name, make or model…"
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Fingerprint className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No unique products</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {products.length > 0 ? "Try adjusting your filters." : "Open a unique component to define what it is, before any stock arrives."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass} />
                  <th className={thClass}>Code</th>
                  <th className={thClass}>Component</th>
                  <th className={thClass}>Make / Model</th>
                  <th className={thClass}>On Hand</th>
                  <th className={thClass}>Unit Cost</th>
                  {canEdit && <th className={thClass}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <Fragment key={p.id}>
                    <tr
                      onClick={() => toggleUnits(p.id)}
                      className="cursor-pointer border-b border-border transition-colors hover:bg-secondary/30"
                    >
                      <td className="pl-4 text-muted-foreground">
                        {expanded === p.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className={`${tdClass} font-mono text-foreground`}>
                        <span className="inline-flex items-center gap-1">
                          {p.type_code}
                          <CopyButton text={p.type_code} label="Component code" />
                        </span>
                      </td>
                      <td className={`${tdClass} font-medium text-foreground`}>{p.name}</td>
                      <td className={`${tdClass} text-muted-foreground`}>
                        {[p.brand_name, p.model_name].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className={tdClass}>
                        <span className={`font-semibold ${p.in_stock_count === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                          <Qty value={p.in_stock_count} unit={p.unit} />
                        </span>
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>{p.unit_cost ?? "—"}</td>
                      {canEdit && (
                        <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEdit(p)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(p)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {expanded === p.id && (
                      <tr className="border-b border-border bg-secondary/20">
                        <td colSpan={canEdit ? 8 : 7} className="px-8 py-4">
                          {Object.keys(p.specifications ?? {}).length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                              {Object.entries(p.specifications).map(([k, v]) => (
                                <span key={k} className="rounded-full bg-card px-2.5 py-0.5 text-2xs text-muted-foreground ring-1 ring-border">
                                  <span className="font-medium text-foreground">{k}:</span> {String(v)}
                                </span>
                              ))}
                            </div>
                          )}
                          {(units[p.id] ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              No serials registered yet — they arrive through goods receipt and inspection,
                              or with the opening stock when the product is first opened.
                            </p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="py-1.5 font-medium">Serial No</th>
                                  <th className="py-1.5 font-medium">Status</th>
                                  <th className="py-1.5 font-medium">Batch</th>
                                  <th className="py-1.5 font-medium">Source</th>
                                  <th className="py-1.5 font-medium">Warranty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(units[p.id] ?? []).map((u) => (
                                  <tr key={u.id} className="border-t border-border/60">
                                    <td className="py-1.5">
                                      {editingSerial === u.id ? (
                                        <input
                                          autoFocus
                                          defaultValue={u.serial_number}
                                          onBlur={(e) => { saveSerial(p.id, u, e.target.value); setEditingSerial(null); }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                            if (e.key === "Escape") setEditingSerial(null);
                                          }}
                                          title="Type the real serial number — Enter or leaving the box saves it"
                                          className="h-7 w-44 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground focus:border-primary/50 focus:outline-none"
                                        />
                                      ) : (
                                        <span className="inline-flex items-center gap-2">
                                          <span className="font-mono text-foreground">{u.serial_number}</span>
                                          {canEdit && (
                                            <button
                                              type="button"
                                              onClick={() => setEditingSerial(u.id)}
                                              title="Edit this serial number"
                                              className="text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                              <Pencil className="h-3 w-3" />
                                            </button>
                                          )}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-muted-foreground">{STATUS_LABELS[u.status] ?? u.status}</td>
                                    <td className="py-1.5 font-mono text-muted-foreground">{u.batch_number || "—"}</td>
                                    <td className="py-1.5 font-mono text-muted-foreground">
                                      {[u.grn_number, u.po_number].filter(Boolean).join(" · ") || (u.notes?.startsWith("Opening stock") ? "Opening stock" : "Entered by hand")}
                                      {u.supplier_name && (
                                        <span className="block font-sans text-2xs text-muted-foreground">{u.supplier_name}</span>
                                      )}
                                    </td>
                                    <td className="py-1.5">
                                      <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${WARRANTY_BADGES[u.warranty_state]}`}>
                                        {u.warranty_state === "active" ? `till ${u.warranty_end}` : u.warranty_state === "expired" ? "Expired" : "None"}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {/* A unit that has been issued is not on the shelf,
                              so it is not listed here. Say where it went to. */}
                          <p className="mt-2 text-2xs text-muted-foreground">
                            What the store is holding. A unit that has been issued has left — the
                            Issuance Log shows where each serial went, who issued it and who took it.
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "open" ? "Open Unique Component" : "Edit Component"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {modal === "open" && (
            <p className="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
              Define the product now. Open it empty and serial numbers come in at goods inspection —
              or enter the stock already on the shelf and type each unit&apos;s serial here.
            </p>
          )}
          {modal === "edit" && (
            <div className="space-y-1.5">
              <label className={labelClass}>Product Code</label>
              <p className="flex h-10 items-center rounded-lg border border-border bg-secondary/40 px-3 font-mono text-sm text-foreground">
                {selected?.type_code}
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="name" className={labelClass}>Component Name *</label>
              <input id="name" name="name" required defaultValue={selected?.name ?? ""} className={inputClass} placeholder="e.g. 55in Media Player" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="unit" className={labelClass}>Unit of Measure</label>
              <select id="unit" name="unit" defaultValue={selected?.unit ?? "piece"} className={inputClass}>
                {/* The units opened under Setup; a legacy unit on an existing product stays selectable. */}
                {uoms.map((u) => <option key={u.id} value={u.name}>{u.name}{u.symbol ? ` (${u.symbol})` : ""}</option>)}
                {selected?.unit && !uoms.some((u) => u.name === selected.unit) && <option value={selected.unit}>{selected.unit}</option>}
              </select>
              <p className="text-2xs text-muted-foreground">Units are maintained under Setup › Units of Measure.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="brand" className={labelClass}>Make</label>
              <select id="brand" name="brand" defaultValue={selected?.brand ?? ""} className={inputClass}>
                <option value="">—</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="model_name" className={labelClass}>Model</label>
              <input id="model_name" name="model_name" defaultValue={selected?.model_name ?? ""} className={inputClass} placeholder="e.g. MP-900" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="category" className={labelClass}>Category</label>
              <select id="category" name="category" defaultValue={selected?.category ?? ""} className={inputClass}>
                <option value="">Select a category…</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">

            <div className="space-y-1.5">
              <label htmlFor="unit_cost" className={labelClass}>Unit Cost</label>
              <input id="unit_cost" name="unit_cost" type="number" step="0.01" min={0} defaultValue={selected?.unit_cost ?? ""} className={inputClass} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="min_stock_level" className={labelClass}>Min Stock Level</label>
              <input id="min_stock_level" name="min_stock_level" type="number" min={0} defaultValue={selected?.min_stock_level ?? 0} className={inputClass} />
            </div>

            {/* Set once, when the product is first opened: a product usually
                starts empty and fills from goods receipt, but stock already on
                the shelf has to be recordable. */}
            {!selected && (
              <div className="space-y-1.5">
                <label htmlFor="opening_quantity" className={labelClass}>Opening Stock</label>
                <input
                  id="opening_quantity"
                  name="opening_quantity"
                  type="number"
                  min={0}
                  max={500}
                  value={openingQty}
                  onChange={(e) => {
                    const n = Math.max(0, Math.min(500, Number(e.target.value) || 0));
                    setOpeningQty(n);
                    setOpeningSerials((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? ""));
                  }}
                  className={inputClass}
                />
                <p className="text-2xs text-muted-foreground">
                  Units already on the shelf — a serial number is typed for each one below.
                  Leave at 0 to open empty; serials then come in at goods inspection.
                </p>
              </div>
            )}
          </div>

          {/* One serial per unit on the shelf; the item opens only once all are typed. */}
          {!selected && openingQty > 0 && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  Serial numbers — {openingQty} unit{openingQty === 1 ? "" : "s"} on the shelf
                </p>
                <span className={`text-2xs font-medium ${serialsEntered === openingQty && !serialsRepeated ? "text-emerald-600" : "text-amber-600"}`}>
                  {serialsEntered}/{openingQty} entered{serialsRepeated ? " · repeated serial" : ""}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {openingSerials.map((sn, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-6 text-right font-mono text-2xs text-muted-foreground">{i + 1}.</span>
                    <input
                      id={`opening_serial_${i}`}
                      value={sn}
                      required
                      onChange={(e) => setOpeningSerials((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                      placeholder="Serial number"
                      className={`${inputClass} h-9 font-mono text-xs`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-2xs text-muted-foreground">
                Every unit needs its serial before the item can be opened.
              </p>
            </div>
          )}

          {/* Technical details, free-form key/value. */}
          <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Technical Details</p>
              <button
                type="button"
                onClick={() => setSpecs((prev) => [...prev, { key: "", value: "" }])}
                className="text-2xs font-medium text-primary hover:underline"
              >
                + Add detail
              </button>
            </div>
            {specs.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={row.key}
                  onChange={(e) => setSpecs((prev) => prev.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
                  placeholder="e.g. Resolution"
                  className={`${inputClass} h-9 text-xs`}
                />
                <input
                  value={row.value}
                  onChange={(e) => setSpecs((prev) => prev.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                  placeholder="e.g. 1920x1080"
                  className={`${inputClass} h-9 text-xs`}
                />
                <button
                  type="button"
                  onClick={() => setSpecs((prev) => prev.filter((_, j) => j !== i))}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <p className="rounded-lg border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground">
            Warranty is recorded when units are received — type the term at inspection and it runs from that day.
            The dashboard&apos;s in-hand stock watchlist is chosen on the dashboard.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="notes" className={labelClass}>Notes</label>
            <textarea id="notes" name="notes" rows={2} defaultValue={selected?.notes ?? ""} className={`${inputClass} h-auto py-2`} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || openingBlocked}
              title={openingBlocked ? "Type a serial number for every unit on the shelf" : undefined}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
            >
              {saving ? "Saving..." : modal === "open" ? "Open Item" : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
