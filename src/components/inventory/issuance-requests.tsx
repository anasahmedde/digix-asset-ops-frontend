"use client";

import { Download, PackageCheck, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface RequestRow {
  id: string;
  request_number: string;
  what: string;
  item: string | null;
  item_sku: string | null;
  unit_type_name: string | null;
  quantity_requested: number;
  /** Unit of measure of what is asked for (piece, meter, box…). */
  unit?: string;
  quantity_issued: number;
  outstanding_quantity: number;
  available_quantity: number | null;
  source: string;
  source_display: string;
  purpose: string;
  project_name: string | null;
  asset_code: string | null;
  component_name: string | null;
  maintenance_title: string | null;
  requested_by_name: string | null;
  issued_by_name: string | null;
  received_by: string;
  issued_serials: string[];
  status: string;
  status_display: string;
  /** Item 19: the part is on order; it is issued once it has been received. */
  awaiting_procurement?: boolean;
  po_number?: string | null;
  created_at: string;
}

// Only the warehouse hands material over (mirrors the backend).
const STORE_ROLES = ["super_admin", "group_head", "ops_manager", "warehouse"];

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  partial: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  fulfilled: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  cancelled: "bg-secondary text-muted-foreground ring-border",
};

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

/** What the material is for, in the words of whoever asked for it. */
function against(row: RequestRow) {
  if (row.asset_code) return `${row.asset_code}${row.component_name ? ` · ${row.component_name}` : ""}`;
  if (row.maintenance_title) return row.maintenance_title;
  if (row.project_name) return row.project_name;
  return row.purpose || "—";
}

