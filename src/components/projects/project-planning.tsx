"use client";

import { CheckCircle2, FileText, Plus, Printer, RotateCcw, Save, Send, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Qty } from "@/components/ui/qty";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { formatDate } from "@/lib/utils";

interface MaterialLine {
  component: string;
  asset_code: string;
  asset_name: string;
  name: string;
  quantity: number;
  unit?: string;
  unit_price: string | null;
  price_source: string;
  line_total: string | null;
}
interface OverheadLine {
  id: string;
  cost_type: string;
  description: string;
  quantity: string;
  unit_cost: string;
  amount: string;
}
/** One operation in an asset's build route, as the planner priced it. */
interface StepLine {
  id: string;
  step_number: number;
  name: string;
  location: string;
  workshop: string;
  planned_cost: string | null;
}
interface Plan {
  has_plan: boolean;
  status: "draft" | "submitted" | "approved" | "rejected";
  status_display: string;
  is_editable: boolean;
  contingency_percent: string;
  materials: MaterialLine[];
  /** What each asset costs to build: its parts, plus the work. */
  assets: {
    id: string;
    asset_code: string;
    asset_name: string;
    /** Bought complete from a vendor — priced as one line. */
    vendor_asset?: boolean;
    source?: string;
    asset_price?: string | null;
    supply_vendor_name?: string | null;
    lines: number;
    materials_total: string;
    /** What installing and activating this asset is expected to cost. */
    installation_cost: string | null;
    unpriced_lines: number;
    steps: StepLine[];
    production_total: string;
    asset_total: string;
  }[];
  overheads: OverheadLine[];
  materials_total: string;
  production_total: string;
  installation_total: string;
  overheads_total: string;
  subtotal: string;
  contingency_amount: string;
  total: string;
  unpriced_lines: number;
  approved_total: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string;
  cost_types: string[];
}

/** One line of the bill of quantities: a component summed across the project's assets. */
interface BoqLine {
  name: string;
  unit: string;
  quantity: number;
  unit_price: string | null;
  price_source: string;
  assets: (string | { asset_code?: string })[];
  amount: string | null;
}
interface Boq {
  lines: BoqLine[];
  total: string;
  unpriced_lines: number;
}

// Who can sign a budget off (mirrors the backend).
const APPROVER_ROLES = ["super_admin", "group_head", "finance"];

const STATUS_STYLES: Record<Plan["status"], string> = {
  draft: "bg-secondary text-muted-foreground ring-border",
  submitted: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 ring-red-500/20",
};

const money = (v: string | number | null | undefined) =>
  `PKR ${new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v ?? 0))}`;

const thClass = "px-3 py-2 text-left text-2xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-3 py-2";
const inputClass =
  "h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";

/**
 * The project's cost plan: materials priced from inventory and past
 * purchases, the user's overheads, a contingency — and the total that goes
 * up for budget approval before execution can start.
 */
