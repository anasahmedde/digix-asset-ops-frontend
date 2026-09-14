"use client";

import { ClipboardCheck, PackageCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface ReceiptLine {
  id: string;
  grn_number: string | null;
  po_number: string | null;
  supplier_name: string | null;
  po_item_description: string | null;
  material_type: string | null;
  material_name: string | null;
  device_model_name: string | null;
  quantity: number;
  batch_number: string;
  serial_numbers: string[];
  inspection_status: string;
  created_at: string;
}
interface Ref { id: string; name: string }
interface UnitRow {
  serial_number: string;
  model_name: string;
  has_warranty: boolean;
  warranty_type: string;
  warranty_start: string;
  warranty_months: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const smallInput =
  "h-9 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const WARRANTY_TYPES = [
  { value: "manufacturer", label: "Manufacturer" },
  { value: "extended", label: "Extended" },
  { value: "supplier", label: "Supplier" },
  { value: "client", label: "Client Warranty" },
];

function emptyUnit(serial = ""): UnitRow {
  return { serial_number: serial, model_name: "", has_warranty: false, warranty_type: "supplier", warranty_start: "", warranty_months: "" };
}

export function PendingInspection({ onStocked }: { onStocked?: () => void }) {
  const { canWrite } = useUser();
  const canInspect = canWrite("inventory");

  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [categories, setCategories] = useState<Ref[]>([]);
  const [materialTypes, setMaterialTypes] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [active, setActive] = useState<ReceiptLine | null>(null);
  const [route, setRoute] = useState<"generic" | "unique">("generic");
  const [accepted, setAccepted] = useState(0);
  const [notes, setNotes] = useState("");
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [materialType, setMaterialType] = useState("");
  const [category, setCategory] = useState("");
  // Where the storekeeper is putting this delivery.
  const [storageLocation, setStorageLocation] = useState("");

  const fetchLines = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/receipt-lines/pending/", { params: { page_size: 200 } });
      setLines(data.results ?? data);
    } catch (err) {
      toast.error(getApiError(err, "Failed to load the inspection queue"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLines();
    api.get("/inventory/categories/").then((r) => setCategories(r.data.results ?? r.data)).catch(() => {});
    api.get("/assets/material-types/").then((r) => setMaterialTypes(r.data.results ?? r.data)).catch(() => {});
  }, [fetchLines]);

  function openInspect(line: ReceiptLine) {
    setActive(line);
    setAccepted(line.quantity);
    setNotes("");
    setMaterialType(line.material_type ?? "");
    setCategory("");
    setStorageLocation("");
    // Serials captured at the door pre-fill the unique rows.
    const preset = line.serial_numbers.length > 0;
    setRoute(preset ? "unique" : "generic");
    setUnits(
      preset
        ? line.serial_numbers.map((s) => emptyUnit(s))
        : Array.from({ length: line.quantity }, () => emptyUnit()),
    );
  }

  function setUnitCount(n: number) {
    setUnits((prev) => {
      if (n <= prev.length) return prev.slice(0, n);
      return [...prev, ...Array.from({ length: n - prev.length }, () => emptyUnit())];
    });
  }

  function patchUnit(i: number, patch: Partial<UnitRow>) {
    setUnits((prev) => prev.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  }

  async function submitInspection() {
    if (!active) return;
    const rejected = active.quantity - accepted;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        accepted_quantity: accepted,
        rejected_quantity: rejected,
        notes,
      };
      if (accepted > 0) {
        payload.route = route;
        if (route === "generic") {
          payload.generic = {
            material_type: materialType || null,
            category: category || null,
            storage_location: storageLocation.trim(),
          };
        } else {
          payload.units = units.slice(0, accepted).map((u) => ({
            serial_number: u.serial_number,
            model_name: u.model_name,
            has_warranty: u.has_warranty,
            ...(u.has_warranty
              ? {
                  warranty_type: u.warranty_type,
                  warranty_start: u.warranty_start || null,
                  warranty_months: u.warranty_months ? Number(u.warranty_months) : null,
                }
              : {}),
          }));
        }
      }
      const { data } = await api.post(`/inventory/receipt-lines/${active.id}/inspect/`, payload);
      const stocked = data.stocked_units?.length ?? 0;
      toast.success(
        accepted === 0
          ? "Line rejected — nothing stocked"
          : route === "unique"
            ? `${stocked} unique item${stocked === 1 ? "" : "s"} added to inventory`
            : `${accepted} added to generic stock`,
      );
      setActive(null);
      fetchLines();
      onStocked?.();
    } catch (err) {
      toast.error(getApiError(err, "Inspection failed"));
    } finally {
      setSaving(false);
    }
  }

  const rejected = active ? active.quantity - accepted : 0;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Goods received against purchase orders wait here. A technician inspects each delivery and files
        the accepted items into generic stock or unique items — nothing enters inventory until then.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : lines.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <PackageCheck className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">Nothing awaiting inspection</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Received purchase-order lines appear here for checking.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>GRN</th>
                  <th className={thClass}>PO</th>
                  <th className={thClass}>Supplier</th>
                  <th className={thClass}>Item</th>
                  <th className={thClass}>Qty</th>
                  <th className={thClass}>Batch</th>
                  <th className={thClass}>Serials</th>
                  {canInspect && <th className={thClass}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-mono text-foreground`}>{line.grn_number ?? "—"}</td>
                    <td className={`${tdClass} font-mono text-muted-foreground`}>{line.po_number ?? "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{line.supplier_name ?? "—"}</td>
                    <td className={`${tdClass} text-foreground`}>
                      {line.po_item_description ?? line.material_name ?? line.device_model_name ?? "—"}
                    </td>
                    <td className={`${tdClass} font-medium text-foreground`}>{line.quantity}</td>
                    <td className={`${tdClass} font-mono text-muted-foreground`}>{line.batch_number || "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {line.serial_numbers.length > 0 ? `${line.serial_numbers.length} captured` : "—"}
                    </td>
                    {canInspect && (
                      <td className={tdClass}>
                        <button
                          onClick={() => openInspect(line)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" /> Inspect
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={active !== null} onClose={() => setActive(null)} title="Inspect Delivery" size="xl">
        {active && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {active.po_item_description ?? active.material_name ?? "Item"}
              </span>
              {" · "}GRN <span className="font-mono">{active.grn_number}</span>
              {active.po_number && <> · PO <span className="font-mono">{active.po_number}</span></>}
              {active.batch_number && <> · Batch <span className="font-mono">{active.batch_number}</span></>}
              {" · "}{active.quantity} received
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="accepted" className={labelClass}>Accepted</label>
                <select
                  id="accepted"
                  value={accepted}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setAccepted(n);
                    if (route === "unique") setUnitCount(n);
                  }}
                  className={inputClass}
                >
                  {Array.from({ length: active.quantity + 1 }, (_, n) => n).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Rejected</label>
                <p className={`flex h-10 items-center rounded-lg border border-border px-3 text-sm ${rejected > 0 ? "bg-destructive/10 text-destructive" : "bg-secondary/40 text-muted-foreground"}`}>
                  {rejected}
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="route" className={labelClass}>File into</label>
                <select
                  id="route"
                  value={route}
                  disabled={accepted === 0}
                  onChange={(e) => {
                    const r = e.target.value as "generic" | "unique";
                    setRoute(r);
                    if (r === "unique") setUnitCount(accepted);
                  }}
                  className={`${inputClass} disabled:opacity-50`}
                >
                  <option value="generic">Generic stock</option>
                  <option value="unique">Unique items</option>
                </select>
              </div>
            </div>

            {accepted > 0 && route === "generic" && (
              <div className="grid gap-4 rounded-xl border border-border bg-secondary/20 p-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="ins_material" className={labelClass}>Material Type</label>
                  <select id="ins_material" value={materialType} onChange={(e) => setMaterialType(e.target.value)} className={inputClass}>
                    <option value="">From the purchase order</option>
                    {materialTypes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ins_category" className={labelClass}>Category</label>
                  <select id="ins_category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
                    <option value="">—</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ins_placed" className={labelClass}>Placed At</label>
                  <input
                    id="ins_placed"
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    placeholder="e.g. Rack A3"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {accepted > 0 && route === "unique" && (
              <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-4">
                <p className="text-xs text-muted-foreground">
                  One row per physical unit. Make, supplier, price and batch are taken from the purchase order.
                </p>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {units.slice(0, accepted).map((u, i) => (
                    <div key={i} className="grid items-center gap-2 sm:grid-cols-12">
                      <input
                        value={u.serial_number}
                        onChange={(e) => patchUnit(i, { serial_number: e.target.value })}
                        placeholder={`Serial no ${i + 1} *`}
                        className={`${smallInput} sm:col-span-4`}
                      />
                      <input
                        value={u.model_name}
                        onChange={(e) => patchUnit(i, { model_name: e.target.value })}
                        placeholder="Model"
                        className={`${smallInput} sm:col-span-3`}
                      />
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={u.has_warranty}
                          onChange={(e) => patchUnit(i, { has_warranty: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-border accent-primary"
                        />
                        Warranty
                      </label>
                      {u.has_warranty ? (
                        <>
                          <input
                            type="date"
                            value={u.warranty_start}
                            onChange={(e) => patchUnit(i, { warranty_start: e.target.value })}
                            title="Warranty start"
                            className={`${smallInput} sm:col-span-2`}
                          />
                          <input
                            type="number"
                            min={1}
                            value={u.warranty_months}
                            onChange={(e) => patchUnit(i, { warranty_months: e.target.value })}
                            placeholder="mo"
                            title="Months"
                            className={`${smallInput} sm:col-span-1`}
                          />
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground sm:col-span-3">No warranty</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="ins_notes" className={labelClass}>Inspection notes</label>
              <textarea
                id="ins_notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={rejected > 0 ? "Why were items rejected?" : "Optional"}
                className={`${inputClass} h-auto py-2`}
              />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitInspection}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
              >
                {saving ? "Filing…" : accepted === 0 ? "Reject Delivery" : "Accept & File to Inventory"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
