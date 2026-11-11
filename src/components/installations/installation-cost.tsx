"use client";

import { Check, Clock, Pause, Play, Plus, Receipt, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/utils";
import {
  CostGroup, CostRow, HoursBasis, moneyInput, pkr, useCrewLabour, type WorkTimes,
} from "@/components/maintenance/corrective-visit";

/** An installation as a job of work: the same times and costs a maintenance visit keeps. */
export interface InstallationWorkRow extends WorkTimes {
  id: string;
  installed_by: string | null;
  installed_by_name?: string | null;
  can_advance?: boolean;
  paused_since?: string | null;
  /** The installer is checked in at the site now; null once the work is done. */
  technician_here?: boolean | null;
  work_done?: boolean;
  purchases?: {
    id: string; kind: string; kind_display: string; description: string; quantity: number; amount: string | null;
    shop: string; receipt: string | null; photo: string | null; bought_by_name: string | null; created_at: string;
  }[];
  cost?: string | null;
  cost_lines?: { id: string; source: string; description: string; quantity: string | null; unit_cost: string | null; amount: string | null }[];
  cost_recorded_by_name?: string | null;
  cost_recorded_at?: string | null;
  can_record_cost?: boolean;
}

const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors disabled:opacity-50";

/** Paused or not, and the buttons that change it - above the checklist. */
export function InstallationWork({ inst, onChanged }: { inst: InstallationWorkRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const going = !!inst.started_at && !inst.work_done;
  if (!going && !inst.paused_since) return null;

  async function act(what: "pause" | "resume") {
    setBusy(true);
    try {
      await api.post(`/sites/installations/${inst.id}/${what}/`, {});
      toast.success(what === "pause" ? "Work paused" : "Work resumed");
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, what === "pause" ? "Could not pause the work" : "Could not resume the work"));
    } finally {
      setBusy(false);
    }
  }

  const away = inst.technician_here === false && !!inst.installed_by;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1 text-xs">
        {inst.paused_since ? (
          <p className="text-amber-700">
            Work paused since {formatDateTime(inst.paused_since)}
            {inst.pauses?.find((p) => !p.resumed_at)?.automatic ? " (on check-out)" : ""}. The paused time is not counted in the man-hours.
          </p>
        ) : (
          <p className="text-muted-foreground">Work under way since {formatDateTime(inst.started_at!)}. Pause it when the crew stops for the day or waits on something.</p>
        )}
        {away && (
          <p className="text-muted-foreground">
            {inst.installed_by_name ?? "The installer"} is not checked in at the site. The work opens once they check in.
          </p>
        )}
      </div>
      {inst.can_advance && going && (
        inst.paused_since ? (
          <button onClick={() => act("resume")} disabled={busy || away}
            className={`${btn} bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20 hover:bg-amber-500/20`}>
            <Play className="h-3.5 w-3.5" /> Resume work
          </button>
        ) : (
          <button onClick={() => act("pause")} disabled={busy || away}
            className={`${btn} text-muted-foreground ring-1 ring-border hover:bg-secondary`}>
            <Pause className="h-3.5 w-3.5" /> Pause work
          </button>
        )
      )}
    </div>
  );
}

/** What the installation cost: what the crew paid, man-hours at each
 *  person's rate, anything else. Recorded by the installer's supervisor once
 *  the work is done; it becomes the asset's actual installation cost. */
