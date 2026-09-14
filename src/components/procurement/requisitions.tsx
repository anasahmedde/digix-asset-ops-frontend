"use client";

import { ClipboardList, ShoppingCart } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface Requisition {
  component: string;
  name: string;
  asset_code: string;
  project: string | null;
  project_name: string | null;
  required_quantity: number;
  outstanding_quantity: number;
  available_quantity: number | null;
  purchase_order_item: string | null;
  po_number: string | null;
}
interface Ref { id: string; name: string }

const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-4 py-3";
const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

export function Requisitions({ onPoRaised }: { onPoRaised?: () => void }) {
  const { canWrite } = useUser();
  const canBuy = canWrite("procurement");

  const [rows, setRows] = useState<Requisition[]>([]);
  const [suppliers, setSuppliers] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [poModal, setPoModal] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [saving, setSaving] = useState(false);
  // Off by default: hiding ordered lines made a re-flagged requirement
  // look like it had vanished.
  const [onlyUnordered, setOnlyUnordered] = useState(false);

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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectable = useMemo(() => rows.filter((r) => !r.purchase_order_item), [rows]);

  async function raisePo() {
    if (!supplier || selected.size === 0) return;
    setSaving(true);
    try {
      const { data } = await api.post("/procurement/purchase-orders/raise-po/", {
        supplier,
        components: Array.from(selected),
      });
      toast.success(`${data.po_number} raised with ${data.items?.length ?? 0} line(s)`);
      setPoModal(false);
      setSupplier("");
      fetchRows();
      onPoRaised?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the purchase order"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Asset requirements the project flagged to buy. Some may already be in stock — buying was
          the deliberate choice.
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
              onClick={() => setPoModal(true)}
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
            Requirements marked &ldquo;Procure&rdquo; on a project appear here.
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
                          setSelected(e.target.checked ? new Set(selectable.map((r) => r.component)) : new Set())
                        }
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                    </th>
                  )}
                  <th className={thClass}>Component</th>
                  <th className={thClass}>Asset</th>
                  <th className={thClass}>Project</th>
                  <th className={thClass}>To Buy</th>
                  <th className={thClass}>In Stock</th>
                  <th className={thClass}>Purchase Order</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.component} className="border-b border-border transition-colors hover:bg-secondary/30">
                    {canBuy && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.name}`}
                          disabled={!!r.purchase_order_item}
                          checked={selected.has(r.component)}
                          onChange={() => toggle(r.component)}
                          className="h-4 w-4 rounded border-border accent-primary disabled:opacity-40"
                        />
                      </td>
                    )}
                    <td className={`${tdClass} font-medium text-foreground`}>{r.name}</td>
                    <td className={`${tdClass} font-mono text-muted-foreground`}>{r.asset_code}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{r.project_name ?? "—"}</td>
                    <td className={`${tdClass} font-medium text-foreground`}>{r.outstanding_quantity}</td>
                    <td className={tdClass}>
                      <span className={(r.available_quantity ?? 0) > 0 ? "text-amber-600" : "text-muted-foreground"}>
                        {r.available_quantity ?? 0}
                      </span>
                      {(r.available_quantity ?? 0) >= r.outstanding_quantity && (
                        <span className="block text-[10px] text-muted-foreground">stock would cover it</span>
                      )}
                    </td>
                    <td className={`${tdClass} font-mono text-muted-foreground`}>{r.po_number ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={poModal} onClose={() => setPoModal(false)} title="Raise Purchase Order" size="md">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {selected.size} requirement{selected.size === 1 ? "" : "s"} will become lines on one draft
            purchase order, at the quantities still outstanding.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="req_supplier" className="text-xs font-medium text-muted-foreground">Supplier *</label>
            <select id="req_supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} className={inputClass}>
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setPoModal(false)}
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={raisePo}
              disabled={saving || !supplier}
              className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
            >
              {saving ? "Raising…" : "Raise PO"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
