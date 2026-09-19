"use client";

import { AlertTriangle, PackageCheck, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { Qty } from "@/components/ui/qty";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

/** A stock item or unique product at or below its reorder level. */
interface LowStockRow {
  kind: "generic" | "unique";
  id: string;
  name: string;
  code: string;
  unit: string;
  on_hand: number;
  reorder_level: number;
  shortfall: number;
  unit_cost: string | null;
  open_request: { id: string; status: string; status_display: string; quantity: number; po_number: string | null } | null;
}

const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";
const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";
const labelClass = "text-xs font-medium text-muted-foreground";

export function LowStock({ onChanged }: { onChanged?: () => void }) {
  const { canWrite } = useUser();
  const canRequest = canWrite("inventory");
  const [rows, setRows] = useState<LowStockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // The request being raised: quantity and the reason on record.
  const [target, setTarget] = useState<LowStockRow | null>(null);
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/low-stock/");
      setRows(data.results ?? []);
    } catch (err) {
      toast.error(getApiError(err, "Could not load the low stock list"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function openRequest(row: LowStockRow) {
    setTarget(row);
    // Enough to get back to the reorder level and hold one level more.
    setQuantity(String(Math.max(row.shortfall + row.reorder_level, 1)));
    setReason("Below reorder level");
  }

  async function submitRequest() {
    if (!target) return;
    const qty = Number(quantity) || 0;
    if (qty < 1) { toast.error("Ask for at least one."); return; }
    setSaving(true);
    try {
      await api.post("/inventory/reorder-requests/", {
        [target.kind === "unique" ? "unit_type" : "item"]: target.id,
        quantity: qty,
        reason: reason.trim(),
      });
      toast.success(`Reorder request raised — ${qty} ${target.unit} of ${target.name} is now under Procurement › To Procure`);
      setTarget(null);
      fetchRows();
      onChanged?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the reorder request"));
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(row: LowStockRow) {
    if (!row.open_request) return;
    if (!window.confirm(`Withdraw the reorder request for ${row.name}?`)) return;
    try {
      await api.post(`/inventory/reorder-requests/${row.open_request.id}/cancel/`, { reason: "Withdrawn from Low Stock" });
      toast.success("Reorder request withdrawn");
      fetchRows();
      onChanged?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not withdraw the request"));
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Stock items and unique products at or below their reorder level. Raise a reorder request here and it
        goes to Procurement › To Procure to be put on a purchase order; it closes when the goods are received
        into stock. Reorder levels are set on each component.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <PackageCheck className="mx-auto h-12 w-12 text-emerald-500/40" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">Nothing below its reorder level</h3>
          <p className="mt-2 text-sm text-muted-foreground">Every stock item and unique product is above the level set on it.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Component</th>
                  <th className={thClass}>Kind</th>
                  <th className={`${thClass} text-right`}>On Hand</th>
                  <th className={`${thClass} text-right`}>Reorder Level</th>
                  <th className={`${thClass} text-right`}>Shortfall</th>
                  <th className={thClass}>Reorder Request</th>
                  {canRequest && <th className={thClass}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.kind}:${r.id}`} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-medium text-foreground`}>
                      {r.name}
                      <span className="block font-mono text-2xs text-muted-foreground">{r.code}</span>
                    </td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ${r.kind === "unique" ? "bg-indigo-500/10 text-indigo-600" : "bg-secondary text-muted-foreground"}`}>
                        {r.kind === "unique" ? "Unique item" : "Generic stock"}
                      </span>
                    </td>
                    <td className={`${tdClass} text-right font-medium ${r.on_hand === 0 ? "text-red-600" : "text-amber-600"}`}>
                      <Qty value={r.on_hand} unit={r.unit} />
                    </td>
                    <td className={`${tdClass} text-right text-muted-foreground`}><Qty value={r.reorder_level} unit={r.unit} /></td>
                    <td className={`${tdClass} text-right text-foreground`}>
                      {r.shortfall > 0 ? <Qty value={r.shortfall} unit={r.unit} /> : <span className="text-muted-foreground">at level</span>}
                    </td>
                    <td className={tdClass}>
                      {r.open_request ? (
                        <span className="inline-flex items-center gap-2">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${
                            r.open_request.status === "ordered" ? "bg-blue-500/10 text-blue-600 ring-blue-500/20" : "bg-amber-500/10 text-amber-600 ring-amber-500/20"
                          }`}>
                            {r.open_request.status_display} · <Qty value={r.open_request.quantity} unit={r.unit} />
                          </span>
                          {r.open_request.po_number && <span className="font-mono text-2xs text-muted-foreground">{r.open_request.po_number}</span>}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground"><AlertTriangle className="h-3 w-3 text-amber-500" /> Not requested</span>
                      )}
                    </td>
                    {canRequest && (
                      <td className={tdClass}>
                        {r.open_request ? (
                          r.open_request.status === "open" ? (
                            <button onClick={() => withdraw(r)} className="rounded-lg border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                              Withdraw
                            </button>
                          ) : (
                            <span className="text-2xs text-muted-foreground">On order</span>
                          )
                        ) : (
                          <button onClick={() => openRequest(r)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-2xs font-medium text-white transition-all hover:opacity-90">
                            <ShoppingCart className="h-3 w-3" /> Request procurement
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title={target ? `Reorder — ${target.name}` : "Reorder"} size="sm">
        {target && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground"><Qty value={target.on_hand} unit={target.unit} /></span> on hand against a
              reorder level of <span className="font-semibold text-foreground"><Qty value={target.reorder_level} unit={target.unit} /></span>.
              The request goes to Procurement › To Procure to be put on a purchase order.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="reorder_qty" className={labelClass}>Reorder quantity ({target.unit})</label>
              <input id="reorder_qty" type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} autoFocus />
              <p className="text-2xs text-muted-foreground">Suggested: the shortfall plus one more reorder level.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="reorder_reason" className={labelClass}>Reason</label>
              <input id="reorder_reason" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="e.g. Below reorder level" />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setTarget(null)} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
              <button type="button" onClick={submitRequest} disabled={saving || Number(quantity) < 1} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                <ShoppingCart className="h-3.5 w-3.5" /> Raise reorder request
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
