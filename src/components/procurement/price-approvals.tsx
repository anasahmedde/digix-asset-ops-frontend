"use client";

import { AlertTriangle, Check, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

/**
 * A purchase order line that costs more than anybody planned for.
 *
 * The buyer cannot wave this through — that is the point — so it waits here
 * for the side whose figure was passed: Execution for a project's parts,
 * Inventory for the store's own, Operations for an asset bought on its own.
 */
interface Variance {
  id: string;
  /** Which kind of order it sits on — the decision goes to a different
   *  endpoint for each, though it is the same argument either way. */
  kind?: "purchase" | "work";
  order: string;
  order_number: string;
  purchase_order: string | null;
  po_number: string;
  supplier_name: string | null;
  currency: string;
  description: string;
  quantity: number;
  unit_price: string;
  reference_unit_price: string | null;
  reference_label: string;
  variance_percent: number | null;
  variance_owner: string;
  variance_owner_display: string;
  variance_reason: string;
  raised_by: string | null;
}

const money = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isNaN(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

/**
 * The queue of prices waiting on this user's word.
 *
 * Mounted wherever the owning side already works — Inventory for the store,
 * the project screen for Execution — rather than asking people to visit
 * Procurement to unblock Procurement. The endpoint scopes by role, so each
 * side only ever sees its own.
 */
export function PriceApprovals({
  /** Shown when nothing is waiting; hidden entirely if false. */
  showWhenEmpty = true,
  onChanged,
}: {
  showWhenEmpty?: boolean;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Variance[]>([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<{ row: Variance; approve: boolean } | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/procurement/purchase-orders/price-variances/");
      setRows(data.results ?? []);
    } catch {
      // A role with nothing to decide is not an error worth shouting about.
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function decide() {
    if (!deciding) return;
    if (!deciding.approve && !notes.trim()) {
      toast.error("Say why it is refused — the buyer has to act on it");
      return;
    }
    setSaving(true);
    try {
      // Buying a part and buying an operation are the same argument about
      // the same kind of figure; only the order they sit on differs.
      const path = deciding.row.kind === "work"
        ? `/work-orders/${deciding.row.order}/price-variance/`
        : `/procurement/purchase-orders/${deciding.row.order ?? deciding.row.purchase_order}/price-variance/`;
      const { data } = await api.post(
        path,
        { item: deciding.row.id, approve: deciding.approve, notes: notes.trim() },
      );
      toast.success(data.detail);
      setDeciding(null);
      setNotes("");
      fetchRows();
      onChanged?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not record that"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;
  if (rows.length === 0 && !showWhenEmpty) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-foreground">Prices waiting on you</h3>
        {rows.length > 0 && (
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-medium text-amber-600 ring-1 ring-amber-500/20">
            {rows.length}
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          Nothing is priced over plan. An order that goes over comes here before it can be signed.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Line</th>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 text-right font-medium">Planned</th>
                  <th className="px-4 py-3 text-right font-medium">Quoted</th>
                  <th className="px-4 py-3 font-medium">Why</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{r.description}</span>
                      <span className="block text-2xs text-muted-foreground">
                        {r.quantity} × · {r.variance_owner_display}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="font-mono text-xs text-foreground">
                        {r.order_number ?? r.po_number}
                      </span>
                      {r.kind === "work" && (
                        <span className="ml-1.5 rounded-full bg-secondary px-1.5 py-0.5 text-2xs text-muted-foreground">
                          work order
                        </span>
                      )}
                      <span className="block text-2xs">
                        {r.supplier_name ?? "—"}{r.raised_by ? ` · ${r.raised_by}` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {money(r.reference_unit_price)}
                      <span className="block text-2xs">{r.reference_label}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold tabular-nums text-foreground">
                        {money(r.unit_price)}
                      </span>
                      {r.variance_percent != null && (
                        <span className="block text-2xs font-medium text-amber-600">
                          +{r.variance_percent}% over
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-xs text-muted-foreground">
                      {r.variance_reason || <span className="italic">No reason given</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => { setDeciding({ row: r, approve: true }); setNotes(""); }}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-primary px-2.5 py-1 text-2xs font-medium text-white transition-all"
                        >
                          <Check className="h-3 w-3" /> Agree
                        </button>
                        <button
                          onClick={() => { setDeciding({ row: r, approve: false }); setNotes(""); }}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          <Undo2 className="h-3 w-3" /> Refuse
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={!!deciding}
        onClose={() => setDeciding(null)}
        title={deciding?.approve ? "Agree this price" : "Refuse this price"}
        size="sm"
      >
        {deciding && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {deciding.approve ? (
                <>
                  <span className="font-medium text-foreground">{deciding.row.description}</span> goes
                  on {deciding.row.order_number ?? deciding.row.po_number} at{" "}
                  {money(deciding.row.unit_price)} instead of the{" "}
                  {money(deciding.row.reference_unit_price)} planned. The order can then go up for
                  signature.
                </>
              ) : (
                <>
                  <span className="font-medium text-foreground">{deciding.row.description}</span> goes
                  back to Procurement. The order stays where it is until the price is renegotiated or
                  the line is dropped.
                </>
              )}
            </p>
            <div className="space-y-1.5">
              <label htmlFor="variance_notes" className="text-xs font-medium text-muted-foreground">
                {deciding.approve ? "Note (optional)" : "Reason *"}
              </label>
              <textarea
                id="variance_notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={deciding.approve
                  ? "e.g. Rate rise confirmed with two other suppliers"
                  : "e.g. Get a quote from the Lahore supplier first"}
                className={`${inputClass} h-auto py-2`}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeciding(null)}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={decide}
                disabled={saving || (!deciding.approve && !notes.trim())}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
              >
                {saving ? "Saving…" : deciding.approve ? "Agree the price" : "Refuse it"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
