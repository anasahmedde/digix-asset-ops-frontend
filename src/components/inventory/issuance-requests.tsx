"use client";

import { Download, PackageCheck, Plus, Search, ShoppingCart, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { confirmAction } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
import { Pagination, pageSlice } from "@/components/ui/pagination";
import { Qty } from "@/components/ui/qty";
import { SearchSelect } from "@/components/ui/search-select";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { formatDateTime } from "@/lib/utils";

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
  /** Preventive or corrective — what kind of work the parts are for. */
  maintenance_type?: string | null;
  asset_name?: string | null;
  /** The technician the job is assigned to — the only person who collects
   *  parts raised for it. */
  maintenance_assignee?: string | null;
  requested_by_name: string | null;
  issued_by_name: string | null;
  received_by: string;
  issued_serials: string[];
  /** The units this request will draw, oldest first — what issuing will take. */
  next_units?: { serial_number: string; unit_code: string }[];
  status: string;
  status_display: string;
  /** Item 19: the part is on order; it is issued once it has been received. */
  awaiting_procurement?: boolean;
  /** Raised by a Procure decision: the goods come in on a PO and are issued from here. */
  procured?: boolean;
  po_number?: string | null;
  po_received_quantity?: number;
  created_at: string;
}

// Only the warehouse hands material over (mirrors the backend).

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  partial: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  fulfilled: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  cancelled: "bg-secondary text-muted-foreground ring-border",
};

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-3 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-3 py-3.5 align-top";

