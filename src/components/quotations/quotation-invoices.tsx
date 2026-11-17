"use client";

import { Check, FileText, Plus, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { confirmAction } from "@/components/ui/confirm";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatCurrency, type CurrencyCode } from "@/lib/currency";
import { useUser } from "@/lib/user-context";
import { cn, formatDate } from "@/lib/utils";

export interface QuotationBilling {
  quoted: number;
  invoiced: number;
  received: number;
  to_invoice: number;
  invoices: number;
  /** The client's PO against the quotation, and how much of it is not invoiced. */
  client_po_number?: string;
  client_po_amount?: number | null;
  client_po_date?: string | null;
  po_left?: number | null;
}

interface QuoteInvoice {
  id: string;
  invoice_number: string;
  description: string;
  status: string;
  amount: string;
  tax_amount: string;
  total_amount: string;
  paid_amount: string;
  issue_date: string;
  due_date: string;
}

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: "Waiting for approval", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
  approved: { label: "Approved", tone: "bg-primary/10 text-primary" },
  sent: { label: "Approved", tone: "bg-primary/10 text-primary" },
  partially_paid: { label: "Part received", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  paid: { label: "Received", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  overdue: { label: "Overdue", tone: "bg-red-500/10 text-red-700 dark:text-red-300" },
  cancelled: { label: "Cancelled", tone: "bg-secondary text-muted-foreground" },
};

/** What each invoice is usually for, one tap each; the share is of the
 *  quotation value, capped at what is left to invoice. */
const PRESETS = [
  { label: "Advance", share: 30 },
  { label: "Milestone", share: 40 },
  { label: "Final", share: null },
] as const;

const inputClass =
  "flex h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";
const labelClass = "text-2xs font-medium text-muted-foreground";

/** Invoices raised against an accepted quotation: how much of it is billed
 *  and received, and the form that bills the next part. Each invoice is a
 *  receivable on the Finance page once it is approved. */
export function QuotationInvoices({
  quotation, billing, onChanged,
}: {
  quotation: { id: string; quote_number: string; currency: string; client_name: string | null };
  billing: QuotationBilling;
  onChanged: () => void;
}) {
  const { can } = useUser();
  const manage = can("manage_finance");
  const approve = can("approve_invoice");
  const cur = quotation.currency as CurrencyCode;
  const fmt = (v: number | string) => formatCurrency(v, cur);

  const [invoices, setInvoices] = useState<QuoteInvoice[]>([]);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("0");
  const today = new Date().toISOString().slice(0, 10);
  const [issue, setIssue] = useState(today);
  const [due, setDue] = useState(new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [editPo, setEditPo] = useState(false);

  async function savePo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await api.post(`/finance/client-po/${quotation.id}/`, {
        client_po_number: fd.get("po_number"), client_po_amount: fd.get("po_amount") || null, client_po_date: fd.get("po_date") || null,
      });
      toast.success("Client PO saved");
      setEditPo(false);
      refresh();
    } catch (err) {
      toast.error(getApiError(err, "Could not save the client PO"));
    }
  }

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/finance/invoices/", { params: { quotation: quotation.id, page_size: 100 } });
      setInvoices((data.results ?? data).sort((a: QuoteInvoice, b: QuoteInvoice) => a.issue_date.localeCompare(b.issue_date)));
    } catch (err) {
      toast.error(getApiError(err, "Could not load the invoices"));
    }
  }, [quotation.id]);
  useEffect(() => { load(); }, [load]);

  const refresh = () => { load(); onChanged(); };

  function preset(label: string, share: number | null) {
    const value = share == null ? billing.to_invoice : Math.min(billing.to_invoice, Math.round(billing.quoted * share) / 100);
    setDescription(share == null ? "Final invoice" : `${label} ${share}%`);
    setAmount(String(value));
    setOpen(true);
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    const value = (parseFloat(amount || "0") || 0);
    if (billing.po_left != null && value > billing.po_left + 0.005
      && !(await confirmAction(`This invoice (${fmt(value)}) is more than the ${fmt(billing.po_left)} left on the client's PO ${billing.client_po_number}. Generate it anyway?`))) return;
    setSaving(true);
    try {
      const { data } = await api.post("/finance/invoices/", {
        quotation: quotation.id, description, amount, tax_amount: tax || "0", issue_date: issue, due_date: due,
      });
      toast.success(`${data.invoice_number} generated - it counts as a receivable once approved`);
      setOpen(false); setAmount(""); setDescription(""); setTax("0");
      refresh();
    } catch (err) {
      toast.error(getApiError(err, "Could not generate the invoice"));
    } finally {
      setSaving(false);
    }
  }

  async function approveOne(inv: QuoteInvoice) {
    if (!(await confirmAction(`Approve ${inv.invoice_number} for ${fmt(inv.total_amount)}? It then counts as money owed by ${quotation.client_name}.`))) return;
    try {
      await api.post(`/finance/invoices/${inv.id}/approve/`);
      toast.success(`${inv.invoice_number} approved`);
      refresh();
    } catch (err) {
      toast.error(getApiError(err, "Could not approve it"));
    }
  }

  async function remove(inv: QuoteInvoice) {
    if (!(await confirmAction(`Delete the draft ${inv.invoice_number}?`))) return;
    try {
      await api.delete(`/finance/invoices/${inv.id}/`);
      toast.success("Draft deleted");
      refresh();
    } catch (err) {
      toast.error(getApiError(err, "Could not delete it"));
    }
  }

  async function print(inv: QuoteInvoice) {
    try {
      const res = await api.get(`/finance/invoices/${inv.id}/print/`, { responseType: "blob" });
      window.open(URL.createObjectURL(res.data as Blob), "_blank");
    } catch (err) {
      toast.error(getApiError(err, "Could not print it"));
    }
  }

  const pct = (v: number) => (billing.quoted > 0 ? Math.min(100, (v / billing.quoted) * 100) : 0);

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" /> Invoices
        </h3>
        <Link href="/finance?tab=receivable" className="text-2xs font-medium text-primary hover:underline">Receivables on the Finance page</Link>
      </div>

      <div className="space-y-3 px-4 py-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Quotation value", value: billing.quoted },
            { label: "Invoiced", value: billing.invoiced },
            { label: "Received", value: billing.received },
            { label: "Left to invoice", value: billing.to_invoice, strong: true },
          ].map((s) => (
            <div key={s.label}>
              <p className={labelClass}>{s.label}</p>
              <p className={cn("text-sm tabular-nums", s.strong ? "font-bold text-foreground" : "font-semibold text-foreground")}>{fmt(s.value)}</p>
            </div>
          ))}
        </div>
        {editPo ? (
          <form onSubmit={savePo} className="flex flex-wrap items-end gap-2 rounded-lg bg-secondary/50 p-3">
            <div className="space-y-1">
              <label htmlFor={`po-n-${quotation.id}`} className={labelClass}>Client PO no.</label>
              <input id={`po-n-${quotation.id}`} name="po_number" required defaultValue={billing.client_po_number ?? ""} className={cn(inputClass, "h-9 w-40")} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`po-a-${quotation.id}`} className={labelClass}>PO amount</label>
              <input id={`po-a-${quotation.id}`} name="po_amount" type="number" min="0.01" step="0.01" required defaultValue={billing.client_po_amount ?? ""} className={cn(inputClass, "h-9 w-36")} />
            </div>
            <div className="space-y-1">
              <label htmlFor={`po-d-${quotation.id}`} className={labelClass}>PO date</label>
              <input id={`po-d-${quotation.id}`} name="po_date" type="date" defaultValue={billing.client_po_date ?? ""} className={cn(inputClass, "h-9 w-40")} />
            </div>
            <button type="submit" className="h-9 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground">Save</button>
            <button type="button" onClick={() => setEditPo(false)} className="h-9 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </form>
        ) : (
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            {billing.client_po_number ? (
              <span>
                Client PO <span className="font-semibold text-foreground">{billing.client_po_number}</span>
                {billing.client_po_amount != null && <> · {fmt(billing.client_po_amount)}{billing.po_left != null && <> · {fmt(billing.po_left)} not invoiced yet</>}</>}
              </span>
            ) : <span>No client PO recorded yet.</span>}
            {manage && (
              <button onClick={() => setEditPo(true)} className="font-medium text-primary hover:underline">
                {billing.client_po_number ? "Edit" : "Add the client's PO"}
              </button>
            )}
          </p>
        )}
        <div className="relative h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
          <span className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${pct(billing.invoiced)}%` }} />
          <span className="absolute inset-y-0 left-0 rounded-full bg-emerald-500" style={{ width: `${pct(billing.received)}%` }} />
        </div>

        {invoices.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Invoice</th>
                  <th className="py-2 pr-3 font-semibold">Due</th>
                  <th className="py-2 pr-3 text-right font-semibold">Total</th>
                  <th className="py-2 pr-3 text-right font-semibold">Received</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((inv) => {
                  const s = STATUS[inv.status] ?? { label: inv.status, tone: "bg-secondary text-muted-foreground" };
                  return (
                    <tr key={inv.id}>
                      <td className="py-2 pr-3">
                        <span className="font-mono text-xs font-semibold text-foreground">{inv.invoice_number}</span>
                        <span className="block text-2xs text-muted-foreground">{inv.description || "—"} · {formatDate(inv.issue_date)}</span>
                      </td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">{formatDate(inv.due_date)}</td>
                      <td className="py-2 pr-3 text-right font-medium tabular-nums">{fmt(inv.total_amount)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{Number(inv.paid_amount) > 0 ? fmt(inv.paid_amount) : "—"}</td>
                      <td className="py-2 pr-3"><span className={cn("rounded-full px-2 py-0.5 text-2xs font-semibold", s.tone)}>{s.label}</span></td>
                      <td className="py-2 text-right">
                        <span className="inline-flex items-center gap-1">
                          <button onClick={() => print(inv)} aria-label={`Print ${inv.invoice_number}`} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Printer className="h-3.5 w-3.5" /></button>
                          {inv.status === "draft" && manage && (
                            <button onClick={() => remove(inv)} aria-label={`Delete ${inv.invoice_number}`} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                          {inv.status === "draft" && approve && (
                            <button onClick={() => approveOne(inv)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground"><Check className="h-3 w-3" /> Approve</button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {manage && billing.to_invoice > 0 && (
          !open ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="mr-1 text-xs font-medium text-foreground">Generate invoice:</span>
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => preset(p.label, p.share)}
                  className="rounded-full bg-secondary px-2.5 py-1 text-2xs font-medium text-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                  + {p.share == null ? "Final (the rest)" : `${p.label} ${p.share}%`}
                </button>
              ))}
              <button onClick={() => { setDescription(""); setAmount(""); setOpen(true); }}
                className="inline-flex items-center gap-1 px-1 text-2xs font-medium text-muted-foreground hover:text-primary">
                <Plus className="h-3 w-3" /> Any amount
              </button>
            </div>
          ) : (
            <form onSubmit={generate} className="space-y-3 rounded-lg bg-secondary/50 p-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                <div className="col-span-2 space-y-1">
                  <label htmlFor={`qi-desc-${quotation.id}`} className={labelClass}>For</label>
                  <input id={`qi-desc-${quotation.id}`} value={description} onChange={(e) => setDescription(e.target.value)} required placeholder="e.g. Advance 30%" className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`qi-amount-${quotation.id}`} className={labelClass}>Amount ({quotation.currency})</label>
                  <input id={`qi-amount-${quotation.id}`} type="number" min="0.01" step="0.01" max={billing.to_invoice} required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`qi-tax-${quotation.id}`} className={labelClass}>Tax</label>
                  <input id={`qi-tax-${quotation.id}`} type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`qi-issue-${quotation.id}`} className={labelClass}>Issue date</label>
                  <input id={`qi-issue-${quotation.id}`} type="date" required value={issue} onChange={(e) => setIssue(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`qi-due-${quotation.id}`} className={labelClass}>Due date</label>
                  <input id={`qi-due-${quotation.id}`} type="date" required min={issue} value={due} onChange={(e) => setDue(e.target.value)} className={inputClass} />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-2xs text-muted-foreground">
                  {fmt(billing.to_invoice)} left to invoice. Billed to {quotation.client_name}; it counts as a receivable once approved.
                </p>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-card">Cancel</button>
                  <button type="submit" disabled={saving} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60">
                    {saving ? "Generating…" : "Generate invoice"}
                  </button>
                </span>
              </div>
            </form>
          )
        )}
        {billing.to_invoice <= 0 && <p className="text-2xs text-muted-foreground">The whole quotation is invoiced.</p>}
      </div>
    </section>
  );
}
