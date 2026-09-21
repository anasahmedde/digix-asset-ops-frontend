"use client";

import { ChevronDown, ChevronRight, ClipboardCheck, FileDown, Pencil, Plus, ScrollText, Trash2, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { CopyButton } from "@/components/ui/copy-button";
import { Modal } from "@/components/ui/modal";
import { WorkOrderRequests } from "@/components/work-orders/work-order-requests";
import { WorkReceiving } from "@/components/work-orders/work-receiving";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import type { PaymentTerms, Supplier, WorkOrder, WorkOrderItem, WorkOrderStatus } from "@/types";

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
// inputClass minus w-full — for row inputs with explicit widths (w-20/w-32/w-36),
// where the baked-in w-full would win Tailwind's cascade and break the layout.
const rowInputClass = inputClass.replace("w-full ", "");
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-600 ring-slate-500/20",
  pending_approval: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  approved: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  issued: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20",
  in_progress: "bg-cyan-500/10 text-cyan-600 ring-cyan-500/20",
  partially_delivered: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  delivered: "bg-teal-500/10 text-teal-600 ring-teal-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-600 ring-red-500/20",
};

// Guarded transitions per current status (mirrors backend VALID_TRANSITIONS),
// worded like the purchase order bar. Completion happens through Work
// Receiving — the delivered work is inspected — so there is no manual button.
const TRANSITIONS: Record<WorkOrderStatus, Array<{ status: WorkOrderStatus; label: string }>> = {
  draft: [
    { status: "pending_approval", label: "Submit for Approval" },
    { status: "cancelled", label: "Cancel WO" },
  ],
  pending_approval: [
    { status: "approved", label: "Approve" },
    { status: "draft", label: "Back to Draft" },
    { status: "cancelled", label: "Cancel WO" },
  ],
  approved: [
    { status: "issued", label: "Issue to Vendor" },
    { status: "cancelled", label: "Cancel WO" },
  ],
  issued: [
    { status: "in_progress", label: "Work Started" },
    { status: "cancelled", label: "Cancel WO" },
  ],
  in_progress: [
    { status: "delivered", label: "Vendor Delivered" },
    { status: "partially_delivered", label: "Partly Delivered" },
    { status: "cancelled", label: "Cancel WO" },
  ],
  partially_delivered: [
    { status: "delivered", label: "Vendor Delivered" },
    // The vendor can keep sending jobs in until the last one is done.
    { status: "partially_delivered", label: "Partly Delivered" },
    { status: "cancelled", label: "Cancel WO" },
  ],
  delivered: [],
  completed: [],
  cancelled: [],
};
const NEXT_STATUS: Record<WorkOrderStatus, WorkOrderStatus[]> = Object.fromEntries(
  Object.entries(TRANSITIONS).map(([k, v]) => [k, v.map((a) => a.status)]),
) as Record<WorkOrderStatus, WorkOrderStatus[]>;

// A work order is for services a vendor performs for us; goods are bought on
// purchase orders. Older orders keep their type but new ones are services.
const ORDER_TYPES = [
  { value: "services", label: "Services" },
];
const LEGACY_TYPES: Record<string, string> = {
  supply: "Supply / Purchase", installation: "Installation", supply_install: "Supply & Installation", production: "Production Step",
};
// The same sign-off as a purchase order: the Group Head approves, Operations
// move the order everywhere else.
function movesFor(status: WorkOrderStatus, role: string | undefined): WorkOrderStatus[] {
  const all = NEXT_STATUS[status];
  if (role === "group_head") return all.filter((s) => s === "approved" || s === "draft");
  if (role === "super_admin") return all;
  return all.filter((s) => s !== "approved");
}
function labelFor(status: WorkOrderStatus, next: WorkOrderStatus): string {
  return TRANSITIONS[status].find((a) => a.status === next)?.label ?? next;
}
const CURRENCIES = ["PKR", "AED", "SAR", "QAR", "USD", "EUR", "GBP"];

// Where one job on an order stands, in the same colours the order's own status
// uses: out with the vendor, on the receiving desk, or done.
const LINE_STATE_STYLES: Record<string, string> = {
  with_vendor: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  awaiting_inspection: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  accepted: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  rework: "bg-rose-500/10 text-rose-600 ring-rose-500/20",
};