export function IssuanceRequests({ onIssued }: { onIssued?: () => void }) {
  const { can, canAny } = useUser();
  const canIssue = can("issue_stock");
  // Putting a line on the queue by hand, and sending a short one to be bought.
  const canAsk = canAny("manage_stock", "issue_stock", "decide_requirements", "review_maintenance");
  const canProcure = canAny("manage_stock", "request_material", "decide_requirements", "review_maintenance");
  const canDiscard = can("cancel_material_request");

  /** A request raised here by hand has nobody to go back to: it is discarded. */
  async function discard(row: RequestRow) {
    if (!(await confirmAction(`Discard ${row.request_number}? Nothing has been issued against it.`))) return;
    try {
      await api.post(`/inventory/issuance-requests/${row.id}/cancel/`, { reason: "Discarded from the queue" });
      toast.success(`${row.request_number} discarded`);
      fetchRows();
    } catch (err) {
      toast.error(getApiError(err, "Could not discard the request"));
    }
  }

  // A request raised here, not from a job or a project: what, how many, what for.
  const [newOpen, setNewOpen] = useState(false);
  const [newKind, setNewKind] = useState<"generic" | "unique">("generic");
  // The picker names the component; what the shelf holds is shown under
  // it once one is chosen, so the list stays readable.
  const [stock, setStock] = useState<{ id: string; label: string; kind: "generic" | "unique"; onHand: number; unit: string; where: string }[]>([]);
  const [draft, setDraft] = useState({ component: "", quantity: "1", purpose: "" });
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    // Read the shelf fresh each time the dialog opens: the figures move.
    if (!newOpen) return;
    Promise.all([
      api.get("/inventory/items/", { params: { page_size: 500 } }),
      api.get("/inventory/products/", { params: { page_size: 500 } }),
    ]).then(([items, products]) => {
      type Item = { id: string; sku: string; material_name?: string | null; quantity: number; unit?: string; storage_location?: string; location?: string };
      type Product = { id: string; name: string; type_code: string; in_stock_count: number; storage_locations?: string[] };
      setStock([
        ...((items.data.results ?? items.data) as Item[]).map((it) => ({
          id: it.id, kind: "generic" as const, label: `${it.material_name ?? it.sku} · ${it.sku}`,
          onHand: it.quantity, unit: it.unit ?? "piece",
          // The bin, and the place kind when the stock is not on the warehouse shelf.
          where: [it.storage_location, it.location === "in_transit" ? "in transit to site" : ""].filter(Boolean).join(" · "),
        })),
        ...((products.data.results ?? products.data) as Product[]).map((p) => ({
          id: p.id, kind: "unique" as const, label: `${p.name} · ${p.type_code}`,
          onHand: p.in_stock_count, unit: "piece", where: (p.storage_locations ?? []).join(", "),
        })),
      ]);
    }).catch(() => {});
  }, [newOpen]);

  async function submitNew(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qty = Number(draft.quantity) || 0;
    if (!draft.component) { toast.error("Pick the component"); return; }
    if (qty < 1) { toast.error("Ask for at least one"); return; }
    if (!draft.purpose.trim()) { toast.error("Say what it is for"); return; }
    setCreating(true);
    try {
      const { data } = await api.post("/inventory/issuance-requests/", {
        [newKind === "unique" ? "unit_type" : "item"]: draft.component,
        quantity_requested: qty, purpose: draft.purpose.trim(), source: "other",
      });
      toast.success(`${data.request_number} is on the store's queue`);
      setNewOpen(false);
      setDraft({ component: "", quantity: "1", purpose: "" });
      fetchRows();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the request"));
    } finally {
      setCreating(false);
    }
  }

  /** The shelf cannot cover a request: buy the shortfall for it. */
  async function procure(row: RequestRow) {
    try {
      const { data } = await api.post(`/inventory/issuance-requests/${row.id}/procure/`, {});
      const short = Math.max(row.outstanding_quantity - (row.available_quantity ?? 0), 0);
      toast.success(`Procurement request raised for ${short} ${row.unit ?? ""} of ${data.what ?? row.what} — Procurement › Procurement Requests`);
      fetchRows();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the procurement request"));
    }
  }

  const [rows, setRows] = useState<RequestRow[]>([]);
  const sort = useSortState();
  const [requestPage, setRequestPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  // Handing a request back to whoever raised it, with a reason they can read.
  const [backFor, setBackFor] = useState<RequestRow | null>(null);
  const [backNote, setBackNote] = useState("");
  const [sendingBack, setSendingBack] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [issueFor, setIssueFor] = useState<RequestRow | null>(null);
  const [issue, setIssue] = useState({ quantity: "", received_by: "", notes: "" });
  // Who takes the material away: one of the team, or someone named by hand.
  const [people, setPeople] = useState<{ id: string; name: string; label: string }[]>([]);
  const [receiverPick, setReceiverPick] = useState("");

  /** Who may collect for this request: the team of its project's manager
   *  (the whole team when it is for no project). Names only - the
   *  storekeeper may not hold "See team". */
  async function loadCollectors(row: RequestRow) {
    try {
      const { data } = await api.get("/accounts/users/names/", { params: { request: row.id } });
      return (data as { id: string; name: string; role: string }[])
        .map((u) => ({ id: u.id, name: u.name, label: `${u.name} · ${u.role}` }));
    } catch {
      return [];
    }
  }

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

  async function openIssue(row: RequestRow) {
    // Default to what can actually be covered right now.
    const possible = Math.min(row.outstanding_quantity, row.available_quantity ?? row.outstanding_quantity);
    const team = await loadCollectors(row);
    setPeople(team);
    // Whoever asked for it usually comes for it: they are picked to start with.
    const asker = team.find((p) => p.name === row.requested_by_name)?.name ?? "";
    const receiver = row.maintenance_assignee ?? asker;
    setIssue({
      quantity: String(Math.max(possible, 0)),
      received_by: receiver,
      notes: "",
    });
    setReceiverPick(receiver);
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
      if (data.closed) {
        // Nothing moved: the requirement was already covered another way.
        toast.message(data.reason || "Already covered from stock — request closed");
      } else {
        toast.success(
          left > 0 ? `Issued ${data.issued} — ${left} still owed` : `Issued ${data.issued}, request complete`,
        );
      }
      setIssueFor(null);
      fetchRows();
      onIssued?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not issue that material"));
    } finally {
      setSaving(false);
    }
  }

  async function sendBack(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!backFor) return;
    setSendingBack(true);
    try {
      const { data } = await api.post(
        `/inventory/issuance-requests/${backFor.id}/send-back/`,
        { note: backNote },
      );
      toast.success(`Sent back to ${data.sent_back_to}`, {
        description: "Whoever raised it decides again; nothing is issued against it now.",
      });
      setBackFor(null);
      setBackNote("");
      fetchRows();
    } catch (err) {
      toast.error(getApiError(err, "Could not send the request back"));
    } finally {
      setSendingBack(false);
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
        <div className="flex items-center gap-3">
          {waiting > 0 && (
            <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 ring-1 ring-amber-500/20">
              {waiting} awaiting issue
            </span>
          )}
          {canAsk && (
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-white"
            >
              <Plus className="h-3.5 w-3.5" /> New issue request
            </button>
          )}
        </div>
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
                  <SortTh sort={sort} k="request_number" className={thClass}>Request</SortTh>
                  <SortTh sort={sort} k="component" className={thClass}>Component</SortTh>
                  <SortTh sort={sort} k="unit_type_name" className={thClass}>Kind</SortTh>
                  <SortTh sort={sort} k="quantity_requested" className={thClass}>Requested</SortTh>
                  <SortTh sort={sort} k="quantity_issued" className={thClass}>Issued</SortTh>
                  <SortTh sort={sort} k="available_quantity" className={thClass}>On Hand</SortTh>
                  <SortTh sort={sort} k="asset_code" className={thClass}>Project / Asset</SortTh>
                  <SortTh sort={sort} k="purpose" className={thClass}>For</SortTh>
                  <SortTh sort={sort} k="status" className={thClass}>Status</SortTh>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice(sortRows(filtered, sort, { component: (r) => r.item_sku || r.unit_type_name || r.what }), requestPage).map((row) => {
                  const short = (row.available_quantity ?? 0) < row.outstanding_quantity;
                  const settled = row.status === "fulfilled" || row.status === "cancelled";
                  return (
                    <tr key={row.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                      <td className={`${tdClass} whitespace-nowrap font-mono text-foreground`}>
                        {row.request_number}
                        <span className="block text-2xs font-sans text-muted-foreground">
                          {row.source_display}{row.requested_by_name ? ` · ${row.requested_by_name}` : ""}
                        </span>
                      </td>
                      <td className={`${tdClass} text-foreground`}>
                        {row.unit_type_name ?? row.what.replace(/\s*\(.*\)$/, "")}
                        {row.item_sku && (
                          <span className="block font-mono text-2xs text-muted-foreground">{row.item_sku}</span>
                        )}
                      </td>
                      <td className={tdClass}>
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ${row.unit_type_name ? "bg-indigo-500/10 text-indigo-600" : "bg-secondary text-muted-foreground"}`}>{row.unit_type_name ? "Unique item" : "Generic stock"}</span>
                      </td>
                      <td className={`${tdClass} text-foreground`}><Qty value={row.quantity_requested} unit={row.unit} /></td>
                      <td className={`${tdClass} text-muted-foreground`}>
                        <Qty value={row.quantity_issued} unit={row.unit} />
                        {/* A unique item is a particular one. Which one left
                            the store is the thing worth recording. */}
                        {row.issued_serials.length > 0 && (
                          <span className="block font-mono text-2xs text-foreground">
                            {row.issued_serials.join(" · ")}
                          </span>
                        )}
                        {row.outstanding_quantity > 0 && (
                          <span className="block whitespace-nowrap text-2xs text-amber-600">
                            balance <Qty value={row.outstanding_quantity} unit={row.unit} />
                          </span>
                        )}
                      </td>
                      <td className={`${tdClass} ${short ? "text-amber-600" : "text-muted-foreground"}`}>
                        {row.available_quantity != null ? <Qty value={row.available_quantity} unit={row.unit} /> : "—"}
                      </td>
                      <td className={tdClass}>
                        {/* The column asks for the project, so the project leads
                            and the asset it is for sits under it. */}
                        <span className="block max-w-[11rem] text-foreground">
                          {row.project_name ?? "Not on a project"}
                        </span>
                        {row.asset_code && (
                          <span className="block font-mono text-2xs text-muted-foreground">
                            {row.asset_code}
                            {row.asset_name ? <span className="font-sans"> · {row.asset_name}</span> : null}
                          </span>
                        )}
                      </td>
                      <td className={tdClass}>
                        {/* What the material is wanted for: a build line, or a
                            maintenance job and the kind of work it is. */}
                        {row.maintenance_title ? (
                          <>
                            <span className="block max-w-[11rem] text-foreground">{row.maintenance_title}</span>
                            <span className="block text-2xs text-muted-foreground">
                              {row.maintenance_type ?? "Maintenance"}
                            </span>
                          </>
                        ) : row.component_name ? (
                          <>
                            <span className="block max-w-[11rem] text-foreground">{row.component_name}</span>
                            <span className="block text-2xs text-muted-foreground">Build requirement</span>
                          </>
                        ) : row.purpose ? (
                          // A job that has since been closed out or deleted
                          // still said what its material was for.
                          <span className="block text-muted-foreground">{row.purpose}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={tdClass}>
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
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
                        {!row.awaiting_procurement && row.procured && !settled && (
                          <span className="mt-1 block text-2xs font-medium text-emerald-600">
                            {row.po_received_quantity ?? 0} received into stock{row.po_number ? ` · ${row.po_number}` : ""} — ready to issue
                          </span>
                        )}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap`}>
                        <div className="flex items-center gap-1.5">
                          {canIssue && !settled && (
                            <button
                              onClick={() => openIssue(row)}
                              disabled={!!row.awaiting_procurement}
                              title={row.awaiting_procurement ? "On order — issue it once the delivery has been received and inspected" : "Issue from stock"}
                              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
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
                          {canProcure && !settled && !row.awaiting_procurement
                            && row.available_quantity != null && row.available_quantity < row.outstanding_quantity && (
                            <button
                              onClick={() => procure(row)}
                              title={`Short by ${row.outstanding_quantity - (row.available_quantity ?? 0)} — buy it through Procurement`}
                              aria-label="Raise procurement for the shortfall"
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-amber-500/40 text-amber-700 transition-colors hover:bg-amber-500/10"
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Raised by hand: nothing to send it back to. */}
                          {row.source === "other" && !row.asset_code && !row.maintenance_title ? (
                            canDiscard && !settled && row.quantity_issued === 0 && (
                              <button
                                onClick={() => discard(row)}
                                title="Discard this request"
                                aria-label="Discard this request"
                                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )
                          ) : canIssue && !settled && (
                            <button
                              onClick={() => { setBackFor(row); setBackNote(""); }}
                              title="Send this request back to whoever raised it"
                              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            >
                              <Undo2 className="h-3.5 w-3.5" /> Send back
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={requestPage} total={filtered.length} onPage={setRequestPage} noun="requests" />
          </div>
        </div>
      )}

      <Modal
        open={backFor !== null}
        onClose={() => setBackFor(null)}
        title={backFor ? `Send ${backFor.request_number} back` : "Send back"}
        size="sm"
      >
        {backFor && (
          <form onSubmit={sendBack} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{backFor.what}</span> ·{" "}
              {backFor.outstanding_quantity} {backFor.unit ?? "piece"} still owed
            </p>
            {/* Where it goes is the whole point of the action, so it is said
                plainly rather than left to the person to work out. */}
            <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
              Goes back to{" "}
              <span className="font-medium text-foreground">
                {backFor.source === "maintenance"
                  ? backFor.maintenance_title ?? "the maintenance job"
                  : backFor.source === "project"
                    ? [backFor.asset_code, backFor.component_name].filter(Boolean).join(" · ") ||
                      backFor.project_name || "the project"
                    : "whoever raised it"}
              </span>
              {backFor.source === "maintenance"
                ? " — the supervisor answers it again, and approving raises a fresh request here."
                : " — the requirement is undecided again, to be issued or procured."}
              {backFor.quantity_issued > 0 &&
                ` ${backFor.quantity_issued} ${backFor.unit ?? "piece"} already issued stays issued.`}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="back-note" className={labelClass}>Why</label>
              <textarea
                id="back-note"
                rows={2}
                value={backNote}
                required
                onChange={(e) => setBackNote(e.target.value)}
                placeholder="e.g. Not in stock until Thursday — decide again or procure"
                className={`${inputClass} h-auto py-2`}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setBackFor(null)}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Keep it here
              </button>
              <button
                type="submit"
                disabled={sendingBack}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-all disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" /> {sendingBack ? "Sending…" : "Send back"}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New issue request" size="md">
        <form onSubmit={submitNew} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            A request raised here follows the same road as one from a job: the store issues what it has, and what it lacks can be bought.
          </p>
          <div className="grid gap-4 sm:grid-cols-[9rem_1fr] [&>*]:min-w-0">
            <div className="space-y-1.5">
              <label htmlFor="mr-kind" className={labelClass}>Kind</label>
              <select id="mr-kind" value={newKind} onChange={(e) => { setNewKind(e.target.value as "generic" | "unique"); setDraft((d) => ({ ...d, component: "" })); }} className={inputClass}>
                <option value="generic">Generic stock</option>
                <option value="unique">Unique component</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>Component *</label>
              <SearchSelect
                options={stock.filter((o) => o.kind === newKind)}
                value={draft.component}
                onChange={(v) => setDraft((d) => ({ ...d, component: v }))}
                placeholder="Search stock…"
              />
              {(() => {
                const picked = stock.find((o) => o.id === draft.component);
                if (!picked) return null;
                const short = (Number(draft.quantity) || 0) > picked.onHand;
                return (
                  <p className="text-xs text-muted-foreground">
                    <span className="block font-medium text-foreground">{picked.label}</span>
                    <span className={short ? "text-amber-600" : undefined}>
                      In stock: <span className="font-medium">{picked.onHand} {picked.unit}</span>
                      {picked.onHand > 0 && picked.where ? ` · ${picked.where}` : ""}
                      {short ? " — short; the balance can be sent to Procurement after raising" : ""}
                    </span>
                  </p>
                );
              })()}
            </div>
          </div>
          {/* No project here: a project's material is asked for from the
              project itself, where the requirement is decided. */}
          <div className="grid gap-4 sm:grid-cols-[9rem_1fr] [&>*]:min-w-0">
            <div className="space-y-1.5">
              <label htmlFor="mr-qty" className={labelClass}>Quantity *</label>
              <input id="mr-qty" type="number" min={1} value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="mr-purpose" className={labelClass}>What for *</label>
              <input id="mr-purpose" value={draft.purpose} onChange={(e) => setDraft((d) => ({ ...d, purpose: e.target.value }))} placeholder="e.g. Site office rewire" className={inputClass} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setNewOpen(false)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary">Cancel</button>
            <button type="submit" disabled={creating} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{creating ? "Raising…" : "Raise request"}</button>
          </div>
        </form>
      </Modal>

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
            <p className="-mt-2 text-xs text-muted-foreground">
              Requested by{" "}
              <span className="font-medium text-foreground">{issueFor.requested_by_name ?? "—"}</span>
              {" "}on {formatDateTime(issueFor.created_at)}
              {(issueFor.asset_code || issueFor.project_name) && (
                <> · for {[issueFor.asset_code, issueFor.project_name].filter(Boolean).join(" · ")}</>
              )}
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
            {/* A unique item is a particular one. The store takes the oldest
                units first, so say which ones before it does. */}
            {(issueFor.next_units ?? []).length > 0 && (
              <div className="space-y-1.5">
                <label className={labelClass}>Serial numbers going out</label>
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-secondary/30 p-2.5">
                  {(issueFor.next_units ?? [])
                    .slice(0, Math.max(Number(issue.quantity) || 0, 0))
                    .map((u) => (
                      <span
                        key={u.unit_code}
                        className="rounded-md bg-card px-2 py-1 font-mono text-xs text-foreground ring-1 ring-border"
                      >
                        {u.serial_number}
                      </span>
                    ))}
                  {(Number(issue.quantity) || 0) === 0 && (
                    <span className="text-xs text-muted-foreground">Enter a quantity to see which units go.</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Oldest units first. Issuing hands over exactly these.
                </p>
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="issue-to" className={labelClass}>Received by</label>
              {issueFor.maintenance_assignee ? (
                // Parts for a job go to whoever is on that job: handing them to
                // somebody else leaves the parts with one person and the work
                // with another.
                <>
                  <p className={`${inputClass} flex items-center bg-secondary/40 text-muted-foreground`}>
                    {issueFor.maintenance_assignee}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    The technician on {issueFor.maintenance_title ?? "this job"} collects its parts.
                  </p>
                </>
              ) : (
              <>
              <select
                id="issue-to"
                value={receiverPick}
                onChange={(e) => {
                  const v = e.target.value;
                  setReceiverPick(v);
                  setIssue({ ...issue, received_by: v === "__other__" ? "" : v });
                }}
                className={inputClass}
              >
                <option value="">Who is taking it away… *</option>
                {people.map((p) => (
                  // The name is what is recorded and told: "received by Sharjeel".
                  <option key={p.id} value={p.name}>
                    {p.label}{p.name === issueFor.requested_by_name ? " (requested it)" : ""}
                  </option>
                ))}
                <option value="__other__">Someone else…</option>
              </select>
              {receiverPick === "__other__" && (
                <input
                  id="issue-to-other"
                  value={issue.received_by}
                  onChange={(e) => setIssue({ ...issue, received_by: e.target.value })}
                  placeholder="Name of the person taking it"
                  className={inputClass}
                  autoFocus
                />
              )}
              <p className="text-xs text-muted-foreground">
                {issueFor.project_name
                  ? `The project manager's team on ${issueFor.project_name}, as set up under Teams`
                  : "The team as set up under Teams"}; pick “Someone else” for an outside collector.
              </p>
              {!issue.received_by.trim() && (
                <p className="text-xs font-medium text-amber-600">
                  Name who is collecting — stock cannot leave the store unaccounted for.
                </p>
              )}
              </>
              )}
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
                disabled={saving || Number(issue.quantity) < 1 || !issue.received_by.trim()}
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
