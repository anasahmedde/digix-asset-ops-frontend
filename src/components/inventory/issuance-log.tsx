"use client";

import { ChevronDown, ChevronRight, Download, PackageOpen, Printer, Search } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { Qty } from "@/components/ui/qty";

/** A store request with at least one hand-over: the log's main record. */
interface RequestRow {
  id: string;
  request_number: string;
  what: string;
  item_sku: string | null;
  item_name: string | null;
  unit_type_name: string | null;
  /** The component's own code, as the Unique Components list prints it. */
  unit_type_code?: string | null;
  unit: string;
  quantity_requested: number;
  quantity_issued: number;
  outstanding_quantity: number;
  source_display: string;
  purpose: string;
  project_name: string | null;
  asset_code: string | null;
  /** The asset the material is going into, as people name it. */
  asset_name?: string | null;
  maintenance_title?: string | null;
  component_name: string | null;
  requested_by_name: string | null;
  issued_by_name: string | null;
  received_by: string;
  issued_serials: string[];
  issued_units: { serial_number: string; unit_code: string | null; status: string | null; status_display: string | null }[];
  /** Every hand-over, one by one. */
  handovers: { at: string; quantity: number; received_by: string; issued_by: string; serials: string[]; note?: string }[];
  last_issued_at: string | null;
  status: string;
  status_display: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** Issues recorded by the older project-BOM flow, kept for history. */
interface LegacyRow {
  id: string;
  issue_number: string;
  item_name: string | null;
  quantity: number;
  site_name: string | null;
  project_name: string | null;
  issued_to_user_name: string | null;
  issued_by_name: string | null;
  reason: string;
  notes: string;
  created_at: string;
}

type LogRow =
  | { kind: "request"; id: string; number: string; date: string; row: RequestRow }
  | { kind: "legacy"; id: string; number: string; date: string; row: LegacyRow };

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

/** Everyone who took material against a request, in order, once each. */
function receivers(r: RequestRow): string[] {
  const names: string[] = [];
  for (const h of r.handovers ?? []) {
    const n = (h.received_by || "").trim();
    if (n && !names.includes(n)) names.push(n);
  }
  if (names.length === 0 && r.received_by) names.push(r.received_by);
  return names;
}

/** What the material was drawn for: a project, a maintenance job, or the store\'s
 *  own reason. Separate from who carried it away. */
function drawnFor(row: LogRow): { name: string; kind: string } | null {
  if (row.kind === "request") {
    if (row.row.project_name) return { name: row.row.project_name, kind: "Project" };
    if (row.row.maintenance_title) return { name: row.row.maintenance_title, kind: "Maintenance" };
    // Nothing named it, so the source is all there is — and labelling
    // "Maintenance" as "Store" would just contradict itself.
    if (row.row.source_display) return { name: row.row.source_display, kind: "" };
    return null;
  }
  if (row.row.project_name) return { name: row.row.project_name, kind: "Project" };
  if (row.row.site_name) return { name: row.row.site_name, kind: "Site" };
  return null;
}

/** Where the stock went: the people who took it, else the project or asset it was for. */
function destination(row: LogRow): { name: string; kind: string } | null {
  if (row.kind === "request") {
    const people = receivers(row.row);
    if (people.length) return { name: people.join(", "), kind: people.length > 1 ? "People" : "Person" };
    if (row.row.project_name) return { name: row.row.project_name, kind: "Project" };
    if (row.row.asset_code) return { name: row.row.asset_code, kind: "Asset" };
    return null;
  }
  if (row.row.project_name) return { name: row.row.project_name, kind: "Project" };
  if (row.row.issued_to_user_name) return { name: row.row.issued_to_user_name, kind: "Person" };
  if (row.row.site_name) return { name: row.row.site_name, kind: "Site" };
  return null;
}

function Detail({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}

export function IssuanceLog() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [legacy, setLegacy] = useState<LegacyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, oldRes] = await Promise.allSettled([
        api.get("/inventory/issuance-requests/", { params: { page_size: 500 } }),
        api.get("/inventory/issuances/", { params: { page_size: 500 } }),
      ]);
      if (reqRes.status === "fulfilled") {
        const list: RequestRow[] = reqRes.value.data.results ?? reqRes.value.data;
        // Only requests something has actually been handed over against.
        setRequests(list.filter((r) => r.quantity_issued > 0));
      } else {
        toast.error(getApiError(reqRes.reason, "Could not load the issuance log"));
      }
      if (oldRes.status === "fulfilled") setLegacy(oldRes.value.data.results ?? oldRes.value.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const rows = useMemo<LogRow[]>(() => {
    const all: LogRow[] = [
      ...requests.map((r): LogRow => ({
        kind: "request", id: r.id, number: r.request_number, date: r.last_issued_at ?? r.updated_at, row: r,
      })),
      ...legacy.map((r): LogRow => ({ kind: "legacy", id: r.id, number: r.issue_number, date: r.created_at, row: r })),
    ];
    // Newest hand-over first.
    return all.sort((a, b) => b.date.localeCompare(a.date));
  }, [requests, legacy]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) => {
      const to = destination(r);
      const fields = r.kind === "request"
        ? [r.number, r.row.what, r.row.item_sku, r.row.project_name, r.row.asset_code, r.row.component_name,
           r.row.received_by, r.row.purpose, r.row.issued_by_name, r.row.requested_by_name,
           r.row.asset_name, r.row.unit_type_code, ...(r.row.issued_serials ?? [])]
        : [r.number, r.row.item_name, r.row.project_name, r.row.issued_to_user_name, r.row.site_name, r.row.reason, r.row.issued_by_name];
      return [...fields, to?.name].some((v) => (v ?? "").toLowerCase().includes(query));
    });
  }, [rows, search]);

  const [exporting, setExporting] = useState(false);
  /** The whole log as Excel — one row per hand-over. */
  async function exportExcel() {
    setExporting(true);
    try {
      const res = await api.get("/inventory/issuance-requests/export/", { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `issuance-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiError(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  }

  /** The issue slip for one request, fetched with the token and opened to print. */
  async function printSlip(r: RequestRow) {
    try {
      const { data } = await api.get(`/inventory/issuance-requests/${r.id}/slip/`, { responseType: "blob" });
      window.open(URL.createObjectURL(data), "_blank", "noopener");
    } catch (err) {
      toast.error(getApiError(err, "Could not build the issue slip"));
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Every hand-over from the store, newest first, under the request&apos;s own number — what left, where
        it went, why it was needed, and who authorised it. Open a line for the full record, including every
        serial number issued on a unique item.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by request number, item, serial, project, person or purpose..."
            className={inputClass}
          />
        </div>
        <button
          onClick={exportExcel}
          disabled={exporting || requests.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <PackageOpen className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            {rows.length > 0 ? "No issues match that search" : "Nothing issued yet"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {rows.length > 0
              ? "Try a different item, serial, project or person."
              : "Material handed over against an issue request is recorded here."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={`${thClass} w-8`}></th>
                  <th className={thClass}>Request</th>
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Component</th>
                  <th className={thClass}>Kind</th>
                  <th className={thClass}>Issued</th>
                  <th className={thClass}>For / Received By</th>
                  <th className={thClass}>For Asset</th>
                  <th className={thClass}>Issued By</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const forWhat = drawnFor(r);
                  const takenBy = r.kind === "request"
                    ? receivers(r.row)
                    : (r.row.issued_to_user_name ? [r.row.issued_to_user_name] : []);
                  const isOpen = open === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setOpen(isOpen ? null : r.id)}
                        className="cursor-pointer border-b border-border transition-colors hover:bg-secondary/30"
                        aria-expanded={isOpen}
                      >
                        <td className={`${tdClass} text-muted-foreground`}>
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap font-mono text-foreground`}>
                          {r.number}
                          {r.kind === "legacy" && (
                            <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 font-sans text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                              old flow
                            </span>
                          )}
                        </td>
                        <td className={`${tdClass} text-muted-foreground`}>{new Date(r.date).toLocaleDateString()}</td>
                        <td className={`${tdClass} text-foreground`}>
                          {r.kind === "request" ? (r.row.unit_type_name ?? r.row.item_name ?? r.row.what) : (r.row.item_name ?? "—")}
                          {r.kind === "request" && r.row.unit_type_code && (
                            <span className="block font-mono text-2xs text-muted-foreground">{r.row.unit_type_code}</span>
                          )}
                        </td>
                        <td className={tdClass}>
                          {r.kind === "request" ? (
                            <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ${r.row.unit_type_name ? "bg-indigo-500/10 text-indigo-600" : "bg-secondary text-muted-foreground"}`}>{r.row.unit_type_name ? "Unique item" : "Generic stock"}</span>
                          ) : (
                            <span className="inline-flex whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium text-muted-foreground">Generic stock</span>
                          )}
                        </td>
                        <td className={`${tdClass} font-medium text-foreground`}>
                          {r.kind === "request" ? (
                            <>
                              <Qty value={r.row.quantity_issued} unit={r.row.unit} />
                              {r.row.outstanding_quantity > 0 && (
                                <span className="ml-1 text-2xs font-normal text-amber-600">of {r.row.quantity_requested} · balance {r.row.outstanding_quantity}</span>
                              )}
                              {/* Searching a serial should show the hit without
                                  having to open the line to find it. */}
                              {(r.row.issued_serials ?? []).length > 0 && (
                                <span className="block font-mono text-2xs font-normal text-muted-foreground">
                                  {(r.row.issued_serials ?? []).join(" · ")}
                                </span>
                              )}
                            </>
                          ) : (
                            r.row.quantity
                          )}
                        </td>
                        <td className={tdClass}>
                          {/* What it was drawn for, then who actually took it. */}
                          {forWhat ? (
                            <span className="inline-flex items-center gap-2">
                              <span className="text-foreground">{forWhat.name}</span>
                              {forWhat.kind && (
                                <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                                  {forWhat.kind}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          <span className="block text-2xs text-muted-foreground">
                            {takenBy.length ? takenBy.join(", ") : "Nobody named"}
                          </span>
                        </td>
                        <td className={tdClass}>
                          {r.kind === "request" && r.row.asset_code ? (
                            <>
                              <span className="block font-mono text-xs text-foreground">{r.row.asset_code}</span>
                              {r.row.asset_name && (
                                <span className="block text-2xs text-muted-foreground">{r.row.asset_name}</span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground">
                              {r.kind === "request" ? (r.row.purpose || "—") : (r.row.reason || r.row.notes || "—")}
                            </span>
                          )}
                        </td>
                        <td className={`${tdClass} text-muted-foreground`}>{r.row.issued_by_name ?? "—"}</td>
                      </tr>

                      {isOpen && (
                        <tr className="border-b border-border bg-secondary/20">
                          <td colSpan={9} className="px-6 py-4">
                            {r.kind === "request" ? (
                              <div className="space-y-4">
                                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                  <Detail label="Component" value={<>{r.row.unit_type_name ?? r.row.item_name ?? r.row.what}{r.row.unit_type_code ? <span className="ml-1 font-mono text-xs text-muted-foreground">{r.row.unit_type_code}</span> : null}{r.row.item_sku ? <span className="ml-1 font-mono text-xs text-muted-foreground">{r.row.item_sku}</span> : null}<span className={`ml-2 rounded-full px-2 py-0.5 text-2xs font-medium ${r.row.unit_type_name ? "bg-indigo-500/10 text-indigo-600" : "bg-secondary text-muted-foreground"}`}>{r.row.unit_type_name ? "Unique item" : "Generic stock"}</span></>} />
                                  <Detail label="For asset" value={r.row.asset_code ? <>{r.row.asset_code}{r.row.component_name ? <span className="text-muted-foreground"> · {r.row.component_name}</span> : null}</> : null} />
                                  <Detail label="Project" value={r.row.project_name} />
                                  <Detail label="Source" value={r.row.source_display} />
                                  <Detail label="Requested by" value={<>{r.row.requested_by_name ?? "—"}<span className="block text-2xs text-muted-foreground">{new Date(r.row.created_at).toLocaleString()}</span></>} />
                                  <Detail label="Issued by" value={<>{r.row.issued_by_name ?? "—"}<span className="block text-2xs text-muted-foreground">{r.row.last_issued_at ? new Date(r.row.last_issued_at).toLocaleString() : "—"}</span></>} />
                                  <Detail label="Received by" value={receivers(r.row).join(", ") || null} />
                                  <Detail label="Issued" value={<><Qty value={r.row.quantity_issued} unit={r.row.unit} /> of <Qty value={r.row.quantity_requested} unit={r.row.unit} /> · {r.row.status_display}</>} />
                                </div>
                                {(r.row.handovers ?? []).length > 0 && (
                                  <div>
                                    <p className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                                      Hand-overs ({r.row.handovers.length})
                                    </p>
                                    <div className="overflow-hidden rounded-lg border border-border bg-card">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                                            <th className="px-3 py-2 font-medium">Date</th>
                                            <th className="px-3 py-2 text-right font-medium">Qty</th>
                                            <th className="px-3 py-2 font-medium">Issued by</th>
                                            <th className="px-3 py-2 font-medium">Received by</th>
                                            <th className="px-3 py-2 font-medium">{r.row.unit_type_name ? "Serial Nos" : "Note"}</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {r.row.handovers.map((h, i) => (
                                            <tr key={i} className="border-b border-border/60 last:border-0">
                                              <td className="px-3 py-1.5 text-muted-foreground">{h.at ? new Date(h.at).toLocaleString() : "—"}</td>
                                              <td className="px-3 py-1.5 text-right text-foreground"><Qty value={h.quantity} unit={r.row.unit} /></td>
                                              <td className="px-3 py-1.5 text-muted-foreground">{h.issued_by || "—"}</td>
                                              <td className="px-3 py-1.5 text-foreground">{h.received_by || "—"}</td>
                                              <td className={`px-3 py-1.5 text-muted-foreground ${r.row.unit_type_name ? "font-mono" : ""}`}>{r.row.unit_type_name ? ((h.serials ?? []).join(", ") || "—") : (h.note || "—")}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                                {r.row.issued_units.length > 0 && (
                                  <div>
                                    <p className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                                      Serial numbers issued ({r.row.issued_units.length})
                                    </p>
                                    <div className="overflow-hidden rounded-lg border border-border bg-card">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                                            <th className="px-3 py-2 font-medium">#</th>
                                            <th className="px-3 py-2 font-medium">Serial No</th>
                                            <th className="px-3 py-2 font-medium">Component</th>
                                            <th className="px-3 py-2 font-medium">Status</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {r.row.issued_units.map((u, i) => (
                                            <tr key={u.serial_number} className="border-b border-border/60 last:border-0">
                                              <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                                              <td className="px-3 py-1.5 font-mono text-foreground">{u.serial_number}</td>
                                              <td className="px-3 py-1.5 text-muted-foreground">
                                                {r.row.unit_type_code && (
                                                  <span className="font-mono">{r.row.unit_type_code}</span>
                                                )}
                                                {r.row.unit_type_code && r.row.unit_type_name ? " · " : ""}
                                                {r.row.unit_type_name ?? ""}
                                              </td>
                                              <td className="px-3 py-1.5 text-muted-foreground">{u.status_display ?? "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                                {r.row.notes && <Detail label="Notes" value={<span className="whitespace-pre-line">{r.row.notes}</span>} />}
                                <div>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); printSlip(r.row); }}
                                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                  >
                                    <Printer className="h-3.5 w-3.5" /> Print issue slip
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                <Detail label="Item" value={r.row.item_name} />
                                <Detail label="Project" value={r.row.project_name} />
                                <Detail label="Site" value={r.row.site_name} />
                                <Detail label="Reason" value={r.row.reason || null} />
                                <Detail label="Notes" value={r.row.notes || null} />
                                <Detail label="Recorded" value={new Date(r.row.created_at).toLocaleString()} />
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