/** Whether the work came in on time, once it has come in. */
function lateness(wo: WorkOrder): string {
  if (!wo.expected_delivery || !wo.delivered_at) return "";
  const due = new Date(`${wo.expected_delivery}T00:00:00`);
  const came = new Date(wo.delivered_at);
  const days = Math.round((came.getTime() - due.getTime()) / 86_400_000);
  if (days > 0) return `${days} day${days === 1 ? "" : "s"} late`;
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} early`;
  return "on the day";
}

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
  title: "", order_type: "services", supplier: "", payment_terms: "",
  currency: "PKR", warranty_months: "", order_date: "", expected_delivery: "",
  description: "", terms_conditions: "", safety_instructions: "",
  items: [{ description: "", quantity: "1", unit_price: "0" }],
};

const label = (s: string) => s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

export default function WorkOrdersPage() {
  const { canWrite, user } = useUser();
  const canEdit = canWrite("setup") || canWrite("procurement");
  const [tab, setTab] = useState<"orders" | "requests" | "receiving">("orders");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, WorkOrder>>({});
  const [downloading, setDownloading] = useState<string | null>(null);
  // The vendor has finished some of the jobs on an order: which ones.
  const [partDelivery, setPartDelivery] = useState<{ wo: WorkOrder; lines: WorkOrderItem[] } | null>(null);
  const [partPicked, setPartPicked] = useState<Set<string>>(new Set());
  const [partSaving, setPartSaving] = useState(false);

  /** The full order — lines, receipt and inspection. */
  async function loadDetail(id: string) {
    try {
      const { data } = await api.get<WorkOrder>(`/work-orders/${id}/`);
      setDetail((d) => ({ ...d, [id]: data }));
    } catch { /* the row still shows its summary */ }
  }

  async function expandRow(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!detail[id]) await loadDetail(id);
  }

  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const receivingCount = orders.filter((o) => o.status === "delivered" || o.status === "partially_delivered").length;
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
      const { data } = await api.post(`/work-orders/${id}/transition/`, { status });
      toast.success(
        status === "delivered" ? `${data.wo_number} delivered — inspect it under Work Receiving`
        : status === "approved" ? `${data.wo_number} approved`
        : `Moved to ${data.status_display ?? label(status)}`,
      );
      closeModal();
      setDetail((d) => ({ ...d, [id]: data }));
      fetchOrders();
    } catch (err) {
      toast.error(getApiError(err, "Status change failed"));
    }
  }

  /** The order as a PDF, the way the vendor receives it. */
  async function handlePrint(wo: WorkOrder) {
    setDownloading(wo.id);
    try {
      const res = await api.get(`/work-orders/${wo.id}/print/`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${wo.wo_number || "work-order"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiError(err, "Could not produce the work order"));
    } finally {
      setDownloading(null);
    }
  }

  /** Part delivery: the vendor names the jobs he has finished. */
  function openPartDelivery(wo: WorkOrder) {
    const lines = detail[wo.id]?.items ?? [];
    setPartDelivery({ wo, lines: lines.filter((i) => i.line_state === "with_vendor") });
    setPartPicked(new Set());
  }

  async function submitPartDelivery() {
    if (!partDelivery || partPicked.size === 0) return;
    setPartSaving(true);
    try {
      const { data } = await api.post(`/work-orders/${partDelivery.wo.id}/transition/`, {
        status: "partially_delivered",
        items: Array.from(partPicked),
      });
      toast.success(
        `${partPicked.size} job${partPicked.size === 1 ? "" : "s"} received on ${data.wo_number} — inspect ${partPicked.size === 1 ? "it" : "them"} under Work Receiving`,
      );
      setPartDelivery(null);
      fetchOrders();
      loadDetail(partDelivery.wo.id);
    } catch (err) {
      toast.error(getApiError(err, "Could not record the delivery"));
    } finally {
      setPartSaving(false);
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
            <p className="text-muted-foreground">Services we take from vendors — workshop operations, installation and repair</p>
          </div>
        </div>
        {canEdit && tab === "orders" && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
            <Plus className="h-4 w-4" /> New Work Order
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          { key: "orders", label: "Work Orders" },
          { key: "requests", label: "Work Requests" },
          { key: "receiving", label: "Work Receiving" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.key === "receiving" && receivingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-2xs font-semibold text-amber-600">{receivingCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "requests" && <WorkOrderRequests onRaised={() => { fetchOrders(); setTab("orders"); }} />}
      {tab === "receiving" && <WorkReceiving onInspected={() => { setDetail({}); fetchOrders(); }} />}

      {tab === "orders" && (loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ScrollText className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No work orders yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">Raise one from Requests, or create one for a service a vendor performs.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={`${thClass} w-8`}></th>
                  <th className={thClass}>WO #</th>
                  <th className={thClass}>Title</th>
                  <th className={thClass}>For</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Vendor</th>
                  <th className={thClass}>Total</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Delivery</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((wo) => (
                  <Fragment key={wo.id}>
                  <tr onClick={() => expandRow(wo.id)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30" aria-expanded={expanded === wo.id}>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {expanded === wo.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap font-mono text-foreground`}>
                      <span className="inline-flex items-center gap-1">
                        {wo.wo_number}
                        <CopyButton text={wo.wo_number} label="WO #" />
                      </span>
                    </td>
                    <td className={`${tdClass} font-medium text-foreground`}>{wo.title}</td>
                    <td className={tdClass}>
                      {wo.project_name ? (
                        <span className="text-foreground">{wo.project_name}</span>
                      ) : (
                        <span className="text-muted-foreground">{wo.client_name ?? "No project"}</span>
                      )}
                      {(wo.asset_codes ?? []).length > 0 && (
                        <span className="block font-mono text-2xs text-muted-foreground">
                          {(wo.asset_codes ?? []).join(" · ")}
                        </span>
                      )}
                      {wo.site_name && <span className="block text-2xs text-muted-foreground">{wo.site_name}</span>}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{wo.order_type_display ?? LEGACY_TYPES[wo.order_type] ?? label(wo.order_type)}</td>
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
                  {expanded === wo.id && (
                    <tr className="border-b border-border bg-secondary/20">
                      <td colSpan={10} className="px-6 py-4">
                        {(() => {
                          const d = detail[wo.id];
                          const lines = d?.items ?? [];
                          // Nothing is "partly" about a single job, and there
                          // has to be more than one still out for it to apply.
                          const canSplit = lines.length > 1 && lines.filter((i) => i.line_state === "with_vendor").length > 1;
                          const moves = movesFor(wo.status, user?.role).filter(
                            (m) => m !== "partially_delivered" || canSplit,
                          );
                          return (
                            <div className="space-y-4">
                              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4 text-sm">
                                <div><p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Vendor</p><p className="mt-0.5 text-foreground">{wo.supplier_name ?? "—"}</p></div>
                                <div><p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Project</p><p className="mt-0.5 text-foreground">{wo.project_name ?? "—"}</p></div>
                                <div><p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Order date</p><p className="mt-0.5 text-foreground">{d?.order_date ?? "Set when the Group Head approves"}</p></div>
                                <div><p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Approved by</p><p className="mt-0.5 text-foreground">{d?.approved_by_name ?? "—"}</p></div>
                                <div>
                                  <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Work received</p>
                                  <p className="mt-0.5 text-foreground">{wo.delivered_at ? new Date(wo.delivered_at).toLocaleString() : "—"}</p>
                                  <p className="text-2xs text-muted-foreground">
                                    {wo.expected_delivery
                                      ? <>due {wo.expected_delivery}{lateness(wo) ? ` · ${lateness(wo)}` : ""}</>
                                      : "no date agreed"}
                                  </p>
                                </div>
                                <div className="sm:col-span-2 lg:col-span-3">
                                  <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Inspection</p>
                                  <p className="mt-0.5 text-foreground">
                                    {wo.inspection_result
                                      ? <>{wo.inspection_result_display}{wo.inspected_by_name ? ` by ${wo.inspected_by_name}` : ""}{wo.inspected_at ? ` on ${new Date(wo.inspected_at).toLocaleString()}` : ""}</>
                                      : wo.status === "delivered" || wo.status === "partially_delivered" ? "Awaiting inspection — Work Receiving" : "—"}
                                  </p>
                                  {wo.inspection_notes && <p className="mt-1 whitespace-pre-line text-2xs text-muted-foreground">{wo.inspection_notes}</p>}
                                </div>
                              </div>
                              {d && lines.length > 0 && (
                                <div className="overflow-hidden rounded-lg border border-border bg-card">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                                        <th className="px-3 py-2 font-medium">Job</th>
                                        <th className="px-3 py-2 font-medium">Where it stands</th>
                                        <th className="px-3 py-2 font-medium">Received</th>
                                        <th className="px-3 py-2 font-medium">Inspected</th>
                                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                                        <th className="px-3 py-2 text-right font-medium">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lines.map((i, n) => (
                                        <tr key={i.id ?? n} className="border-b border-border/60 align-top last:border-0">
                                          <td className="px-3 py-1.5 text-foreground">
                                            {i.description}
                                            {i.asset_code && <span className="ml-1.5 font-mono text-2xs text-muted-foreground">{i.asset_code}</span>}
                                          </td>
                                          <td className="px-3 py-1.5">
                                            <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${LINE_STATE_STYLES[i.line_state ?? "with_vendor"]}`}>
                                              {i.line_state_display ?? "With the vendor"}
                                            </span>
                                          </td>
                                          <td className="px-3 py-1.5 text-muted-foreground">
                                            {i.delivered_at ? new Date(i.delivered_at).toLocaleString() : "—"}
                                          </td>
                                          <td className="px-3 py-1.5 text-muted-foreground">
                                            {i.inspected_at
                                              ? <>{i.inspected_by_name ?? "—"}<span className="block text-2xs">{new Date(i.inspected_at).toLocaleString()}</span></>
                                              : "—"}
                                            {i.inspection_notes && (
                                              <span className="mt-0.5 block whitespace-pre-line text-2xs text-muted-foreground">{i.inspection_notes}</span>
                                            )}
                                          </td>
                                          <td className="px-3 py-1.5 text-right text-muted-foreground">{i.quantity}</td>
                                          <td className="px-3 py-1.5 text-right text-foreground">{Number(i.unit_price).toLocaleString()}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {/* Where the purchase order keeps its download. */}
                              <div>
                                <button
                                  onClick={() => handlePrint(wo)}
                                  disabled={downloading === wo.id}
                                  className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                                >
                                  <FileDown className="h-4 w-4" />
                                  {downloading === wo.id ? "Preparing…" : "Download WO"}
                                </button>
                              </div>
                              {canEdit && (moves.length > 0 || wo.status === "delivered" || wo.status === "partially_delivered" || wo.status === "pending_approval") && (
                                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3">
                                  {(wo.status === "delivered" || wo.status === "partially_delivered") && (
                                    <button type="button" onClick={() => setTab("receiving")} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all">
                                      <ClipboardCheck className="h-3.5 w-3.5" /> Inspect work
                                    </button>
                                  )}
                                  {moves.length > 0 && <span className="text-xs font-medium text-muted-foreground">Advance status:</span>}
                                  {wo.status === "pending_approval" && user?.role !== "group_head" && user?.role !== "super_admin" && (
                                    <span className="text-2xs text-muted-foreground">Waiting for the Group Head to approve.</span>
                                  )}
                                  {moves.map((m) => (
                                    <button key={m} type="button"
                                      onClick={() => (m === "partially_delivered" ? openPartDelivery(wo) : handleTransition(wo.id, m))}
                                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${m === "cancelled" ? "border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive" : m === "approved" ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20" : "border-border bg-card text-foreground hover:bg-secondary"}`}>
                                      {labelFor(wo.status, m)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {modalMode === "create" ? "New Work Order" : `Edit ${selected?.wo_number}`}
              </h2>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalMode === "edit" && selected && movesFor(selected.status, user?.role).length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3">
                <span className="text-xs font-medium text-muted-foreground">Advance status:</span>
                {selected.status === "pending_approval" && user?.role !== "group_head" && user?.role !== "super_admin" && (
                  <span className="text-2xs text-muted-foreground">Waiting for the Group Head to approve.</span>
                )}
                {movesFor(selected.status, user?.role).map((s) => (
                  <button key={s} type="button" onClick={() => handleTransition(selected.id, s)}
                    className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary">
                    {labelFor(selected.status, s)}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={labelClass}>Title</label>
                  <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="e.g. Painting and powder coating — 4 kiosk frames" />
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Order Type</label>
                  <select value={form.order_type} onChange={(e) => setForm({ ...form, order_type: e.target.value })} className={inputClass}>
                    {ORDER_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    {form.order_type !== "services" && LEGACY_TYPES[form.order_type] && (
                      <option value={form.order_type}>{LEGACY_TYPES[form.order_type]} (older order)</option>
                    )}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>Vendor</label>
                  <select required value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className={inputClass}>
                    <option value="">Select vendor…</option>
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
                  <label className={labelClass}>Required Delivery</label>
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
                    <input type="number" step="0.01" value={it.unit_price} onChange={(e) => updateItem(idx, "unit_price", e.target.value)} placeholder="Unit price" className={`${rowInputClass} w-32`} />
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

      {/* Which jobs the vendor has finished. Only the ones still with him can
          be named, and naming them all is simply a whole delivery. */}
      {partDelivery && (
        <Modal
          open
          onClose={() => setPartDelivery(null)}
          title={`What has come in on ${partDelivery.wo.wo_number}?`}
          size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tick the jobs {partDelivery.wo.supplier_name ?? "the vendor"} has finished. They go to Work
              Receiving to be inspected; the rest stay with him and follow the same way in.
            </p>
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {partDelivery.lines.map((line) => (
                <label key={line.id} className="flex cursor-pointer items-start gap-3 p-3 hover:bg-secondary/40">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                    checked={partPicked.has(line.id as string)}
                    onChange={(e) => setPartPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(line.id as string); else next.delete(line.id as string);
                      return next;
                    })}
                  />
                  <span className="text-sm">
                    <span className="font-medium text-foreground">{line.description}</span>
                    {line.asset_code && <span className="ml-1.5 font-mono text-2xs text-muted-foreground">{line.asset_code}</span>}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPartDelivery(null)}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPartDelivery}
                disabled={partSaving || partPicked.size === 0}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
              >
                {partSaving ? "Recording…" : `Received ${partPicked.size || ""}`.trim()}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
