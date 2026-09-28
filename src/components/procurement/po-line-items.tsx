"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import api from "@/lib/api";

/**
 * The line items of a purchase order, however the order was started.
 *
 * An order raised from scratch and one raised from procurement requests are
 * the same document, so they are written the same way: one editor, one set of
 * choices, one idea of what a line can be.
 */
export type PoLineKind = "generic" | "unique" | "asset" | "charge" | "custom";

export interface PoLine {
  id?: string;
  kind: PoLineKind;
  inventory_item: string;
  inventory_unit_type: string;
  device: string;
  /** Older lines pointed at a model or a material; they keep doing so. */
  device_model: string;
  material_type: string;
  description: string;
  quantity: string;
  unit_price: string;
  received_quantity: number;
}

export const emptyPoLine: PoLine = {
  kind: "generic",
  inventory_item: "",
  inventory_unit_type: "",
  device: "",
  device_model: "",
  material_type: "",
  description: "",
  quantity: "1",
  unit_price: "0",
  received_quantity: 0,
};

export interface PoOption {
  id: string;
  label: string;
}

export interface PoOptions {
  generic: PoOption[];
  unique: PoOption[];
  assets: PoOption[];
}

/** The three things an order buys, as the rest of the system knows them. */
export function usePoOptions(): PoOptions {
  const [generic, setGeneric] = useState<PoOption[]>([]);
  const [unique, setUnique] = useState<PoOption[]>([]);
  const [assets, setAssets] = useState<PoOption[]>([]);

  useEffect(() => {
    api.get("/inventory/items/", { params: { page_size: 500 } })
      .then((r) =>
        setGeneric(
          (r.data.results ?? r.data).map((i: { id: string; material_name?: string; sku: string }) => ({
            id: i.id, label: `${i.material_name || i.sku} · ${i.sku}`,
          })),
        ),
      )
      .catch(() => {});
    api.get("/inventory/products/", { params: { page_size: 500 } })
      .then((r) =>
        setUnique(
          (r.data.results ?? r.data).map((p: { id: string; name: string; model_name?: string; type_code?: string }) => ({
            id: p.id,
            label: [p.name, p.model_name].filter(Boolean).join(" ") + (p.type_code ? ` · ${p.type_code}` : ""),
          })),
        ),
      )
      .catch(() => {});
    // An asset bought complete is registered first, then ordered by name:
    // the ones still in procurement and not yet on an order.
    api.get("/assets/devices/", { params: { status: "procured", page_size: 500 } })
      .then((r) =>
        setAssets(
          (r.data.results ?? r.data)
            .filter((d: { procurement_item?: string | null }) => !d.procurement_item)
            .map((d: { id: string; asset_code: string; display_name?: string; asset_type_name?: string }) => ({
              id: d.id, label: `${d.asset_code} · ${d.display_name || d.asset_type_name || "asset"}`,
            })),
        ),
      )
      .catch(() => {});
  }, []);

  return { generic, unique, assets };
}

/** What a line buys, ready for the API. */
export function poLinePayload(line: PoLine) {
  return {
    ...(line.id ? { id: line.id } : {}),
    description: line.description.trim(),
    quantity: Number(line.quantity) || 1,
    unit_price: Number(line.unit_price) || 0,
    inventory_item: line.kind === "generic" && line.inventory_item ? line.inventory_item : null,
    inventory_unit_type: line.kind === "unique" && line.inventory_unit_type ? line.inventory_unit_type : null,
    device: line.kind === "asset" && line.device ? line.device : null,
    is_charge: line.kind === "charge",
    device_model: line.kind === "custom" && line.device_model ? line.device_model : null,
    material_type: line.kind === "custom" && line.material_type ? line.material_type : null,
  };
}

/** A row still at its defaults may be dropped; anything else must be filled in. */
export function isPoLineEmpty(line: PoLine) {
  return (
    !line.description.trim() &&
    !line.inventory_item &&
    !line.inventory_unit_type &&
    !line.device &&
    !line.device_model &&
    !line.material_type &&
    (line.quantity === "" || line.quantity === emptyPoLine.quantity) &&
    (Number(line.unit_price) || 0) === 0
  );
}

/** What is wrong with these lines, in the words the user needs. */
export function poLinesProblem(lines: PoLine[]): string | null {
  const real = lines.filter((l) => !isPoLineEmpty(l));
  const missingDescription = real.findIndex((l) => !l.description.trim());
  if (missingDescription !== -1) return `Line ${missingDescription + 1} is missing a description`;
  const unnamed = real.findIndex(
    (l) =>
      (l.kind === "generic" && !l.inventory_item) ||
      (l.kind === "unique" && !l.inventory_unit_type) ||
      (l.kind === "asset" && !l.device),
  );
  if (unnamed !== -1) {
    return `Line ${unnamed + 1}: pick which ${real[unnamed].kind === "asset" ? "asset" : "component"} it buys`;
  }
  return null;
}

