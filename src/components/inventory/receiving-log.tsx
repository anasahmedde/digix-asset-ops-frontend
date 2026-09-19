"use client";

import { ChevronDown, ChevronRight, Download, PackageOpen, Search } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { Qty } from "@/components/ui/qty";

/** One inspected delivery line: what arrived, what was accepted, where it went. */
interface ReceivedLine {
  id: string;
  grn_number: string;
  po_number: string | null;
  supplier_name: string | null;
  po_item_description: string | null;
  material_name: string | null;
  known_component: string | null;
  kind: "generic" | "unique" | "asset" | null;
  unit: string;
  quantity: number;
  accepted_quantity: number | null;
  rejected_quantity: number;
  batch_number: string;
  serial_numbers: string[];
  inspection_status: string;
  inspection_status_display: string;
  routed_to: string;
  routed_to_display: string | null;
  inspected_by_name: string | null;
  inspected_at: string | null;
  inspection_notes: string;
  source: string;
  source_display: string;
  reference: string;
  received_at: string;
  received_by_name: string | null;
  stocked_item_sku: string | null;
  /** What the line became: the stock row's SKU or the product's code, and its name. */
  stocked_code: string | null;
  stocked_name: string | null;
  storage_location: string | null;
  stocked_units: { serial_number: string; unit_code: string; status: string; status_display: string }[];
  created_at: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

function Detail({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm text-foreground ${mono ? "font-mono" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}

function kindLabel(k: ReceivedLine["kind"]) {
  return k === "unique" ? "Unique item" : k === "asset" ? "Whole asset" : k === "generic" ? "Generic stock" : "—";
}

export function ReceivingLog() {
  const [rows, setRows] = useState<ReceivedLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const [passed, rejected] = await Promise.all([
        api.get("/inventory/receipt-lines/", { params: { inspection_status: "passed", page_size: 500, ordering: "-inspected_at" } }),
        api.get("/inventory/receipt-lines/", { params: { inspection_status: "rejected", page_size: 500, ordering: "-inspected_at" } }),
      ]);
      const all: ReceivedLine[] = [...(passed.data.results ?? passed.data), ...(rejected.data.results ?? rejected.data)];
      // Newest inspection first.
      setRows(all.sort((a, b) => (b.inspected_at ?? b.created_at).localeCompare(a.inspected_at ?? a.created_at)));
    } catch (err) {
      toast.error(getApiError(err, "Could not load the receiving log"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.grn_number, r.po_number, r.supplier_name, r.known_component, r.po_item_description, r.material_name,
       r.batch_number, r.reference, r.inspected_by_name, r.stocked_item_sku, ...(r.serial_numbers ?? []),
       ...(r.stocked_units ?? []).map((u) => u.serial_number)]
        .some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [rows, search]);

  /** The whole log as Excel — one row per inspected line. */
  async function exportExcel() {
    setExporting(true);
    try {
      const res = await api.get("/inventory/receipt-lines/export/", { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receiving-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiError(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Every delivery line that has been inspected, newest first — where it came from, what arrived, what
        was accepted or rejected, where it was filed and which serial numbers it became. Open a line for the
        full record.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by GRN, PO, supplier, component, batch or serial..."
            className={inputClass}
          />
        </div>
        <button
          onClick={exportExcel}
          disabled={exporting || rows.length === 0}
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
            {rows.length > 0 ? "No deliveries match that search" : "Nothing received yet"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {rows.length > 0 ? "Try a different GRN, supplier, component or serial." : "Delivery lines appear here once they have been inspected."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={`${thClass} w-8`}></th>
                  <th className={thClass}>GRN</th>
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Component</th>
                  <th className={thClass}>Kind</th>
                  <th className={thClass}>Source</th>
                  <th className={`${thClass} text-right`}>Received</th>
                  <th className={`${thClass} text-right`}>Accepted</th>
                  <th className={`${thClass} text-right`}>Rejected</th>
                  <th className={thClass}>Filed Into</th>
                  <th className={thClass}>Inspected By</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isOpen = open === r.id;
                  const rejected = r.inspection_status === "rejected";
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
                        <td className={`${tdClass} font-mono text-foreground`}>{r.grn_number}</td>
                        <td className={`${tdClass} text-muted-foreground`}>{r.inspected_at ? new Date(r.inspected_at).toLocaleDateString() : "—"}</td>
                        <td className={`${tdClass} text-foreground`}>{r.known_component ?? r.stocked_name ?? r.po_item_description ?? r.material_name ?? "—"}</td>
                        <td className={tdClass}>
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ${r.kind === "unique" ? "bg-indigo-500/10 text-indigo-600" : r.kind === "asset" ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground"}`}>{kindLabel(r.kind)}</span>
                        </td>
                        <td className={tdClass}>
                          {r.po_number ? (
                            <span>
                              <span className="font-mono text-foreground">{r.po_number}</span>
                              {r.supplier_name && <span className="block text-2xs text-muted-foreground">{r.supplier_name}</span>}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">{r.source_display}{r.reference ? ` · ${r.reference}` : ""}</span>
                          )}
                        </td>
                        <td className={`${tdClass} text-right text-foreground`}><Qty value={r.quantity} unit={r.unit} /></td>
                        <td className={`${tdClass} text-right font-medium ${rejected ? "text-muted-foreground" : "text-emerald-600"}`}><Qty value={r.accepted_quantity ?? 0} unit={r.unit} /></td>
                        <td className={`${tdClass} text-right ${r.rejected_quantity > 0 ? "font-medium text-red-600" : "text-muted-foreground"}`}>
                          {r.rejected_quantity > 0 ? <Qty value={r.rejected_quantity} unit={r.unit} /> : "—"}
                        </td>
                        <td className={`${tdClass} text-muted-foreground`}>
                          {rejected ? (
                            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-2xs font-medium text-red-600">Rejected</span>
                          ) : (
                            r.kind === "asset" ? "Asset registry" : r.routed_to === "unique" ? "Unique item" : r.routed_to === "generic" ? "Generic stock" : "—"
                          )}
                          {!rejected && (r.stocked_code ?? r.stocked_item_sku) && <span className="block font-mono text-2xs">{r.stocked_code ?? r.stocked_item_sku}</span>}
                        </td>
                        <td className={`${tdClass} text-muted-foreground`}>{r.inspected_by_name ?? "—"}</td>
                      </tr>

                      {isOpen && (
                        <tr className="border-b border-border bg-secondary/20">
                          <td colSpan={11} className="px-6 py-4">
                            <div className="space-y-4">
                              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
                                <Detail label="Source" value={<>{r.source_display}{r.reference ? <span className="text-muted-foreground"> · {r.reference}</span> : null}</>} />
                                <Detail label="Purchase order" value={r.po_number ? <>{r.po_number}{r.supplier_name ? <span className="text-muted-foreground"> · {r.supplier_name}</span> : null}</> : null} mono={!!r.po_number} />
                                <Detail label="PO line" value={r.po_item_description} />
                                <Detail label="Kind" value={kindLabel(r.kind)} />
                                <Detail label="Received" value={<>{new Date(r.received_at).toLocaleString()}{r.received_by_name ? <span className="block text-2xs text-muted-foreground">by {r.received_by_name}</span> : null}</>} />
                                <Detail label="Inspected" value={<>{r.inspected_at ? new Date(r.inspected_at).toLocaleString() : "—"}{r.inspected_by_name ? <span className="block text-2xs text-muted-foreground">by {r.inspected_by_name}</span> : null}</>} />
                                <Detail label="Batch" value={r.batch_number || null} mono />
                                <Detail label="Placed at" value={r.storage_location || null} />
                              </div>
                              {r.stocked_units.length > 0 && (
                                <div>
                                  <p className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                                    Serial numbers stocked ({r.stocked_units.length})
                                  </p>
                                  <div className="overflow-hidden rounded-lg border border-border bg-card">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                                          <th className="px-3 py-2 font-medium">#</th>
                                          <th className="px-3 py-2 font-medium">Serial No</th>
                                          <th className="px-3 py-2 font-medium">Unit Code</th>
                                          <th className="px-3 py-2 font-medium">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {r.stocked_units.map((u, i) => (
                                          <tr key={u.serial_number} className="border-b border-border/60 last:border-0">
                                            <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                                            <td className="px-3 py-1.5 font-mono text-foreground">{u.serial_number}</td>
                                            <td className="px-3 py-1.5 font-mono text-muted-foreground">{u.unit_code}</td>
                                            <td className="px-3 py-1.5 text-muted-foreground">{u.status_display}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                              {r.inspection_notes && <Detail label="Inspection notes" value={<span className="whitespace-pre-line">{r.inspection_notes}</span>} />}
                            </div>
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