export function IssuanceRequests({ onIssued }: { onIssued?: () => void }) {
  const { user } = useUser();
  const canIssue = user != null && STORE_ROLES.includes(user.role);

  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [issueFor, setIssueFor] = useState<RequestRow | null>(null);
  const [issue, setIssue] = useState({ quantity: "", received_by: "", notes: "" });

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/issuance-requests/", {
        params: { page_size: 500 },
      });
      const list: RequestRow[] = data.results ?? data;
      // Anything still owed first — that is the queue's whole purpose.
      const rank = (r: RequestRow) =>
        r.status === "pending" ? 0 : r.status === "partial" ? 1 : 2;
      setRows([...list].sort((a, b) => rank(a) - rank(b) || b.created_at.localeCompare(a.created_at)));
    } catch (err) {
      toast.error(getApiError(err, "Could not load the issue queue"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!showDone && (row.status === "fulfilled" || row.status === "cancelled")) return false;
      if (!query) return true;
      return [row.request_number, row.what, row.purpose, row.project_name,
              row.asset_code, row.component_name, row.requested_by_name]
        .some((v) => (v ?? "").toLowerCase().includes(query));
    });
  }, [rows, search, showDone]);

  const waiting = rows.filter((r) => r.status === "pending" || r.status === "partial").length;

  function openIssue(row: RequestRow) {
    // Default to what can actually be covered right now.
    const possible = Math.min(row.outstanding_quantity, row.available_quantity ?? row.outstanding_quantity);
    setIssue({ quantity: String(Math.max(possible, 0)), received_by: "", notes: "" });
    setIssueFor(row);
  }

  async function submitIssue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!issueFor) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/inventory/issuance-requests/${issueFor.id}/issue/`, {
        quantity: Number(issue.quantity),
        received_by: issue.received_by.trim(),
        notes: issue.notes.trim(),
      });
      const left = data.request.outstanding_quantity;
      toast.success(
        left > 0 ? `Issued ${data.issued} — ${left} still owed` : `Issued ${data.issued}, request complete`,
      );
      setIssueFor(null);
      fetchRows();
      onIssued?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not issue that material"));
    } finally {
      setSaving(false);
    }
  }

  async function cancelRequest(row: RequestRow) {
    if (!confirm(`Cancel ${row.request_number}? Anything already issued stays issued.`)) return;
    try {
      await api.post(`/inventory/issuance-requests/${row.id}/cancel/`, {});
      toast.success("Request cancelled");
      fetchRows();
    } catch (err) {
      toast.error(getApiError(err, "Could not cancel the request"));
    }
  }

  async function downloadSlip(row: RequestRow) {
    try {
      const res = await api.get(`/inventory/issuance-requests/${row.id}/slip/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${row.request_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiError(err, "Could not produce the issue slip"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Everything waiting on the store. Projects and maintenance both ask here, and material only
          leaves once it is issued — in full, or in part with the balance left owed.
        </p>
        {waiting > 0 && (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 ring-1 ring-amber-500/20">
            {waiting} awaiting issue
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by request number, item, asset or person..."
            className={`${inputClass} pl-9`}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(e) => setShowDone(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Show settled requests
        </label>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <PackageCheck className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            {rows.length > 0 ? "Nothing waiting" : "No requests yet"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {rows.length > 0
              ? "Every request has been dealt with. Tick 'show settled' to see them."
              : "Material asked for by a project or a maintenance job lands here."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Request</th>
                  <th className={thClass}>Item</th>
                  <th className={thClass}>Asked</th>
                  <th className={thClass}>Issued</th>
                  <th className={thClass}>In Stock</th>
                  <th className={thClass}>For</th>
                  <th className={thClass}>Asked By</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const short = (row.available_quantity ?? 0) < row.outstanding_quantity;
                  const settled = row.status === "fulfilled" || row.status === "cancelled";
                  return (
                    <tr key={row.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                      <td className={`${tdClass} font-mono text-foreground`}>
                        {row.request_number}
                        <span className="block text-2xs font-sans text-muted-foreground">
                          {row.source_display}
                        </span>
                      </td>
                      <td className={`${tdClass} text-foreground`}>{row.what}</td>
                      <td className={`${tdClass} text-foreground`}>{row.quantity_requested} <span className="text-2xs text-muted-foreground">{row.unit ?? ""}</span></td>
                      <td className={`${tdClass} text-muted-foreground`}>
                        {row.quantity_issued}
                        {row.outstanding_quantity > 0 && (
                          <span className="block text-2xs text-amber-600">
                            {row.outstanding_quantity} owed
                          </span>
                        )}
                      </td>
                      <td className={`${tdClass} ${short ? "text-amber-600" : "text-muted-foreground"}`}>
                        {row.available_quantity ?? "—"}
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>
                        {against(row)}
                        {row.purpose && against(row) !== row.purpose && (
                          <span className="block text-2xs">{row.purpose}</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>{row.requested_by_name ?? "—"}</td>
                      <td className={tdClass}>
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                            STATUS_BADGES[row.status] ?? STATUS_BADGES.cancelled
                          }`}
                        >
                          {row.status_display}
                        </span>
                        {row.awaiting_procurement && (
                          <span className="mt-1 block text-2xs font-medium text-indigo-600">
                            Procurement in progress{row.po_number ? ` · ${row.po_number}` : ""}
                          </span>
                        )}
                      </td>
                      <td className={tdClass}>
                        <div className="flex items-center gap-1.5">
                          {canIssue && !settled && (
                            <button
                              onClick={() => openIssue(row)}
                              disabled={!!row.awaiting_procurement}
                              title={row.awaiting_procurement ? "On order — issue it once the delivery has been received and inspected" : "Issue from stock"}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <PackageCheck className="h-3.5 w-3.5" /> Issue
                            </button>
                          )}
                          {row.quantity_issued > 0 && (
                            <button
                              onClick={() => downloadSlip(row)}
                              title="Download the issue slip"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canIssue && !settled && (
                            <button
                              onClick={() => cancelRequest(row)}
                              title="Cancel this request"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-destructive"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={issueFor !== null}
        onClose={() => setIssueFor(null)}
        title={issueFor ? `Issue against ${issueFor.request_number}` : "Issue material"}
        size="sm"
      >
        {issueFor && (
          <form onSubmit={submitIssue} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{issueFor.what}</span> ·{" "}
              {issueFor.outstanding_quantity} owed · {issueFor.available_quantity ?? 0} in stock
            </p>
            <div className="space-y-1.5">
              <label htmlFor="issue-qty" className={labelClass}>Quantity to issue</label>
              <input
                id="issue-qty"
                type="number"
                min={1}
                max={issueFor.outstanding_quantity}
                value={issue.quantity}
                onChange={(e) => setIssue({ ...issue, quantity: e.target.value })}
                className={inputClass}
              />
              <p className="text-xs text-muted-foreground">
                Issue less than asked for and the balance stays on this queue.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="issue-to" className={labelClass}>Received by</label>
              <input
                id="issue-to"
                value={issue.received_by}
                onChange={(e) => setIssue({ ...issue, received_by: e.target.value })}
                placeholder="Who is taking it away"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="issue-notes" className={labelClass}>Notes</label>
              <input
                id="issue-notes"
                value={issue.notes}
                onChange={(e) => setIssue({ ...issue, notes: e.target.value })}
                placeholder="Optional"
                className={inputClass}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIssueFor(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || Number(issue.quantity) < 1}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {saving ? "Issuing…" : `Issue ${Number(issue.quantity) || 0}`}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
