"use client";

import { AlertTriangle, ClipboardList, ScrollText, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import { todayIso } from "@/lib/utils";
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
  /** When the project needs it — what the order is dated from. */
  project_target_date?: string | null;
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
  const { can } = useUser();
  const canRaise = can("raise_work_order");
  const [rows, setRows] = useState<WorkOrderRequest[]>([]);
  const sort = useSortState();
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
  // When the vendor gets paid is part of the order. The list is the
  // client's, from Setup.
  const [paymentTerms, setPaymentTerms] = useState("");
  // Terms typed for this deal, when no catalogue term fits.
  const [paymentNote, setPaymentNote] = useState("");
  const [termOptions, setTermOptions] = useState<{ id: string; name: string }[]>([]);
  // Why an operation is going on above the figure the project planned.
  const [reasons, setReasons] = useState<Record<string, string>>({});

  /** Quoted above what the project costed this operation at. */
  function overPlan(r: { step: string; planned_cost: string | null }) {
    const planned = r.planned_cost == null ? null : Number(r.planned_cost);
    return planned != null && planned > 0 && Number(amounts[r.step] ?? 0) > planned;
  }
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
    api.get("/setup/payment-terms/", { params: { is_active: true } })
      .then((r) => setTermOptions(r.data.results ?? r.data))
      .catch(() => {});
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
    // The date is not typed from memory: the work is wanted by the day the
    // project is due, and the earliest of the chosen operations is what binds.
    const due = chosen
      .map((r) => r.project_target_date)
      .filter((d): d is string => !!d)
      .sort()[0];
    setExpectedDelivery(due ?? "");
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
        payment_terms: paymentTerms === "__other__" ? null : paymentTerms || null,
        payment_terms_note: paymentTerms === "__other__" ? paymentNote.trim() : "",
        variance_reasons: Object.fromEntries(
          chosen.filter(overPlan).map((r) => [r.step, (reasons[r.step] ?? "").trim()]),
        ),
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
                  <SortTh sort={sort} k="operation" className={thClass}>Operation</SortTh>
                  <SortTh sort={sort} k="asset_code" className={thClass}>For Asset</SortTh>
                  <SortTh sort={sort} k="project_name" className={thClass}>Project</SortTh>
                  <SortTh sort={sort} k="planned_cost" className={`${thClass} text-right`}>Planned</SortTh>
                  <SortTh sort={sort} k="requested_at" className={thClass}>Requested</SortTh>
                  {canRaise && <th className={thClass}></th>}
                </tr>
              </thead>
              <tbody>
                {sortRows(rows, sort).map((r) => (
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
              <input id="wor_delivery" type="date" min={todayIso()} value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} className={inputClass} />
              <p className="text-2xs text-muted-foreground">
                {chosen.some((r) => r.project_target_date)
                  ? "Taken from the date the project is due. Change it if the vendor is held to another."
                  : "No project date to take it from — set the date the vendor is held to."}
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="wor_payment_terms" className={labelClass}>Payment terms</label>
              <select
                id="wor_payment_terms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                className={inputClass}
              >
                <option value="">—</option>
                {termOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="__other__">Other — type the terms…</option>
              </select>
              {paymentTerms === "__other__" && (
                <input
                  id="wor_payment_note"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  maxLength={200}
                  placeholder="e.g. 30% on order, balance on commissioning"
                  className={inputClass}
                  autoFocus
                />
              )}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Operation</th>
                  <th className="px-3 py-2 font-medium">For</th>
                  <th className="px-3 py-2 font-medium">Project</th>
                  <th className="px-3 py-2 text-right font-medium">Planned</th>
                  <th className="px-3 py-2 text-right font-medium">Amount (PKR)</th>
                </tr>
              </thead>
              <tbody>
                {chosen.map((r) => (
                  <tr key={r.step} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 text-foreground">{r.operation}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.asset_code}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.project_name ?? "—"}</td>
                    {/* What the project costed this operation at. A vendor
                        quoting above it is spending the project's money, so
                        Execution agrees the figure before the order goes up. */}
                    <td className="px-3 py-2 text-right align-top tabular-nums text-muted-foreground">
                      {r.planned_cost == null ? "—" : Number(r.planned_cost).toLocaleString()}
                      <span className="block text-2xs">per operation</span>
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={amounts[r.step] ?? ""}
                        onChange={(e) => setAmounts({ ...amounts, [r.step]: e.target.value })}
                        placeholder={r.planned_cost == null ? "amount" : String(Number(r.planned_cost))}
                        title="Blank uses the planned step cost"
                        className="h-8 w-28 rounded-lg border border-border bg-card px-2 text-right text-xs text-foreground focus:border-primary/50 focus:outline-none"
                      />
                      {overPlan(r) && (
                        <>
                          <span className="block text-2xs font-medium text-amber-600">
                            +{Math.round(((Number(amounts[r.step]) - Number(r.planned_cost)) / Number(r.planned_cost)) * 100)}% over plan
                          </span>
                          <input
                            value={reasons[r.step] ?? ""}
                            onChange={(e) => setReasons({ ...reasons, [r.step]: e.target.value })}
                            placeholder="Why the higher quote?"
                            aria-label={`Reason for the higher quote on ${r.operation}`}
                            className="mt-1 h-7 w-40 rounded-lg border border-amber-500/40 bg-card px-2 text-2xs text-foreground focus:border-primary/50 focus:outline-none"
                          />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="bg-secondary/30">
                  <td colSpan={4} className="px-3 py-2 text-right font-medium text-muted-foreground">Draft total</td>
                  <td className="px-3 py-2 text-right font-semibold text-foreground">{draftTotal.toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-2xs text-muted-foreground">A blank amount falls back to what the plan expected for that operation, or zero if it was never priced.</p>
          {chosen.some(overPlan) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {chosen.filter(overPlan).length} operation
                {chosen.filter(overPlan).length === 1 ? " is" : "s are"} quoted above the project&apos;s
                plan. The draft will be raised, then Project Execution has to agree the price before
                this order can go up for the Group Head&apos;s signature.
              </span>
            </div>
          )}

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
