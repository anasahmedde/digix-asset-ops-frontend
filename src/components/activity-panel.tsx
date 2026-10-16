"use client";

import { History, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import api from "@/lib/api";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";

/** One line of a job's history, as the server writes it. */
interface ActivityRow {
  id: string;
  action: string;
  text: string;
  actor: string | null;
  at: string;
}

/** Acts that finish something read green; trouble reads red; the rest are the job moving. */
const TONE: Record<string, TimelineItem["tone"]> = {
  completed: "success", accepted: "success", step_completed: "success", activated: "success",
  handed_over: "success", part_issued: "success", parts_settled: "success", part_approved: "success",
  delay_resolved: "success", resumed: "success",
  sent_back: "danger", cancelled: "danger", part_rejected: "danger", part_sent_back: "danger",
  delay: "danger", step_on_hold: "warning", paused: "warning", part_withdrawn: "muted",
  step_skipped: "muted", step_removed: "muted", edited: "muted", notes: "muted", photo: "muted",
  purchase: "warning", purchase_removed: "muted",
};

/**
 * Who did what on a job, and exactly when: every act the server recorded,
 * newest first, each day headed by its full date and each line by its time.
 * Refetches whenever `refreshKey` changes, so an act on the page shows here.
 */
export function ActivityPanel({ endpoint, refreshKey, className = "" }: {
  endpoint: string;
  refreshKey?: string | number;
  className?: string;
}) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(endpoint);
      setRows(Array.isArray(data) ? data : data.results ?? []);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="h-4 w-4 text-primary" /> Activity
          {rows && rows.length > 0 && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium text-muted-foreground ring-1 ring-border">
              {rows.length}
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh activity"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
      {failed && !rows ? (
        <p className="text-xs text-muted-foreground">The history could not be loaded.</p>
      ) : !rows ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto pr-1">
          <Timeline
            exact
            compact
            empty="Nothing has been done on this yet."
            items={rows.map((r) => ({
              key: r.id,
              title: r.text,
              // Older lines written back from the records may not know who.
              actor: r.actor ?? "Not recorded",
              at: r.at,
              tone: TONE[r.action] ?? "primary",
            }))}
          />
        </div>
      )}
    </div>
  );
}
