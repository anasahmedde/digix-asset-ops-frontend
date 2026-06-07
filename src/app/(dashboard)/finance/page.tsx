"use client";

import { CreditCard, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { CURRENCIES, formatCurrency, getCurrency, setCurrency, type CurrencyCode } from "@/lib/currency";
import { useUser } from "@/lib/user-context";

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_type: string;
  status: string;
  currency: string;
  client: string | null;
  client_name: string | null;
  supplier: string | null;
  supplier_name: string | null;
  amount: string;
  tax_amount: string;
  total_amount: string;
  issue_date: string;
  due_date: string;
  paid_amount: string;
  balance_due: string;
  notes: string;
  created_at: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30 transition-colors";
const labelClass = "text-xs font-medium text-gray-600";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-gray-400";
const tdClass = "px-5 py-3.5";

const typeBadge: Record<string, string> = {
  payable: "bg-red-500/10 text-red-400 ring-red-500/20",
  receivable: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
};

const statusBadge: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-400 ring-gray-500/20",
  sent: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  partially_paid: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  paid: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  overdue: "bg-red-500/10 text-red-400 ring-red-500/20",
  cancelled: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
};

function fmt(value: string | number) {
  return formatCurrency(value);
}

export default function FinancePage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("finance");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [currency, setCurrencyState] = useState<CurrencyCode>(getCurrency());
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ type: "", status: "" });
  const [search, setSearch] = useState("");

  useEffect(() => {
    function onCurrencyChange() { setCurrencyState(getCurrency()); }
    window.addEventListener("currency-change", onCurrencyChange);
    return () => window.removeEventListener("currency-change", onCurrencyChange);
  }, []);

  const fetchInvoices = useCallback(async () => {
    try {
      const { data } = await api.get("/finance/invoices/");
      setInvoices(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load invoices"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      invoice_number: fd.get("invoice_number"),
      invoice_type: fd.get("invoice_type"),
      status: fd.get("status"),
      currency: fd.get("currency"),
      amount: fd.get("amount"),
      tax_amount: fd.get("tax_amount"),
      issue_date: fd.get("issue_date"),
      due_date: fd.get("due_date"),
      notes: fd.get("notes"),
    };
    try {
      if (modalMode === "create") {
        await api.post("/finance/invoices/", payload);
        toast.success("Invoice created");
      } else if (selected) {
        await api.patch(`/finance/invoices/${selected.id}/`, payload);
        toast.success("Invoice updated");
      }
      closeModal();
      fetchInvoices();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save invoice"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(invoice: Invoice) {
    if (!confirm(`Delete invoice "${invoice.invoice_number}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/finance/invoices/${invoice.id}/`);
      toast.success("Invoice deleted");
      fetchInvoices();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — invoice may have linked records"));
    }
  }

  const totalReceivable = invoices
    .filter((i) => i.invoice_type === "receivable")
    .reduce((sum, i) => sum + parseFloat(i.total_amount || "0"), 0);

  const totalPayable = invoices
    .filter((i) => i.invoice_type === "payable")
    .reduce((sum, i) => sum + parseFloat(i.total_amount || "0"), 0);

  const totalPaid = invoices.reduce((sum, i) => sum + parseFloat(i.paid_amount || "0"), 0);

  const totalOverdue = invoices
    .filter((i) => i.status === "overdue")
    .reduce((sum, i) => sum + parseFloat(i.total_amount || "0"), 0);

  const summaryCards = [
    { label: "Total Receivable", value: totalReceivable, color: "border-emerald-500", text: "text-emerald-600" },
    { label: "Total Payable", value: totalPayable, color: "border-red-500", text: "text-red-600" },
    { label: "Total Paid", value: totalPaid, color: "border-blue-500", text: "text-blue-600" },
    { label: "Total Overdue", value: totalOverdue, color: "border-amber-500", text: "text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
            <p className="text-gray-500">Manage invoices, payments, and financial records</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={currency}
            onChange={(e) => { setCurrency(e.target.value as CurrencyCode); setCurrencyState(e.target.value as CurrencyCode); }}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-teal-500/50 focus:outline-none focus:ring-1 focus:ring-teal-500/30"
          >
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
            ))}
          </select>
          {canEdit && (
            <button onClick={() => { setSelected(null); setModalMode("create"); }} className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30">
              <Plus className="h-4 w-4" /> Add Invoice
            </button>
          )}
        </div>
      </div>

      {!loading && invoices.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className={`rounded-xl border border-gray-200 bg-white p-5 border-l-4 ${card.color}`}>
              <p className="text-xs font-medium text-gray-500">{card.label}</p>
              <p className={`mt-1 text-xl font-bold ${card.text}`}>{fmt(card.value)}</p>
            </div>
          ))}
        </div>
      )}

      <FilterBar
        filters={[
          { key: "type", label: "Type", options: [{ value: "receivable", label: "Receivable" }, { value: "payable", label: "Payable" }] },
          { key: "status", label: "Status", options: Object.keys(statusBadge).map((s) => ({ value: s, label: s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by invoice #, client..."
      />

      {(() => {
        const filtered = invoices.filter((inv) => {
          if (filterValues.type && inv.invoice_type !== filterValues.type) return false;
          if (filterValues.status && inv.status !== filterValues.status) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!inv.invoice_number.toLowerCase().includes(q) && !(inv.client_name || "").toLowerCase().includes(q) && !(inv.supplier_name || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <CreditCard className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No invoices found</h3>
          <p className="mt-2 text-sm text-gray-500">{invoices.length > 0 ? "Try adjusting your filters." : "Add invoices to start tracking your finances."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className={thClass}>Invoice #</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Client / Supplier</th>
                  <th className={thClass}>Cur.</th>
                  <th className={thClass}>Amount</th>
                  <th className={thClass}>Tax</th>
                  <th className={thClass}>Total</th>
                  <th className={thClass}>Paid</th>
                  <th className={thClass}>Balance Due</th>
                  <th className={thClass}>Due Date</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id} onClick={() => { setSelected(inv); setModalMode("edit"); }} className="border-b border-gray-200 cursor-pointer transition-colors hover:bg-teal-50/40">
                    <td className={`${tdClass} font-medium text-gray-900`}>{inv.invoice_number}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${typeBadge[inv.invoice_type] ?? "bg-gray-500/10 text-gray-400 ring-gray-500/20"}`}>
                        {inv.invoice_type}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusBadge[inv.status] ?? "bg-gray-500/10 text-gray-400 ring-gray-500/20"}`}>
                        {inv.status?.replace("_", " ")}
                      </span>
                    </td>
                    <td className={`${tdClass} text-gray-600`}>
                      {inv.invoice_type === "receivable" ? inv.client_name || "-" : inv.supplier_name || "-"}
                    </td>
                    <td className={`${tdClass} text-xs text-gray-500`}>{inv.currency || "PKR"}</td>
                    <td className={`${tdClass} text-gray-600`}>{formatCurrency(inv.amount, (inv.currency as CurrencyCode) || undefined)}</td>
                    <td className={`${tdClass} text-gray-600`}>{formatCurrency(inv.tax_amount, (inv.currency as CurrencyCode) || undefined)}</td>
                    <td className={`${tdClass} font-medium text-gray-900`}>{formatCurrency(inv.total_amount, (inv.currency as CurrencyCode) || undefined)}</td>
                    <td className={`${tdClass} text-gray-600`}>{formatCurrency(inv.paid_amount, (inv.currency as CurrencyCode) || undefined)}</td>
                    <td className={`${tdClass} font-medium text-gray-900`}>{formatCurrency(inv.balance_due, (inv.currency as CurrencyCode) || undefined)}</td>
                    <td className={`${tdClass} text-gray-600`}>{inv.due_date || "-"}</td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setSelected(inv); setModalMode("edit"); }} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(inv)} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-400" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
      })()}

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{modalMode === "create" ? "Add New Invoice" : "Edit Invoice"}</h2>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="invoice_number" className={labelClass}>Invoice Number</label>
                  <input id="invoice_number" name="invoice_number" required defaultValue={selected?.invoice_number ?? ""} className={inputClass} placeholder="e.g. INV-001" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="invoice_type" className={labelClass}>Type</label>
                  <select id="invoice_type" name="invoice_type" defaultValue={selected?.invoice_type ?? "receivable"} className={inputClass}>
                    <option value="receivable">Receivable</option>
                    <option value="payable">Payable</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="currency" className={labelClass}>Currency</label>
                  <select id="currency" name="currency" defaultValue={selected?.currency ?? currency} className={inputClass}>
                    {CURRENCIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="status" className={labelClass}>Status</label>
                  <select id="status" name="status" defaultValue={selected?.status ?? "draft"} className={inputClass}>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="partially_paid">Partially Paid</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="amount" className={labelClass}>Amount</label>
                  <input id="amount" name="amount" type="number" step="0.01" defaultValue={selected?.amount ?? ""} className={inputClass} placeholder="0.00" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="tax_amount" className={labelClass}>Tax Amount</label>
                  <input id="tax_amount" name="tax_amount" type="number" step="0.01" defaultValue={selected?.tax_amount ?? ""} className={inputClass} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="issue_date" className={labelClass}>Issue Date</label>
                  <input id="issue_date" name="issue_date" type="date" defaultValue={selected?.issue_date ?? ""} className={inputClass} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="due_date" className={labelClass}>Due Date</label>
                <input id="due_date" name="due_date" type="date" defaultValue={selected?.due_date ?? ""} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="notes" className={labelClass}>Notes</label>
                <textarea id="notes" name="notes" rows={3} defaultValue={selected?.notes ?? ""} className={`${inputClass} h-auto py-2`} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-transparent px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-gradient-to-r from-teal-500 to-teal-600 px-5 text-sm font-medium text-white shadow-lg shadow-teal-500/20 transition-all hover:shadow-teal-500/30 disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Create Invoice" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
