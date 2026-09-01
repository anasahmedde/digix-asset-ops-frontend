"use client";

import { FileDown, Pencil, Plus, ScrollText, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/ui/copy-button";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import type { PaymentTerms, Supplier, WorkOrder, WorkOrderStatus } from "@/types";

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
// inputClass minus w-full — for row inputs with explicit widths (w-20/w-32/w-36),
// where the baked-in w-full would win Tailwind's cascade and break the layout.
const rowInputClass = inputClass.replace("w-full ", "");
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
  pending_approval: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  approved: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  issued: "bg-indigo-500/10 text-indigo-400 ring-indigo-500/20",
  in_progress: "bg-cyan-500/10 text-cyan-400 ring-cyan-500/20",
  partially_delivered: "bg-violet-500/10 text-violet-400 ring-violet-500/20",
  delivered: "bg-teal-500/10 text-teal-400 ring-teal-500/20",
  completed: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 ring-red-500/20",
};

const NEXT_STATUS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  draft: ["pending_approval", "cancelled"],
  pending_approval: ["approved", "draft", "cancelled"],
  approved: ["issued", "cancelled"],
  issued: ["in_progress", "cancelled"],
  in_progress: ["partially_delivered", "delivered", "cancelled"],
  partially_delivered: ["delivered", "cancelled"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

const ORDER_TYPES = [
  { value: "supply", label: "Supply / Purchase" },
  { value: "installation", label: "Installation" },
  { value: "supply_install", label: "Supply & Installation" },
];
const CURRENCIES = ["PKR", "AED", "SAR", "QAR", "USD", "EUR", "GBP"];

interface ItemRow {
  description: string;
  quantity: string;
  unit_price: string;
}
interface FormState {
  title: string;
  order_type: string;
  supplier: string;
  payment_terms: string;
  currency: string;
  warranty_months: string;
  order_date: string;
  expected_delivery: string;
  description: string;
  terms_conditions: string;
  safety_instructions: string;
  items: ItemRow[];
}

const emptyForm: FormState = {
  title: "", order_type: "supply_install", supplier: "", payment_terms: "",
  currency: "PKR", warranty_months: "", order_date: "", expected_delivery: "",
  description: "", terms_conditions: "", safety_instructions: "",
  items: [{ description: "", quantity: "1", unit_price: "0" }],
};

const label = (s: string) => s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export default function WorkOrdersPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("setup") || canWrite("procurement");

  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [terms, setTerms] = useState<PaymentTerms[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await api.get("/work-orders/");
      setOrders(data.results ?? data);
    } catch (err) {
      toast.error(getApiError(err, "Failed to load work orders"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    api.get("/suppliers/").then((r) => setSuppliers(r.data.results ?? r.data)).catch(() => {});
    api.get("/setup/payment-terms/").then((r) => setTerms(r.data.results ?? r.data)).catch(() => {});
  }, [fetchOrders]);

  function openCreate() {
    setSelected(null);
    setForm(emptyForm);
    setModalMode("create");
  }

  async function openEdit(id: string) {
    try {
      const { data } = await api.get<WorkOrder>(`/work-orders/${id}/`);
      setSelected(data);
      setForm({
        title: data.title,
        order_type: data.order_type,
        supplier: data.supplier,
        payment_terms: data.payment_terms ?? "",
        currency: data.currency,
        warranty_months: data.warranty_months?.toString() ?? "",
        order_date: data.order_date ?? "",
        expected_delivery: data.expected_delivery ?? "",
        description: data.description,
        terms_conditions: data.terms_conditions,
        safety_instructions: data.safety_instructions,
        items: data.items.length
          ? data.items.map((i) => ({
              description: i.description,
              quantity: String(i.quantity),
              unit_price: String(i.unit_price),
            }))
          : [{ description: "", quantity: "1", unit_price: "0" }],
      });
      setModalMode("edit");
    } catch (err) {
      toast.error(getApiError(err, "Failed to load work order"));
    }
  }

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  function updateItem(idx: number, key: keyof ItemRow, value: string) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, [key]: value } : it)) }));
  }
  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, { description: "", quantity: "1", unit_price: "0" }] }));
  }
  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  const formTotal = form.items.reduce(
    (sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unit_price) || 0),
    0
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplier) {
      toast.error("Please select a supplier");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title,
      order_type: form.order_type,
      supplier: form.supplier,
      payment_terms: form.payment_terms || null,
      currency: form.currency,
      warranty_months: form.warranty_months ? Number(form.warranty_months) : null,
      order_date: form.order_date || null,
      expected_delivery: form.expected_delivery || null,
      description: form.description,
      terms_conditions: form.terms_conditions,
      safety_instructions: form.safety_instructions,
      items: form.items
        .filter((it) => it.description.trim())
        .map((it) => ({
          description: it.description,
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
        })),
    };
    try {
      if (modalMode === "create") {
        await api.post("/work-orders/", payload);
        toast.success("Work order created");
      } else if (selected) {
        await api.patch(`/work-orders/${selected.id}/`, payload);
        toast.success("Work order updated");
      }
      closeModal();
      fetchOrders();
    } catch (err) {
      toast.error(getApiError(err, "Failed to save work order"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(id: string, status: WorkOrderStatus) {
    try {
      await api.post(`/work-orders/${id}/transition/`, { status });
      toast.success(`Moved to ${label(status)}`);
      closeModal();
      fetchOrders();
    } catch (err) {
      toast.error(getApiError(err, "Status change failed"));
    }
  }

  async function handlePrint(wo: WorkOrder) {
    try {
      const res = await api.get(`/work-orders/${wo.id}/print/`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, "_blank");
    } catch (err) {
      toast.error(getApiError(err, "Failed to generate PDF"));
    }
  }

  async function handleDelete(wo: WorkOrder) {
    if (!confirm(`Delete work order ${wo.wo_number}? This cannot be undone.`)) return;
    try {
      await api.delete(`/work-orders/${wo.id}/`);
      toast.success("Work order deleted");
      fetchOrders();
    } catch (err) {
      toast.error(getApiError(err, "Cannot delete work order"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600">
            <ScrollText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Work Orders</h1>
            <p className="text-muted-foreground">Supply &amp; installation orders issued to suppliers</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
            <Plus className="h-4 w-4" /> New Work Order
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ScrollText className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No work orders yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Create a work order to supply or install new assets.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>WO #</th>
                  <th className={thClass}>Title</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Supplier</th>
                  <th className={thClass}>Total</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Delivery</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((wo) => (
                  <tr key={wo.id} onClick={() => openEdit(wo.id)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-mono text-foreground`}>
                      <span className="inline-flex items-center gap-1">
                        {wo.wo_number}
                        <CopyButton text={wo.wo_number} label="WO #" />
                      </span>
                    </td>
                    <td className={`${tdClass} font-medium text-foreground`}>{wo.title}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{wo.order_type_display ?? label(wo.order_type)}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{wo.supplier_name ?? "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{wo.currency} {Number(wo.total_amount).toLocaleString()}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_STYLES[wo.status] ?? ""}`}>
                        {wo.status_display ?? label(wo.status)}
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{wo.expected_delivery ?? "-"}</td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => handlePrint(wo)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Print PDF">
                          <FileDown className="h-3.5 w-3.5" />
                        </button>
                        {canEdit && (
                          <>
                            <button onClick={() => openEdit(wo.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDelete(wo)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {modalMode === "create" ? "New Work Order" : `Edit ${selected?.wo_number}`}
              </h2>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalMode === "edit" && selected && NEXT_STATUS[selected.status].length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3">
                <span className="text-xs font-medium text-muted-foreground">Advance status:</span>
                {NEXT_STATUS[selected.status].map((s) => (
                  <button key={s} type="button" onClick={() => handleTransition(selected.id, s)}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary">
                    {label(s)}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={labelClass}>Title</label>
                  <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="e.g. Supply & install 3 SMD screens" />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Order Type</label>
                  <select value={form.order_type} onChange={(e) => setForm({ ...form, order_type: e.target.value })} className={inputClass}>
                    {ORDER_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Supplier</label>
                  <select required value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={inputClass}>
                    <option value="">Select supplier…</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Payment Terms</label>
                  <select value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} className={inputClass}>
                    <option value="">—</option>
                    {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>Currency</label>
                    <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>Warranty (months)</label>
                    <input type="number" value={form.warranty_months} onChange={(e) => setForm({ ...form, warranty_months: e.target.value })} className={inputClass} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Order Date</label>
                  <input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Expected Delivery</label>
                  <input type="date" value={form.expected_delivery} onChange={(e) => setForm({ ...form, expected_delivery: e.target.value })} className={inputClass} />
                </div>
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Line Items</label>
                  <button type="button" onClick={addItem} className="text-xs font-medium text-primary">+ Add item</button>
                </div>
                {form.items.map((it, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input value={it.description} onChange={(e) => updateItem(idx, "description", e.target.value)} placeholder="Description" className={`${inputClass} flex-1`} />
                    <input type="number" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", e.target.value)} placeholder="Qty" className={`${rowInputClass} w-20`} />
                    <input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, "unit_price", e.target.value)} placeholder="Unit price" className={`${rowInputClass} w-32`} />
                    <button type="button" onClick={() => removeItem(idx)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <div className="text-right text-sm font-medium text-foreground">Total: {form.currency} {formTotal.toLocaleString()}</div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={labelClass}>Description</label>
                  <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${inputClass} h-auto py-2`} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Terms &amp; Conditions</label>
                  <textarea rows={3} value={form.terms_conditions} onChange={(e) => setForm({ ...form, terms_conditions: e.target.value })} className={`${inputClass} h-auto py-2`} />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Safety Instructions</label>
                  <textarea rows={3} value={form.safety_instructions} onChange={(e) => setForm({ ...form, safety_instructions: e.target.value })} className={`${inputClass} h-auto py-2`} />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Create Work Order" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
