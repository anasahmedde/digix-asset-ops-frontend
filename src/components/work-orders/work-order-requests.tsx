"use client";

import { ClipboardList, ScrollText, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

/** One operation of a build that Execution decided to give to a vendor. */
interface WorkOrderRequest {
  step: string;
  step_number: number;
  operation: string;
  device: string;
  asset_code: string;
  asset_name: string;
  project: string | null;
  project_name: string | null;
  planned_cost: string | null;
  requested_at: string;
  notes: string;
}
interface Ref { id: string; name: string }

const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-4 py-3";
const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";
const labelClass = "text-xs font-medium text-muted-foreground";

export function WorkOrderRequests({ onRaised }: { onRaised?: () => void }) {
  const { canWrite } = useUser();
  const canRaise = canWrite("setup") || canWrite("procurement");
  const [rows, setRows] = useState<WorkOrderRequest[]>([]);
  const [vendors, setVendors] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  // The order's own details — asked for up front so the draft is complete.
  const [vendor, setVendor] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  // Handing a request back to the project, with the reason on record.
  const [sendBack, setSendBack] = useState<WorkOrderRequest | null>(null);
  const [reason, setReason] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/work-orders/requests/");
      setRows(data.results ?? []);
      setSelected(new Set());
    } catch (err) {
      toast.error(getApiError(err, "Could not load the work order requests"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
    api.get("/suppliers/", { params: { page_size: 500 } }).then((r) => setVendors(r.data.results ?? r.data)).catch(() => {});
  }, [fetchRows]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const chosen = useMemo(() => rows.filter((r) => selected.has(r.step)), [rows, selected]);

  function openModal() {
    // The plan's figure for each operation; the buyer can overtype it.
    const seed: Record<string, string> = {};
    chosen.forEach((r) => { seed[r.step] = r.planned_cost ? String(Number(r.planned_cost)) : ""; });
    setAmounts(seed);
    setModal(true);
  }

  function resetModal() {
    setModal(false);
    setVendor("");
    setExpectedDelivery("");
    setTerms("");
    setNotes("");
    setAmounts({});
  }

  async function raise() {
    if (!vendor || chosen.length === 0) return;
    setSaving(true);
    try {
      const filled: Record<string, string> = {};
      chosen.forEach((r) => { const a = (amounts[r.step] ?? "").trim(); if (a !== "") filled[r.step] = a; });
      const { data } = await api.post("/work-orders/raise/", {
        steps: chosen.map((r) => r.step),
        supplier: vendor,
        amounts: filled,
        expected_delivery: expectedDelivery || null,
        terms: terms.trim(),
        notes: notes.trim(),
      });
      toast.success(`${data.wo_number} drafted with ${data.items?.length ?? chosen.length} line(s) — review it, then submit it for the Group Head's approval`);
      resetModal();
      fetchRows();
      onRaised?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the work order"));
    } finally {
      setSaving(false);
    }
  }

  async function submitSendBack() {
    if (!sendBack || !reason.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post("/work-orders/requests/send-back/", { step: sendBack.step, reason: reason.trim() });
      toast.success(data.detail || "Sent back to the project");
      setSendBack(null);
      setReason("");
      fetchRows();
    } catch (err) {
      toast.error(getApiError(err, "Could not send the request back"));
    } finally {
      setSaving(false);
    }
  }

  const draftTotal = chosen.reduce((sum, r) => {
    const a = Number(amounts[r.step] ?? 0);
    return sum + (Number.isFinite(a) ? a : 0);
  }, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Operations a project decided to give to a vendor. Pick the ones going to the same vendor and
          raise one work order for them; the draft then goes for the Group Head&apos;s approval like a
          purchase order.
        </p>
        {canRaise && (
          <button
            onClick={openModal}
            disabled={selected.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all disabled:opacity-50"
          >
            <ScrollText className="h-4 w-4" /> Raise WO ({selected.size})
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No work order requests</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Operations marked &ldquo;Work order&rdquo; in a project&apos;s Execution tab appear here until an
            order is raised for them.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  {canRaise && (
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={rows.length > 0 && selected.size === rows.length}
                        onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.step)) : new Set())}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                    </th>
                  )}
                  <th className={thClass}>Operation</th>
                  <th className={thClass}>For Asset</th>
                  <th className={thClass}>Project</th>
                  <th className={`${thClass} text-right`}>Planned</th>
                  <th className={thClass}>Requested</th>
                  {canRaise && <th className={thClass}></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.step} className="border-b border-border transition-colors hover:bg-secondary/30">
                    {canRaise && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.operation}`}
                          checked={selected.has(r.step)}
                          onChange={() => toggle(r.step)}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                      </td>
                    )}
                    <td className={`${tdClass} font-medium text-foreground`}>
                      <span className="mr-1.5 font-mono text-2xs text-muted-foreground">{r.step_number}.</span>
                      {r.operation}
                    </td>
                    <td className={tdClass}>
                      <span className="font-mono text-xs text-foreground">{r.asset_code}</span>
                      <span className="block text-2xs text-muted-foreground">{r.asset_name}</span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{r.project_name ?? "—"}</td>
                    <td className={`${tdClass} text-right text-muted-foreground`}>
                      {r.planned_cost != null ? `PKR ${Number(r.planned_cost).toLocaleString()}` : "—"}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{new Date(r.requested_at).toLocaleDateString()}</td>
                    {canRaise && (
                      <td className={tdClass}>
                        <button
                          onClick={() => { setSendBack(r); setReason(""); }}
                          title="Send this request back to the project to decide again"
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-2xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                        >
                          <Undo2 className="h-3 w-3" /> Send back
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

      {/* One draft order, one vendor, a line per operation. */}
      <Modal open={modal} onClose={resetModal} title="Raise Work Order" size="lg">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {chosen.length} operation{chosen.length === 1 ? " goes" : "s go"} on one draft order. Amounts can still be
            changed on the draft; once the Group Head approves it, they are fixed.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="wor_vendor" className={labelClass}>Vendor *</label>
              <select id="wor_vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputClass}>
                <option value="">Select vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="wor_delivery" className={labelClass}>Required delivery</label>
              <input id="wor_delivery" type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Operation</th>
                  <th className="px-3 py-2 font-medium">For</th>
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 text-right font-medium">Amount (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {chosen.map((r) => (
                  <tr key={r.step} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 text-foreground">{r.operation}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.asset_code}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.project_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={amounts[r.step] ?? ""}
                        onChange={(e) => setAmounts({ ...amounts, [r.step]: e.target.value })}
                        placeholder="planned"
                        title="Blank uses the planned step cost"
                        className="h-8 w-28 rounded-lg border border-border bg-card px-2 text-right text-xs text-foreground focus:border-primary/50 focus:outline-none"
                      />
                    </td>
                  </tr>
                ))}
                <tr className="bg-secondary/30">
                  <td colSpan={3} className="px-3 py-2 text-right font-medium text-muted-foreground">Draft total</td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{draftTotal.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-muted-foreground">A blank amount falls back to what the plan expected for that operation, or zero if it was never priced.</p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="wor_terms" className={labelClass}>Terms</label>
              <textarea id="wor_terms" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Blank uses the standard terms" className={`${inputClass} h-auto py-2`} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="wor_notes" className={labelClass}>Notes</label>
              <textarea id="wor_notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the vendor or approver should know" className={`${inputClass} h-auto py-2`} />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={resetModal} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
            <button type="button" onClick={raise} disabled={saving || !vendor || chosen.length === 0} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
              {saving ? "Raising…" : "Raise draft WO"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Back to the project, with the reason on the asset. */}
      <Modal open={!!sendBack} onClose={() => setSendBack(null)} title={sendBack ? `Send back — ${sendBack.operation}` : "Send back"} size="sm">
        {sendBack && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{sendBack.operation}</span> on {sendBack.asset_code} goes back to
              the project as undecided. The reason is written on the asset for Execution to read.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="wor_reason" className={labelClass}>Reason *</label>
              <textarea id="wor_reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Our floor is free next week — do it in-house" className={`${inputClass} h-auto py-2`} autoFocus />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setSendBack(null)} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
              <button type="button" onClick={submitSendBack} disabled={saving || !reason.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                <Undo2 className="h-3.5 w-3.5" /> Send back to project
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
