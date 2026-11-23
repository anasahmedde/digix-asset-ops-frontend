"use client";

import { ChevronDown, ChevronRight, Download, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { confirmAction } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
import { SearchSelect } from "@/components/ui/search-select";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import { cn, formatDate } from "@/lib/utils";

export interface LedgerPayment {
  id: string;
  kind: "advance" | "payment";
  amount: number | null;
  payment_date: string;
  method_display: string;
  reference: string;
  notes: string;
}

/** One purchase order (payable) or approved client invoice (receivable). */
export interface LedgerRow {
  id: string;
  number: string;
  party: string;
  currency: string;
  status: string;
  status_display: string;
  date: string | null;
  due_date: string | null;
  due_date_set: boolean;
  terms: string;
  /** The quotation a client invoice bills, and what the invoice is for. */
  quotation?: string | null;
  quote_number?: string | null;
  client_po_number?: string;
  description?: string;
  party_id?: string | null;
  projects?: { id: string; name: string }[];
  /** Payable bought for no project: what it was for ("Stock purchase"). */
  purpose?: string;
  /** Payable: the payment terms' days, for a supplier invoice's due date. */
  terms_days?: number;
  /** Payable: the supplier's invoices against the order, and their sum. */
  invoiced?: number;
  /** Payable: what the supplier knocked off the order on their invoices. */
  discount?: number;
  invoices?: SupplierBill[];
  pay_status: "unpaid" | "partially_paid" | "paid";
  pay_status_display: string;
  total: number;
  advance: number;
  first: number | null;
  second: number | null;
  third: number | null;
  later_payments: number;
  paid: number;
  balance: number;
  overdue_days: number;
  aging: string | null;
  payments: LedgerPayment[];
}

export interface SupplierBill {
  id: string;
  number: string;
  reference: string;
  amount: number;
  discount: number;
  total: number;
  issue_date: string;
  due_date: string;
}

/** What the Payable and Receivable lists (and their exports) are narrowed by. */
export interface LedgerParams {
  status: string;
  preset: string;
  date_from: string;
  date_to: string;
  party: string;
  project: string;
  q: string;
}
export const DEFAULT_PARAMS: LedgerParams = { status: "outstanding", preset: "all", date_from: "", date_to: "", party: "", project: "", q: "" };

export interface Option { id: string; label: string }

export interface AgingBucket { key: string; label: string; amount: number }
export interface Totals {
  total: number; discount?: number; paid: number; balance: number; overdue: number;
  open: number; overdue_count: number; aging: AgingBucket[];
}
export type ByCurrency = Record<string, Totals>;

export const money = (v: number | string | null | undefined, cur?: string) =>
  formatCurrency(v, (cur || "PKR") as CurrencyCode);

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";
const labelClass = "text-xs font-medium text-muted-foreground";
const th = "whitespace-nowrap px-3 py-3 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground";
const td = "whitespace-nowrap px-3 py-3 text-sm";

/** How late a balance is, coloured the way an aging report reads. */
export function OverdueBadge({ days, balance }: { days: number; balance: number }) {
  if (balance <= 0) return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-2xs font-semibold text-emerald-700 dark:text-emerald-300">Paid</span>;
  if (days <= 0) return <span className="text-2xs text-muted-foreground">Not due</span>;
  const tone = days > 90 ? "bg-red-600 text-white" : days > 60 ? "bg-red-500/15 text-red-700 dark:text-red-300" : days > 30 ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums", tone)}>{days} {days === 1 ? "day" : "days"} overdue</span>;
}

const STATUSES = [
  { value: "outstanding", label: "Outstanding" },
  { value: "overdue", label: "Overdue" },
  { value: "unpaid", label: "Unpaid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "", label: "All" },
];

const PRESETS = [
  { value: "all", label: "Any date" },
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "quarter", label: "This quarter" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The first and last day a date preset covers. */
export function presetRange(preset: string): [string, string] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (preset === "month") return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
  if (preset === "last_month") return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
  if (preset === "quarter") { const q = Math.floor(m / 3) * 3; return [iso(new Date(y, q, 1)), iso(new Date(y, q + 3, 0))]; }
  if (preset === "year") return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
  return ["", ""];
}

/** The query a list (or its export) is fetched with. */
export function queryOf(p: LedgerParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ["status", "date_from", "date_to", "party", "project", "q"] as const) if (p[k]) out[k] = p[k];
  return out;
}

/** Download a Finance list as Excel, PDF or CSV, with the filters shown. */
export async function exportFile(path: string, params: Record<string, string>, fmt: "xlsx" | "pdf" | "csv", name: string) {
  try {
    const res = await api.get(path, { params: { ...params, export: fmt }, responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}-${iso(new Date())}.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast.error(getApiError(err, "Could not export it"));
  }
}

export function ExportButtons({ onExport, label }: { onExport: (fmt: "xlsx" | "pdf" | "csv") => void; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label && <span className="text-2xs font-semibold text-primary">{label}:</span>}
      {(["xlsx", "pdf", "csv"] as const).map((f) => (
        <button key={f} type="button" onClick={() => onExport(f)}
          className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary">
          <Download className="h-3.5 w-3.5" /> {f === "xlsx" ? "Excel" : f.toUpperCase()}
        </button>
      ))}
    </span>
  );
}

/** Unpaid, Partially Paid or Paid, at a glance. */
export function PayStatusBadge({ status, label }: { status: string; label: string }) {
  const tone = status === "paid" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : status === "partially_paid" ? "bg-sky-500/10 text-sky-700 dark:text-sky-300"
      : "bg-secondary text-muted-foreground";
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold", tone)}>{label}</span>;
}

/** The Payable or Receivable register: each document's value, the advance
 *  and the payments after it, what is still owed and how late it is. The
 *  rows arrive already narrowed by the filters, so the totals above them,
 *  the footer and an export all cover the same documents. */
export function LedgerTable({
  side, rows, totals, canPay, canSetDue, onChanged, toolbar, params, onParams, parties, projects,
}: {
  side: "payable" | "receivable";
  rows: LedgerRow[];
  totals: ByCurrency;
  canPay: boolean;
  canSetDue?: boolean;
  onChanged: () => void;
  toolbar?: React.ReactNode;
  params: LedgerParams;
  onParams: (p: LedgerParams) => void;
  parties: Option[];
  projects: Option[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState<LedgerRow | null>(null);
  const [dueFor, setDueFor] = useState<LedgerRow | null>(null);
  const [billing, setBilling] = useState<LedgerRow | null>(null);
  // Rows ticked for an export of just those.
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const shown = useMemo(
    () => [...rows].sort((a, b) => b.overdue_days - a.overdue_days || b.balance - a.balance),
    [rows],
  );

  const sums = useMemo(() => {
    const by: Record<string, Record<string, number>> = {};
    for (const r of shown) {
      const s = (by[r.currency] ??= { total: 0, invoiced: 0, advance: 0, first: 0, second: 0, third: 0, paid: 0, balance: 0 });
      s.total += r.total; s.invoiced += r.invoiced ?? 0; s.advance += r.advance; s.first += r.first ?? 0;
      s.second += r.second ?? 0; s.third += r.third ?? 0; s.paid += r.paid; s.balance += r.balance;
    }
    return Object.entries(by);
  }, [shown]);

  const payable = side === "payable";
  const docLabel = payable ? "PO" : "Invoice";
  const partyLabel = payable ? "Supplier" : "Client";
  const set = (patch: Partial<LedgerParams>) => onParams({ ...params, ...patch });
  const sumKeys = (payable ? ["total", "invoiced", "advance", "first", "second", "third", "paid"] : ["total", "advance", "first", "second", "third", "paid"]) as string[];
  const cols = (payable ? 14 : 13) + (canPay ? 1 : 0);
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));
  const toggle = (id: string) => setPicked((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function removeBill(b: SupplierBill) {
    if (!(await confirmAction(`Remove the supplier invoice ${b.reference || b.number}?`))) return;
    try {
      await api.delete(`/finance/invoices/${b.id}/`);
      toast.success("Supplier invoice removed");
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not remove it"));
    }
  }

  async function removePayment(p: LedgerPayment) {
    if (!(await confirmAction(`Remove this ${p.kind === "advance" ? "advance" : "payment"} of ${money(p.amount)}?`))) return;
    try {
      await api.delete(`/finance/payments/${p.id}/`);
      toast.success("Payment removed");
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not remove that payment"));
    }
  }

  return (
    <div className="space-y-4">
      <TotalsStrip side={side} totals={totals} />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-end gap-2 border-b border-border p-3">
          <div className="space-y-1">
            <label htmlFor={`${side}-status`} className={labelClass}>Status</label>
            <select id={`${side}-status`} value={params.status} onChange={(e) => set({ status: e.target.value })} className={cn(inputClass, "h-9 w-40")}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${side}-dates`} className={labelClass}>{payable ? "Order date" : "Issue date"}</label>
            <select id={`${side}-dates`} value={params.preset}
              onChange={(e) => { const [date_from, date_to] = presetRange(e.target.value); set({ preset: e.target.value, ...(e.target.value === "custom" ? {} : { date_from, date_to }) }); }}
              className={cn(inputClass, "h-9 w-36")}>
              {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          {params.preset === "custom" && (
            <div className="flex items-center gap-1">
              <input type="date" aria-label="From" value={params.date_from} max={params.date_to || undefined} onChange={(e) => set({ date_from: e.target.value })} className={cn(inputClass, "h-9 w-36")} />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="date" aria-label="To" value={params.date_to} min={params.date_from || undefined} onChange={(e) => set({ date_to: e.target.value })} className={cn(inputClass, "h-9 w-36")} />
            </div>
          )}
          <div className="w-48 space-y-1">
            <span className={labelClass}>{partyLabel}</span>
            <SearchSelect options={[{ id: "", label: `All ${payable ? "suppliers" : "clients"}` }, ...parties]} value={params.party} onChange={(v) => set({ party: v })} placeholder={`All ${payable ? "suppliers" : "clients"}`} />
          </div>
          <div className="w-48 space-y-1">
            <span className={labelClass}>Project</span>
            <SearchSelect options={[{ id: "", label: "All projects" }, ...projects]} value={params.project} onChange={(v) => set({ project: v })} placeholder="All projects" />
          </div>
          <input value={params.q} onChange={(e) => set({ q: e.target.value })}
            placeholder={payable ? "Search PO, supplier or invoice no." : "Search invoice, client, quotation or PO"}
            aria-label="Search" className={cn(inputClass, "h-9 w-full sm:w-60")} />
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {picked.size > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{picked.size} selected</span>
                <button type="button" onClick={() => setPicked(new Set())} className="hover:text-foreground">Clear</button>
              </span>
            )}
            <ExportButtons label={picked.size > 0 ? "Export selected" : undefined}
              onExport={(fmt) => exportFile(`/finance/${payable ? "payables" : "receivables"}/`,
                { ...queryOf(params), ...(picked.size > 0 ? { ids: [...picked].join(",") } : {}) }, fmt, payable ? "payables" : "receivables")} />
            {toolbar}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px]">
            <thead className="bg-secondary/60">
              <tr>
                <th className="w-8 pl-3">
                  <input type="checkbox" aria-label={`Select all ${payable ? "payables" : "receivables"}`} checked={allPicked}
                    onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} />
                </th>
                <th className={cn(th, "w-8")} />
                <th className={th}>{docLabel}</th>
                <th className={th}>{partyLabel}</th>
                <th className={cn(th, "text-right")}>{payable ? "PO value" : "Total value (incl. tax)"}</th>
                {payable && <th className={cn(th, "text-right")}>Invoiced</th>}
                <th className={cn(th, "text-right")}>Advance</th>
                <th className={cn(th, "text-right")}>1st payment</th>
                <th className={cn(th, "text-right")}>2nd payment</th>
                <th className={cn(th, "text-right")}>3rd payment</th>
                <th className={cn(th, "text-right")}>{payable ? "Paid" : "Received"}</th>
                <th className={cn(th, "text-right")}>Balance pending</th>
                <th className={th}>Payment</th>
                <th className={th}>Due date</th>
                {canPay && <th className={cn(th, "sticky right-0 bg-secondary")} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => {
                const expanded = open === r.id;
                const cell = (v: number | null | undefined) => (v == null || v === 0 ? <span className="text-muted-foreground/50">—</span> : money(v, r.currency));
                return (
                  <Fragment key={r.id}>
                    <tr className={cn("hover:bg-secondary/30", r.overdue_days > 0 && "bg-red-500/[0.03]")}>
                      <td className="pl-3">
                        <input type="checkbox" aria-label={`Select ${r.number}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                      <td className="pl-1">
                        <button onClick={() => setOpen(expanded ? null : r.id)} aria-label={expanded ? "Hide details" : "Show details"}
                          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className={td}>
                        {payable ? (
                          <Link href={`/procurement?po=${r.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">{r.number}</Link>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-foreground">{r.number}</span>
                        )}
                        <span className="block text-2xs text-muted-foreground">{r.status_display}{r.date ? ` · ${formatDate(r.date)}` : ""}</span>
                        {r.quote_number && (
                          <Link href={`/quotations?quotation=${r.quotation}`} className="block text-2xs text-primary hover:underline" title={r.description}>
                            {r.quote_number}{r.description ? ` · ${r.description}` : ""}
                          </Link>
                        )}
                        {r.client_po_number && <span className="block text-2xs text-muted-foreground">Client PO {r.client_po_number}</span>}
                      </td>
                      <td className={cn(td, "max-w-[200px] truncate")} title={r.party}>
                        {r.party || "—"}
                        {(r.projects ?? []).length > 0
                          ? <span className="block truncate text-2xs text-muted-foreground">{r.projects!.map((p) => p.name).join(", ")}</span>
                          : r.purpose && <span className="block truncate text-2xs text-muted-foreground">{r.purpose}</span>}
                      </td>
                      <td className={cn(td, "text-right font-medium tabular-nums")}>
                        {money(r.total, r.currency)}
                        {(r.discount ?? 0) > 0 && <span className="block text-2xs font-normal text-emerald-700 dark:text-emerald-300">less {money(r.discount, r.currency)} discount</span>}
                      </td>
                      {payable && (
                        <td className={cn(td, "text-right tabular-nums")}>
                          {cell(r.invoiced)}
                          {(r.invoices ?? []).length > 0 && <span className="block text-2xs text-muted-foreground">{r.invoices!.length} {r.invoices!.length === 1 ? "invoice" : "invoices"}</span>}
                        </td>
                      )}
                      <td className={cn(td, "text-right tabular-nums")}>{cell(r.advance)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{cell(r.first)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{cell(r.second)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {cell(r.third)}
                        {r.later_payments > 0 && <span className="block text-2xs text-muted-foreground">incl. {r.later_payments} later</span>}
                      </td>
                      <td className={cn(td, "text-right font-medium tabular-nums")}>{cell(r.paid)}</td>
                      <td className={cn(td, "text-right font-semibold tabular-nums", r.balance > 0 ? "text-foreground" : "text-muted-foreground")}>{money(r.balance, r.currency)}</td>
                      <td className={td}><PayStatusBadge status={r.pay_status} label={r.pay_status_display} /></td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1">
                          {r.due_date ? formatDate(r.due_date) : "—"}
                          {canSetDue && (
                            <button onClick={() => setDueFor(r)} aria-label={`Set the due date of ${r.number}`}
                              className="rounded p-0.5 text-muted-foreground hover:text-primary"><Pencil className="h-3 w-3" /></button>
                          )}
                        </span>
                        {!r.due_date_set && <span className="block max-w-[150px] truncate text-2xs text-muted-foreground" title={r.terms}>from {r.terms || "the order date"}</span>}
                        {r.overdue_days > 0 && <span className="mt-1 block"><OverdueBadge days={r.overdue_days} balance={r.balance} /></span>}
                      </td>
                      {canPay && (
                        // Pinned to the right edge, so the actions stay in reach on a narrow screen.
                        <td className={cn(td, "sticky right-0 bg-card text-right shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]")}>
                          <span className="inline-flex gap-1">
                            {payable && (
                              <button onClick={() => setBilling(r)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary">
                                <FileText className="h-3.5 w-3.5" /> Invoice
                              </button>
                            )}
                            {r.balance > 0 && (
                              <button onClick={() => setPaying(r)}
                                className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary">
                                <Plus className="h-3.5 w-3.5" /> {payable ? "Pay" : "Receive"}
                              </button>
                            )}
                          </span>
                        </td>
                      )}
                    </tr>
                    {expanded && (
                      <tr className="bg-secondary/20">
                        <td colSpan={2} />
                        <td colSpan={cols - 2} className="space-y-3 px-3 py-3">
                          {payable && (
                            <div>
                              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Supplier invoices · {money(r.invoiced ?? 0, r.currency)} invoiced of {money(r.total, r.currency)} ordered
                                {(r.discount ?? 0) > 0 && ` · ${money(r.discount, r.currency)} discount`}
                              </p>
                              {(r.invoices ?? []).length === 0 ? (
                                <p className="text-xs text-muted-foreground">No supplier invoice entered against this PO yet.</p>
                              ) : (
                                <ul className="space-y-1.5">
                                  {r.invoices!.map((b) => (
                                    <li key={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                                      <span className="w-32 font-semibold text-foreground">{b.reference || b.number}</span>
                                      <span className="w-24 tabular-nums text-muted-foreground">{formatDate(b.issue_date)}</span>
                                      <span className="w-28 text-right font-medium tabular-nums">{money(b.total, r.currency)}</span>
                                      <span className="text-muted-foreground">
                                        {b.discount > 0 && <span className="text-emerald-700 dark:text-emerald-300">{money(b.discount, r.currency)} discount · </span>}
                                        Due {formatDate(b.due_date)} · our ref {b.number}
                                      </span>
                                      {canPay && (
                                        <button onClick={() => removeBill(b)} aria-label="Remove supplier invoice" className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                          <div>
                            {payable && <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Payments</p>}
                            {r.payments.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nothing {payable ? "paid" : "received"} against it yet.</p>
                            ) : (
                              <ol className="space-y-1.5">
                                {r.payments.map((p, i) => {
                                  const n = r.payments.slice(0, i + 1).filter((x) => x.kind !== "advance").length;
                                  return (
                                    <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                                      <span className={cn("w-20 font-semibold", p.kind === "advance" ? "text-primary" : "text-foreground")}>
                                        {p.kind === "advance" ? "Advance" : `${ordinal(n)} payment`}
                                      </span>
                                      <span className="w-24 tabular-nums text-muted-foreground">{formatDate(p.payment_date)}</span>
                                      <span className="w-28 text-right font-medium tabular-nums">{money(p.amount, r.currency)}</span>
                                      <span className="text-muted-foreground">{p.method_display}{p.reference ? ` · ${p.reference}` : ""}{p.notes ? ` · ${p.notes}` : ""}</span>
                                      {canPay && (
                                        <button onClick={() => removePayment(p)} aria-label="Remove payment" className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive">
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </li>
                                  );
                                })}
                              </ol>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={cols} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {JSON.stringify(queryOf(params)) === JSON.stringify(queryOf(DEFAULT_PARAMS))
                    ? payable ? "Nothing outstanding. Approved purchase orders appear here once the Group Head signs them off." : "Nothing outstanding. Approved client invoices appear here."
                    : "Nothing matches these filters."}
                </td></tr>
              )}
            </tbody>
            {sums.length > 0 && (
              <tfoot className="border-t-2 border-border bg-secondary/40">
                {sums.map(([cur, s]) => (
                  <tr key={cur}>
                    <td colSpan={2} />
                    <td className={cn(td, "font-semibold")} colSpan={2}>Total{sums.length > 1 ? ` · ${cur}` : ""}</td>
                    {sumKeys.map((k) => (
                      <td key={k} className={cn(td, "text-right font-semibold tabular-nums")}>{money(s[k], cur)}</td>
                    ))}
                    <td className={cn(td, "text-right font-bold tabular-nums text-foreground")}>{money(s.balance, cur)}</td>
                    <td colSpan={canPay ? 3 : 2} />
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {paying && <PaymentModal side={side} row={paying} onClose={() => setPaying(null)} onSaved={() => { setPaying(null); onChanged(); }} />}
      {dueFor && <DueDateModal row={dueFor} onClose={() => setDueFor(null)} onSaved={() => { setDueFor(null); onChanged(); }} />}
      {billing && <SupplierInvoiceModal row={billing} onClose={() => setBilling(null)} onSaved={() => { setBilling(null); onChanged(); }} />}
    </div>
  );
}

/** Enter the supplier's invoice against their PO. Billing more than is left
 *  of the order is allowed - the bill is theirs - but asked about first. */
function SupplierInvoiceModal({ row, onClose, onSaved }: { row: LedgerRow; onClose: () => void; onSaved: () => void }) {
  // What is left of the order: its value less what was billed and discounted.
  const left = Math.max(0, row.total - (row.invoiced ?? 0) - (row.discount ?? 0));
  const [amount, setAmount] = useState(String(left || ""));
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [saving, setSaving] = useState(false);
  // Due on the invoice date plus the PO's payment terms (Net 30), never before it.
  const dueFrom = (d: string) => { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() + (row.terms_days ?? 0)); return iso(x); };
  const [issue, setIssue] = useState(iso(new Date()));
  const [due, setDue] = useState(dueFrom(iso(new Date())));
  const gross = parseFloat(amount || "0") || 0;
  const off = parseFloat(discount || "0") || 0;
  const total = Math.max(0, gross - off) + (parseFloat(tax || "0") || 0);
  // Billed before the discount, against what is left of the order.
  const over = gross > left + 0.005;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (over && !(await confirmAction(`This invoice (${money(gross, row.currency)}) is more than the ${money(left, row.currency)} left to invoice on ${row.number}. Enter it anyway?`))) return;
    setSaving(true);
    try {
      await api.post("/finance/invoices/", {
        purchase_order: row.id, reference: fd.get("reference"), amount, discount_amount: discount || "0", tax_amount: tax || "0",
        issue_date: issue, due_date: due, notes: fd.get("notes"),
      });
      toast.success(`Supplier invoice entered against ${row.number}`);
      onSaved();
    } catch (err) {
      toast.error(getApiError(err, "Could not enter the invoice"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Supplier invoice against ${row.number}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary/60 px-3 py-2.5 text-xs">
          <span><span className="block text-muted-foreground">PO value</span><span className="font-semibold tabular-nums">{money(row.total, row.currency)}</span></span>
          <span><span className="block text-muted-foreground">Invoiced</span><span className="font-semibold tabular-nums">{money(row.invoiced ?? 0, row.currency)}</span></span>
          <span><span className="block text-muted-foreground">Left to invoice</span><span className="font-semibold tabular-nums">{money(left, row.currency)}</span></span>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="bill-ref" className={labelClass}>Supplier&apos;s invoice no.</label>
          <input id="bill-ref" name="reference" required placeholder="As printed on their invoice" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="bill-amount" className={labelClass}>Amount ({row.currency})</label>
            <input id="bill-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bill-discount" className={labelClass}>Discount</label>
            <input id="bill-discount" type="number" min="0" step="0.01" max={amount || undefined} value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bill-tax" className={labelClass}>Tax</label>
            <input id="bill-tax" type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col justify-end rounded-lg bg-secondary/60 px-3 py-2">
            <span className="text-2xs text-muted-foreground">Invoice total</span>
            <span className="font-semibold tabular-nums">{money(total, row.currency)}</span>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bill-issue" className={labelClass}>Invoice date</label>
            <input id="bill-issue" name="issue_date" type="date" required value={issue}
              onChange={(e) => { setIssue(e.target.value); if (e.target.value) setDue(dueFrom(e.target.value)); }} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="bill-due" className={labelClass}>Due date</label>
            <input id="bill-due" name="due_date" type="date" required min={issue} value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
          </div>
          <p className="col-span-2 -mt-1 text-2xs text-muted-foreground">
            {row.terms_days ? `Due date: invoice date + ${row.terms_days} days (${row.terms}).` : "No payment terms on the PO: due on the invoice date."}
          </p>
        </div>
        {off > 0 && (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            The {money(off, row.currency)} discount comes off what is owed on {row.number}: paying this invoice in full settles it.
          </p>
        )}
        {over && (
          <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            {money(gross, row.currency)} is more than the {money(left, row.currency)} left to invoice on this PO.
          </p>
        )}
        <div className="space-y-1.5">
          <label htmlFor="bill-notes" className={labelClass}>Notes</label>
          <input id="bill-notes" name="notes" className={inputClass} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {saving ? "Saving…" : "Enter invoice"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** Outstanding, overdue and the aging of what is still owed, per currency. */
function TotalsStrip({ side, totals }: { side: "payable" | "receivable"; totals: ByCurrency }) {
  const entries = Object.entries(totals);
  if (entries.length === 0) return null;
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      {entries.map(([cur, t]) => (
        <Fragment key={cur}>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{side === "payable" ? "Total payable" : "Total receivable (incl. tax)"}{entries.length > 1 ? ` · ${cur}` : ""}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{money(t.balance, cur)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.open} open · {money(t.paid, cur)} {side === "payable" ? "paid" : "received"} of {money(t.total, cur)}
              {(t.discount ?? 0) > 0 && ` · ${money(t.discount, cur)} discount`}
            </p>
            {t.overdue > 0 && <p className="mt-1 text-xs font-medium text-red-600 dark:text-red-400">{money(t.overdue, cur)} overdue on {t.overdue_count}</p>}
          </div>
          <AgingBars aging={t.aging} currency={cur} />
        </Fragment>
      ))}
    </div>
  );
}

const AGING_TONE: Record<string, string> = {
  current: "bg-emerald-500",
  "1_30": "bg-amber-400",
  "31_60": "bg-amber-600",
  "61_90": "bg-red-500",
  "90_plus": "bg-red-700",
};

/** What is still owed, by how late it is. */
export function AgingBars({ aging, currency, title = "Aging" }: { aging: AgingBucket[]; currency: string; title?: string }) {
  const max = Math.max(1, ...aging.map((a) => a.amount));
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="mt-2.5 space-y-2">
        {aging.map((a) => (
          <li key={a.key} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 text-xs">
            <span className="text-muted-foreground">{a.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-secondary">
              <span className={cn("block h-full rounded-full", AGING_TONE[a.key])} style={{ width: `${(a.amount / max) * 100}%` }} />
            </span>
            <span className="w-28 text-right font-medium tabular-nums">{money(a.amount, currency)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentModal({ side, row, onClose, onSaved }: { side: "payable" | "receivable"; row: LedgerRow; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const first = row.payments.length === 0;
  const [kind, setKind] = useState<"advance" | "payment">(first && side === "payable" ? "advance" : "payment");
  const nextPayment = row.payments.filter((p) => p.kind !== "advance").length + 1;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await api.post("/finance/payments/", {
        [side === "payable" ? "purchase_order" : "invoice"]: row.id,
        kind,
        amount: fd.get("amount"),
        payment_date: fd.get("payment_date"),
        method: fd.get("method"),
        reference: fd.get("reference"),
        notes: fd.get("notes"),
      });
      toast.success(side === "payable" ? "Payment recorded" : "Receipt recorded");
      onSaved();
    } catch (err) {
      toast.error(getApiError(err, "Could not record it"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${side === "payable" ? "Pay" : "Receive against"} ${row.number}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-secondary/60 px-3 py-2.5 text-xs">
          <span className="font-medium text-foreground">{row.party}</span>
          <span className="mt-0.5 block text-muted-foreground">
            {money(row.balance, row.currency)} still {side === "payable" ? "to pay" : "to receive"} of {money(row.total, row.currency)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Kind of payment">
          {(["advance", "payment"] as const).map((k) => (
            <button type="button" key={k} role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
              className={cn("rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                kind === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
              {k === "advance" ? "Advance" : `${ordinal(nextPayment)} payment`}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="pay-amount" className={labelClass}>Amount ({row.currency})</label>
            <input id="pay-amount" name="amount" type="number" min="0.01" step="0.01" max={row.balance} defaultValue={row.balance} required className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pay-date" className={labelClass}>Date</label>
            <input id="pay-date" name="payment_date" type="date" required defaultValue={iso(new Date())} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pay-method" className={labelClass}>Method</label>
            <select id="pay-method" name="method" defaultValue="bank_transfer" className={inputClass}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="cash">Cash</option>
              <option value="credit_card">Credit Card</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="pay-ref" className={labelClass}>Reference</label>
            <input id="pay-ref" name="reference" placeholder="Cheque or transfer no." className={inputClass} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pay-notes" className={labelClass}>Notes</label>
          <input id="pay-notes" name="notes" className={inputClass} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {saving ? "Saving…" : side === "payable" ? "Record payment" : "Record receipt"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DueDateModal({ row, onClose, onSaved }: { row: LedgerRow; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  async function save(value: string) {
    setSaving(true);
    try {
      await api.post(`/finance/payables/${row.id}/due-date/`, { payment_due_date: value || null });
      toast.success(value ? "Due date set" : "Due date follows the payment terms again");
      onSaved();
    } catch (err) {
      toast.error(getApiError(err, "Could not set the due date"));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`When ${row.number} is due`} size="xs">
      <form onSubmit={(e) => { e.preventDefault(); save(String(new FormData(e.currentTarget).get("due") || "")); }} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="due-date" className={labelClass}>Pay the supplier by</label>
          <input id="due-date" name="due" type="date" required defaultValue={row.due_date ?? ""} className={inputClass} />
          <p className="text-2xs text-muted-foreground">Payment terms: {row.terms || "none on the order"}.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {row.due_date_set && (
            <button type="button" disabled={saving} onClick={() => save("")} className="mr-auto rounded-lg px-2 py-2 text-xs text-muted-foreground hover:text-foreground">Use the terms</button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">Save</button>
        </div>
      </form>
    </Modal>
  );
}
