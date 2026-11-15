"use client";

import { ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";

import { confirmAction } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
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

export interface AgingBucket { key: string; label: string; amount: number }
export interface Totals {
  total: number; paid: number; balance: number; overdue: number;
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
  return <span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold tabular-nums", tone)}>{days} {days === 1 ? "day" : "days"}</span>;
}

const FILTERS = [
  { key: "open", label: "Outstanding" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
  { key: "all", label: "All" },
] as const;

/** The Payable or Receivable register: each document's value, the advance
 *  and the payments after it, what is still owed and how late it is. */
export function LedgerTable({
  side, rows, totals, canPay, canSetDue, onChanged, toolbar,
}: {
  side: "payable" | "receivable";
  rows: LedgerRow[];
  totals: ByCurrency;
  canPay: boolean;
  canSetDue?: boolean;
  onChanged: () => void;
  toolbar?: React.ReactNode;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState<LedgerRow | null>(null);
  const [dueFor, setDueFor] = useState<LedgerRow | null>(null);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (filter === "open" ? r.balance > 0 : filter === "overdue" ? r.overdue_days > 0 : filter === "paid" ? r.balance <= 0 : true))
      .filter((r) => !q || r.number.toLowerCase().includes(q) || r.party.toLowerCase().includes(q))
      .sort((a, b) => b.overdue_days - a.overdue_days || b.balance - a.balance);
  }, [rows, filter, search]);

  const sums = useMemo(() => {
    const by: Record<string, Record<string, number>> = {};
    for (const r of shown) {
      const s = (by[r.currency] ??= { total: 0, advance: 0, first: 0, second: 0, third: 0, balance: 0 });
      s.total += r.total; s.advance += r.advance; s.first += r.first ?? 0;
      s.second += r.second ?? 0; s.third += r.third ?? 0; s.balance += r.balance;
    }
    return Object.entries(by);
  }, [shown]);

  const docLabel = side === "payable" ? "PO" : "Invoice";
  const partyLabel = side === "payable" ? "Supplier" : "Client";
  const counts = {
    open: rows.filter((r) => r.balance > 0).length,
    overdue: rows.filter((r) => r.overdue_days > 0).length,
    paid: rows.filter((r) => r.balance <= 0).length,
    all: rows.length,
  };

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
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
                {f.label} <span className="ml-1 tabular-nums opacity-70">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${side === "payable" ? "PO" : "invoice"} or ${partyLabel.toLowerCase()}`}
            aria-label="Search" className={cn(inputClass, "h-9 w-full sm:ml-auto sm:w-64")} />
          {toolbar}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="bg-secondary/60">
              <tr>
                <th className={cn(th, "w-8")} />
                <th className={th}>{docLabel}</th>
                <th className={th}>{partyLabel}</th>
                <th className={cn(th, "text-right")}>Total value</th>
                <th className={cn(th, "text-right")}>Advance</th>
                <th className={cn(th, "text-right")}>1st payment</th>
                <th className={cn(th, "text-right")}>2nd payment</th>
                <th className={cn(th, "text-right")}>3rd payment</th>
                <th className={cn(th, "text-right")}>Balance pending</th>
                <th className={th}>Due date</th>
                <th className={th}>Overdue</th>
                {canPay && <th className={th} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((r) => {
                const expanded = open === r.id;
                const cell = (v: number | null) => (v == null || v === 0 ? <span className="text-muted-foreground/50">—</span> : money(v, r.currency));
                return (
                  <Fragment key={r.id}>
                    <tr className={cn("hover:bg-secondary/30", r.overdue_days > 0 && "bg-red-500/[0.03]")}>
                      <td className="pl-3">
                        <button onClick={() => setOpen(expanded ? null : r.id)} aria-label={expanded ? "Hide payments" : "Show payments"}
                          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className={td}>
                        {side === "payable" ? (
                          <Link href={`/procurement?po=${r.id}`} className="font-mono text-xs font-semibold text-primary hover:underline">{r.number}</Link>
                        ) : (
                          <span className="font-mono text-xs font-semibold text-foreground">{r.number}</span>
                        )}
                        <span className="block text-2xs text-muted-foreground">{r.status_display}{r.date ? ` · ${formatDate(r.date)}` : ""}</span>
                      </td>
                      <td className={cn(td, "max-w-[220px] truncate")} title={r.party}>{r.party || "—"}</td>
                      <td className={cn(td, "text-right font-medium tabular-nums")}>{money(r.total, r.currency)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{cell(r.advance)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{cell(r.first)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{cell(r.second)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>
                        {cell(r.third)}
                        {r.later_payments > 0 && <span className="block text-2xs text-muted-foreground">incl. {r.later_payments} later</span>}
                      </td>
                      <td className={cn(td, "text-right font-semibold tabular-nums", r.balance > 0 ? "text-foreground" : "text-muted-foreground")}>{money(r.balance, r.currency)}</td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-1">
                          {r.due_date ? formatDate(r.due_date) : "—"}
                          {canSetDue && (
                            <button onClick={() => setDueFor(r)} aria-label={`Set the due date of ${r.number}`}
                              className="rounded p-0.5 text-muted-foreground hover:text-primary"><Pencil className="h-3 w-3" /></button>
                          )}
                        </span>
                        {!r.due_date_set && <span className="block max-w-[150px] truncate text-2xs text-muted-foreground" title={r.terms}>from {r.terms || "the order date"}</span>}
                      </td>
                      <td className={td}><OverdueBadge days={r.overdue_days} balance={r.balance} /></td>
                      {canPay && (
                        <td className={cn(td, "text-right")}>
                          {r.balance > 0 && (
                            <button onClick={() => setPaying(r)}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary">
                              <Plus className="h-3.5 w-3.5" /> {side === "payable" ? "Pay" : "Receive"}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                    {expanded && (
                      <tr className="bg-secondary/20">
                        <td />
                        <td colSpan={canPay ? 11 : 10} className="px-3 py-3">
                          {r.payments.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nothing {side === "payable" ? "paid" : "received"} against it yet.</p>
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
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {shown.length === 0 && (
                <tr><td colSpan={12} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {rows.length === 0
                    ? side === "payable" ? "No approved purchase orders yet. Orders appear here once the Group Head signs them off." : "No approved invoices yet. Raise one and have it approved."
                    : "Nothing matches this filter."}
                </td></tr>
              )}
            </tbody>
            {sums.length > 0 && (
              <tfoot className="border-t-2 border-border bg-secondary/40">
                {sums.map(([cur, s]) => (
                  <tr key={cur}>
                    <td />
                    <td className={cn(td, "font-semibold")} colSpan={2}>Total{sums.length > 1 ? ` · ${cur}` : ""}</td>
                    {(["total", "advance", "first", "second", "third"] as const).map((k) => (
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
    </div>
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
            <p className="text-xs font-medium text-muted-foreground">{side === "payable" ? "Total payable" : "Total receivable"}{entries.length > 1 ? ` · ${cur}` : ""}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums text-foreground">{money(t.balance, cur)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.open} open · {money(t.paid, cur)} {side === "payable" ? "paid" : "received"} of {money(t.total, cur)}
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
            <input id="pay-date" name="payment_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass} />
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
