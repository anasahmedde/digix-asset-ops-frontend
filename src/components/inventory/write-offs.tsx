"use client";

import { PackageX } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/utils";

export const WRITE_OFF_REASONS = [
  { value: "obsolete", label: "Obsolete" },
  { value: "damaged", label: "Damaged" },
  { value: "stolen", label: "Stolen" },
  { value: "lost", label: "Lost / missing" },
];

/** Generic stock (a quantity of an item) or one unique unit. */
export interface WriteOffTarget {
  kind: "item" | "unit";
  id: string;
  label: string;
  /** For an item: what is on hand. */
  onHand?: number;
  unit?: string;
}

const inputClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none";

/** Take stock off the books: obsolete, damaged, stolen or lost. */
export function WriteOffDialog({ target, onClose, onDone }: {
  target: WriteOffTarget | null; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState({ quantity: "1", reason: "damaged", notes: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (target) setForm({ quantity: "1", reason: "damaged", notes: "" }); }, [target]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    setSaving(true);
    try {
      const url = target.kind === "item" ? `/inventory/items/${target.id}/write-off/` : `/inventory/units/${target.id}/write-off/`;
      const { data } = await api.post(url, {
        reason: form.reason, notes: form.notes.trim(), ...(target.kind === "item" ? { quantity: Number(form.quantity) } : {}),
      });
      toast.success(`Written off on ${data.reference}`);
      onClose();
      onDone();
    } catch (err) {
      toast.error(getApiError(err, "Could not write it off"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Write off — ${target.label}` : "Write off"} size="sm">
      {target && (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Taken off the books for good: {target.kind === "item" ? "the quantity leaves stock" : "the unit is marked Written Off"}, and the
            write-off is kept on the register with its value.
          </p>
          {target.kind === "item" && (
            <div className="space-y-1.5">
              <label htmlFor="wo-qty" className="text-xs font-medium text-muted-foreground">Quantity</label>
              <input id="wo-qty" type="number" min={1} max={target.onHand} value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={inputClass} />
              <p className="text-2xs text-muted-foreground">{target.onHand ?? 0} {target.unit || "piece"} on hand.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="wo-reason" className="text-xs font-medium text-muted-foreground">Reason</label>
            <select id="wo-reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className={inputClass}>
              {WRITE_OFF_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="wo-notes" className="text-xs font-medium text-muted-foreground">What happened *</label>
            <textarea id="wo-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={form.reason === "stolen" ? "e.g. Missing from rack B after the weekend; reported to security"
                : form.reason === "obsolete" ? "e.g. Model discontinued, no longer used in any build"
                : "e.g. Dropped while unloading, panel cracked"}
              className={`${inputClass} h-auto py-2`} />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary">Cancel</button>
            <button type="submit" disabled={saving || !form.notes.trim() || (target.kind === "item" && Number(form.quantity) < 1)}
              className="rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-destructive/90 disabled:opacity-50">
              {saving ? "Writing off…" : target.kind === "item" ? `Write off ${Number(form.quantity) || 0}` : "Write off this unit"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

interface Row {
  id: string; reference: string; what: string; code: string; serial_number: string | null; quantity: number;
  reason: string; reason_display: string; notes: string; value: string | null; written_off_by_name: string | null; created_at: string;
}

/** The register: everything written off, why, by whom, and what it was worth. */
export function WriteOffs() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [reason, setReason] = useState("");
  const sort = useSortState();
  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/inventory/write-offs/", { params: { page_size: 1000, ...(reason ? { reason } : {}) } });
      setRows(data.results ?? data);
    } catch {
      setRows([]);
    }
  }, [reason]);
  useEffect(() => { load(); }, [load]);
  const total = (rows ?? []).reduce((n, r) => n + Number(r.value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Stock taken off the books — obsolete, damaged, stolen or lost. Write off from a row in Generic or Unique Components.
        </p>
        <div className="flex items-center gap-3">
          <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason"
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
            <option value="">All reasons</option>
            {WRITE_OFF_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          {rows && rows.length > 0 && (
            <span className="text-sm text-muted-foreground">Value written off: <span className="font-semibold text-foreground">PKR {total.toLocaleString()}</span></span>
          )}
        </div>
      </div>
      {rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <PackageX className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm font-medium text-foreground">Nothing written off</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <SortTh sort={sort} k="created_at" className="px-4 py-3 font-medium">Date</SortTh>
                <SortTh sort={sort} k="reference" className="px-4 py-3 font-medium">Reference</SortTh>
                <SortTh sort={sort} k="what" className="px-4 py-3 font-medium">Item</SortTh>
                <SortTh sort={sort} k="quantity" className="px-4 py-3 text-right font-medium">Qty</SortTh>
                <SortTh sort={sort} k="reason" className="px-4 py-3 font-medium">Reason</SortTh>
                <th className="px-4 py-3 font-medium">What happened</th>
                <SortTh sort={sort} k="value" className="px-4 py-3 text-right font-medium">Value</SortTh>
                <SortTh sort={sort} k="written_off_by_name" className="px-4 py-3 font-medium">By</SortTh>
              </tr>
            </thead>
            <tbody>
              {sortRows(rows, sort).map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateTime(r.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-foreground">{r.reference}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-foreground">{r.what}</span>
                    <span className="block font-mono text-2xs text-muted-foreground">{r.code}{r.serial_number ? ` · S/N ${r.serial_number}` : ""}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{r.quantity}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${r.reason === "stolen" || r.reason === "lost" ? "bg-red-500/10 text-red-600 ring-red-500/20" : "bg-amber-500/10 text-amber-700 ring-amber-500/20"}`}>
                      {r.reason_display}
                    </span>
                  </td>
                  <td className="max-w-xs px-4 py-2.5 text-muted-foreground">{r.notes}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-foreground">{r.value == null ? "—" : `PKR ${Number(r.value).toLocaleString()}`}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{r.written_off_by_name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