export const poLineTotal = (line: PoLine) => (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const rowInputClass =
  "h-9 rounded-lg border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";

interface Props {
  lines: PoLine[];
  onChange: (lines: PoLine[]) => void;
  currency: string;
  options: PoOptions;
  /** Legacy labels for a line that points at a model or material. */
  legacyLabel?: (line: PoLine) => string | undefined;
  /** Shown above the rows; "Line Items *" on a new order. */
  label?: string;
  /** A running total under the rows, where the caller wants one. */
  total?: number;
  totalLabel?: string;
}

export function PoLineItems({
  lines, onChange, currency, options, legacyLabel, label = "Line Items *", total, totalLabel = "Grand Total",
}: Props) {
  const patch = (idx: number, changes: Partial<PoLine>) =>
    onChange(lines.map((l, i) => (i === idx ? { ...l, ...changes } : l)));

  const setKind = (idx: number, kind: PoLineKind) =>
    patch(idx, { kind, inventory_item: "", inventory_unit_type: "", device: "", device_model: "", material_type: "" });

  /** Name the thing a line buys; the description follows unless typed already. */
  const pick = (idx: number, field: "inventory_item" | "inventory_unit_type" | "device", id: string, from: PoOption[]) => {
    const chosen = from.find((o) => o.id === id);
    const name = chosen?.label.split(" · ")[0] ?? "";
    onChange(
      lines.map((l, i) =>
        i === idx ? { ...l, [field]: id, description: l.description.trim() ? l.description : name } : l,
      ),
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <button type="button" onClick={() => onChange([...lines, { ...emptyPoLine }])} className="text-xs font-medium text-primary">
          + Add line
        </button>
      </div>
      {lines.map((line, idx) => (
        <div key={line.id ?? `new-${idx}`} className="space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <select
              value={line.kind}
              onChange={(e) => setKind(idx, e.target.value as PoLineKind)}
              className={`${rowInputClass} w-44 shrink-0`}
              title="What this line buys"
            >
              <option value="generic">Generic component</option>
              <option value="unique">Unique component</option>
              <option value="asset">Asset</option>
              <option value="charge">Charge (free text)</option>
              {line.kind === "custom" && <option value="custom">Other (older line)</option>}
            </select>
            {line.kind === "generic" && (
              <select value={line.inventory_item} onChange={(e) => pick(idx, "inventory_item", e.target.value, options.generic)} className={`${inputClass} flex-1`}>
                <option value="">Select generic component…</option>
                {options.generic.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
            {line.kind === "unique" && (
              <select value={line.inventory_unit_type} onChange={(e) => pick(idx, "inventory_unit_type", e.target.value, options.unique)} className={`${inputClass} flex-1`}>
                <option value="">Select unique component…</option>
                {options.unique.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
            {line.kind === "asset" && (
              <select value={line.device} onChange={(e) => pick(idx, "device", e.target.value, options.assets)} className={`${inputClass} flex-1`}>
                <option value="">Select asset in procurement…</option>
                {options.assets.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            )}
            {line.kind === "custom" && legacyLabel?.(line) && (
              <span className="flex-1 truncate text-xs text-muted-foreground">{legacyLabel(line)}</span>
            )}
            <div className="ml-auto shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
              Line total{" "}
              <span className="font-medium text-foreground">{currency} {poLineTotal(line).toLocaleString()}</span>
              {line.received_quantity > 0 && (
                <span className="ml-2">· Received {line.received_quantity}/{Number(line.quantity) || 0}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={line.description}
              onChange={(e) => patch(idx, { description: e.target.value })}
              placeholder={line.kind === "charge" ? "e.g. Delivery charges" : "Description"}
              className={`${inputClass} min-w-0 flex-1`}
            />
            <input type="number" min="1" value={line.quantity} onChange={(e) => patch(idx, { quantity: e.target.value })} placeholder="Qty" className={`${rowInputClass} w-20`} />
            <input type="number" min="0" step="0.01" value={line.unit_price} onChange={(e) => patch(idx, { unit_price: e.target.value })} placeholder="Unit price" className={`${rowInputClass} w-32`} />
            <button
              type="button"
              onClick={() => onChange(lines.filter((_, i) => i !== idx))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      {total !== undefined && (
        <div className="text-right text-sm font-medium text-foreground">
          {totalLabel}: {currency} {total.toLocaleString()}
        </div>
      )}
    </div>
  );
}
