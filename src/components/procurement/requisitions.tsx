"use client";

import { AlertTriangle, ClipboardList, ShoppingCart, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  PoLineItems, isPoLineEmpty, poLinePayload, poLineTotal, poLinesProblem, usePoOptions,
  type PoLine,
} from "@/components/procurement/po-line-items";
import { Modal } from "@/components/ui/modal";
import { Qty } from "@/components/ui/qty";
import api from "@/lib/api";
import { CURRENCIES } from "@/lib/currency";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

/**
 * One thing to buy: a component a project's asset needs, or a whole asset
 * the vendor supplies. Components are keyed by their component id, assets by
 * the asset id; the two never collide because a row is one or the other.
 */
interface Requisition {
  kind?: "component" | "asset" | "reorder";
  /** Which part of the business asked for this — Project, Inventory, … */
  origin?: string;
  /** The screen it was raised from, under the origin. */
  origin_detail?: string;
  component: string | null;
  device?: string | null;
  /** A stock reorder raised from Inventory › Low Stock, with its PR number. */
  reorder?: string | null;
  request_number?: string;
  reorder_level?: number | null;
  reason?: string;
  name: string;
  asset_code: string;
  project: string | null;
  project_name: string | null;
  /** When the project needs it — what the order is dated from. */
  project_target_date?: string | null;
  required_quantity: number;
  outstanding_quantity: number;
  /** Unit of measure of the line (piece, meter, asset…). */
  unit?: string;
  available_quantity: number | null;
  purchase_order_item: string | null;
  po_number: string | null;
  /** The last price we paid, when there is one to suggest. */
  last_unit_price?: string | null;
  /** What the line should cost, to hold the quote against. */
  reference_unit_price?: string | number | null;
  reference_amount?: string | number | null;
  /** Where that figure came from — an approved budget, or the last order. */
  reference_label?: string;
}
interface Ref { id: string; name: string }

const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-4 py-3";
const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";
const labelClass = "text-xs font-medium text-muted-foreground";

function keyOf(r: Requisition): string {
  if (r.kind === "asset") return `asset:${r.device}`;
  if (r.kind === "reorder") return `reorder:${r.reorder}`;
  return `component:${r.component}`;
}
function idOf(r: Requisition): string | null | undefined {
  return r.kind === "asset" ? r.device : r.kind === "reorder" ? r.reorder : r.component;
}

/**
 * Where a request came from.
 *
 * The buyer works the queue top to bottom without knowing the history of
 * each line, so the row says which part of the business asked for it. The
 * server sends it; the fallback covers a line raised before it did.
 */
const ORIGIN_TINT: Record<string, string> = {
  Project: "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  Inventory: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  Maintenance: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  "Asset registry": "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20",
};

