"use client";

import { Check, Lock, PackagePlus, PackageSearch, RotateCcw, ShoppingCart, Split, Warehouse, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { Modal } from "@/components/ui/modal";
import { useUser } from "@/lib/user-context";

interface RequirementRow {
  id: string;
  name: string;
  quantity: number;
  issued_quantity: number;
  outstanding_quantity: number;
  available_quantity: number | null;
  can_use_stock: boolean;
  fulfilment: string;
  source_label: string | null;
  po_number: string | null;
  /** An increase asked for but not yet granted. */
  pending_increase: number | null;
  increase_reason: string;
  increase_notes: string;
  increase_requested_by_name: string | null;
}
interface AssetGroup {
  id: string;
  asset_code: string;
  display_name: string;
  status: string;
  components: RequirementRow[];
}
interface Totals {
  required: number;
  issued: number;
  outstanding: number;
  awaiting_decision: number;
  to_procure: number;
}
interface BudgetState {
  has_plan: boolean;
  status: string;
  status_display: string;
}

const FULFILMENT_LABELS: Record<string, string> = {
  pending: "Not decided",
  from_stock: "From inventory",
  procurement: "To be procured",
  fulfilled: "Fulfilled",
};
const FULFILMENT_BADGES: Record<string, string> = {
  pending: "bg-secondary text-muted-foreground ring-border",
  from_stock: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  procurement: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  fulfilled: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
};

// Who may grant an increase (mirrors the backend).
const MANAGER_ROLES = ["super_admin", "group_head", "ops_manager"];

// Why a requirement grew once the work was under way (mirrors the backend).
const INCREASE_REASONS = [
  { value: "damaged", label: "Damaged / manhandled" },
  { value: "miscalculated", label: "Miscalculated" },
  { value: "faulty", label: "Faulty on arrival" },
  { value: "other", label: "Other" },
];

const thClass = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-4 py-2.5";
const fieldClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";

export function ProjectRequirements({ projectId }: { projectId: string }) {
  const { canWrite, user } = useUser();
  // Fulfilment writes to asset components, so it follows the devices rule.
  const canDecide = canWrite("devices") || canWrite("inventory");
  // Granting more than was planned is a manager's call (the backend agrees).
  const canApproveIncrease = user != null && MANAGER_ROLES.includes(user.role);

  const [assets, setAssets] = useState<AssetGroup[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [budget, setBudget] = useState<BudgetState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [increaseFor, setIncreaseFor] = useState<RequirementRow | null>(null);
  const [increase, setIncrease] = useState({ additional: "1", reason: "damaged", notes: "" });
  // Covering one requirement from both sides at once.
  const [splitFor, setSplitFor] = useState<RequirementRow | null>(null);
  const [split, setSplit] = useState({ fromStock: "0", toProcure: "0" });

  const fetchRequirements = useCallback(async () => {
    setLoading(true);
    try {
      const [req, plan] = await Promise.all([
        api.get(`/teams/projects/${projectId}/requirements/`),
        api.get(`/teams/projects/${projectId}/plan/`).catch(() => null),
      ]);
      setAssets(req.data.assets ?? []);
      setTotals(req.data.totals ?? null);
      setBudget(plan?.data ?? null);
    } catch (err) {
      toast.error(getApiError(err, "Failed to load the project's requirements"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchRequirements(); }, [fetchRequirements]);

  // Execution follows approval: a plan that exists but is not signed off
  // locks the stock / procure decisions (the backend refuses them too).
  const locked = budget != null && budget.has_plan && budget.status !== "approved";

  async function act(row: RequirementRow, path: string, success: string) {
    setBusy(row.id);
    try {
      await api.post(`/assets/components/${row.id}/${path}/`, {});
      toast.success(success);
      fetchRequirements();
    } catch (err) {
      toast.error(getApiError(err, "That did not work"));
    } finally {
      setBusy(null);
    }
  }

  async function submitIncrease(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!increaseFor) return;
    setBusy(increaseFor.id);
    try {
      await api.post(`/assets/components/${increaseFor.id}/increase-quantity/`, {
        additional: Number(increase.additional),
        reason: increase.reason,
        notes: increase.notes.trim(),
      });
      toast.success(`${increaseFor.name}: increase sent for approval`);
      setIncreaseFor(null);
      fetchRequirements();
    } catch (err) {
      toast.error(getApiError(err, "Could not request the increase"));
    } finally {
      setBusy(null);
    }
  }

  function openSplit(row: RequirementRow) {
    // Default to taking what the warehouse can actually cover.
    const fromStock = Math.min(row.available_quantity ?? 0, row.outstanding_quantity);
    setSplit({
      fromStock: String(fromStock),
      toProcure: String(row.outstanding_quantity - fromStock),
    });
    setSplitFor(row);
  }

  async function submitSplit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!splitFor) return;
    const fromStock = Number(split.fromStock) || 0;
    const toProcure = Number(split.toProcure) || 0;
    if (fromStock + toProcure !== splitFor.outstanding_quantity) {
      toast.error(`The two must add up to ${splitFor.outstanding_quantity} still outstanding.`);
      return;
    }
    if (fromStock > (splitFor.available_quantity ?? 0)) {
      toast.error(`Only ${splitFor.available_quantity ?? 0} in stock.`);
      return;
    }
    setBusy(splitFor.id);
    try {
      // Issue first: that reduces what is outstanding, so flagging the rest
      // for procurement covers exactly the remainder.
      if (fromStock > 0) {
        await api.post(`/assets/components/${splitFor.id}/fulfil-from-stock/`, { quantity: fromStock });
      }
      if (toProcure > 0) {
        await api.post(`/assets/components/${splitFor.id}/mark-for-procurement/`, {});
      }
      toast.success(
        fromStock && toProcure
          ? `${fromStock} asked of the store, ${toProcure} to procure`
          : fromStock ? "Asked the store for this" : "Flagged for procurement",
      );
      setSplitFor(null);
      fetchRequirements();
    } catch (err) {
      toast.error(getApiError(err, "Could not record that decision"));
    } finally {
      setBusy(null);
    }
  }

  async function decideIncrease(row: RequirementRow, decision: "approve" | "reject") {
    setBusy(row.id);
    try {
      await api.post(`/assets/components/${row.id}/${decision}-increase/`, {});
      toast.success(decision === "approve" ? "Increase approved" : "Increase turned down");
      fetchRequirements();
    } catch (err) {
      toast.error(getApiError(err, "Could not record that decision"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Everything the assets on this project are built from, gathered automatically from each asset.
        Decide per line whether to take it from inventory or procure it — procuring stays available
        even when stock would cover it. If parts get damaged, were miscounted or arrive faulty,
        increase the quantity so the project can still be finished.
      </p>

      {locked && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-700">Budget {budget?.status_display.toLowerCase()}</p>
            <p className="text-xs text-muted-foreground">
              Stock and procurement decisions open once the project budget is approved in Planning.
            </p>
          </div>
        </div>
      )}
      {budget != null && !budget.has_plan && (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-[11px] text-muted-foreground">
          No budget has been planned for this project. Plan and approve it first to keep execution within an agreed figure.
        </p>
      )}

      {totals && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Required", value: totals.required },
            { label: "Issued", value: totals.issued },
            { label: "Outstanding", value: totals.outstanding },
            { label: "Awaiting Decision", value: totals.awaiting_decision },
            { label: "To Procure", value: totals.to_procure },
          ].map((t) => (
            <div key={t.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t.label}</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{t.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <PackageSearch className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No assets on this project</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Link assets to the project and add their components — they appear here automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {assets.map((asset) => (
            <div key={asset.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-3">
                <div>
                  <p className="font-mono text-sm font-semibold text-foreground">{asset.asset_code}</p>
                  <p className="text-xs text-muted-foreground">{asset.display_name}</p>
                </div>
                <span className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted-foreground ring-1 ring-border">
                  {asset.status.replace(/_/g, " ")}
                </span>
              </div>

              {asset.components.length === 0 ? (
                <p className="px-4 py-4 text-xs text-muted-foreground">
                  No components on this asset yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className={thClass}>Component</th>
                        <th className={thClass}>Required</th>
                        <th className={thClass}>Issued</th>
                        <th className={thClass}>In Stock</th>
                        <th className={thClass}>Fulfilment</th>
                        {canDecide && <th className={thClass}>Decision</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {asset.components.map((row) => {
                        const short = (row.available_quantity ?? 0) < row.outstanding_quantity;
                        return (
                          <tr key={row.id} className="border-b border-border/60 last:border-0">
                            <td className={`${tdClass} font-medium text-foreground`}>
                              {row.name}
                              {row.source_label && (
                                <span className="block text-[11px] font-normal text-muted-foreground">
                                  {row.source_label}
                                </span>
                              )}
                            </td>
                            <td className={`${tdClass} text-foreground`}>{row.quantity}</td>
                            <td className={`${tdClass} text-muted-foreground`}>{row.issued_quantity}</td>
                            <td className={`${tdClass} ${short ? "text-amber-600" : "text-muted-foreground"}`}>
                              {row.available_quantity ?? "—"}
                              {short && row.outstanding_quantity > 0 && (
                                <span className="block text-[11px]">
                                  short {row.outstanding_quantity - (row.available_quantity ?? 0)}
                                </span>
                              )}
                            </td>
                            <td className={tdClass}>
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${FULFILMENT_BADGES[row.fulfilment]}`}>
                                {FULFILMENT_LABELS[row.fulfilment] ?? row.fulfilment}
                              </span>
                              {row.po_number && (
                                <span className="block font-mono text-[11px] text-muted-foreground">{row.po_number}</span>
                              )}
                              {row.pending_increase ? (
                                <span
                                  className="mt-1 inline-flex rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-600 ring-1 ring-violet-500/20"
                                  title={
                                    `+${row.pending_increase} asked for` +
                                    (row.increase_requested_by_name ? ` by ${row.increase_requested_by_name}` : "") +
                                    (row.increase_notes ? ` — ${row.increase_notes}` : "")
                                  }
                                >
                                  +{row.pending_increase} awaiting approval
                                </span>
                              ) : null}
                            </td>
                            {canDecide && (
                              <td className={tdClass}>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {row.outstanding_quantity > 0 && (
                                    <>
                                      <button
                                        onClick={() => act(row, "fulfil-from-stock", "Asked the store for this")}
                                        disabled={locked || busy === row.id}
                                        title={locked ? "Locked until the budget is approved" : "Ask the store to issue this from inventory"}
                                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                                      >
                                        <Warehouse className="h-3 w-3" /> Ask store
                                      </button>
                                      <button
                                        onClick={() => act(row, "mark-for-procurement", "Flagged for procurement")}
                                        disabled={locked || busy === row.id || row.fulfilment === "procurement"}
                                        title={locked ? "Locked until the budget is approved" : "Buy this, even if stock is available"}
                                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                                      >
                                        <ShoppingCart className="h-3 w-3" /> Procure
                                      </button>
                                      <button
                                        onClick={() => openSplit(row)}
                                        disabled={locked || busy === row.id}
                                        title={locked ? "Locked until the budget is approved" : "Take some from inventory and buy the rest"}
                                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                                      >
                                        <Split className="h-3 w-3" /> Split
                                      </button>
                                    </>
                                  )}
                                  {row.pending_increase && canApproveIncrease ? (
                                    <>
                                      <button
                                        onClick={() => decideIncrease(row, "approve")}
                                        disabled={busy === row.id}
                                        title={`Approve +${row.pending_increase}`}
                                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 px-2.5 py-1 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
                                      >
                                        <Check className="h-3 w-3" /> Approve
                                      </button>
                                      <button
                                        onClick={() => decideIncrease(row, "reject")}
                                        disabled={busy === row.id}
                                        title="Turn this increase down"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </>
                                  ) : null}
                                  <button
                                    onClick={() => { setIncrease({ additional: "1", reason: "damaged", notes: "" }); setIncreaseFor(row); }}
                                    disabled={busy === row.id || !!row.pending_increase}
                                    title={row.pending_increase ? "An increase is already waiting for approval" : "Need more than planned? Ask for an increase"}
                                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
                                  >
                                    <PackagePlus className="h-3 w-3" /> Qty
                                  </button>
                                  {(row.fulfilment !== "pending" || row.issued_quantity > 0) && (
                                    <button
                                      onClick={() => act(row, "reset-fulfilment", "Decision cleared")}
                                      disabled={busy === row.id}
                                      title="Undo — returns anything already issued"
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                                    >
                                      <RotateCcw className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Asking for more mid-project, with the reason on record. */}
      <Modal
        open={!!increaseFor}
        onClose={() => setIncreaseFor(null)}
        title={increaseFor ? `Request more — ${increaseFor.name}` : "Request more"}
      >
        {increaseFor && (
          <form onSubmit={submitIncrease} className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Currently <span className="font-semibold text-foreground">{increaseFor.quantity}</span> required,{" "}
              {increaseFor.issued_quantity} issued. The extra spends money that was already signed off, so a
              manager approves it before the requirement moves. The reason is journalled on the asset.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="inc-qty" className="text-xs font-medium text-muted-foreground">Additional quantity</label>
                <input
                  id="inc-qty"
                  type="number"
                  min={1}
                  value={increase.additional}
                  onChange={(e) => setIncrease({ ...increase, additional: e.target.value })}
                  className={fieldClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="inc-reason" className="text-xs font-medium text-muted-foreground">Reason</label>
                <select
                  id="inc-reason"
                  value={increase.reason}
                  onChange={(e) => setIncrease({ ...increase, reason: e.target.value })}
                  className={fieldClass}
                >
                  {INCREASE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="inc-notes" className="text-xs font-medium text-muted-foreground">
                What happened{increase.reason === "other" ? " *" : ""}
              </label>
              <textarea
                id="inc-notes"
                rows={2}
                value={increase.notes}
                onChange={(e) => setIncrease({ ...increase, notes: e.target.value })}
                placeholder="e.g. Two modules cracked during unloading"
                className={`${fieldClass} h-auto py-2`}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIncreaseFor(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  busy === increaseFor.id || Number(increase.additional) < 1 ||
                  (increase.reason === "other" && !increase.notes.trim())
                }
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Request {Math.max(0, Number(increase.additional) || 0)} more
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Covering one requirement from both sides: some stock, the rest bought. */}
      <Modal
        open={!!splitFor}
        onClose={() => setSplitFor(null)}
        title={splitFor ? `Split the decision — ${splitFor.name}` : "Split the decision"}
        size="sm"
      >
        {splitFor && (() => {
          const fromStock = Number(split.fromStock) || 0;
          const toProcure = Number(split.toProcure) || 0;
          const balanced = fromStock + toProcure === splitFor.outstanding_quantity;
          const overStock = fromStock > (splitFor.available_quantity ?? 0);
          return (
            <form onSubmit={submitSplit} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{splitFor.outstanding_quantity}</span> still
                outstanding, <span className="font-semibold text-foreground">{splitFor.available_quantity ?? 0}</span>{" "}
                on the shelf. Decide how much to ask the store for and how much to buy — the store issues
                what it can, and anything short stays on its queue.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="split-stock" className="text-xs font-medium text-muted-foreground">
                    Ask the store for
                  </label>
                  <input
                    id="split-stock"
                    type="number"
                    min={0}
                    max={Math.min(splitFor.available_quantity ?? 0, splitFor.outstanding_quantity)}
                    value={split.fromStock}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSplit({
                        fromStock: next,
                        toProcure: String(Math.max(0, splitFor.outstanding_quantity - (Number(next) || 0))),
                      });
                    }}
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="split-procure" className="text-xs font-medium text-muted-foreground">
                    To procure
                  </label>
                  <input
                    id="split-procure"
                    type="number"
                    min={0}
                    max={splitFor.outstanding_quantity}
                    value={split.toProcure}
                    onChange={(e) => {
                      const next = e.target.value;
                      setSplit({
                        fromStock: String(Math.max(0, splitFor.outstanding_quantity - (Number(next) || 0))),
                        toProcure: next,
                      });
                    }}
                    className={fieldClass}
                  />
                </div>
              </div>
              {!balanced && (
                <p className="text-[11px] text-amber-600">
                  The two must add up to {splitFor.outstanding_quantity}.
                </p>
              )}
              {overStock && (
                <p className="text-[11px] text-amber-600">
                  Only {splitFor.available_quantity ?? 0} in stock.
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSplitFor(null)}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy === splitFor.id || !balanced || overStock}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  Confirm split
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
}
