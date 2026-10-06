"use client";

import { ShieldCheck, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

/** One asset on the order, and the cover the client has on it. */
interface Row {
  device: string;
  asset_code: string;
  asset_name: string;
  status: string;
  status_display: string;
  handed_over: boolean;
  installation_date: string | null;
  warranty: {
    id: string;
    months: number;
    start_date: string;
    end_date: string;
    status: string;
  } | null;
}

const TERMS = [3, 6, 12, 24];

const inputClass =
  "h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

/**
 * The warranty this order gives the client, asset by asset.
 *
 * An order is not finished when the last screen is on the wall — it is
 * finished when the client has been told what cover they have. That promise
 * was made on handover and never written down, so a claim months later met a
 * register that knew nothing about it. Recording it is a step of Execution,
 * and the project will not call itself complete until every asset the client
 * is holding carries one.
 */
export function ClientWarranties({
  projectId,
  onChanged,
}: {
  projectId: string;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/teams/projects/${projectId}/client-warranties/`);
      setRows(data.results ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  async function give(row: Row) {
    const term = Number(months[row.device] ?? 0);
    if (!term) {
      toast.error("Say how long the client is covered for");
      return;
    }
    setSaving(row.device);
    try {
      const { data } = await api.post(
        `/teams/projects/${projectId}/client-warranties/`,
        { device: row.device, months: term },
      );
      toast.success(data.detail);
      setRows(data.results ?? []);
      setMonths((m) => ({ ...m, [row.device]: "" }));
      onChanged?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not record that warranty"));
    } finally {
      setSaving(null);
    }
  }

  if (loading) return null;

  const awaiting = rows.filter((r) => r.handed_over && !r.warranty);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {awaiting.length ? (
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
          )}
          <h3 className="text-sm font-semibold text-foreground">Client warranty</h3>
          {awaiting.length > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-medium text-amber-600 ring-1 ring-amber-500/20">
              {awaiting.length} to record
            </span>
          )}
        </div>
        <p className="text-2xs text-muted-foreground">
          {awaiting.length
            ? "The order stays open until every asset the client holds has cover recorded."
            : "Every asset with the client is covered."}
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
          No assets on this project yet. Add them in Scope and their cover is recorded here.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Asset</th>
                  <th className="px-3 py-2 font-medium">Where it is</th>
                  <th className="px-3 py-2 font-medium">Cover</th>
                  <th className="px-3 py-2 font-medium">Runs to</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.device} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <span className="font-mono text-foreground">{r.asset_code}</span>
                      {r.asset_name && (
                        <span className="block text-2xs text-muted-foreground">{r.asset_name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.status_display}
                      {!r.handed_over && (
                        <span className="block text-2xs">not with the client yet</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {r.warranty ? (
                        <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-2xs font-medium text-emerald-600 ring-1 ring-emerald-500/20">
                          {r.warranty.months} month{r.warranty.months === 1 ? "" : "s"}
                        </span>
                      ) : r.handed_over ? (
                        <span className="inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-medium text-amber-600 ring-1 ring-amber-500/20">
                          Not recorded
                        </span>
                      ) : (
                        <span className="text-2xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {r.warranty
                        ? new Date(r.warranty.end_date).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* The term is quoted in months, so it is picked in
                            months. Changing it later re-dates the cover from
                            the day the asset went in, not from today. */}
                        <select
                          value={months[r.device] ?? ""}
                          onChange={(e) => setMonths((m) => ({ ...m, [r.device]: e.target.value }))}
                          className={inputClass}
                          aria-label={`Warranty term for ${r.asset_code}`}
                        >
                          <option value="">{r.warranty ? "Change…" : "Term…"}</option>
                          {TERMS.map((t) => (
                            <option key={t} value={t}>{t} months</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => give(r)}
                          disabled={saving === r.device || !months[r.device]}
                          className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-2xs font-medium text-white transition-all disabled:opacity-40"
                        >
                          {saving === r.device ? "Saving…" : r.warranty ? "Update" : "Record"}
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
    </div>
  );
}