/** A figure with its thousands marked. The column heading carries the currency. */
function amount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isNaN(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function originOf(r: Requisition): { name: string; detail: string } {
  if (r.origin) return { name: r.origin, detail: r.origin_detail ?? "" };
  if (r.kind === "reorder") return { name: "Inventory", detail: "Low Stock" };
  if (r.project_name) return { name: "Project", detail: "Execution › Build Requirements" };
  return { name: "Asset registry", detail: "" };
}

export function Requisitions({ onPoRaised }: { onPoRaised?: () => void }) {
  const { canWrite } = useUser();
  // Local date, not the UTC slice toISOString() gives: east of Greenwich
  // that is tomorrow after mid-afternoon, and west of it, yesterday.
  const today = new Date().toLocaleDateString("en-CA");
  const canBuy = canWrite("procurement");

  const [rows, setRows] = useState<Requisition[]>([]);
  const [suppliers, setSuppliers] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [poModal, setPoModal] = useState(false);
  const [saving, setSaving] = useState(false);
  // Off by default: hiding ordered lines made a re-flagged requirement
  // look like it had vanished.
  // A queue of what to buy shows what has not been bought. A line already on
  // an order is a line somebody decided; leaving it here invited it to be
  // ordered twice, and made a delivered part look outstanding.
  const [showOrdered, setShowOrdered] = useState(false);

  // The order's own details — asked for up front so the draft is complete.
  const [supplier, setSupplier] = useState("");
  const [supplierDetails, setSupplierDetails] = useState("");
  const [showSupplierDetails, setShowSupplierDetails] = useState(false);
  const [currency, setCurrency] = useState("PKR");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  // Why a line is going on above the figure it was planned at. Travels with
  // the order to whoever has to agree it.
  const [reasons, setReasons] = useState<Record<string, string>>({});
  // Anything else the order needs that no request asked for — freight, a
  // spare, a charge. Written with the editor the new-order form uses.
  const [extraLines, setExtraLines] = useState<PoLine[]>([]);
  const poOptions = usePoOptions();
  // Handing a request back to where it came from, with the reason on record.
  const [sendBack, setSendBack] = useState<Requisition | null>(null);
  const [reason, setReason] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/procurement/purchase-orders/requisitions/", {
        params: showOrdered ? {} : { unordered: "true" },
      });
      setRows(data.results ?? []);
      setSelected(new Set());
    } catch (err) {
      toast.error(getApiError(err, "Failed to load requisitions"));
    } finally {
      setLoading(false);
    }
  }, [showOrdered]);

  useEffect(() => {
    fetchRows();
    api.get("/suppliers/").then((r) => setSuppliers(r.data.results ?? r.data)).catch(() => {});
  }, [fetchRows]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const selectable = useMemo(() => rows.filter((r) => !r.purchase_order_item), [rows]);
  const chosen = useMemo(() => rows.filter((r) => selected.has(keyOf(r))), [rows, selected]);

  function openModal() {
    // Suggest the last price paid; the buyer can overtype it.
    const seed: Record<string, string> = {};
    chosen.forEach((r) => { seed[keyOf(r)] = r.last_unit_price ? String(Number(r.last_unit_price)) : ""; });
    setPrices(seed);
    // The date is not typed from memory: the goods are needed by the day the
    // project is due, and the earliest of the chosen lines is what binds.
    const due = chosen
      .map((r) => r.project_target_date)
      .filter((d): d is string => !!d)
      .sort()[0];
    // An overdue project would otherwise seed a date in the past.
    setExpectedDelivery(due && due >= today ? due : "");
    setPoModal(true);
  }

  function resetModal() {
    setPoModal(false);
    setSupplier("");
    setSupplierDetails("");
    setShowSupplierDetails(false);
    setCurrency("PKR");
    setExpectedDelivery("");
    setTerms("");
    setNotes("");
    setPrices({});
    setReasons({});
    setExtraLines([]);
  }

  /** Lines going on above what they were planned at. */
  const overPlan = chosen.filter((r) => {
    const ref = r.reference_unit_price == null ? null : Number(r.reference_unit_price);
    return ref != null && Number(prices[keyOf(r)] ?? 0) > ref;
  });

  async function raisePo() {
    if (!supplier || chosen.length === 0) return;
    if (expectedDelivery && expectedDelivery < today) {
      toast.error("The delivery date has passed — set one the supplier can still meet");
      return;
    }
    const problem = poLinesProblem(extraLines);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const priceById: Record<string, string> = {};
      const reasonById: Record<string, string> = {};
      chosen.forEach((r) => {
        const id = idOf(r);
        const p = (prices[keyOf(r)] ?? "").trim();
        if (id && p !== "") priceById[id] = p;
        const why = (reasons[keyOf(r)] ?? "").trim();
        if (id && why) reasonById[id] = why;
      });
      const { data } = await api.post("/procurement/purchase-orders/raise-po/", {
        supplier,
        components: chosen.filter((r) => r.kind !== "asset" && r.kind !== "reorder").map((r) => r.component),
        devices: chosen.filter((r) => r.kind === "asset").map((r) => r.device),
        reorders: chosen.filter((r) => r.kind === "reorder").map((r) => r.reorder),
        prices: priceById,
        variance_reasons: reasonById,
        extra_items: extraLines.filter((l) => !isPoLineEmpty(l)).map(poLinePayload),
        currency,
        supplier_details: supplierDetails.trim(),
        expected_delivery: expectedDelivery || null,
        terms: terms.trim(),
        notes: notes.trim(),
      });
      const flagged = overPlan.length;
      toast.success(
        flagged
          ? `${data.po_number} drafted. ${flagged} line(s) are priced over plan and have gone to `
            + `${[...new Set(overPlan.map((r) => originOf(r).name))].join(" and ")} to agree — `
            + "the order cannot go up for signature until they do."
          : `${data.po_number} drafted with ${data.items?.length ?? 0} line(s) — review it, then `
            + "submit it for the Group Head's approval",
        { duration: flagged ? 9000 : 5000 },
      );
      resetModal();
      fetchRows();
      onPoRaised?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the purchase order"));
    } finally {
      setSaving(false);
    }
  }

  async function submitSendBack() {
    if (!sendBack || !reason.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, string> = { reason: reason.trim() };
      if (sendBack.kind === "asset" && sendBack.device) body.device = sendBack.device;
      else if (sendBack.kind === "reorder" && sendBack.reorder) body.reorder = sendBack.reorder;
      else if (sendBack.component) body.component = sendBack.component;
      const { data } = await api.post("/procurement/purchase-orders/requisitions/send-back/", body);
      toast.success(data.detail || "Sent back");
      setSendBack(null);
      setReason("");
      fetchRows();
    } catch (err) {
      toast.error(getApiError(err, "Could not send it back"));
    } finally {
      setSaving(false);
    }
  }

  const requisitionTotal = chosen.reduce((sum, r) => {
    const p = Number(prices[keyOf(r)] ?? 0);
    return sum + (Number.isFinite(p) ? p * r.outstanding_quantity : 0);
  }, 0);
  const draftTotal = requisitionTotal + extraLines.reduce((sum, l) => sum + poLineTotal(l), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Still to buy: components an asset needs, whole assets the vendor supplies, and stock
          reorders raised from Inventory › Low Stock. A line goes off this list once it is on a
          purchase order. Send back returns a line to where it came from, with the reason on record.
        </p>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={showOrdered}
              onChange={(e) => setShowOrdered(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            Show lines already on an order
          </label>
          {canBuy && (
            <button
              onClick={openModal}
              disabled={selected.size === 0}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50"
            >
              <ShoppingCart className="h-4 w-4" /> Raise PO ({selected.size})
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">Nothing to procure</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Requirements marked &ldquo;Procure&rdquo; on a project, and vendor-supplied assets awaiting
            purchase, appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  {canBuy && (
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={selectable.length > 0 && selected.size === selectable.length}
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(selectable.map(keyOf)) : new Set())
                        }
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                    </th>
                  )}
                  <th className={thClass}>To Buy</th>
                  <th className={thClass}>Origin</th>
                  <th className={thClass}>For Asset</th>
                  <th className={thClass}>Project</th>
                  <th className={thClass}>Qty</th>
                  <th className={thClass}>In Stock</th>
                  <th className={`${thClass} text-right`}>Reference Value (PKR)</th>
                  <th className={thClass}>Purchase Order</th>
                  {canBuy && <th className={thClass}></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = keyOf(r);
                  const isAsset = r.kind === "asset";
                  const isReorder = r.kind === "reorder";
                  const origin = originOf(r);
                  return (
                    <tr key={key} className="border-b border-border transition-colors hover:bg-secondary/30">
                      {canBuy && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${r.name}`}
                            disabled={!!r.purchase_order_item}
                            checked={selected.has(key)}
                            onChange={() => toggle(key)}
                            className="h-4 w-4 rounded border-border accent-primary disabled:opacity-40"
                          />
                        </td>
                      )}
                      <td className={`${tdClass} font-medium text-foreground`}>
                        {r.name}
                        <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${
                          isAsset ? "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20"
                          : isReorder ? "bg-amber-500/10 text-amber-600 ring-amber-500/20"
                          : "bg-secondary text-muted-foreground ring-border"
                        }`}>
                          {isAsset ? "Whole asset" : isReorder ? "Stock reorder" : "Component"}
                        </span>
                        {isReorder && (
                          <span className="block text-2xs text-muted-foreground">
                            {r.request_number && <span className="mr-1.5 font-mono text-foreground">{r.request_number}</span>}
                            {r.reason}
                          </span>
                        )}
                      </td>
                      <td className={tdClass}>
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${
                          ORIGIN_TINT[origin.name] ?? "bg-secondary text-muted-foreground ring-border"
                        }`}>
                          {origin.name}
                        </span>
                        {origin.detail && (
                          <span className="mt-0.5 block text-2xs text-muted-foreground">{origin.detail}</span>
                        )}
                      </td>
                      <td className={`${tdClass} ${isReorder ? "text-muted-foreground" : "font-mono text-muted-foreground"}`}>
                        {isReorder ? <>Stock<span className="block text-2xs">reorder level {r.reorder_level ?? "—"}</span></> : r.asset_code}
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>{r.project_name ?? "—"}</td>
                      <td className={`${tdClass} font-medium text-foreground`}><Qty value={r.outstanding_quantity} unit={r.unit} /></td>
                      <td className={tdClass}>
                        {isAsset ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <>
                            <span className={(r.available_quantity ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground"}>
                              {r.available_quantity ?? 0}
                            </span>
                            {(r.available_quantity ?? 0) >= r.outstanding_quantity && (
                              <span className="block text-2xs text-muted-foreground">stock would cover it</span>
                            )}
                          </>
                        )}
                      </td>
                      {/* What the line should come to, so a quote can be
                          judged without leaving the queue. */}
                      <td className={`${tdClass} text-right`}>
                        {/* The unit value, not the line total: it is the
                            figure a supplier quotes and the one worth
                            arguing over. */}
                        <span className="font-medium tabular-nums text-foreground">
                          {amount(r.reference_unit_price)}
                        </span>
                        <span className="block text-2xs text-muted-foreground">
                          per {r.unit ?? "piece"}
                        </span>
                        {r.reference_label && (
                          <span className="block text-2xs text-muted-foreground">
                            {r.reference_label}
                          </span>
                        )}
                      </td>
                      <td className={`${tdClass} font-mono text-muted-foreground`}>{r.po_number ?? "—"}</td>
                      {canBuy && (
                        <td className={tdClass}>
                          {!r.purchase_order_item && (
                            <button
                              onClick={() => { setSendBack(r); setReason(""); }}
                              title={isReorder ? "Withdraw this reorder, reason on record" : "Send this line back to the project to decide again"}
                              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            >
                              <Undo2 className="h-3 w-3" /> Send back
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={poModal} onClose={resetModal} title="Raise Purchase Order" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {chosen.length} requested line{chosen.length === 1 ? " goes" : "s go"} on one draft order.
            Add more below if the order needs them. Prices are fixed once the Group Head approves.
          </p>

          {/* The same questions, in the same order, as a new purchase order. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className={labelClass}>PO Number</label>
              <div className={`${inputClass} items-center bg-secondary/30 text-muted-foreground`}>
                Auto-generated on save
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="req_supplier" className={labelClass}>Supplier *</label>
              <select id="req_supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputClass}>
                <option value="">Select supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {showSupplierDetails ? (
                <textarea
                  id="req_supplier_details"
                  rows={2}
                  value={supplierDetails}
                  onChange={(e) => setSupplierDetails(e.target.value)}
                  placeholder="Contact, quote reference, delivery address for this order"
                  className={`${inputClass} h-auto py-2`}
                />
              ) : (
                <button type="button" onClick={() => setShowSupplierDetails(true)} className="text-xs font-medium text-primary">
                  + Supplier details for this order
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="req_currency" className={labelClass}>Currency</label>
              <select id="req_currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelClass}>Order Date</label>
                {/* The sentence did not fit the box and was being cut off
                    mid-word. It reads as a short answer, like PO Number
                    above it, with the detail underneath. */}
                <p className={`${inputClass} flex items-center bg-secondary/30 text-muted-foreground`}>
                  On approval
                </p>
                <p className="text-2xs text-muted-foreground">Stamped when the Group Head signs it off.</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="req_delivery" className={labelClass}>Required Delivery *</label>
                {/* A supplier cannot be held to a date that has gone. The
                    project's own date seeds this, and an overdue project
                    seeds a date already past — which is how an order came
                    to be raised against last week. */}
                <input
                  id="req_delivery"
                  type="date"
                  required
                  min={today}
                  value={expectedDelivery}
                  onChange={(e) => setExpectedDelivery(e.target.value)}
                  className={inputClass}
                />
                {expectedDelivery && expectedDelivery < today && (
                  <p className="text-2xs font-medium text-destructive">
                    That date has passed — set one the supplier can still meet.
                  </p>
                )}
              </div>
            </div>
          </div>
          <p className="text-2xs text-muted-foreground">
            {chosen.some((r) => r.project_target_date)
              ? "Delivery is taken from the date the project is due. Change it if the supplier is held to another."
              : "No project date to take the delivery from — set the date the supplier is held to."}
          </p>

          {/* What the requests asked for. The line is fixed; the price is not. */}
          <div className="space-y-2">
            <label className={labelClass}>Requested Lines</label>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium">For</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Reference</th>
                    <th className="px-3 py-2 text-right font-medium">Unit price</th>
                    <th className="px-3 py-2 text-right font-medium">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {chosen.map((r) => {
                    const key = keyOf(r);
                    const price = Number(prices[key] ?? 0);
                    // What the line was planned or last bought at, and how
                    // far the price being typed has moved from it. Finding
                    // that out after the order is placed is too late.
                    const ref = r.reference_unit_price == null
                      ? null : Number(r.reference_unit_price);
                    const drift = ref && price ? (price - ref) / ref : 0;
                    return (
                      <tr key={key} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.asset_code}</td>
                        <td className="px-3 py-2 text-right text-foreground"><Qty value={r.outstanding_quantity} unit={r.unit} /></td>
                        <td className="px-3 py-2 text-right align-top">
                          <span className="tabular-nums text-foreground">{amount(ref)}</span>
                          {r.reference_label && (
                            <span className="block text-2xs text-muted-foreground">{r.reference_label}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={prices[key] ?? ""}
                            onChange={(e) => setPrices((prev) => ({ ...prev, [key]: e.target.value }))}
                            placeholder={ref ? String(ref) : "last paid"}
                            aria-label={`Unit price for ${r.name}`}
                            className="h-8 w-28 rounded-lg border border-border bg-background px-2 text-right text-xs text-foreground focus:border-primary/50 focus:outline-none"
                          />
                          {Math.abs(drift) >= 0.005 && (
                            <span className={`block text-2xs ${drift > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                              {drift > 0 ? "+" : "−"}{Math.abs(drift * 100).toFixed(0)}%
                              {drift > 0 ? " over" : " under"} reference
                            </span>
                          )}
                          {/* Over the plan is somebody else's money. The
                              reason travels with the line to whoever has to
                              agree it, so ask for it while the quote is in
                              front of the buyer. */}
                          {drift > 0 && (
                            <input
                              value={reasons[key] ?? ""}
                              onChange={(e) => setReasons((prev) => ({ ...prev, [key]: e.target.value }))}
                              placeholder="Why the higher price?"
                              aria-label={`Reason for the higher price on ${r.name}`}
                              className="mt-1 h-7 w-44 rounded-lg border border-amber-500/40 bg-background px-2 text-2xs text-foreground focus:border-primary/50 focus:outline-none"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground">
                          {prices[key] ? (price * r.outstanding_quantity).toLocaleString() : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-2xs text-muted-foreground">
              Reference is the figure the project budget was approved on, or the last price paid
              for stock. A blank price falls back to what we last paid for that line, or zero if
              we never have.
            </p>
            {overPlan.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-500">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {overPlan.length} line{overPlan.length === 1 ? " is" : "s are"} priced above plan.
                  The draft will be raised, then{" "}
                  {[...new Set(overPlan.map((r) => originOf(r).name))].join(" and ")} has to agree
                  the price before this order can go up for the Group Head&apos;s signature.
                </span>
              </div>
            )}
          </div>

          {/* Anything the order needs beyond the requests — same editor as a
              new purchase order, so both forms write a line the same way. */}
          <PoLineItems
            lines={extraLines}
            onChange={setExtraLines}
            currency={currency}
            options={poOptions}
            label="Additional Line Items"
          />

          <div className="text-right text-sm font-medium text-foreground">
            Grand Total: {currency} {draftTotal.toLocaleString()}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="req_notes" className={labelClass}>Notes</label>
            <textarea
              id="req_notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the supplier or approver should know"
              className={`${inputClass} h-auto py-2`}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="req_terms" className={labelClass}>Terms &amp; Conditions</label>
            <textarea
              id="req_terms"
              rows={7}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="The standard terms are used unless you change them here."
              className={`${inputClass} h-auto py-2 font-mono text-xs leading-relaxed`}
            />
            <p className="text-xs text-muted-foreground">
              Printed on the order the supplier receives. Edit for a deal agreed on different terms.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetModal}
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={raisePo}
              disabled={saving || !supplier || !expectedDelivery || chosen.length === 0}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
            >
              {saving ? "Raising…" : "Raise draft PO"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Back to where it came from, with the reason on record. */}
      <Modal open={!!sendBack} onClose={() => setSendBack(null)} title={sendBack ? `Send back — ${sendBack.name}` : "Send back"} size="sm">
        {sendBack && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {sendBack.kind === "reorder"
                ? <>The reorder of <span className="font-medium text-foreground">{sendBack.name}</span> is withdrawn; Inventory can raise it again.</>
                : <><span className="font-medium text-foreground">{sendBack.name}</span>{sendBack.asset_code ? <> on {sendBack.asset_code}</> : null} goes back to the project as undecided. The reason is written on the asset for Execution to read.</>}
            </p>
            <div className="space-y-1.5">
              <label htmlFor="req_reason" className={labelClass}>Reason *</label>
              <textarea id="req_reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Stock arrived from another order — take it from inventory" className={`${inputClass} h-auto py-2`} autoFocus />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setSendBack(null)} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
              <button type="button" onClick={submitSendBack} disabled={saving || !reason.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                <Undo2 className="h-3.5 w-3.5" /> Send back
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
