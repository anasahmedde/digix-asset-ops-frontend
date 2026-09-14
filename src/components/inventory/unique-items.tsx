"use client";

import { ChevronDown, ChevronRight, Fingerprint, Pencil, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/ui/copy-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { Modal } from "@/components/ui/modal";
import { SelectOrCreate } from "@/components/ui/select-or-create";
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
  unit_cost: string | null;
  min_stock_level: number;
  /** Counted in the dashboard's in-hand stock figure. */
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
}
interface Ref { id: string; name: string }
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
const WARRANTY_TYPES = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "extended", label: "Extended" },
  { value: "supplier", label: "Supplier" },
  { value: "client", label: "Client Warranty" },
];

export function UniqueItems() {
  const { canWrite } = useUser();
  const canEdit = canWrite("inventory");

  const [products, setProducts] = useState<UniqueProduct[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [materialTypes, setMaterialTypes] = useState<Ref[]>([]);
  const [brands, setBrands] = useState<Ref[]>([]);
  const [suppliers, setSuppliers] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [modal, setModal] = useState<"open" | "edit" | null>(null);
  const [selected, setSelected] = useState<UniqueProduct | null>(null);
  const [hasWarranty, setHasWarranty] = useState(false);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [formMaterial, setFormMaterial] = useState("");
  const [formCategory, setFormCategory] = useState("");

  const [expanded, setExpanded] = useState<string | null>(null);
  const [units, setUnits] = useState<Record<string, UnitRow[]>>({});
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
    api.get("/assets/material-types/").then((r) => setMaterialTypes(r.data.results ?? r.data)).catch(() => {});
    api.get("/assets/brands/").then((r) => setBrands(r.data.results ?? r.data)).catch(() => {});
    api.get("/suppliers/").then((r) => setSuppliers(r.data.results ?? r.data)).catch(() => {});
  }, [fetchProducts]);

  async function toggleUnits(productId: string) {
    if (expanded === productId) { setExpanded(null); return; }
    setExpanded(productId);
    if (units[productId]) return;
    try {
      const { data } = await api.get(`/inventory/products/${productId}/units/`, {
        params: { page_size: 200 },
      });
      setUnits((prev) => ({ ...prev, [productId]: data.results ?? data }));
    } catch (err) {
      toast.error(getApiError(err, "Failed to load serials"));
    }
  }

  function openNew() {
    setSelected(null);
    setHasWarranty(false);
    setSpecs([{ key: "", value: "" }]);
    setFormMaterial("");
    setFormCategory("");
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
    setHasWarranty(product.default_has_warranty);
    const entries = Object.entries(product.specifications ?? {});
    setSpecs(entries.length ? entries.map(([key, value]) => ({ key, value: String(value) })) : [{ key: "", value: "" }]);
    setFormMaterial(product.material_type ?? "");
    setFormCategory(product.category ?? "");
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
      material_type: formMaterial || null,
      category: formCategory || null,
      brand: fd.get("brand") || null,
      model_name: fd.get("model_name") || "",
      supplier: fd.get("supplier") || null,
      unit_cost: fd.get("unit_cost") || null,
      min_stock_level: Number(fd.get("min_stock_level") || 0),
      is_high_value: fd.get("is_high_value") === "on",
      // Only meaningful on the way in; the API ignores it on an edit.
      ...(selected ? {} : { opening_quantity: Number(fd.get("opening_quantity") || 0) }),
      specifications,
      notes: fd.get("notes") || "",
      default_has_warranty: hasWarranty,
      default_warranty_type: hasWarranty ? fd.get("default_warranty_type") || "manufacturer" : "",
      default_warranty_months: hasWarranty ? Number(fd.get("default_warranty_months") || 0) || null : null,
    };
    try {
      if (modal === "open") {
        await api.post("/inventory/products/", payload);
        toast.success("Unique item opened — stock starts at zero");
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
          Unique products are opened here with their technical details and no stock. Serial numbers are
          added later, when goods arrive and pass inspection.
        </p>
        {canEdit && (
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all"
          >
            <Plus className="h-4 w-4" /> Open Unique Item
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
            {products.length > 0 ? "Try adjusting your filters." : "Open a unique item to define what it is, before any stock arrives."}
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
                  <th className={thClass}>Product</th>
                  <th className={thClass}>Make / Model</th>
                  <th className={thClass}>In Stock</th>
                  <th className={thClass}>Default Warranty</th>
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
                          <CopyButton text={p.type_code} label="Product code" />
                        </span>
                      </td>
                      <td className={`${tdClass} font-medium text-foreground`}>{p.name}</td>
                      <td className={`${tdClass} text-muted-foreground`}>
                        {[p.brand_name, p.model_name].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className={tdClass}>
                        <span className={`font-semibold ${p.in_stock_count === 0 ? "text-muted-foreground" : "text-foreground"}`}>
                          {p.in_stock_count}
                        </span>
                      </td>
                      <td className={tdClass}>
                        {p.default_has_warranty ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-500/20">
                            <ShieldCheck className="h-3 w-3" /> {p.default_warranty_months} mo
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
                                <span key={k} className="rounded-full bg-card px-2.5 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
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
                                  <th className="py-1.5 font-medium">Unit Code</th>
                                  <th className="py-1.5 font-medium">Serial No</th>
                                  <th className="py-1.5 font-medium">Status</th>
                                  <th className="py-1.5 font-medium">Batch</th>
                                  <th className="py-1.5 font-medium">GRN / PO</th>
                                  <th className="py-1.5 font-medium">Warranty</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(units[p.id] ?? []).map((u) => (
                                  <tr key={u.id} className="border-t border-border/60">
                                    <td className="py-1.5 font-mono text-muted-foreground">{u.unit_code}</td>
                                    <td className="py-1.5">
                                      {canEdit ? (
                                        <input
                                          defaultValue={u.serial_number}
                                          onBlur={(e) => saveSerial(p.id, u, e.target.value)}
                                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                          title="Type the real serial number — it saves when you leave the box"
                                          className="h-7 w-44 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground focus:border-primary/50 focus:outline-none"
                                        />
                                      ) : (
                                        <span className="font-mono text-foreground">{u.serial_number}</span>
                                      )}
                                    </td>
                                    <td className="py-1.5 text-muted-foreground">{STATUS_LABELS[u.status] ?? u.status}</td>
                                    <td className="py-1.5 font-mono text-muted-foreground">{u.batch_number || "—"}</td>
                                    <td className="py-1.5 font-mono text-muted-foreground">
                                      {[u.grn_number, u.po_number].filter(Boolean).join(" · ") || "Entered by hand"}
                                      {u.supplier_name && (
                                        <span className="block font-sans text-[11px] text-muted-foreground">{u.supplier_name}</span>
                                      )}
                                    </td>
                                    <td className="py-1.5">
                                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${WARRANTY_BADGES[u.warranty_state]}`}>
                                        {u.warranty_state === "active" ? `till ${u.warranty_end}` : u.warranty_state === "expired" ? "Expired" : "None"}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
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
        title={modal === "open" ? "Open Unique Item" : "Edit Product"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {modal === "open" && (
            <p className="rounded-lg border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
              Define the product now — quantity starts at zero. Serial numbers are captured later at
              goods inspection, where only the serial has to be typed.
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="name" className={labelClass}>Product Name *</label>
              <input id="name" name="name" required defaultValue={selected?.name ?? ""} className={inputClass} placeholder="e.g. 55in Media Player" />
            </div>
            <SelectOrCreate
              id="material_type"
              label="Material Type"
              value={formMaterial}
              onChange={setFormMaterial}
              options={materialTypes}
              onCreated={(created) => setMaterialTypes((prev) => [...prev, created])}
              endpoint="/assets/material-types/"
              extraCreateFields={{ unit: "piece" }}
              createPlaceholder="e.g. Media Player"
            />
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
            <SelectOrCreate
              id="category"
              label="Category"
              value={formCategory}
              onChange={setFormCategory}
              options={categories}
              onCreated={(created) => setCategories((prev) => [...prev, created])}
              endpoint="/inventory/categories/"
              createPlaceholder="e.g. Spares"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="supplier" className={labelClass}>Default Supplier</label>
              <select id="supplier" name="supplier" defaultValue={selected?.supplier ?? ""} className={inputClass}>
                <option value="">—</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="unit_cost" className={labelClass}>Unit Cost</label>
              <input id="unit_cost" name="unit_cost" type="number" step="0.01" min={0} defaultValue={selected?.unit_cost ?? ""} className={inputClass} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="min_stock_level" className={labelClass}>Min Stock Level</label>
              <input id="min_stock_level" name="min_stock_level" type="number" min={0} defaultValue={selected?.min_stock_level ?? 0} className={inputClass} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="is_high_value" className="flex items-start gap-2.5">
                <input
                  id="is_high_value"
                  name="is_high_value"
                  type="checkbox"
                  defaultChecked={selected?.is_high_value ?? false}
                  className="mt-0.5 h-4 w-4 rounded border-border"
                />
                <span>
                  <span className="text-sm font-medium text-foreground">Count in in-hand stock</span>
                  <span className="block text-xs text-muted-foreground">
                    Shows this product&apos;s units and their value on the dashboard. For the few items
                    worth watching at that level.
                  </span>
                </span>
              </label>
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
                  defaultValue={0}
                  className={inputClass}
                />
                <p className="text-[10px] text-muted-foreground">
                  Units already on the shelf. Each gets a provisional serial from the product
                  code — correct them as the units are found. Leave at 0 to open empty.
                </p>
              </div>
            )}
          </div>

          {/* Technical details, free-form key/value. */}
          <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Technical Details</p>
              <button
                type="button"
                onClick={() => setSpecs((prev) => [...prev, { key: "", value: "" }])}
                className="text-[11px] font-medium text-primary hover:underline"
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

          {/* Warranty terms every unit inherits. */}
          <div className="rounded-xl border border-border bg-secondary/20 p-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={hasWarranty}
                onChange={(e) => setHasWarranty(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              <span className="text-sm font-medium text-foreground">Units of this product come with a warranty</span>
            </label>
            {hasWarranty && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="default_warranty_type" className={labelClass}>Warranty Type</label>
                  <select id="default_warranty_type" name="default_warranty_type" defaultValue={selected?.default_warranty_type || "manufacturer"} className={inputClass}>
                    {WARRANTY_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="default_warranty_months" className={labelClass}>Term (months) *</label>
                  <input id="default_warranty_months" name="default_warranty_months" type="number" min={1} defaultValue={selected?.default_warranty_months ?? 12} className={inputClass} />
                </div>
              </div>
            )}
          </div>

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
              disabled={saving}
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
