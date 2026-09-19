"use client";

import { ArrowRight, Check, Factory, Lock, PackagePlus, PackageSearch, RotateCcw, ShoppingCart, Truck, Warehouse, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Qty } from "@/components/ui/qty";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { Modal } from "@/components/ui/modal";
import { useUser } from "@/lib/user-context";

interface RequirementRow {
  id: string;
  name: string;
  quantity: number;
  /** Unit of measure the line is counted in. */
  unit?: string;
  issued_quantity: number;
  outstanding_quantity: number;
  /** Decisions already taken on this line, and what is still open. */
  stock_requested_quantity?: number;
  procure_quantity?: number;
  undecided_quantity?: number;
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
/** One operation of an in-house route, with the execution decision on it. */
interface StepRow {
  id: string;
  step_number: number;
  name: string;
  status: string;
  status_display: string;
  location: "undecided" | "in_house" | "external";
  location_display: string;
  workshop_display: string | null;
  planned_cost: string | null;
  /** True while the project still has to say where this operation happens. */
  decision_pending?: boolean;
  work_order: {
    id: string; wo_number: string; status: string; status_display: string; amount: string;
    supplier_name?: string | null; delivered_at?: string | null;
    inspected_by_name?: string | null; inspected_at?: string | null;
    inspection_result?: "accepted" | "rework" | null; inspection_notes?: string;
  } | null;
  /** Execution asked for a work order that Work Orders has not raised yet. */
  work_order_requested?: boolean;
}
interface AssetGroup {
  id: string;
  asset_code: string;
  display_name: string;
  status: string;
  status_display?: string;
  /** Bought complete from a vendor: no components, no route — one procure decision. */
  vendor_asset: boolean;
  source: string;
  source_display?: string;
  purchase_price?: string | null;
  supply_vendor_name?: string | null;
  procurement_requested_at?: string | null;
  po_number?: string | null;
  po_status?: string | null;
  steps: StepRow[];
  route_complete: boolean;
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

const thClass = "px-3 py-2 text-left text-2xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-4 py-2.5";
const fieldClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";

export function ProjectRequirements({ projectId }: { projectId: string }) {
  const { canWrite, user } = useUser();
  const router = useRouter();
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
  // The decision being taken: from inventory or to procure, and how many.
  const [decideFor, setDecideFor] = useState<{ row: RequirementRow; mode: "inventory" | "procure" } | null>(null);
  const [decideQty, setDecideQty] = useState("1");

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

  /** Vendor asset: the one decision is to buy it complete — Procurement raises the PO. */
  async function procureAsset(asset: AssetGroup, undo = false) {
    setBusy(asset.id);
    try {
      const { data } = await api.post(`/teams/projects/${projectId}/procure-asset/`, { device: asset.id, undo });
      toast.success(data.detail ?? "Sent to Procurement");
      await fetchRequirements();
    } catch (err) {
      toast.error(getApiError(err, "Could not send that asset to Procurement"));
    } finally {
      setBusy(null);
    }
  }

  /** Route decision: this operation happens on our own floor. */
  async function stepInhouse(step: StepRow) {
    setBusy(step.id);
    try {
      await api.post(`/assets/production-steps/${step.id}/decide/`, { location: "in_house" });
      toast.success(`${step.name} — in-house`);
      await fetchRequirements();
    } catch (err) {
      toast.error(getApiError(err, "Could not change that operation"));
    } finally {
      setBusy(null);
    }
  }

  /** Execution decides the operation goes to a vendor; Work Orders › Requests picks the vendor and raises the order. */
  async function requestStepWorkOrder(step: StepRow) {
    setBusy(step.id);
    try {
      await api.post(`/assets/production-steps/${step.id}/decide/`, { location: "external" });
      toast.success(`${step.name} — work order requested. Raise it under Work Orders › Requests.`);
      await fetchRequirements();
    } catch (err) {
      toast.error(getApiError(err, "Could not request the work order"));
    } finally {
      setBusy(null);
    }
  }

  /** Built: finish the asset into stock and open its record to assign a site and technician. */
  async function assignForInstallation(asset: AssetGroup) {
    setBusy(asset.id);
    try {
      await api.post(`/assets/devices/${asset.id}/ready-for-installation/`, {});
      router.push(`/assets?device=${asset.id}&assign=1`);
    } catch (err) {
      toast.error(getApiError(err, "The asset is not ready to assign yet"));
    } finally {
      setBusy(null);
    }
  }

  /** How much of a line is still open to a decision — the cap on any prompt. */
  function openQty(row: RequirementRow): number {
    return row.undecided_quantity ?? row.outstanding_quantity;
  }

  /** How much a decision may cover: what is undecided — and, from inventory, no more than the shelf holds. */
  function decisionCap(row: RequirementRow, mode: "inventory" | "procure") {
    const open = openQty(row);
    return mode === "inventory" ? Math.min(open, Math.max(row.available_quantity ?? 0, 0)) : open;
  }

  function openDecision(row: RequirementRow, mode: "inventory" | "procure") {
    const cap = decisionCap(row, mode);
    setDecideQty(String(Math.max(1, cap)));
    setDecideFor({ row, mode });
  }

  async function submitDecision(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!decideFor) return;
    const { row, mode } = decideFor;
    const cap = decisionCap(row, mode);
    const qty = Number(decideQty) || 0;
    if (qty < 1 || qty > cap) {
      toast.error(`Enter between 1 and ${cap}.`);
      return;
    }
    setBusy(row.id);
    try {
      const path = mode === "inventory" ? "fulfil-from-stock" : "mark-for-procurement";
      await api.post(`/assets/components/${row.id}/${path}/`, { quantity: qty });
      toast.success(mode === "inventory" ? `${qty} × ${row.name} asked of the store` : `${qty} × ${row.name} to procure`);
      setDecideFor(null);
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
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground">
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
                <div className="flex flex-wrap items-center gap-2">
                  {asset.vendor_asset && (
                    <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-2xs font-medium text-indigo-600 ring-1 ring-indigo-500/20">
                      {asset.source_display ?? "Vendor supplied"}
                    </span>
                  )}
                  <span className="rounded-full bg-card px-2.5 py-0.5 text-xs text-muted-foreground ring-1 ring-border">
                    {asset.status_display ?? asset.status.replace(/_/g, " ")}
                  </span>
                  {canDecide && ["in_production", "in_stock"].includes(asset.status) && (asset.vendor_asset || asset.route_complete) && (
                    <button
                      onClick={() => assignForInstallation(asset)}
                      disabled={busy === asset.id}
                      title={asset.status === "in_stock" ? "Open the asset to assign its site and technician" : "Finish the build into stock, then assign its site and technician"}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      Assign for installation <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {asset.vendor_asset ? (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                  <div className="text-sm">
                    <p className="font-medium text-foreground">Complete asset from the vendor</p>
                    <p className="text-xs text-muted-foreground">
                      Bought whole on a purchase order — no components or production route of its own.
                      {asset.supply_vendor_name ? ` Vendor: ${asset.supply_vendor_name}.` : ""}
                      {asset.purchase_price ? ` Planned price PKR ${Number(asset.purchase_price).toLocaleString()}.` : " No price in the plan yet."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {asset.status !== "procured" ? (
                      <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-500/20">
                        Received{asset.po_number ? ` · ${asset.po_number}` : ""}
                      </span>
                    ) : asset.po_number ? (
                      <Link href="/procurement" className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-amber-500/20 hover:underline">
                        On {asset.po_number} · {(asset.po_status ?? "").replace(/_/g, " ")}
                      </Link>
                    ) : asset.procurement_requested_at ? (
                      <>
                        <Link href="/procurement" className="inline-flex rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-amber-500/20 hover:underline">
                          To be procured · raise the PO in Procurement
                        </Link>
                        {canDecide && (
                          <button
                            onClick={() => procureAsset(asset, true)}
                            disabled={locked || busy === asset.id}
                            title="Take it back — no purchase order raised yet"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="inline-flex rounded-full bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground ring-1 ring-border">Not decided</span>
                        {canDecide && (
                          <button
                            onClick={() => procureAsset(asset)}
                            disabled={locked || busy === asset.id}
                            title={locked ? "Locked until the budget is approved" : "Send the complete asset to Procurement to raise the purchase order"}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                          >
                            <ShoppingCart className="h-3.5 w-3.5" /> Procure from vendor
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : asset.components.length === 0 ? (
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
                                <span className="block text-2xs font-normal text-muted-foreground">
                                  {row.source_label}
                                </span>
                              )}
                            </td>
                            <td className={`${tdClass} text-foreground`}><Qty value={row.quantity} unit={row.unit} /></td>
                            <td className={`${tdClass} text-muted-foreground`}><Qty value={row.issued_quantity} unit={row.unit} /></td>
                            <td className={`${tdClass} ${short ? "text-amber-600" : "text-muted-foreground"}`}>
                              <Qty value={row.available_quantity} unit={row.unit} />
                              {short && row.outstanding_quantity > 0 && (
                                <span className="block text-2xs">
                                  short {row.outstanding_quantity - (row.available_quantity ?? 0)}
                                </span>
                              )}
                            </td>
                            <td className={tdClass}>
                              <span className={`inline-flex rounded-full px-2.5 py-0.5 text-2xs font-medium ring-1 ${FULFILMENT_BADGES[row.fulfilment]}`}>
                                {FULFILMENT_LABELS[row.fulfilment] ?? row.fulfilment}
                              </span>
                              {((row.stock_requested_quantity ?? 0) > 0 || (row.procure_quantity ?? 0) > 0) && (
                                <span className="mt-1 block text-2xs text-muted-foreground">
                                  {[
                                    (row.stock_requested_quantity ?? 0) > 0 ? `Inventory ${row.stock_requested_quantity}` : null,
                                    (row.procure_quantity ?? 0) > 0 ? `Procure ${row.procure_quantity}` : null,
                                    openQty(row) > 0 ? `${openQty(row)} to decide` : null,
                                  ].filter(Boolean).join(" · ")}
                                </span>
                              )}
                              {row.po_number && (
                                <span className="block font-mono text-2xs text-muted-foreground">{row.po_number}</span>
                              )}
                              {row.pending_increase ? (
                                <span
                                  className="mt-1 inline-flex rounded-full bg-violet-500/10 px-2 py-0.5 text-2xs font-medium text-violet-600 ring-1 ring-violet-500/20"
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
                                  {openQty(row) > 0 && (
                                    <>
                                      {/* Nothing on the shelf: the store cannot issue, so the
                                          choice is procurement. Inventory stays visible but dead. */}
                                      <button
                                        onClick={() => openDecision(row, "inventory")}
                                        disabled={locked || busy === row.id || (row.available_quantity ?? 0) <= 0}
                                        title={
                                          locked ? "Locked until the budget is approved"
                                          : (row.available_quantity ?? 0) <= 0 ? "Nothing in stock — procure this line"
                                          : `Take up to ${Math.min(openQty(row), row.available_quantity ?? 0)} from inventory — the store issues it`
                                        }
                                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-2xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                                      >
                                        <Warehouse className="h-3 w-3" /> Inventory
                                      </button>
                                      <button
                                        onClick={() => openDecision(row, "procure")}
                                        disabled={locked || busy === row.id}
                                        title={
                                          locked ? "Locked until the budget is approved"
                                          : (row.available_quantity ?? 0) <= 0 ? "Nothing in stock — buy this line"
                                          : `Buy up to ${openQty(row)}, even if stock is available`
                                        }
                                        className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-2xs font-medium transition-colors disabled:opacity-40 ${
                                          (row.available_quantity ?? 0) <= 0 && !locked
                                            ? "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10"
                                            : "border-border text-foreground hover:bg-secondary"
                                        }`}
                                      >
                                        <ShoppingCart className="h-3 w-3" /> Procure
                                      </button>
                                    </>
                                  )}
                                  {row.pending_increase && canApproveIncrease ? (
                                    <>
                                      <button
                                        onClick={() => decideIncrease(row, "approve")}
                                        disabled={busy === row.id}
                                        title={`Approve +${row.pending_increase}`}
                                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 px-2.5 py-1 text-2xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
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
                                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
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

              {!asset.vendor_asset && asset.steps.length > 0 && (
                <div className="border-t border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Production route</p>
                    <p className="text-2xs text-muted-foreground">
                      Each operation is done in-house or given to a workshop on a work order.
                      {asset.route_complete ? " Route complete." : ""}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th className={thClass}>Operation</th>
                          <th className={thClass}>Where</th>
                          <th className={thClass}>Status</th>
                          <th className={`${thClass} text-right`}>Planned</th>
                          {canDecide && <th className={thClass}>Decision</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {asset.steps.map((st) => {
                          const done = ["completed", "skipped"].includes(st.status);
                          return (
                            <tr key={st.id} className="border-t border-border/60">
                              <td className={`${tdClass} font-medium text-foreground`}>
                                <span className="mr-1.5 font-mono text-2xs text-muted-foreground">{st.step_number}.</span>
                                {st.name}
                              </td>
                              <td className={`${tdClass} text-muted-foreground`}>
                                <span className={`inline-flex items-center gap-1 ${st.location === "undecided" ? "italic" : ""}`}>
                                  {st.location === "external" ? <Truck className="h-3 w-3 text-amber-500" /> : st.location === "in_house" ? <Factory className="h-3 w-3" /> : null}
                                  {st.location === "external" ? (st.workshop_display ?? (st.work_order_requested ? "Work order requested" : "Outside workshop")) : st.location === "in_house" ? "In-house" : "Not decided"}
                                </span>
                                {st.work_order && (
                                  <Link href="/work-orders" className="block font-mono text-2xs text-indigo-600 hover:underline">
                                    {st.work_order.wo_number} · {st.work_order.status_display}
                                  </Link>
                                )}
                                {st.work_order?.inspection_result && (
                                  <span className={`block text-2xs ${st.work_order.inspection_result === "accepted" ? "text-emerald-600" : "text-amber-600"}`}>
                                    {st.work_order.inspection_result === "accepted" ? "Accepted" : "Sent back for rework"}
                                    {st.work_order.inspected_by_name ? ` · inspected by ${st.work_order.inspected_by_name}` : ""}
                                    {st.work_order.inspected_at ? ` on ${new Date(st.work_order.inspected_at).toLocaleDateString()}` : ""}
                                  </span>
                                )}
                              </td>
                              <td className={tdClass}>
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${
                                  done ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20" : "bg-secondary text-muted-foreground ring-border"
                                }`}>
                                  {st.status_display}
                                </span>
                              </td>
                              <td className={`${tdClass} text-right text-muted-foreground`}>
                                {st.planned_cost != null ? `PKR ${Number(st.planned_cost).toLocaleString()}` : "—"}
                              </td>
                              {canDecide && (
                                <td className={tdClass}>
                                  <div className="flex items-center gap-1.5">
                                    {st.work_order_requested ? (
                                      // Asked for: Work Orders raises it. In-house stays live to take it back.
                                      <>
                                        <button
                                          onClick={() => stepInhouse(st)}
                                          disabled={locked || done || busy === st.id}
                                          title="Take it back: do this operation on our own floor"
                                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                                        >
                                          <Factory className="h-3.5 w-3.5" /> In-house
                                        </button>
                                        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-700" title="Raise the order under Work Orders › Requests">
                                          <Truck className="h-3.5 w-3.5" /> Work order requested
                                        </span>
                                      </>
                                    ) : st.location === "in_house" && !st.work_order ? (
                                      // The decision has been made: it reads as chosen, and the
                                      // other option stays live in case it changes.
                                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                                        <Check className="h-3.5 w-3.5" /> In-house
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => stepInhouse(st)}
                                        disabled={locked || done || busy === st.id || !!st.work_order}
                                        title={st.work_order ? "On a work order — cancel it in Work Orders to bring it in-house" : "Do this operation on our own floor"}
                                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                                      >
                                        <Factory className="h-3.5 w-3.5" /> In-house
                                      </button>
                                    )}
                                    {!st.work_order_requested && (
                                      st.work_order ? (
                                        // The decision was a work order: it reads as chosen, like In-house does.
                                        <span
                                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary"
                                          title={`On ${st.work_order.wo_number} · ${st.work_order.status_display}`}
                                        >
                                          <Check className="h-3.5 w-3.5" /> Work order
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => requestStepWorkOrder(st)}
                                          disabled={locked || done || busy === st.id}
                                          title={locked ? "Locked until the budget is approved" : "Give this operation to a vendor — Work Orders raises the order"}
                                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
                                        >
                                          <Truck className="h-3.5 w-3.5" /> Work order
                                        </button>
                                      )
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
        open={!!decideFor}
        onClose={() => setDecideFor(null)}
        title={decideFor ? `${decideFor.mode === "inventory" ? "From inventory" : "Procure"} — ${decideFor.row.name}` : "Decision"}
        size="sm"
      >
        {decideFor && (() => {
          const cap = decisionCap(decideFor.row, decideFor.mode);
          const qty = Number(decideQty) || 0;
          const shelf = decideFor.row.available_quantity ?? 0;
          const overShelf = decideFor.mode === "inventory" && qty > shelf;
          return (
            <form onSubmit={submitDecision} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{decideFor.row.quantity}</span> required,{" "}
                <span className="font-semibold text-foreground">{cap}</span> still to decide,{" "}
                <span className="font-semibold text-foreground">{shelf}</span> on the shelf.
                {decideFor.mode === "inventory"
                  ? " The store issues what you ask for; anything it cannot cover stays on its queue."
                  : " What you buy goes to Procurement → To Procure for the purchase order; the rest of the line stays open to decide."}
              </p>
              <div className="space-y-1.5">
                <label htmlFor="decide-qty" className="text-xs font-medium text-muted-foreground">
                  Quantity (1 to {cap})
                </label>
                <input
                  id="decide-qty"
                  type="number"
                  min={1}
                  max={cap}
                  value={decideQty}
                  onChange={(e) => setDecideQty(e.target.value)}
                  autoFocus
                  className={fieldClass}
                />
                {overShelf && (
                  <p className="text-2xs text-amber-600">Only {shelf} in stock — the store will be short by {qty - shelf}.</p>
                )}
                {(qty < 1 || qty > cap) && (
                  <p className="text-2xs text-amber-600">Enter between 1 and {cap}.</p>
                )}
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setDecideFor(null)} className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  Cancel
                </button>
                <button type="submit" disabled={busy === decideFor.row.id || qty < 1 || qty > cap} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-white transition-all disabled:opacity-50">
                  {decideFor.mode === "inventory" ? <Warehouse className="h-3.5 w-3.5" /> : <ShoppingCart className="h-3.5 w-3.5" />}
                  {decideFor.mode === "inventory" ? `Ask the store for ${qty || 0}` : `Procure ${qty || 0}`}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>
    </div>
  );
}
