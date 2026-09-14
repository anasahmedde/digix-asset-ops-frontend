"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface ActualLine {
  component: string;
  name: string;
  required: number;
  issued: number;
  unit_price: string | null;
  price_source: string;
  line_total: string | null;
}
interface ActualAsset {
  id: string;
  asset_code: string;
  asset_name: string;
  lines: ActualLine[];
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
  overheads: Overhead[];
  overheads_planned_total: string;
  overheads_actual_total: string;
  actual_total: string;
  variance_vs_approved: string | null;
  cost_types: string[];
}

const money = (v: string | number | null | undefined) =>
  `PKR ${new Intl.NumberFormat("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v ?? 0))}`;

const thClass = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground";
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
    if (!extra.cost_type.trim() || !extra.unit_cost) return;
    setBusy(true);
    try {
      // Planned stays zero: the approved estimate never moves after sign-off.
      await api.post("/teams/cost-lines/", {
        project: projectId,
        cost_type: extra.cost_type.trim(),
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
      <p className="text-sm text-muted-foreground">
        What the project has cost so far: materials at what they were actually bought or drawn for, and
        the planned overheads with what each one really came to. Costs move on site, so these are yours
        to edit — the approved estimate stays as it was signed off.
      </p>

      {/* ── Materials actually used ── */}
      <div>
        <div className="mb-2 flex items-end justify-between">
          <div>
            <h4 className="text-sm font-semibold text-foreground">Materials used</h4>
            <p className="text-[11px] text-muted-foreground">
              Counted as each line is issued from stock or received against its purchase order.
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-foreground">{money(data.materials_actual)}</p>
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
                        <span className="ml-2 text-[11px] font-medium text-amber-600">
                          · {asset.outstanding} still to come
                        </span>
                      )}
                    </td>
                    <td className={`${tdClass} text-right font-semibold text-foreground`}>{money(asset.actual_total)}</td>
                  </tr>
                  {asset.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className={`${tdClass} pl-6 text-[11px] text-muted-foreground`}>
                        No components on this asset.
                      </td>
                    </tr>
                  ) : (
                    asset.lines.map((l) => (
                      <tr key={l.component} className="border-t border-border/50">
                        <td className={`${tdClass} pl-6 font-medium text-foreground`}>{l.name}</td>
                        <td className={`${tdClass} text-right text-muted-foreground`}>{l.required}</td>
                        <td className={`${tdClass} text-right text-foreground`}>{l.issued}</td>
                        <td className={`${tdClass} text-right text-foreground`}>{l.unit_price != null ? money(l.unit_price) : "—"}</td>
                        <td className={`${tdClass} text-muted-foreground`}>{l.price_source}</td>
                        <td className={`${tdClass} text-right font-medium text-foreground`}>
                          {l.line_total != null ? money(l.line_total) : "—"}
                        </td>
                      </tr>
                    ))
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
            <p className="text-[11px] text-muted-foreground">
              Carried over from planning. Record what each actually came to; add anything nobody planned for.
            </p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-foreground">
            {money(data.overheads_actual_total)}
            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
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
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">{o.cost_type}</span>
                        {o.unplanned && <span className="ml-1 text-[10px] text-amber-600">unplanned</span>}
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
                          <span className={`block text-[10px] ${diff > 0 ? "text-amber-600" : "text-emerald-600"}`}>
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
              list="actual-cost-types"
              value={extra.cost_type}
              onChange={(e) => setExtra({ ...extra, cost_type: e.target.value })}
              placeholder="Unplanned cost (e.g. Crane hire)"
              className={`${inputClass} w-48`}
            />
            <datalist id="actual-cost-types">
              {data.cost_types.map((t) => <option key={t} value={t} />)}
            </datalist>
            <input
              value={extra.description}
              onChange={(e) => setExtra({ ...extra, description: e.target.value })}
              placeholder="Description"
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
              disabled={busy || !extra.cost_type.trim() || !extra.unit_cost}
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
    </div>
  );
}