export function InstallationCost({ inst, onChanged }: { inst: InstallationWorkRow; onChanged: () => void }) {
  const crew = useCrewLabour(inst.time_on_site, inst.id);
  const [extra, setExtra] = useState<{ description: string; amount: string }[]>([]);
  const [again, setAgain] = useState(false);
  const [busy, setBusy] = useState(false);
  const purchases = inst.purchases ?? [];
  const recorded = inst.cost != null;
  const editing = !!inst.can_record_cost && (!recorded || again);
  if (!inst.started_at && purchases.length === 0 && !recorded) return null;

  const paid = purchases.reduce((n, p) => n + Number(p.amount || 0), 0);
  const others = extra.reduce((n, l) => n + Number(l.amount || 0), 0);
  const total = paid + crew.total + others;

  async function record() {
    setBusy(true);
    try {
      await api.post(`/sites/installations/${inst.id}/price/`, {
        cost_lines: extra.filter((l) => l.description.trim() && l.amount !== "")
          .map((l) => ({ description: l.description.trim(), amount: l.amount })),
        ...crew.payload,
      });
      crew.remember();
      setExtra([]); setAgain(false);
      toast.success("Installation cost recorded");
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not record the cost"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 border-t border-border pt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">Cost of this installation</h3>
        {recorded && !again && (
          <span className="text-2xs font-medium text-emerald-600">
            Recorded{inst.cost_recorded_by_name ? ` by ${inst.cost_recorded_by_name}` : ""}
            {inst.cost_recorded_at ? `, ${formatDateTime(inst.cost_recorded_at)}` : ""}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {recorded && !again ? (
          ([["purchase", "Paid by the technician", Receipt], ["labour", "Man-hours", Clock], ["manual", "Other costs", Plus]] as const).map(([src, title, Icon]) => {
            const rows = (inst.cost_lines ?? []).filter((l) => l.source === src);
            return rows.length === 0 ? null : (
              <CostGroup key={src} icon={<Icon className="h-4 w-4" />} title={title}
                total={rows.reduce((n, l) => n + Number(l.amount || 0), 0)}>
                {rows.map((l) => (
                  <CostRow key={l.id} what={l.description} amount={Number(l.amount || 0)}
                    calc={l.quantity && l.unit_cost ? `${Number(l.quantity)} × ${pkr(Number(l.unit_cost))}` : undefined} />
                ))}
                {src === "labour" && <div className="mt-3"><HoursBasis visit={inst} canEnter={false} /></div>}
              </CostGroup>
            );
          })
        ) : (
          <>
            <CostGroup icon={<Receipt className="h-4 w-4" />} title="Paid by the technician" note="Recorded in the field app" total={paid}>
              {purchases.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing recorded.</p>
              ) : purchases.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-1.5">
                  {p.photo ? (
                    <a href={p.photo} target="_blank" rel="noreferrer" className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-secondary">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.photo} alt={p.description} className="h-full w-full object-cover" />
                    </a>
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground">
                      <Receipt className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">
                      {p.kind !== "part" && <span className="text-muted-foreground">{p.kind_display}: </span>}
                      {p.description}
                    </p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {p.bought_by_name ?? "—"} · {formatDateTime(p.created_at)}
                      {p.receipt ? (
                        <> · <a href={p.receipt} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline">Receipt</a></>
                      ) : " · No receipt"}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums text-foreground">{p.amount == null ? "—" : pkr(Number(p.amount))}</span>
                </div>
              ))}
            </CostGroup>

            <CostGroup icon={<Clock className="h-4 w-4" />} title="Man-hours" note="Each person's hours at their own rate" total={crew.total}>
              <HoursBasis visit={inst} canEnter={editing} crew={editing ? crew : undefined} />
            </CostGroup>

            {editing && (
              <CostGroup icon={<Plus className="h-4 w-4" />} title="Other costs" note="Anything else this installation cost" total={others}>
                {extra.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
                {extra.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <input value={l.description} aria-label="What the cost was for" placeholder="What it was for"
                      onChange={(e) => setExtra((cur) => cur.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                      className={`${moneyInput.replace("text-right", "text-left")} flex-1`} />
                    <input value={l.amount} aria-label="Amount" type="number" min={0} step="0.01" placeholder="PKR"
                      onChange={(e) => setExtra((cur) => cur.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                      className={`${moneyInput} w-28`} />
                    <button onClick={() => setExtra((cur) => cur.filter((_, j) => j !== i))} aria-label="Remove"
                      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button onClick={() => setExtra((cur) => [...cur, { description: "", amount: "" }])}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary">
                  <Plus className="h-3.5 w-3.5" /> Add a cost
                </button>
              </CostGroup>
            )}
          </>
        )}

        <div className="flex items-center justify-between gap-3 bg-secondary/60 px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Total cost of this installation</span>
          <span className="text-lg font-bold tabular-nums text-foreground">
            PKR {pkr(recorded && !again ? Number(inst.cost || 0) : total)}
          </span>
        </div>
      </div>

      {inst.can_record_cost && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {editing ? (
            <>
              {again && (
                <button onClick={() => setAgain(false)} className={`${btn} text-muted-foreground ring-1 ring-border hover:bg-secondary`}>Cancel</button>
              )}
              <button onClick={record} disabled={busy} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
                <Check className="h-3.5 w-3.5" /> {recorded ? "Record again" : "Record cost"}
              </button>
            </>
          ) : (
            <button onClick={() => setAgain(true)} className={`${btn} text-muted-foreground ring-1 ring-border hover:bg-secondary`}>
              Record again
            </button>
          )}
        </div>
      )}
      {!inst.work_done && !recorded && (
        <p className="mt-2 text-2xs text-muted-foreground">The installer&apos;s supervisor records the cost once the work is done.</p>
      )}
    </div>
  );
}
