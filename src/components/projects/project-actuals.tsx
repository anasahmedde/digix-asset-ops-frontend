"use client";

import { Plus, Printer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface ActualLine {
  component: string;
  name: string;
  unit?: string;
  required: number;
  issued: number;
  unit_price: string | null;
  price_source: string;
  line_total: string | null;
}
/** A production step with what it really cost (item 22). */
interface ActualStep {
  id: string;
  step_number: number;
  name: string;
  status?: string;
  planned_cost: string | null;
  actual_cost: string | null;
}
interface ActualWorkOrder {
  id: string;
  wo_number: string;
  status: string;
  supplier: string;
  amount: string | null;
}
interface ActualAsset {
  id: string;
  asset_code: string;
  asset_name: string;
  source: string;
  lines: ActualLine[];
  steps: ActualStep[];
  work_orders: ActualWorkOrder[];
  materials_actual: string;
  production_actual: string;
  work_orders_actual: string;
  actual_total: string;
  outstanding: number;
}
interface Overhead {
  id: string;
  cost_type: string;
  description: string;
  planned_amount: string;
  actual_quantity: string | null;
  actual_unit_cost: string | null;
  actual_amount: string | null;
  unplanned: boolean;
}
interface Actuals {
  budget_status: string | null;
  approved_total: string | null;
  estimate_total: string;
  assets: ActualAsset[];
  materials_actual: string;
  production_actual: string;
  work_orders_actual: string;
  overheads: Overhead[];
  overheads_planned_total: string;
  overheads_actual_total: string;
  actual_total: string;
  variance_vs_approved: string | null;
  cost_types: string[];
}

const money = (v: string | number | null | undefined) =>
  `PKR ${new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v ?? 0))}`;

const thClass = "px-3 py-2 text-left text-2xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-3 py-2";
const inputClass =
  "h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";

/**
 * What the project is actually costing: materials at what they were really
 * bought or drawn for, and the planned overheads with room to record what
 * each one came to — plus the variance against the approved budget.
 */
export function ProjectActuals({ projectId }: { projectId: string }) {
  const { canWrite } = useUser();
  const canBuy = canWrite("procurement");
  // Item 22: a vendor-built asset is given to its vendor on a work order.
  const [woModal, setWoModal] = useState<ActualAsset | null>(null);
  const [woSuppliers, setWoSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [wo, setWo] = useState({ supplier: "", amount: "", expected_delivery: "", notes: "" });
  const [woSaving, setWoSaving] = useState(false);

  async function openWorkOrder(asset: ActualAsset) {
    setWo({ supplier: "", amount: "", expected_delivery: "", notes: "" });
    setWoModal(asset);
    if (woSuppliers.length === 0) {
      api.get("/suppliers/", { params: { page_size: 500 } })
        .then((r) => setWoSuppliers(r.data.results ?? r.data))
        .catch(() => {});
    }
  }

  async function raiseWorkOrder() {
    if (!woModal || !wo.supplier) return;
    setWoSaving(true);
    try {
      const { data } = await api.post(`/teams/projects/${projectId}/raise-work-order/`, {
        device: woModal.id,
        supplier: wo.supplier,
        amount: wo.amount || null,
        expected_delivery: wo.expected_delivery || null,
        notes: wo.notes,
      });
      toast.success(`${data.wo_number ?? "Work order"} raised for ${woModal.asset_code}`);
      setWoModal(null);
      load();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the work order"));
    } finally {
      setWoSaving(false);
    }
  }

  /** The complete actual-cost table as a PDF, fetched with the token and opened to print. */
  async function printActuals() {
    try {
      const { data } = await api.get(`/teams/projects/${projectId}/actuals/document/`, { responseType: "blob" });
      window.open(URL.createObjectURL(data), "_blank", "noopener");
    } catch (err) {
      toast.error(getApiError(err, "Could not build the document"));
    }
  }

  /** What a production step really cost, typed once it is known. */
  async function saveStepActual(stepId: string, raw: string, current: string | null) {
    const value = raw.trim();
    if (value === (current ?? "")) return;
    try {
      await api.patch(`/assets/production-steps/${stepId}/`, { actual_cost: value || null });
      await load();
      toast.success(value ? "Actual cost recorded" : "Actual cost cleared");
    } catch (err) {
      toast.error(getApiError(err, "Could not record that cost"));
    }
  }
  const canEdit = canWrite("devices") || canWrite("inventory");

  const [data, setData] = useState<Actuals | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<string, { qty: string; rate: string }>>({});
  const [extra, setExtra] = useState({ cost_type: "", description: "", quantity: "1", unit_cost: "" });

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/teams/projects/${projectId}/actuals/`);
      setData(data);
      const seeded: Record<string, { qty: string; rate: string }> = {};
      for (const o of data.overheads as Overhead[]) {
        seeded[o.id] = {
          qty: o.actual_quantity != null ? String(Number(o.actual_quantity)) : "",
          rate: o.actual_unit_cost != null ? String(Number(o.actual_unit_cost)) : "",
        };
      }
      setDraft(seeded);
    } catch (err) {
      toast.error(getApiError(err, "Failed to load the actual costs"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function saveActual(line: Overhead) {
    const row = draft[line.id] ?? { qty: "", rate: "" };
    if (row.rate === "" && line.actual_unit_cost == null) return;
    setBusy(true);
    try {
      await api.patch(`/teams/cost-lines/${line.id}/`, {
        actual_quantity: row.qty === "" ? null : row.qty,
        actual_unit_cost: row.rate === "" ? null : row.rate,
      });
      await load();
    } catch (err) {
      toast.error(getApiError(err, "Could not record that cost"));
    } finally {
      setBusy(false);
    }
  }

  async function addUnplanned(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!extra.description.trim() || !extra.unit_cost) return;
    setBusy(true);
    try {
      // Planned stays zero: the approved estimate never moves after sign-off.
      await api.post("/teams/cost-lines/", {
        project: projectId,
        cost_type: extra.description.trim(),
        description: extra.description,
        actual_quantity: extra.quantity || "1",
        actual_unit_cost: extra.unit_cost,
      });
      setExtra({ cost_type: "", description: "", quantity: "1", unit_cost: "" });
      await load();
      toast.success("Cost recorded");
    } catch (err) {
      toast.error(getApiError(err, "Could not add the cost"));
    } finally {
      setBusy(false);
    }
  }

  async function removeLine(line: Overhead) {
    if (!confirm(`Remove "${line.cost_type}" from the actual costs?`)) return;
    try {
      await api.delete(`/teams/cost-lines/${line.id}/`);
      await load();
    } catch (err) {
      toast.error(getApiError(err, "Could not remove that cost"));
    }
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  const variance = data.variance_vs_approved == null ? null : Number(data.variance_vs_approved);
  const over = variance != null && variance > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          What the project has cost so far: materials at what they were actually bought or drawn for, and
          the planned overheads with what each one really came to. Costs move on site, so these are yours
          to edit — the approved estimate stays as it was signed off.
        </p>
        <button
          onClick={printActuals}
          title="Print the complete actual-cost table: every asset, its parts, production and vendor work, the overheads and the position against the budget"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Printer className="h-3.5 w-3.5" /> Print actuals
        </button>
      </div>

      {/* ── Materials actually used ── */}
      <div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Assets — materials, production and vendor work</h4>
            <p className="text-2xs text-muted-foreground">
              Materials count as each line is issued from stock or received against its purchase order;
              production as each step&apos;s actual cost is typed; vendor builds at their work-order amount.
            </p>
          </div>
          <p className="shrink-0 text-right text-sm font-semibold text-foreground">
            {money(Number(data.materials_actual) + Number(data.production_actual ?? 0) + Number(data.work_orders_actual ?? 0))}
            <span className="block text-2xs font-normal text-muted-foreground">
              materials {money(data.materials_actual)} · production {money(data.production_actual ?? 0)} · vendor {money(data.work_orders_actual ?? 0)}
            </span>
          </p>
        </div>
        {data.assets.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No assets on this project yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Component</th>
                  <th className={`${thClass} text-right`}>Required</th>
                  <th className={`${thClass} text-right`}>Used</th>
                  <th className={`${thClass} text-right`}>Unit price</th>
                  <th className={thClass}>Valued at</th>
                  <th className={`${thClass} text-right`}>Actual</th>
                </tr>
              </thead>
              {data.assets.map((asset) => (
                <tbody key={asset.id} className="border-b border-border last:border-0">
                  <tr className="bg-secondary/30">
                    <td colSpan={5} className={tdClass}>
                      <span className="font-mono font-semibold text-foreground">{asset.asset_code}</span>
                      {asset.asset_name && <span className="ml-2 text-muted-foreground">{asset.asset_name}</span>}
                      {asset.outstanding > 0 && (
                        <span className="ml-2 text-2xs font-medium text-amber-600">
                          · {asset.outstanding} still to come
                        </span>
                      )}
                    </td>
                    <td className={`${tdClass} text-right font-semibold text-foreground`}>{money(asset.actual_total)}</td>
                  </tr>
                  {asset.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={`${tdClass} pl-6 text-2xs text-muted-foreground`}>
                        No components on this asset.
                      </td>
                    </tr>
                  ) : (
                    asset.lines.map((l) => (
                      <tr key={l.component} className="border-t border-border/50">
                        <td className={`${tdClass} pl-6 font-medium text-foreground`}>{l.name}</td>
                        <td className={`${tdClass} text-right text-muted-foreground`}>{l.required} <span className="text-2xs">{l.unit || "piece"}</span></td>
                        <td className={`${tdClass} text-right text-foreground`}>{l.issued} <span className="text-2xs text-muted-foreground">{l.unit || "piece"}</span></td>
                        <td className={`${tdClass} text-right text-foreground`}>{l.unit_price != null ? money(l.unit_price) : "—"}</td>
                        <td className={`${tdClass} text-muted-foreground`}>{l.price_source}</td>
                        <td className={`${tdClass} text-right font-medium text-foreground`}>
                          {l.line_total != null ? money(l.line_total) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                  {(asset.steps ?? []).map((st) => (
                    <tr key={st.id} className="border-t border-border/50 bg-secondary/10">
                      <td className={`${tdClass} pl-6 text-foreground`}>
                        <span className="mr-1.5 font-mono text-2xs text-muted-foreground">#{st.step_number}</span>
                        {st.name}
                        <span className="ml-1.5 text-2xs text-muted-foreground">production · {(st.status ?? "pending").replace(/_/g, " ")}</span>
                      </td>
                      <td className={`${tdClass} text-right text-muted-foreground`} colSpan={2}>
                        planned {st.planned_cost != null ? money(st.planned_cost) : "—"}
                      </td>
                      <td className={`${tdClass} text-right`} colSpan={2}>
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            defaultValue={st.actual_cost ?? ""}
                            onBlur={(e) => saveStepActual(st.id, e.target.value, st.actual_cost)}
                            placeholder="actual"
                            aria-label={`Actual cost of ${st.name}`}
                            className={`${inputClass} w-28 text-right`}
                          />
                        ) : (
                          <span className="text-muted-foreground">{st.actual_cost != null ? money(st.actual_cost) : "—"}</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-right font-medium text-foreground`}>
                        {st.actual_cost != null ? money(st.actual_cost) : "—"}
                      </td>
                    </tr>
                  ))}
                  {(asset.work_orders ?? []).map((w) => (
                    <tr key={w.id} className="border-t border-border/50 bg-secondary/10">
                      <td className={`${tdClass} pl-6 text-foreground`} colSpan={4}>
                        <span className="font-mono text-2xs">{w.wo_number}</span>
                        <span className="ml-1.5 text-2xs text-muted-foreground">vendor work order · {w.supplier || "—"} · {(w.status ?? "").replace(/_/g, " ")}</span>
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>work order</td>
                      <td className={`${tdClass} text-right font-medium text-foreground`}>{w.amount != null ? money(w.amount) : "—"}</td>
                    </tr>
                  ))}
                  {asset.source !== "inhouse" && (asset.work_orders ?? []).filter((w) => w.status !== "cancelled").length === 0 && canBuy && (
                    <tr className="border-t border-border/50">
                      <td colSpan={6} className={`${tdClass} pl-6`}>
                        <button
                          onClick={() => openWorkOrder(asset)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          <Plus className="h-3 w-3" /> Raise work order — the vendor builds this asset
                        </button>
                      </td>
                    </tr>
                  )}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </div>

      {/* ── Overheads: planned against actual ── */}
      <div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Overheads</h4>
            <p className="text-2xs text-muted-foreground">
              Carried over from planning. Record what each actually came to; add anything nobody planned for.
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-foreground">
            {money(data.overheads_actual_total)}
            <span className="ml-2 text-2xs font-normal text-muted-foreground">
              planned {money(data.overheads_planned_total)}
            </span>
          </p>
        </div>
        {data.overheads.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No overheads planned. Anything spent on site can be added below.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Cost type</th>
                  <th className={thClass}>Description</th>
                  <th className={`${thClass} text-right`}>Planned</th>
                  <th className={`${thClass} text-right`}>Actual qty</th>
                  <th className={`${thClass} text-right`}>Actual rate</th>
                  <th className={`${thClass} text-right`}>Actual</th>
                  {canEdit && <th className={thClass} />}
                </tr>
              </thead>
              <tbody>
                {data.overheads.map((o) => {
                  const row = draft[o.id] ?? { qty: "", rate: "" };
                  const diff = o.actual_amount == null ? null : Number(o.actual_amount) - Number(o.planned_amount);
                  return (
                    <tr key={o.id} className="border-b border-border/60 last:border-0">
                      <td className={tdClass}>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium text-foreground">{o.cost_type}</span>
                        {o.unplanned && <span className="ml-1 text-2xs text-amber-600">unplanned</span>}
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>{o.description || "—"}</td>
                      <td className={`${tdClass} text-right text-muted-foreground`}>{money(o.planned_amount)}</td>
                      <td className={`${tdClass} text-right`}>
                        {canEdit ? (
                          <input
                            type="number" min={0} step="0.01" value={row.qty}
                            onChange={(e) => setDraft({ ...draft, [o.id]: { ...row, qty: e.target.value } })}
                            onBlur={() => saveActual(o)}
                            placeholder="—"
                            className={`${inputClass} w-20 text-right`}
                          />
                        ) : (o.actual_quantity ?? "—")}
                      </td>
                      <td className={`${tdClass} text-right`}>
                        {canEdit ? (
                          <input
                            type="number" min={0} step="0.01" value={row.rate}
                            onChange={(e) => setDraft({ ...draft, [o.id]: { ...row, rate: e.target.value } })}
                            onBlur={() => saveActual(o)}
                            placeholder="—"
                            className={`${inputClass} w-24 text-right`}
                          />
                        ) : (o.actual_unit_cost ?? "—")}
                      </td>
                      <td className={`${tdClass} text-right font-medium text-foreground`}>
                        {o.actual_amount == null ? <span className="text-muted-foreground">not recorded</span> : money(o.actual_amount)}
                        {diff != null && Math.abs(diff) >= 0.01 && (
                          <span className={`block text-2xs ${diff > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                            {diff > 0 ? "+" : "−"}{money(Math.abs(diff))} vs plan
                          </span>
                        )}
                      </td>
                      {canEdit && (
                        <td className={`${tdClass} text-right`}>
                          {o.unplanned && (
                            <button onClick={() => removeLine(o)} title="Remove" className="text-muted-foreground transition-colors hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
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
        )}

        {canEdit && (
          <form onSubmit={addUnplanned} className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={extra.description}
              onChange={(e) => setExtra({ ...extra, description: e.target.value })}
              placeholder="What the cost is (e.g. Travelling, Crane hire)"
              className={`${inputClass} min-w-40 flex-1`}
            />
            <input
              type="number" min={0} step="0.01" value={extra.quantity}
              onChange={(e) => setExtra({ ...extra, quantity: e.target.value })}
              title="Quantity" className={`${inputClass} w-20`}
            />
            <input
              type="number" min={0} step="0.01" value={extra.unit_cost}
              onChange={(e) => setExtra({ ...extra, unit_cost: e.target.value })}
              placeholder="Rate" className={`${inputClass} w-28`}
            />
            <button
              type="submit"
              disabled={busy || !extra.description.trim() || !extra.unit_cost}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Record cost
            </button>
          </form>
        )}
      </div>

      {/* ── Where it stands against the budget ── */}
      <div className="ml-auto w-full max-w-md rounded-xl border border-border bg-card">
        <dl className="divide-y divide-border text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-muted-foreground">Materials used</dt>
            <dd className="font-medium text-foreground">{money(data.materials_actual)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-muted-foreground">Overheads recorded</dt>
            <dd className="font-medium text-foreground">{money(data.overheads_actual_total)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-muted-foreground">Estimated at planning</dt>
            <dd className="text-muted-foreground">{money(data.estimate_total)}</dd>
          </div>
          {data.approved_total != null && (
            <div className="flex justify-between px-4 py-2.5">
              <dt className="text-muted-foreground">Approved budget</dt>
              <dd className="font-medium text-foreground">{money(data.approved_total)}</dd>
            </div>
          )}
          <div className="flex justify-between bg-primary/5 px-4 py-3">
            <dt className="font-semibold text-foreground">Actual cost so far</dt>
            <dd className="text-lg font-bold text-primary">{money(data.actual_total)}</dd>
          </div>
          {variance != null && (
            <div className={`flex justify-between rounded-b-xl px-4 py-2.5 ${over ? "bg-amber-500/5" : "bg-emerald-500/5"}`}>
              <dt className={`font-medium ${over ? "text-amber-700" : "text-emerald-700"}`}>
                {over ? "Over the approved budget" : "Under the approved budget"}
              </dt>
              <dd className={`font-semibold ${over ? "text-amber-700" : "text-emerald-700"}`}>{money(Math.abs(variance))}</dd>
            </div>
          )}
        </dl>
      </div>
      <Modal open={woModal !== null} onClose={() => setWoModal(null)} title={woModal ? `Work Order — ${woModal.asset_code}` : "Work Order"} size="md">
        {woModal && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Gives {woModal.asset_name || woModal.asset_code} to its vendor to build. The amount counts
              as this asset&apos;s production cost; the vendor&apos;s cover on the finished asset is recorded when it arrives.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="wo_supplier" className="text-xs font-medium text-muted-foreground">Vendor *</label>
                <select id="wo_supplier" value={wo.supplier} onChange={(e) => setWo({ ...wo, supplier: e.target.value })} className={`${inputClass} h-10 w-full`}>
                  <option value="">Select vendor…</option>
                  {woSuppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="wo_amount" className="text-xs font-medium text-muted-foreground">Amount (PKR)</label>
                <input id="wo_amount" type="number" min={0} step="0.01" value={wo.amount} onChange={(e) => setWo({ ...wo, amount: e.target.value })} placeholder="Blank uses the asset's purchase price" className={`${inputClass} h-10 w-full`} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="wo_delivery" className="text-xs font-medium text-muted-foreground">Required delivery</label>
                <input id="wo_delivery" type="date" value={wo.expected_delivery} onChange={(e) => setWo({ ...wo, expected_delivery: e.target.value })} className={`${inputClass} h-10 w-full`} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="wo_notes" className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea id="wo_notes" rows={2} value={wo.notes} onChange={(e) => setWo({ ...wo, notes: e.target.value })} className={`${inputClass} h-auto w-full py-2`} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setWoModal(null)} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
              <button type="button" onClick={raiseWorkOrder} disabled={woSaving || !wo.supplier} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                {woSaving ? "Raising…" : "Raise work order"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
