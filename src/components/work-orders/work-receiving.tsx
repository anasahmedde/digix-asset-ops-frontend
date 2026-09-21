"use client";

import { CheckCircle2, ClipboardCheck, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import type { WorkOrder, WorkOrderItem } from "@/types";

/** The jobs on an order that have come in and nobody has looked at yet. */
function waitingLines(wo: WorkOrder): WorkOrderItem[] {
  return (wo.items ?? []).filter((i) => i.line_state === "awaiting_inspection");
}

const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-4 py-3";
const inputClass =
  "flex w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";
const labelClass = "text-xs font-medium text-muted-foreground";

/** Delivered work waiting to be inspected: accepted completes the order and
 *  its operations; sent back for rework returns it to the vendor. */
export function WorkReceiving({ onInspected }: { onInspected?: () => void }) {
  const { canWrite } = useUser();
  const canInspect = canWrite("inventory") || canWrite("setup") || canWrite("procurement");
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<WorkOrder | null>(null);
  const [result, setResult] = useState<"accepted" | "rework">("accepted");
  const [notes, setNotes] = useState("");
  // Which of the delivered jobs this verdict covers. All of them, unless the
  // inspector passes some and sends others back.
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/work-orders/receiving/");
      setRows(data.results ?? []);
    } catch (err) {
      toast.error(getApiError(err, "Could not load the delivered work"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  function open(wo: WorkOrder) {
    setTarget(wo);
    setResult("accepted");
    setNotes("");
    setPicked(new Set(waitingLines(wo).map((i) => i.id as string)));
  }

  async function submit() {
    if (!target) return;
    if (result === "rework" && !notes.trim()) { toast.error("Say what has to be redone."); return; }
    const waiting = waitingLines(target);
    if (waiting.length > 1 && picked.size === 0) { toast.error("Pick the jobs this verdict covers."); return; }
    setSaving(true);
    try {
      const some = waiting.length > 1 && picked.size < waiting.length;
      const { data } = await api.post(`/work-orders/${target.id}/inspect/`, {
        result,
        notes: notes.trim(),
        // Only name the jobs when it is some of them; all of them is the default.
        ...(some ? { items: Array.from(picked) } : {}),
      });
      toast.success(
        result === "accepted"
          ? data.status === "completed"
            ? `${data.wo_number} accepted — the work is complete and its operations are marked done`
            : `${picked.size} job${picked.size === 1 ? "" : "s"} accepted on ${data.wo_number}; the rest are still with ${data.supplier_name}`
          : `${some ? `${picked.size} job${picked.size === 1 ? "" : "s"} on ` : ""}${data.wo_number} sent back to ${data.supplier_name} for rework`,
      );
      setTarget(null);
      fetchRows();
      onInspected?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not record the inspection"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Work the vendor has delivered, waiting to be inspected. Accepting it completes the order and marks
        every operation on it done, with who inspected it on record; sending it back returns the order to
        the vendor for rework with the reason.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ClipboardCheck className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">Nothing awaiting inspection</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            When a vendor delivers, mark the work order Delivered and it appears here for inspection.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>WO #</th>
                  <th className={thClass}>Work</th>
                  <th className={thClass}>Vendor</th>
                  <th className={thClass}>Project</th>
                  <th className={thClass}>Delivered</th>
                  <th className={`${thClass} text-right`}>Amount</th>
                  <th className={thClass}>Previous Inspection</th>
                  {canInspect && <th className={thClass}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((wo) => (
                  <tr key={wo.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} whitespace-nowrap font-mono text-foreground`}>{wo.wo_number}</td>
                    <td className={`${tdClass} text-foreground`}>
                      {wo.title}
                      <span className="block text-2xs text-muted-foreground">
                        {waitingLines(wo).map((i) => i.description).join(" · ") || wo.items.map((i) => i.description).join(" · ")}
                      </span>
                      {(wo.lines_with_vendor ?? 0) > 0 && (
                        <span className="mt-0.5 block text-2xs font-medium text-amber-600">
                          {waitingLines(wo).length} of {wo.line_count ?? wo.items.length} in · {wo.lines_with_vendor} still with the vendor
                        </span>
                      )}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{wo.supplier_name ?? "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{wo.project_name ?? "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{wo.delivered_at ? new Date(wo.delivered_at).toLocaleDateString() : "—"}</td>
                    <td className={`${tdClass} text-right text-foreground`}>{wo.currency} {Number(wo.total_amount).toLocaleString()}</td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {wo.inspection_result === "rework" ? (
                        <span className="text-amber-600">Sent back for rework{wo.inspected_by_name ? ` by ${wo.inspected_by_name}` : ""}</span>
                      ) : "—"}
                    </td>
                    {canInspect && (
                      <td className={tdClass}>
                        <button
                          onClick={() => open(wo)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90"
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" /> Inspect
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={!!target} onClose={() => setTarget(null)} title={target ? `Inspect ${target.wo_number}` : "Inspect"} size="md">
        {target && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{target.title}</span>
              {" · "}{target.supplier_name}
              {target.inspection_notes && <span className="mt-1 block whitespace-pre-line text-amber-700">{target.inspection_notes}</span>}
            </div>
            {waitingLines(target).length > 1 ? (
              <div className="space-y-1.5">
                <p className={labelClass}>Which jobs this covers</p>
                <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                  {waitingLines(target).map((line) => (
                    <label key={line.id} className="flex cursor-pointer items-start gap-3 p-2.5 hover:bg-secondary/40">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                        checked={picked.has(line.id as string)}
                        onChange={(e) => setPicked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(line.id as string); else next.delete(line.id as string);
                          return next;
                        })}
                      />
                      <span className="text-sm text-foreground">
                        {line.description}
                        {line.asset_code && <span className="ml-1.5 font-mono text-2xs text-muted-foreground">{line.asset_code}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-2xs text-muted-foreground">
                  Pass some and send others back by inspecting them separately.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {waitingLines(target)[0]?.description ?? target.items.map((i) => i.description).join(" · ")}
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setResult("accepted")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${result === "accepted" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700" : "border-border text-muted-foreground hover:bg-secondary"}`}
              >
                <CheckCircle2 className="h-4 w-4" /> Accepted — work is complete
              </button>
              <button
                type="button"
                onClick={() => setResult("rework")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${result === "rework" ? "border-amber-500/50 bg-amber-500/10 text-amber-700" : "border-border text-muted-foreground hover:bg-secondary"}`}
              >
                <Undo2 className="h-4 w-4" /> Send back for rework
              </button>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="wi_notes" className={labelClass}>{result === "rework" ? "What has to be redone *" : "Inspection notes"}</label>
              <textarea id="wi_notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={result === "rework" ? "e.g. Paint runs on two panels" : "Optional"} className={inputClass} />
            </div>
            <p className="text-2xs text-muted-foreground">
              Recorded as inspected by you, now. Accepted work finishes those jobs and their operations in the
              project; the order completes once every job on it has passed.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setTarget(null)} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
              <button type="button" onClick={submit} disabled={saving || (result === "rework" && !notes.trim())} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                <ClipboardCheck className="h-3.5 w-3.5" /> {result === "accepted" ? "Accept & complete" : "Send back"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
