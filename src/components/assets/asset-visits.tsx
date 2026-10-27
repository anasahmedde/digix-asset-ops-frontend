"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { formatDate } from "@/lib/utils";

interface CostLine { id?: string; description: string; quantity: string | null; unit_cost: string | null; amount: string | null }
interface Visit {
  id: string;
  schedule: string;
  schedule_title: string;
  maintenance_type_display?: string;
  sequence: number;
  status: string;
  status_display: string;
  started_at: string | null;
  completed_at: string | null;
  assigned_to_name: string | null;
  helper_names?: string[];
  remarks: string;
  notes: string;
  resolved: boolean | null;
  review_decision_display: string;
  review_reason: string;
  review_note: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  issue_side?: string;
  issue_side_display?: string;
  cost: string | null;
  charge_to?: string;
  cost_lines: CostLine[];
  component_costs: CostLine[];
  component_names?: string[];
  purchases?: { id: string; description: string; quantity: number; amount: string | null; shop: string }[];
  visit_photos?: { id: string; image: string; kind_display?: string; caption: string }[];
  asset_verified_at: string | null;
}

const money = (v: string | number | null | undefined) =>
  v == null ? "—" : `PKR ${Number(v).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const when = (v: string | null) =>
  v ? new Date(v).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** Every maintenance visit this asset has had, newest first, each in full:
 *  who went, what they found, what it cost and how the office decided it. */
export function AssetVisits({ deviceId, open, onClose, showCosts }: {
  deviceId: string; open: boolean; onClose: () => void; showCosts: boolean;
}) {
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVisits(null);
    api.get("/maintenance/visits/", { params: { schedule__device: deviceId, ordering: "-started_at", page_size: 200 } })
      .then(({ data }) => {
        const rows: Visit[] = (data.results ?? data).filter((v: Visit) => v.started_at);
        setVisits(rows);
        setOpenId(rows[0]?.id ?? null);
      })
      .catch(() => setVisits([]));
  }, [open, deviceId]);

  return (
    <Modal open={open} onClose={onClose} title="Visits" size="lg">
      {visits === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading visits…</p>
      ) : visits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No maintenance visit has been made to this asset yet.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {visits.length} visit{visits.length === 1 ? "" : "s"}, newest first. The latest is open; click any other to read it.
          </p>
          {visits.map((v, i) => {
            const expanded = openId === v.id;
            const lines = v.cost_lines.length ? v.cost_lines : v.component_costs;
            return (
              <div key={v.id} className={`rounded-xl border ${expanded ? "border-primary/30 bg-primary/[0.03]" : "border-border"}`}>
                <button onClick={() => setOpenId(expanded ? null : v.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">
                      {formatDate(v.completed_at ?? v.started_at!)}
                      {i === 0 && <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-semibold text-primary">Last visit</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {v.schedule_title} · {v.maintenance_type_display ?? "Maintenance"} · visit {v.sequence} · {v.assigned_to_name ?? "Unassigned"}
                    </p>
                  </div>
                  {v.issue_side_display && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${v.issue_side === "client" ? "bg-amber-500/10 text-amber-700 ring-amber-500/20" : "bg-sky-500/10 text-sky-700 ring-sky-500/20"}`}>
                      {v.issue_side_display}
                    </span>
                  )}
                  {showCosts && <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{money(v.cost)}</span>}
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
                {expanded && (
                  <div className="space-y-4 border-t border-border px-4 py-4 text-sm">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
                      {([
                        ["Status", v.status_display],
                        ["Started", when(v.started_at)],
                        ["Finished", when(v.completed_at)],
                        ["Technician", v.assigned_to_name ?? "—"],
                        ["Helpers", v.helper_names?.length ? v.helper_names.join(", ") : "—"],
                        ["Asset scanned", v.asset_verified_at ? when(v.asset_verified_at) : "No"],
                        ["Fixed?", v.resolved == null ? "Not said" : v.resolved ? "Yes" : "No"],
                        ["Issue was on", v.issue_side_display || "Not recorded"],
                        ["Decision", v.review_decision_display ? `${v.review_decision_display}${v.reviewed_by_name ? ` · ${v.reviewed_by_name}` : ""}` : "Not reviewed yet"],
                      ] as const).map(([k, val]) => (
                        <div key={k}>
                          <dt className="text-2xs uppercase tracking-wider text-muted-foreground">{k}</dt>
                          <dd className="text-foreground">{val}</dd>
                        </div>
                      ))}
                    </dl>
                    {(v.remarks || v.notes || v.review_reason || v.review_note) && (
                      <div className="space-y-1.5">
                        {v.remarks && <p><span className="text-muted-foreground">Technician&apos;s findings: </span>{v.remarks}</p>}
                        {v.notes && <p><span className="text-muted-foreground">Notes: </span>{v.notes}</p>}
                        {v.review_reason && <p><span className="text-muted-foreground">Sent back because: </span>{v.review_reason}</p>}
                        {v.review_note && <p><span className="text-muted-foreground">Office note: </span>{v.review_note}</p>}
                      </div>
                    )}
                    {(v.component_names ?? []).length > 0 && (
                      <p><span className="text-muted-foreground">Components serviced or replaced: </span>{v.component_names!.join(", ")}</p>
                    )}
                    {showCosts && (
                      <div className="rounded-lg border border-border">
                        <p className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
                          Cost of this visit{!v.cost_lines.length && lines.length ? " (parts, before the office priced it)" : ""}
                        </p>
                        {lines.length === 0 && !(v.purchases ?? []).length ? (
                          <p className="px-3 py-2 text-xs text-muted-foreground">Nothing costed on this visit.</p>
                        ) : (
                          <table className="w-full text-xs">
                            <tbody>
                              {lines.map((l, j) => (
                                <tr key={l.id ?? j} className="border-b border-border/60 last:border-0">
                                  <td className="px-3 py-1.5 text-foreground">{l.description}</td>
                                  <td className="px-3 py-1.5 text-right text-muted-foreground">{l.quantity ?? ""}{l.unit_cost ? ` × ${money(l.unit_cost)}` : ""}</td>
                                  <td className="px-3 py-1.5 text-right font-medium tabular-nums text-foreground">{money(l.amount)}</td>
                                </tr>
                              ))}
                              {!v.cost_lines.length && (v.purchases ?? []).map((p) => (
                                <tr key={p.id} className="border-b border-border/60 last:border-0">
                                  <td className="px-3 py-1.5 text-foreground">{p.description} <span className="text-muted-foreground">· bought{p.shop ? ` at ${p.shop}` : ""}</span></td>
                                  <td className="px-3 py-1.5 text-right text-muted-foreground">{p.quantity}</td>
                                  <td className="px-3 py-1.5 text-right font-medium tabular-nums text-foreground">{money(p.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-border font-semibold text-foreground">
                                <td className="px-3 py-2">Total{v.charge_to ? ` · charged to ${v.charge_to}` : ""}</td>
                                <td />
                                <td className="px-3 py-2 text-right tabular-nums">{money(v.cost)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        )}
                      </div>
                    )}
                    {(v.visit_photos ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {v.visit_photos!.map((p) => (
                          <a key={p.id} href={p.image} target="_blank" rel="noreferrer" title={[p.kind_display, p.caption].filter(Boolean).join(" · ")}>
                            <img src={p.image} alt={p.caption || "Visit photo"} className="h-20 w-20 rounded-lg border border-border object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                    <Link href={`/maintenance?schedule=${v.schedule}`} className="inline-block text-xs font-medium text-primary hover:underline">
                      Open the maintenance job →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