export function ProjectPlanning({
  projectId,
  refreshKey,
  onGoToExecution,
  onChanged,
}: {
  projectId: string;
  /** Changes when the scope does, so the estimate re-reads at once. */
  refreshKey?: string;
  onGoToExecution?: () => void;
  /** Called after a budget decision, so the page can show the new figure. */
  onChanged?: () => void;
}) {
  const { user, canWrite } = useUser();
  const canPlan = canWrite("devices") || canWrite("inventory");
  const canApprove = user != null && APPROVER_ROLES.includes(user.role);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [contingency, setContingency] = useState("");
  const [decisionNotes, setDecisionNotes] = useState("");
  const [line, setLine] = useState({ cost_type: "", description: "", quantity: "1", unit_cost: "" });
  // Item 6: the consolidated bill of quantities, and printable documents.
  const [showBoq, setShowBoq] = useState(false);
  const [boq, setBoq] = useState<Boq | null>(null);
  const [boqLoading, setBoqLoading] = useState(false);

  async function loadBoq() {
    setBoqLoading(true);
    try {
      const { data } = await api.get(`/teams/projects/${projectId}/boq/`);
      setBoq(data);
    } catch (err) {
      toast.error(getApiError(err, "Could not build the bill of quantities"));
    } finally {
      setBoqLoading(false);
    }
  }

  /** Fetch a PDF through the API (so the token goes with it) and open it to print. */
  async function openDocument(path: string) {
    try {
      const { data } = await api.get(path, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(getApiError(err, "Could not build the document"));
    }
  }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/teams/projects/${projectId}/plan/`);
      setPlan(data);
      setContingency(String(Number(data.contingency_percent)));
    } catch (err) {
      toast.error(getApiError(err, "Failed to load the cost plan"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { if (showBoq) loadBoq(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [refreshKey, plan?.materials_total, showBoq]);

  async function run(fn: () => Promise<{ data: Plan }>, success: string) {
    setBusy(true);
    try {
      const { data } = await fn();
      setPlan(data);
      setContingency(String(Number(data.contingency_percent)));
      toast.success(success);
      onChanged?.();
    } catch (err) {
      toast.error(getApiError(err, "That did not work"));
    } finally {
      setBusy(false);
    }
  }

  async function saveContingency() {
    if (!plan || Number(contingency) === Number(plan.contingency_percent)) return;
    await run(
      () => api.patch(`/teams/projects/${projectId}/plan/`, { contingency_percent: contingency || "0" }),
      "Contingency updated",
    );
  }

  async function addLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!line.description.trim() || !line.unit_cost) return;
    setBusy(true);
    try {
      await api.post("/teams/cost-lines/", { project: projectId, ...line, cost_type: line.description.trim() });
      setLine({ cost_type: "", description: "", quantity: "1", unit_cost: "" });
      await load();
      toast.success("Cost added");
    } catch (err) {
      toast.error(getApiError(err, "Could not add the cost"));
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(id: string) {
    if (!confirm("Remove this cost from the plan?")) return;
    try {
      await api.delete(`/teams/cost-lines/${id}/`);
      await load();
    } catch (err) {
      toast.error(getApiError(err, "Could not remove the cost"));
    }
  }

  /** A price the planner sets by hand; blank hands the line back to the record. */
  async function savePrice(componentId: string, raw: string, current: string | null) {
    const value = raw.trim();
    if (value === (current ?? "")) return;
    try {
      await api.patch(`/assets/components/${componentId}/`, { planned_unit_price: value || null });
      await load();
      toast.success(value ? "Price set" : "Price back to the last procured figure");
    } catch (err) {
      toast.error(getApiError(err, "Could not set that price"));
    }
  }

  /** The vendor's price for a complete asset — the plan's one line for it. */
  async function saveAssetPrice(deviceId: string, raw: string, current: string | null | undefined) {
    const value = raw.trim();
    if (value === (current == null ? "" : String(Number(current)))) return;
    try {
      await api.patch(`/assets/devices/${deviceId}/`, { purchase_price: value || null });
      await load();
      toast.success(value ? "Vendor price set" : "Vendor price cleared");
    } catch (err) {
      toast.error(getApiError(err, "Could not set that price"));
    }
  }

  /** What putting this asset in and switching it on is expected to cost. */
  async function saveInstallCost(deviceId: string, raw: string, current: string | null) {
    const value = raw.trim();
    if (value === (current ?? "")) return;
    try {
      await api.patch(`/assets/devices/${deviceId}/`, { planned_installation_cost: value || null });
      await load();
    } catch (err) {
      toast.error(getApiError(err, "Could not price the installation"));
    }
  }

  async function saveStepCost(stepId: string, raw: string, current: string | null) {
    const value = raw.trim();
    if (value === (current ?? "")) return;
    try {
      await api.patch(`/assets/production-steps/${stepId}/`, { planned_cost: value || null });
      await load();
      toast.success(value ? "Step cost updated" : "Step cost cleared");
    } catch (err) {
      toast.error(getApiError(err, "Could not price that step"));
    }
  }

  if (loading || !plan) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const editable = canPlan && plan.is_editable;
  const variance = plan.approved_total != null ? Number(plan.total) - Number(plan.approved_total) : 0;

  return (
    <div className="space-y-5">
      {/* ── Where the budget stands ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-secondary/30 p-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-2xs font-semibold ring-1 ${STATUS_STYLES[plan.status]}`}>
              {plan.has_plan ? plan.status_display : "Not started"}
            </span>
            {plan.status === "approved" && (
              <span className="text-xs text-muted-foreground">
                Approved at <span className="font-semibold text-foreground">{money(plan.approved_total)}</span>
              </span>
            )}
          </div>
          <p className="text-2xs text-muted-foreground">
            {plan.status === "approved" && plan.decided_by
              ? `Signed off by ${plan.decided_by}${plan.decided_at ? ` on ${formatDate(plan.decided_at)}` : ""} — execution is open.`
              : plan.status === "submitted" && plan.submitted_by
                ? `Sent for approval by ${plan.submitted_by}${plan.submitted_at ? ` on ${formatDate(plan.submitted_at)}` : ""}.`
                : "Build the estimate, then send it for approval. Execution opens once it is approved."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <button
              onClick={() => run(() => api.patch(`/teams/projects/${projectId}/plan/`, { contingency_percent: contingency || "0" }), "Draft saved")}
              disabled={busy}
              title="Keep the plan as a draft — nothing goes for approval yet"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> Save draft
            </button>
          )}
          <button
            onClick={() => openDocument(`/teams/projects/${projectId}/plan/document/`)}
            disabled={!plan.has_plan && plan.materials.length === 0}
            title="Print the cost plan — per-asset BOM, production, overheads and total"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" /> Print cost plan
          </button>
          <button
            onClick={() => setShowBoq((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showBoq ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <FileText className="h-3.5 w-3.5" /> {showBoq ? "Hide BOQ" : "Bill of quantities"}
          </button>
          {editable && (
            <button
              onClick={() => run(() => api.post(`/teams/projects/${projectId}/submit-budget/`, {}), "Sent for approval")}
              disabled={busy || Number(plan.total) <= 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Submit for approval
            </button>
          )}
          {!plan.is_editable && canPlan && (
            <button
              onClick={() => run(() => api.post(`/teams/projects/${projectId}/revise-budget/`, {}), "Budget reopened for changes")}
              disabled={busy}
              title="Reopen the plan for changes — execution locks until it is approved again"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Revise
            </button>
          )}
          {plan.status === "approved" && onGoToExecution && (
            <button
              onClick={onGoToExecution}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              Go to execution →
            </button>
          )}
        </div>

        {/* Approver's decision, only while it is waiting on one. */}
        {plan.status === "submitted" && canApprove && (
          <div className="w-full space-y-2 border-t border-border pt-3">
            <textarea
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              rows={2}
              placeholder="Notes for the decision (required to send it back)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => run(() => api.post(`/teams/projects/${projectId}/approve-budget/`, { notes: decisionNotes }), "Budget approved")}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve {money(plan.total)}
              </button>
              <button
                onClick={() => run(() => api.post(`/teams/projects/${projectId}/reject-budget/`, { notes: decisionNotes }), "Budget sent back")}
                disabled={busy || !decisionNotes.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" /> Send back
              </button>
            </div>
          </div>
        )}

        {plan.status === "rejected" && plan.decision_notes && (
          <div className="w-full rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-700">
            <span className="font-semibold">Sent back{plan.decided_by ? ` by ${plan.decided_by}` : ""}:</span> {plan.decision_notes}
          </div>
        )}
      </div>

      {showBoq && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold text-foreground">Bill of quantities</h4>
              <p className="text-2xs text-muted-foreground">
                Every component the project needs, summed across its assets. Each asset&apos;s own list is its BOM below.
              </p>
            </div>
            <button
              onClick={() => openDocument(`/teams/projects/${projectId}/boq/document/`)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Printer className="h-3.5 w-3.5" /> Print BOQ
            </button>
          </div>
          {boqLoading && !boq ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            </div>
          ) : !boq || boq.lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
              No components yet — add assets to the scope and list their parts.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className={thClass}>Component</th>
                    <th className={`${thClass} text-right`}>Qty</th>
                    <th className={`${thClass} text-right`}>Unit price</th>
                    <th className={thClass}>Priced from</th>
                    <th className={thClass}>Used on</th>
                    <th className={`${thClass} text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {boq.lines.map((l, i) => (
                    <tr key={`${l.name}-${i}`} className="border-b border-border/60 last:border-0">
                      <td className={`${tdClass} font-medium text-foreground`}>{l.name}</td>
                      <td className={`${tdClass} text-right text-foreground`}><Qty value={l.quantity} unit={l.unit} /></td>
                      <td className={`${tdClass} text-right text-foreground`}>{l.unit_price != null ? money(l.unit_price) : "—"}</td>
                      <td className={`${tdClass} text-muted-foreground`}>{l.price_source}</td>
                      <td className={`${tdClass} font-mono text-2xs text-muted-foreground`}>
                        {l.assets.map((a) => (typeof a === "string" ? a : a.asset_code ?? "")).filter(Boolean).join(", ")}
                      </td>
                      <td className={`${tdClass} text-right font-medium text-foreground`}>{l.amount != null ? money(l.amount) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-secondary/30">
                    <td colSpan={5} className={`${tdClass} text-right font-medium text-muted-foreground`}>
                      Total{boq.unpriced_lines > 0 ? ` · ${boq.unpriced_lines} unpriced line${boq.unpriced_lines === 1 ? "" : "s"}` : ""}
                    </td>
                    <td className={`${tdClass} text-right font-semibold text-foreground`}>{money(boq.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Asset Development Cost: the parts plus the work, asset by asset ── */}
      <div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Asset Development Cost</h4>
            <p className="text-2xs text-muted-foreground">
              What it takes to build each asset: its components, priced at the last procured price (or the
              cost it was opened with), and every operation on its production route. Any price can be set
              by hand.
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-foreground">
            {money(Number(plan.materials_total) + Number(plan.production_total) + Number(plan.installation_total ?? 0))}
          </p>
        </div>
        {plan.assets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No assets on this project yet — add them in Scope and their components are priced here automatically.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Item</th>
                  <th className={`${thClass} text-right`}>Qty</th>
                  <th className={`${thClass} text-right`}>Unit price</th>
                  <th className={thClass}>Priced from</th>
                  <th className={`${thClass} text-right`}>Total</th>
                </tr>
              </thead>
              {/* One group per asset: what it is made of, then what making it costs. */}
              {plan.assets.map((asset) => {
                const lines = plan.materials.filter((m) => m.asset_code === asset.asset_code);
                return (
                  <tbody key={asset.id} className="border-b border-border last:border-0">
                    <tr className="bg-secondary/30">
                      <td colSpan={4} className={tdClass}>
                        <Link
                          href={`/assets?device=${asset.id}`}
                          className="font-mono font-semibold text-primary hover:underline"
                        >
                          {asset.asset_code}
                        </Link>
                        {asset.asset_name && (
                          <Link href={`/assets?device=${asset.id}`} className="ml-2 text-muted-foreground hover:underline">
                            {asset.asset_name}
                          </Link>
                        )}
                        {asset.unpriced_lines > 0 && (
                          <span className="ml-2 text-2xs font-medium text-amber-600">· {asset.unpriced_lines} unpriced</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-right font-semibold text-foreground`}>{money(asset.asset_total)}</td>
                    </tr>

                    {asset.vendor_asset ? (
                      <>
                      <tr>
                        <td colSpan={4} className={`${tdClass} pl-6 text-2xs font-semibold uppercase tracking-wider text-muted-foreground`}>
                          Asset
                        </td>
                        <td className={`${tdClass} text-right text-2xs font-medium text-muted-foreground`}>
                          {asset.asset_price != null ? money(asset.asset_price) : money(0)}
                        </td>
                      </tr>
                      <tr className="border-t border-border/50">
                        <td className={`${tdClass} pl-6 font-medium text-foreground`}>
                          Complete asset from the vendor
                          <span className="block text-2xs font-normal text-muted-foreground">
                            Bought whole on a purchase order — no components or production route.
                            {asset.supply_vendor_name ? ` Vendor: ${asset.supply_vendor_name}.` : ""}
                          </span>
                        </td>
                        <td className={`${tdClass} text-right text-foreground`}>1</td>
                        <td className={`${tdClass} text-right`}>
                          {editable ? (
                            <input
                              key={`${asset.id}-${asset.asset_price ?? ""}`}
                              type="number"
                              min={0}
                              step="0.01"
                              defaultValue={asset.asset_price ?? ""}
                              onBlur={(e) => saveAssetPrice(asset.id, e.target.value, asset.asset_price)}
                              placeholder="Vendor price"
                              title="The vendor's price for the complete asset; the purchase order suggests it"
                              className={`${inputClass} w-28 text-right`}
                            />
                          ) : (
                            <span className="text-foreground">{asset.asset_price != null ? money(asset.asset_price) : "—"}</span>
                          )}
                        </td>
                        <td className={tdClass}>
                          <span className={asset.asset_price == null ? "font-medium text-amber-600" : "text-muted-foreground"}>
                            {asset.asset_price == null ? "No price on record" : "Vendor price"}
                          </span>
                        </td>
                        <td className={`${tdClass} text-right font-medium text-foreground`}>
                          {asset.asset_price != null ? money(asset.asset_price) : "—"}
                        </td>
                      </tr>
                    <tr>
                      <td colSpan={4} className={`${tdClass} pl-6 text-2xs font-semibold uppercase tracking-wider text-muted-foreground`}>
                        Installation &amp; activation
                      </td>
                      <td className={`${tdClass} text-right text-2xs font-medium text-muted-foreground`}>
                        {asset.installation_cost != null ? money(asset.installation_cost) : money(0)}
                      </td>
                    </tr>
                    <tr className="border-t border-border/50">
                      <td className={`${tdClass} pl-10 font-medium text-foreground`}>
                        Putting it in and switching it on
                        <span className="block text-2xs font-normal text-muted-foreground">
                          Labour, access, rigging and commissioning for this asset.
                        </span>
                      </td>
                      <td className={`${tdClass} text-right text-muted-foreground`}>—</td>
                      <td className={`${tdClass} text-right`}>
                        {editable ? (
                          <input
                            key={`${asset.id}-install-${asset.installation_cost ?? ""}`}
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={asset.installation_cost ?? ""}
                            onBlur={(e) => saveInstallCost(asset.id, e.target.value, asset.installation_cost)}
                            placeholder="Price it"
                            className={`${inputClass} w-28 text-right`}
                          />
                        ) : (
                          <span className="text-foreground">{asset.installation_cost != null ? money(asset.installation_cost) : "—"}</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>Set by hand</td>
                      <td className={`${tdClass} text-right font-medium text-foreground`}>
                        {asset.installation_cost != null ? money(asset.installation_cost) : "—"}
                      </td>
                    </tr>
                      </>
                    ) : (
                    <>
                    <tr>
                      <td colSpan={4} className={`${tdClass} pl-6 text-2xs font-semibold uppercase tracking-wider text-muted-foreground`}>
                        Components
                      </td>
                      <td className={`${tdClass} text-right text-2xs font-medium text-muted-foreground`}>
                        {money(asset.materials_total)}
                      </td>
                    </tr>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={`${tdClass} pl-10 text-2xs text-muted-foreground`}>
                          No components listed on this asset yet.
                        </td>
                      </tr>
                    ) : (
                      lines.map((m) => (
                        <tr key={m.component} className="border-t border-border/50">
                          <td className={`${tdClass} pl-10 font-medium text-foreground`}>{m.name}</td>
                          <td className={`${tdClass} text-right text-foreground`}><Qty value={m.quantity} unit={m.unit} /></td>
                          <td className={`${tdClass} text-right`}>
                            {editable ? (
                              <input
                                key={`${m.component}-${m.unit_price ?? ""}`}
                                type="number"
                                min={0}
                                step="0.01"
                                defaultValue={m.unit_price ?? ""}
                                onBlur={(e) => savePrice(m.component, e.target.value, m.unit_price)}
                                title="Type a price to set it by hand; clear it to go back to the last procured price"
                                className={`${inputClass} w-24 text-right`}
                              />
                            ) : (
                              <span className="text-foreground">{m.unit_price != null ? money(m.unit_price) : "—"}</span>
                            )}
                          </td>
                          <td className={tdClass}>
                            <span className={m.unit_price == null ? "font-medium text-amber-600" : "text-muted-foreground"}>
                              {m.price_source}
                            </span>
                          </td>
                          <td className={`${tdClass} text-right font-medium text-foreground`}>
                            {m.line_total != null ? money(m.line_total) : "—"}
                          </td>
                        </tr>
                      ))
                    )}

                    <tr>
                      <td colSpan={4} className={`${tdClass} pl-6 text-2xs font-semibold uppercase tracking-wider text-muted-foreground`}>
                        Production
                      </td>
                      <td className={`${tdClass} text-right text-2xs font-medium text-muted-foreground`}>
                        {money(asset.production_total)}
                      </td>
                    </tr>
                    {asset.steps.length === 0 ? (
                      <tr>
                        <td colSpan={5} className={`${tdClass} pl-10 text-2xs text-muted-foreground`}>
                          No production route on this asset — in-house builds lay one out in the Asset section.
                        </td>
                      </tr>
                    ) : (
                      asset.steps.map((s) => (
                        <tr key={s.id} className="border-t border-border/50">
                          <td className={`${tdClass} pl-10 font-medium text-foreground`}>
                            <span className="mr-2 text-muted-foreground">{s.step_number}.</span>
                            {s.name}
                          </td>
                          <td className={`${tdClass} text-right text-muted-foreground`}>—</td>
                          <td className={`${tdClass} text-right`}>
                            {editable ? (
                              <input
                                key={`${s.id}-${s.planned_cost ?? ""}`}
                                type="number"
                                min={0}
                                step="0.01"
                                defaultValue={s.planned_cost ?? ""}
                                onBlur={(e) => saveStepCost(s.id, e.target.value, s.planned_cost)}
                                placeholder="Price it"
                                className={`${inputClass} w-24 text-right`}
                              />
                            ) : (
                              <span className="text-foreground">{s.planned_cost != null ? money(s.planned_cost) : "—"}</span>
                            )}
                          </td>
                          <td className={`${tdClass} text-muted-foreground`}>
                            {s.location === "external"
                              ? s.workshop ? `Outside workshop · ${s.workshop}` : "Outside workshop"
                              : "In-house"}
                          </td>
                          <td className={`${tdClass} text-right font-medium text-foreground`}>
                            {s.planned_cost != null ? money(s.planned_cost) : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                    <tr>
                      <td colSpan={4} className={`${tdClass} pl-6 text-2xs font-semibold uppercase tracking-wider text-muted-foreground`}>
                        Installation &amp; activation
                      </td>
                      <td className={`${tdClass} text-right text-2xs font-medium text-muted-foreground`}>
                        {asset.installation_cost != null ? money(asset.installation_cost) : money(0)}
                      </td>
                    </tr>
                    <tr className="border-t border-border/50">
                      <td className={`${tdClass} pl-10 font-medium text-foreground`}>
                        Putting it in and switching it on
                        <span className="block text-2xs font-normal text-muted-foreground">
                          Labour, access, rigging and commissioning for this asset.
                        </span>
                      </td>
                      <td className={`${tdClass} text-right text-muted-foreground`}>—</td>
                      <td className={`${tdClass} text-right`}>
                        {editable ? (
                          <input
                            key={`${asset.id}-install-${asset.installation_cost ?? ""}`}
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={asset.installation_cost ?? ""}
                            onBlur={(e) => saveInstallCost(asset.id, e.target.value, asset.installation_cost)}
                            placeholder="Price it"
                            className={`${inputClass} w-28 text-right`}
                          />
                        ) : (
                          <span className="text-foreground">{asset.installation_cost != null ? money(asset.installation_cost) : "—"}</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>Set by hand</td>
                      <td className={`${tdClass} text-right font-medium text-foreground`}>
                        {asset.installation_cost != null ? money(asset.installation_cost) : "—"}
                      </td>
                    </tr>
                    </>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
        {plan.unpriced_lines > 0 && (
          <p className="mt-2 text-2xs text-amber-600">
            {plan.unpriced_lines} line(s) have no price on record — type one above, or set a unit cost on the inventory item.
          </p>
        )}
      </div>

      {/* ── Overheads: the user's own cost types ── */}
      <div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Overheads</h4>
            <p className="text-2xs text-muted-foreground">
              Travelling, labour, transport — name the cost type however your team slices it.
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-foreground">{money(plan.overheads_total)}</p>
        </div>
        {plan.overheads.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Cost type</th>
                  <th className={thClass}>Description</th>
                  <th className={`${thClass} text-right`}>Qty</th>
                  <th className={`${thClass} text-right`}>Rate</th>
                  <th className={`${thClass} text-right`}>Amount</th>
                  {editable && <th className={thClass} />}
                </tr>
              </thead>
              <tbody>
                {plan.overheads.map((o) => (
                  <tr key={o.id} className="border-b border-border/60 last:border-0">
                    <td className={tdClass}>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium text-foreground">{o.cost_type}</span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{o.description || "—"}</td>
                    <td className={`${tdClass} text-right text-foreground`}>{Number(o.quantity)}</td>
                    <td className={`${tdClass} text-right text-foreground`}>{money(o.unit_cost)}</td>
                    <td className={`${tdClass} text-right font-medium text-foreground`}>{money(o.amount)}</td>
                    {editable && (
                      <td className={`${tdClass} text-right`}>
                        <button onClick={() => removeLine(o.id)} title="Remove" className="text-muted-foreground transition-colors hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {editable && (
          <form onSubmit={addLine} className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={line.description}
              onChange={(e) => setLine({ ...line, description: e.target.value })}
              placeholder="What the cost is (e.g. Travelling, Crane hire)"
              className={`${inputClass} min-w-40 flex-1`}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={line.quantity}
              onChange={(e) => setLine({ ...line, quantity: e.target.value })}
              title="Quantity (days, trips, people…)"
              className={`${inputClass} w-20`}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={line.unit_cost}
              onChange={(e) => setLine({ ...line, unit_cost: e.target.value })}
              placeholder="Rate"
              className={`${inputClass} w-28`}
            />
            <button
              type="submit"
              disabled={busy || !line.description.trim() || !line.unit_cost}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add cost
            </button>
          </form>
        )}
      </div>

      {/* ── The estimate ── */}
      <div className="ml-auto w-full max-w-md rounded-xl border border-border bg-card">
        <dl className="divide-y divide-border text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-muted-foreground">Components</dt>
            <dd className="font-medium text-foreground">{money(plan.materials_total)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-muted-foreground">Production</dt>
            <dd className="font-medium text-foreground">{money(plan.production_total)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-muted-foreground">Installation &amp; activation</dt>
            <dd className="font-medium text-foreground">{money(plan.installation_total ?? 0)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-muted-foreground">Overheads</dt>
            <dd className="font-medium text-foreground">{money(plan.overheads_total)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-medium text-foreground">{money(plan.subtotal)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
            <dt className="flex items-center gap-2 text-muted-foreground">
              Contingency
              <span className="text-2xs text-muted-foreground/70">on materials</span>
              {editable ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={contingency}
                    onChange={(e) => setContingency(e.target.value)}
                    onBlur={saveContingency}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className={`${inputClass} w-16 text-right`}
                  />
                  %
                </span>
              ) : (
                <span className="text-xs">({Number(plan.contingency_percent)}%)</span>
              )}
            </dt>
            <dd className="font-medium text-foreground">{money(plan.contingency_amount)}</dd>
          </div>
          <div className="flex justify-between rounded-b-xl bg-primary/5 px-4 py-3">
            <dt className="font-semibold text-foreground">Estimated total</dt>
            <dd className="text-lg font-bold text-primary">{money(plan.total)}</dd>
          </div>
        </dl>
        {plan.status === "approved" && Math.abs(variance) >= 0.01 && (
          <p className={`border-t border-border px-4 py-2 text-2xs ${variance > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            The estimate has moved {variance > 0 ? "above" : "below"} the approved budget by {money(Math.abs(variance))} since sign-off.
          </p>
        )}
      </div>
    </div>
  );
}
