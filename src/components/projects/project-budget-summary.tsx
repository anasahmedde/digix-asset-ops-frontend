"use client";

import { useCallback, useEffect, useState } from "react";

import api from "@/lib/api";

interface Actuals {
  approved_total: string | null;
  estimate_total: string;
  actual_total: string;
  variance_vs_approved: string | null;
  budget_status: string | null;
}

const money = (v: string | number | null | undefined) =>
  `PKR ${new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Number(v ?? 0))}`;

/**
 * Where the project stands against the figure that was signed off: what was
 * approved, what has been spent, and how much of the budget that uses up.
 */
export function ProjectBudgetSummary({
  projectId,
  refreshKey,
}: {
  projectId: string;
  /** Bumped whenever the project is re-read, so approving in Planning below
   *  is reflected here rather than leaving a stale "Not approved yet". */
  refreshKey?: number | string;
}) {
  const [actuals, setActuals] = useState<Actuals | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/teams/projects/${projectId}/actuals/`);
      setActuals(data);
    } catch {
      /* the strip is a summary — the tabs below still work without it */
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!actuals) return null;

  const approved = actuals.approved_total != null ? Number(actuals.approved_total) : null;
  // Once the budget is reopened, the approved figure is the previous one until
  // the revision is approved; the card says so instead of passing it off as current.
  const underRevision = approved != null && actuals.budget_status !== "approved";
  const estimate = Number(actuals.estimate_total);
  const incurred = Number(actuals.actual_total);
  // Utilisation only means something once there is a budget to measure against.
  const used = approved && approved > 0 ? (incurred / approved) * 100 : null;
  const over = used != null && used > 100;
  const remaining = approved != null ? approved - incurred : null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {underRevision ? "Budget Under Revision" : "Approved Budget"}
          </p>
          <p className="text-lg font-semibold text-foreground">
            {underRevision ? money(estimate) : approved != null ? money(approved) : "Not approved yet"}
          </p>
          {approved == null && (
            <p className="text-2xs text-muted-foreground">
              The estimate stands at {money(actuals.estimate_total)}.
            </p>
          )}
          {underRevision && (
            <p className="text-2xs text-amber-600">
              {actuals.budget_status === "submitted" ? "Revised estimate awaiting approval" : "Revised estimate, not yet submitted"} · previously approved {money(approved)}
            </p>
          )}
        </div>

        <div>
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            Cost Incurred
          </p>
          <p className="text-lg font-semibold text-foreground">{money(incurred)}</p>
          {remaining != null && (
            <p className={`text-2xs ${remaining < 0 ? "text-red-600" : "text-muted-foreground"}`}>
              {remaining < 0
                ? `${money(Math.abs(remaining))} over budget`
                : `${money(remaining)} left`}
            </p>
          )}
        </div>

        <div className="sm:col-span-2 lg:col-span-1">
          <div className="flex items-baseline justify-between">
            <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              Budget Utilisation
            </p>
            <p className={`text-sm font-semibold ${over ? "text-red-600" : "text-foreground"}`}>
              {used != null ? `${used.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all ${
                over ? "bg-red-500" : used != null && used > 80 ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(used ?? 0, 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-2xs text-muted-foreground">
            {used == null
              ? "Approve the budget to track utilisation."
              : over
                ? "Spending has passed the approved budget."
                : `${money(incurred)} of ${money(approved)} spent`}
          </p>
        </div>
      </div>
    </div>
  );
}
