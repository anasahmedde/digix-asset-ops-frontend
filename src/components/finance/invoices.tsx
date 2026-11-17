"use client";

import { Check, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { confirmAction } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
import { SearchSelect } from "@/components/ui/search-select";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { CURRENCIES } from "@/lib/currency";
import { formatDate } from "@/lib/utils";

import { money } from "./ledger";

export interface DraftInvoice {
  id: string;
  invoice_number: string;
  client: string | null;
  client_name: string | null;
  currency: string;
  amount: string;
  tax_amount: string;
  total_amount: string;
  issue_date: string;
  due_date: string;
  notes: string;
  created_at: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";
const labelClass = "text-xs font-medium text-muted-foreground";

/** Client invoices not yet approved. They are not money owed to us until
 *  somebody who may approve them signs them off. */
export function DraftInvoices({
  drafts, canEdit, canApprove, onChanged, onEdit,
}: {
  drafts: DraftInvoice[]; canEdit: boolean; canApprove: boolean;
  onChanged: () => void; onEdit: (d: DraftInvoice) => void;
}) {
  if (drafts.length === 0) return null;

  async function approve(d: DraftInvoice) {
    if (!(await confirmAction(`Approve ${d.invoice_number} for ${money(d.total_amount, d.currency)}? It then counts as money owed by ${d.client_name} and can no longer be changed.`))) return;
    try {
      await api.post(`/finance/invoices/${d.id}/approve/`);
      toast.success(`${d.invoice_number} approved`);
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not approve it"));
    }
  }
  async function remove(d: DraftInvoice) {
    if (!(await confirmAction(`Delete the draft ${d.invoice_number}?`))) return;
    try {
      await api.delete(`/finance/invoices/${d.id}/`);
      toast.success("Draft deleted");
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not delete it"));
    }
  }

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Waiting for approval <span className="ml-1 text-xs font-medium text-muted-foreground">{drafts.length}</span></h2>
        <p className="text-2xs text-muted-foreground">Not counted in receivables until approved.</p>
      </div>
      <ul className="divide-y divide-amber-500/20 border-t border-amber-500/20">
        {drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            <span className="font-mono text-xs font-semibold text-foreground">{d.invoice_number}</span>
            <span className="min-w-0 flex-1 truncate">{d.client_name}</span>
            <span className="text-xs text-muted-foreground">Due {formatDate(d.due_date)}</span>
            <span className="w-32 text-right font-semibold tabular-nums">{money(d.total_amount, d.currency)}</span>
            <span className="flex items-center gap-1">
              {canEdit && (
                <>
                  <button onClick={() => onEdit(d)} aria-label={`Edit ${d.invoice_number}`} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(d)} aria-label={`Delete ${d.invoice_number}`} className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </>
              )}
              {canApprove && (
                <button onClick={() => approve(d)} className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground">
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

interface BillableQuote {
  id: string;
  quote_number: string;
  title: string;
  client_name: string | null;
  currency: string;
  billing: {
    quoted: number; invoiced: number; to_invoice: number;
    client_po_number: string; client_po_amount: number | null; client_po_date: string | null; po_left: number | null;
  } | null;
}

/** Enter a client invoice against the client's PO on an accepted quotation.
 *  The client's PO number and amount are recorded on the quotation the first
 *  time; billing past what is left of that PO is asked about first. */
export function ClientInvoiceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [quotes, setQuotes] = useState<BillableQuote[] | null>(null);
  const [pick, setPick] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [poAmount, setPoAmount] = useState("");
  const [poDate, setPoDate] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [tax, setTax] = useState("0");
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    api.get("/quotations/quotations/", { params: { status: "accepted", page_size: 500 } })
      .then(({ data }) => setQuotes(data.results ?? data))
      .catch((err) => { setQuotes([]); toast.error(getApiError(err, "Could not load the accepted quotations")); });
  }, []);

  const q = quotes?.find((x) => x.id === pick) ?? null;
  const b = q?.billing ?? null;
  function choose(id: string) {
    setPick(id);
    const nb = quotes?.find((x) => x.id === id)?.billing;
    setPoNumber(nb?.client_po_number ?? "");
    setPoAmount(nb?.client_po_amount != null ? String(nb.client_po_amount) : "");
    setPoDate(nb?.client_po_date ?? "");
    setAmount(nb ? String(nb.po_left ?? nb.to_invoice) : "");
  }
  const poValue = parseFloat(poAmount || "") || null;
  const poLeft = poValue == null ? null : Math.max(0, poValue - (b?.invoiced ?? 0));
  const value = parseFloat(amount || "0") || 0;
  const over = poLeft != null && value > poLeft + 0.005;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q) return;
    if (over && !(await confirmAction(`This invoice (${money(value, q.currency)}) is more than the ${money(poLeft, q.currency)} left on the client's PO ${poNumber}. Enter it anyway?`))) return;
    setSaving(true);
    try {
      const poChanged = poNumber !== (b?.client_po_number ?? "") || poValue !== (b?.client_po_amount ?? null) || poDate !== (b?.client_po_date ?? "");
      if (poChanged) {
        await api.post(`/finance/client-po/${q.id}/`, { client_po_number: poNumber, client_po_amount: poAmount || null, client_po_date: poDate || null });
      }
      const { data } = await api.post("/finance/invoices/", {
        quotation: q.id, description: description || (poNumber ? `Against PO ${poNumber}` : ""),
        amount, tax_amount: tax || "0", issue_date: today, due_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
      });
      toast.success(`${data.invoice_number} drafted - it counts as a receivable once approved`);
      onSaved();
    } catch (err) {
      toast.error(getApiError(err, "Could not enter the invoice"));
    } finally {
      setSaving(false);
    }
  }

  const options = (quotes ?? []).map((x) => ({ id: x.id, label: `${x.quote_number} · ${x.client_name ?? ""} · ${x.title}` }));
  return (
    <Modal open onClose={onClose} title="Client invoice" size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className={labelClass}>Accepted quotation</label>
          <SearchSelect options={options} value={pick} onChange={choose} placeholder={quotes == null ? "Loading…" : quotes.length ? "Choose the quotation" : "No accepted quotation yet"} required />
        </div>
        {q && b && (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-lg bg-secondary/60 px-3 py-2.5 text-xs">
              <span><span className="block text-muted-foreground">Quotation</span><span className="font-semibold tabular-nums">{money(b.quoted, q.currency)}</span></span>
              <span><span className="block text-muted-foreground">Invoiced</span><span className="font-semibold tabular-nums">{money(b.invoiced, q.currency)}</span></span>
              <span><span className="block text-muted-foreground">Left on {poValue != null ? "the PO" : "the quotation"}</span><span className="font-semibold tabular-nums">{money(poLeft ?? b.to_invoice, q.currency)}</span></span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="cpo-number" className={labelClass}>Client PO no.</label>
                <input id="cpo-number" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} required className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cpo-amount" className={labelClass}>PO amount ({q.currency})</label>
                <input id="cpo-amount" type="number" min="0.01" step="0.01" value={poAmount} onChange={(e) => setPoAmount(e.target.value)} required className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cpo-date" className={labelClass}>PO date</label>
                <input id="cpo-date" type="date" value={poDate} onChange={(e) => setPoDate(e.target.value)} className={inputClass} />
              </div>
              <div className="col-span-2 space-y-1.5 sm:col-span-3">
                <label htmlFor="ci-desc" className={labelClass}>What it is for</label>
                <input id="ci-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Advance 30%, Final invoice" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ci-amount" className={labelClass}>Amount</label>
                <input id="ci-amount" type="number" min="0.01" step="0.01" max={b.to_invoice} required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ci-tax" className={labelClass}>Tax</label>
                <input id="ci-tax" type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} className={inputClass} />
              </div>
            </div>
            {over && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                {money(value, q.currency)} is more than the {money(poLeft, q.currency)} left on the client&apos;s PO.
              </p>
            )}
            <p className="text-2xs text-muted-foreground">Client, currency and the quoted items come from the quotation. It counts as a receivable once approved.</p>
          </>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">Cancel</button>
          <button type="submit" disabled={saving || !q} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {saving ? "Saving…" : "Draft invoice"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Raise (or correct) a draft client invoice. */
export function InvoiceModal({ editing, onClose, onSaved }: { editing: DraftInvoice | null; onClose: () => void; onSaved: () => void }) {
  const [clients, setClients] = useState<{ id: string; label: string }[]>([]);
  const [client, setClient] = useState(editing?.client ?? "");
  const [amount, setAmount] = useState(editing?.amount ?? "");
  const [tax, setTax] = useState(editing?.tax_amount ?? "0");
  const [saving, setSaving] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const inThirty = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  useEffect(() => {
    api.get("/clients/", { params: { page_size: 500 } })
      .then(({ data }) => setClients((data.results ?? data).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name }))))
      .catch(() => toast.error("Could not load the clients"));
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      invoice_type: "receivable",
      client: client || null,
      currency: fd.get("currency"),
      amount, tax_amount: tax || "0",
      issue_date: fd.get("issue_date"),
      due_date: fd.get("due_date"),
      notes: fd.get("notes"),
    };
    setSaving(true);
    try {
      if (editing) await api.patch(`/finance/invoices/${editing.id}/`, payload);
      else await api.post("/finance/invoices/", payload);
      toast.success(editing ? "Draft updated" : "Invoice drafted - it counts once approved");
      onSaved();
    } catch (err) {
      toast.error(getApiError(err, "Could not save the invoice"));
    } finally {
      setSaving(false);
    }
  }

  const total = (parseFloat(amount || "0") || 0) + (parseFloat(tax || "0") || 0);
  return (
    <Modal open onClose={onClose} title={editing ? `Edit ${editing.invoice_number}` : "New client invoice"} size="md">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className={labelClass}>Client</label>
          <SearchSelect options={clients} value={client} onChange={setClient} placeholder="Choose the client" required />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="inv-currency" className={labelClass}>Currency</label>
            <select id="inv-currency" name="currency" defaultValue={editing?.currency ?? "PKR"} className={inputClass}>
              {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inv-amount" className={labelClass}>Amount</label>
            <input id="inv-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inv-tax" className={labelClass}>Tax</label>
            <input id="inv-tax" type="number" min="0" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inv-issue" className={labelClass}>Issue date</label>
            <input id="inv-issue" name="issue_date" type="date" required defaultValue={editing?.issue_date ?? today} className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="inv-due" className={labelClass}>Due date</label>
            <input id="inv-due" name="due_date" type="date" required defaultValue={editing?.due_date ?? inThirty} className={inputClass} />
          </div>
          <div className="col-span-2 flex flex-col justify-end rounded-lg bg-secondary/60 px-3 py-2 sm:col-span-1">
            <span className="text-2xs text-muted-foreground">Invoice total</span>
            <span className="font-semibold tabular-nums">{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="inv-notes" className={labelClass}>Notes</label>
          <textarea id="inv-notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} className={`${inputClass} h-auto py-2`} />
        </div>
        <p className="text-2xs text-muted-foreground">The invoice number is given automatically. It counts as a receivable once it is approved.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">Cancel</button>
          <button type="submit" disabled={saving || !client} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {saving ? "Saving…" : editing ? "Save draft" : "Draft invoice"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
