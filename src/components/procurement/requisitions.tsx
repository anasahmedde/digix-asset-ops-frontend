"use client";

import { ClipboardList, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

/**
 * One thing to buy: a component a project's asset needs, or a whole asset
 * the vendor supplies. Components are keyed by their component id, assets by
 * the asset id; the two never collide because a row is one or the other.
 */
interface Requisition {
  kind?: "component" | "asset";
  component: string | null;
  device?: string | null;
  name: string;
  asset_code: string;
  project: string | null;
  project_name: string | null;
  required_quantity: number;
  outstanding_quantity: number;
  available_quantity: number | null;
  purchase_order_item: string | null;
  po_number: string | null;
  /** The last price we paid, when there is one to suggest. */
  last_unit_price?: string | null;
}
interface Ref { id: string; name: string }

const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-4 py-3";
const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";
const labelClass = "text-xs font-medium text-muted-foreground";

function keyOf(r: Requisition): string {
  return r.kind === "asset" ? `asset:${r.device}` : `component:${r.component}`;
}

export function Requisitions({ onPoRaised }: { onPoRaised?: () => void }) {
  const { canWrite } = useUser();
  const canBuy = canWrite("procurement");

  const [rows, setRows] = useState<Requisition[]>([]);
  const [suppliers, setSuppliers] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [poModal, setPoModal] = useState(false);
  const [saving, setSaving] = useState(false);
  // Off by default: hiding ordered lines made a re-flagged requirement
  // look like it had vanished.
  const [onlyUnordered, setOnlyUnordered] = useState(false);

  // The order's own details — asked for up front so the draft is complete.
  const [supplier, setSupplier] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/procurement/purchase-orders/requisitions/", {
        params: onlyUnordered ? { unordered: "true" } : {},
      });
      setRows(data.results ?? []);
      setSelected(new Set());
    } catch (err) {
      toast.error(getApiError(err, "Failed to load requisitions"));
    } finally {
      setLoading(false);
    }
  }, [onlyUnordered]);

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
    setPoModal(true);
  }

  function resetModal() {
    setPoModal(false);
    setSupplier("");
    setExpectedDelivery("");
    setTerms("");
    setNotes("");
    setPrices({});
  }

  async function raisePo() {
    if (!supplier || chosen.length === 0) return;
    setSaving(true);
    try {
      const priceById: Record<string, string> = {};
      chosen.forEach((r) => {
        const id = r.kind === "asset" ? r.device : r.component;
        const p = (prices[keyOf(r)] ?? "").trim();
        if (id && p !== "") priceById[id] = p;
      });
      const { data } = await api.post("/procurement/purchase-orders/raise-po/", {
        supplier,
        components: chosen.filter((r) => r.kind !== "asset").map((r) => r.component),
        devices: chosen.filter((r) => r.kind === "asset").map((r) => r.device),
        prices: priceById,
        expected_delivery: expectedDelivery || null,
        terms: terms.trim(),
        notes: notes.trim(),
      });
      toast.success(`${data.po_number} drafted with ${data.items?.length ?? 0} line(s) — review it, then submit it for the Group Head's approval`);
      resetModal();
      fetchRows();
      onPoRaised?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the purchase order"));
    } finally {
      setSaving(false);
    }
  }

  const draftTotal = chosen.reduce((sum, r) => {
    const p = Number(prices[keyOf(r)] ?? 0);
    return sum + (Number.isFinite(p) ? p * r.outstanding_quantity : 0);
  }, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          What projects flagged to buy: components an asset needs, and whole assets the vendor
          supplies. Some components may already be in stock — buying was the deliberate choice.
        </p>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyUnordered}
              onChange={(e) => setOnlyUnordered(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-primary"
            />
            Hide already ordered
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
                  <th className={thClass}>For Asset</th>
                  <th className={thClass}>Project</th>
                  <th className={thClass}>Qty</th>
                  <th className={thClass}>In Stock</th>
                  <th className={thClass}>Purchase Order</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const key = keyOf(r);
                  const isAsset = r.kind === "asset";
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
                        <span className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${
                          isAsset ? "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20" : "bg-secondary text-muted-foreground ring-border"
                        }`}>
                          {isAsset ? "Whole asset" : "Component"}
                        </span>
                      </td>
                      <td className={`${tdClass} font-mono text-muted-foreground`}>{r.asset_code}</td>
                      <td className={`${tdClass} text-muted-foreground`}>{r.project_name ?? "—"}</td>
                      <td className={`${tdClass} font-medium text-foreground`}>{r.outstanding_quantity}</td>
                      <td className={tdClass}>
                        {isAsset ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <>
                            <span className={(r.available_quantity ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground"}>
                              {r.available_quantity ?? 0}
                            </span>
                            {(r.available_quantity ?? 0) >= r.outstanding_quantity && (
                              <span className="block text-[10px] text-muted-foreground">stock would cover it</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className={`${tdClass} font-mono text-muted-foreground`}>{r.po_number ?? "—"}</td>
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
            {chosen.length} line{chosen.length === 1 ? "" : "s"} go on one draft order. Prices can
            still be changed on the draft; once the Group Head approves it, they are fixed.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="req_supplier" className={labelClass}>Supplier *</label>
              <select id="req_supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputClass}>
                <option value="">Select supplier…</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="req_delivery" className={labelClass}>Expected delivery</label>
              <input id="req_delivery" type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Line</th>
                  <th className="px-3 py-2 font-medium">For</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit price</th>
                  <th className="px-3 py-2 text-right font-medium">Line total</th>
                </tr>
              </thead>
              <tbody>
                {chosen.map((r) => {
                  const key = keyOf(r);
                  const price = Number(prices[key] ?? 0);
                  return (
                    <tr key={key} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-2 font-medium text-foreground">{r.name}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{r.asset_code}</td>
                      <td className="px-3 py-2 text-right text-foreground">{r.outstanding_quantity}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={prices[key] ?? ""}
                          onChange={(e) => setPrices((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder="last paid"
                          aria-label={`Unit price for ${r.name}`}
                          className="h-8 w-28 rounded-lg border border-border bg-background px-2 text-right text-xs text-foreground focus:border-primary/50 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {prices[key] ? (price * r.outstanding_quantity).toLocaleString() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-secondary/30">
                  <td colSpan={4} className="px-3 py-2 text-right font-medium text-muted-foreground">Draft total</td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{draftTotal.toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A blank price falls back to what we last paid for that line, or zero if we never have.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="req_terms" className={labelClass}>Terms</label>
              <textarea
                id="req_terms"
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Blank uses the standard terms"
                className={`${inputClass} h-auto py-2`}
              />
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
          </div>

          <div className="flex justify-end gap-3">
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
              disabled={saving || !supplier || chosen.length === 0}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
            >
              {saving ? "Raising…" : "Raise draft PO"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
