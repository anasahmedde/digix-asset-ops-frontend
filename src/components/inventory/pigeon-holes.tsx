"use client";

import { Archive, PackageOpen } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { Qty } from "@/components/ui/qty";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useReloadOnNotice } from "@/lib/notification-context";

interface Hole {
  id: string;
  project: string;
  project_code: string;
  project_name: string;
  what: string;
  code: string;
  kind: "generic" | "unique";
  unit: string;
  /** On hand in the pigeon hole now. */
  quantity: number;
  serials: string[];
  kept: number;
  issued: number;
  pending_in: number;
  pending_out: number;
}

const thClass = "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-4 py-3 align-top";
const inputClass =
  "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none";

/**
 * Contingency stock each project keeps apart in the store: set aside from a
 * line of its bill of material, the project's own, and drawn on only for
 * that project - asked for here and issued by the store like any request.
 */
export function PigeonHoles() {
  const [rows, setRows] = useState<Hole[] | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [askFor, setAskFor] = useState<Hole | null>(null);
  const [ask, setAsk] = useState({ quantity: "1", purpose: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/inventory/pigeon-holes/", { params: { page_size: 1000, ...(showEmpty ? {} : { held: "true" }) } });
      setRows(data.results ?? data);
    } catch (err) {
      setRows([]);
      toast.error(getApiError(err, "Could not load the pigeon holes"));
    }
  }, [showEmpty]);

  useEffect(() => { load(); }, [load]);
  // Set aside or issued by the store: the figures here move.
  useReloadOnNotice((n) => /pigeon hole|issued/i.test(n.title ?? ""), load);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!askFor) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/inventory/pigeon-holes/${askFor.id}/request/`, {
        quantity: Number(ask.quantity), purpose: ask.purpose.trim(),
      });
      toast.success(`${data.request_number} raised — the store issues it from Issue Requests`);
      setAskFor(null);
      load();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the request"));
    } finally {
      setSaving(false);
    }
  }

  // Grouped by project: a pigeon hole belongs to one.
  const groups = new Map<string, Hole[]>();
  for (const r of rows ?? []) groups.set(r.project, [...(groups.get(r.project) ?? []), r]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Contingency stock kept apart for a project, in case the job physically changes and needs more. It is the
          project&apos;s own: out of general stock, and issued only for that project. Set aside from a line of the
          project&apos;s bill of material (Execution › Pigeon Hole › Keep).
        </p>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} className="h-4 w-4" />
          Show emptied pigeon holes
        </label>
      </div>

      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Archive className="mx-auto h-10 w-10 text-muted-foreground/30" />
          <p className="mt-3 text-sm font-medium text-foreground">Nothing kept in a pigeon hole</p>
          <p className="mt-1 text-sm text-muted-foreground">Keep contingency stock for a project from its bill of material in Execution.</p>
        </div>
      ) : (
        [...groups.values()].map((holes) => (
          <div key={holes[0].project} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-2.5">
              <Link href={`/projects?project=${holes[0].project}&tab=execution`} className="text-sm font-semibold text-foreground hover:underline">
                <span className="font-mono text-primary">{holes[0].project_code}</span> · {holes[0].project_name}
              </Link>
              <span className="text-xs text-muted-foreground">{holes.length} item{holes.length === 1 ? "" : "s"} kept</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className={thClass}>Item</th>
                    <th className={thClass}>In pigeon hole</th>
                    <th className={thClass}>Kept so far</th>
                    <th className={thClass}>Issued from it</th>
                    <th className={thClass}>With the store</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {holes.map((h) => {
                    const free = h.quantity - h.pending_out;
                    return (
                      <tr key={h.id} className="border-b border-border/60 last:border-0">
                        <td className={tdClass}>
                          <span className="font-medium text-foreground">{h.what}</span>
                          <span className="block text-2xs text-muted-foreground">
                            {h.kind === "generic" ? "Stock" : "Unique"} · {h.code}
                          </span>
                          {h.serials.length > 0 && (
                            <span className="mt-1 block font-mono text-2xs text-muted-foreground">{h.serials.join(", ")}</span>
                          )}
                        </td>
                        <td className={`${tdClass} font-semibold text-foreground`}><Qty value={h.quantity} unit={h.unit} /></td>
                        <td className={`${tdClass} text-muted-foreground`}><Qty value={h.kept} unit={h.unit} /></td>
                        <td className={`${tdClass} text-muted-foreground`}><Qty value={h.issued} unit={h.unit} /></td>
                        <td className={`${tdClass} text-2xs text-muted-foreground`}>
                          {h.pending_in > 0 && <span className="block text-amber-600">{h.pending_in} to set aside</span>}
                          {h.pending_out > 0 && <span className="block text-amber-600">{h.pending_out} asked for</span>}
                          {!h.pending_in && !h.pending_out && "—"}
                        </td>
                        <td className={`${tdClass} text-right`}>
                          <button
                            onClick={() => { setAsk({ quantity: "1", purpose: "" }); setAskFor(h); }}
                            disabled={free <= 0}
                            title={free <= 0 ? "Everything here is already asked for" : "Ask the store to issue some for this project"}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                          >
                            <PackageOpen className="h-3.5 w-3.5" /> Request issue
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <Modal open={!!askFor} onClose={() => setAskFor(null)} title={askFor ? `Request from pigeon hole — ${askFor.what}` : "Request"} size="sm">
        {askFor && (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{askFor.project_code}</span> keeps{" "}
              <span className="font-medium text-foreground">{askFor.quantity}</span> {askFor.unit}
              {askFor.pending_out > 0 ? ` (${askFor.pending_out} already asked for)` : ""}. The store issues it to a named
              person, like any material request.
            </p>
            <div className="space-y-1.5">
              <label htmlFor="ph-qty" className="text-xs font-medium text-muted-foreground">Quantity</label>
              <input id="ph-qty" type="number" min={1} max={askFor.quantity - askFor.pending_out} value={ask.quantity}
                onChange={(e) => setAsk({ ...ask, quantity: e.target.value })} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ph-why" className="text-xs font-medium text-muted-foreground">What it is for</label>
              <input id="ph-why" value={ask.purpose} onChange={(e) => setAsk({ ...ask, purpose: e.target.value })}
                placeholder="e.g. Replace a cracked module on DGX-2026-00076" className={inputClass} />
            </div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setAskFor(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary">Cancel</button>
              <button type="submit" disabled={saving || Number(ask.quantity) < 1}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                {saving ? "Raising…" : `Request ${Number(ask.quantity) || 0}`}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
