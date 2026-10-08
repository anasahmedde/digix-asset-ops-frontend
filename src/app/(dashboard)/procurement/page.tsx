"use client";

import {ChevronDown, ChevronRight, Download, PackageCheck, Pencil, Plus, ShoppingCart, Trash2, Upload} from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { Requisitions } from "@/components/procurement/requisitions";
import { Modal } from "@/components/ui/modal";
import { FilterBar } from "@/components/ui/filter-bar";
import {
  emptyPoLine, isPoLineEmpty, poLinePayload, poLinesProblem, usePoOptions,
  type PoLine, type PoLineKind,
} from "@/components/procurement/po-line-items";
import {
  PurchaseOrderForm, emptyPoForm, paymentChoiceOf, paymentTermsPayload, useStandardPoTerms,
  type PoFormValues,
} from "@/components/procurement/purchase-order-form";
import { Qty } from "@/components/ui/qty";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import { confirmAction } from "@/components/ui/confirm";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import type { Supplier } from "@/types";

type POStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "ordered"
  | "partially_received"
  | "received"
  | "cancelled";

interface POItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: string;
  asset_type?: string | null;
  device_model?: string | null;
  material_type?: string | null;
  /** What the line is, worked out from what it points at (asset, part, stock row). */
  line_title?: string | null;
  line_detail?: string | null;
  /** Unit of measure of the line (piece, meter, asset…). */
  unit?: string;
  /** What the line was expected to cost, and whether paying over was agreed. */
  reference_unit_price?: string | null;
  reference_label?: string;
  variance_percent?: number | null;
  variance_status?: "not_required" | "pending" | "approved" | "rejected";
  variance_status_display?: string;
  variance_owner_display?: string;
  variance_notes?: string;
  variance_decided_by_name?: string | null;
  /** Set when the line is for a serialized inventory product. */
  inventory_unit_type?: string | null;
  inventory_item?: string | null;
  /** Asset codes when the line buys complete assets (already in the registry). */
  procured_asset_codes?: string[];
  /** The registered asset this line buys, when it buys one. */
  procured_device?: string | null;
  /** Money on the order that is not goods — nothing arrives for it. */
  is_charge?: boolean;
  received_quantity: number;
  line_total: string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier: string;
  supplier_name: string | null;
  /** The supplier's particulars for this order, where they differ from the record. */
  supplier_details?: string;
  status: POStatus;
  currency: string;
  order_date: string | null;
  /** How the supplier is paid, from the Setup catalogue. */
  payment_terms?: string | null;
  payment_terms_name?: string | null;
  payment_terms_note?: string;
  /** The catalogue term, or the terms typed for this deal. */
  payment_terms_display?: string | null;
  expected_delivery: string | null;
  total_amount: string;
  /** True when the API withheld prices for this user's role. */
  prices_hidden?: boolean;
  /** Who the order was raised for, worked out from what its lines point at. */
  raised_for?: { kind: string; label: string; detail: string };
  notes: string;
  /** Terms as typed on this order; `effective_terms` falls back to the standard. */
  terms: string;
  effective_terms: string;
  ordered_by_name: string | null;
  items: POItem[];
  created_at: string;
}

interface Option {
  id: string;
  label: string;
}

// --- Goods receipt (WF-04) types ---

interface ReceiveRow {
  po_item: string;
  description: string;
  serialized: boolean; // asset model or serialized product → one serial per unit
  ordered: number;
  received: number;
  outstanding: number;
  quantity: string;
  batch_number: string;
  serials: string; // textarea raw value, one serial per line
  /** Registry codes of the complete assets this line brings in, if any. */
  asset_codes: string[];
  /** Vendor warranty on a complete asset, in months from receipt (asset lines only). */
  warranty_months: string;
  /** How much of the delivery is being turned away, and why. */
  rejected: string;
  inspection_notes: string;
}

interface CreatedDevice {
  id: string;
  asset_code: string;
  /** The manufacturer's, where there is one. Assets go by their asset code. */
  serial_number: string | null;
}

interface ReceiveResult {
  grn_number: string;
  created_devices: CreatedDevice[];
}

interface ReceiptLine {
  id: string;
  po_item: string | null;
  po_item_description: string | null;
  inventory_item_name: string | null;
  quantity: number;
  batch_number: string;
  serial_numbers: string[] | null;
}

interface GoodsReceipt {
  id: string;
  grn_number: string;
  reference: string;
  notes: string;
  received_by_name: string | null;
  lines: ReceiptLine[];
  created_at: string;
}

type ItemRow = PoLine;

const emptyItem: ItemRow = emptyPoLine;

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
// inputClass minus w-full — for row inputs with explicit widths (w-20/w-32/w-36),
// where the baked-in w-full would win Tailwind's cascade and break the layout.
const rowInputClass = inputClass.replace("w-full ", "");
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const STATUS_BADGES: Record<string, string> = {
  draft: "bg-secondary/500/10 text-muted-foreground ring-gray-500/20",
  pending_approval: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  approved: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  ordered: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20",
  partially_received: "bg-purple-500/10 text-purple-600 ring-purple-500/20",
  received: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-600 ring-red-500/20",
};

// Guarded transitions per current status (mirrors backend VALID_TRANSITIONS).
// Approval places the order, so receiving (approved → partially_received →
// received) follows straight from it, through goods receipts — no button.
const TRANSITIONS: Record<POStatus, Array<{ status: POStatus; label: string }>> = {
  draft: [
    { status: "pending_approval", label: "Submit for Approval" },
    { status: "cancelled", label: "Cancel PO" },
  ],
  pending_approval: [
    { status: "approved", label: "Approve" },
    { status: "draft", label: "Back to Draft" },
    { status: "cancelled", label: "Cancel PO" },
  ],
  approved: [{ status: "cancelled", label: "Cancel PO" }],
  ordered: [{ status: "cancelled", label: "Cancel PO" }],
  partially_received: [{ status: "cancelled", label: "Cancel PO" }],
  received: [],
  cancelled: [],
};

const RECEIVABLE_STATUSES: POStatus[] = ["approved", "ordered", "partially_received"];
const RECEIPT_HISTORY_STATUSES: POStatus[] = ["approved", "ordered", "partially_received", "received"];

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseSerials(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// The receive endpoint raises DRF ValidationErrors keyed "lines[<i>]" (payload
// index), plus top-level keys like "status" / "serial_numbers" / "detail".
// Split them so per-line errors can be pinned to the offending row.
function parseReceiveErrors(err: unknown): { general: string[]; perLine: Record<number, string> } {
  const general: string[] = [];
  const perLine: Record<number, string> = {};
  if (err && typeof err === "object" && "response" in err) {
    const resp = (err as { response?: { status?: number; data?: unknown } }).response;
    if (resp?.status === 403) {
      return { general: ["You do not have permission to perform this action."], perLine };
    }
    const data = resp?.data;
    if (Array.isArray(data)) {
      general.push(data.map(String).join(" "));
    } else if (data && typeof data === "object") {
      for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        const msg = Array.isArray(value) ? value.map(String).join(" ") : String(value);
        const lineMatch = key.match(/^lines\[(\d+)\]$/);
        if (lineMatch) {
          perLine[Number(lineMatch[1])] = msg;
        } else if (key === "detail" || key === "non_field_errors") {
          general.push(msg);
        } else {
          general.push(`${statusLabel(key)}: ${msg}`);
        }
      }
    }
  }
  return { general, perLine };
}

export default function ProcurementPage() {
  const { can } = useUser();
  // The same three signatures the server checks: raising, approving, cancelling.
  const canEdit = can("raise_po");
  const canApprove = can("approve_po");
  const canCancel = can("cancel_po");
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const sort = useSortState();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [deviceModels, setDeviceModels] = useState<Option[]>([]);
  const [materialTypes, setMaterialTypes] = useState<Option[]>([]);
  // The three things an order buys: counted stock, serialised units, and
  // assets registered under Assets that are still to be bought.
  const poOptions = usePoOptions();
  // A draft leaving for approval has to say when the goods are needed by.
  // Asked for right there in the bar, not thrown back as an error.
  const [deliveryAsk, setDeliveryAsk] = useState<{ poId: string; status: POStatus } | null>(null);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);
  const [form, setForm] = useState<PoFormValues>(emptyPoForm);
  const standardTerms = useStandardPoTerms();
  const today = new Date().toLocaleDateString("en-CA");
  const [saving, setSaving] = useState(false);
  const [downloadingPo, setDownloadingPo] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "" });
  const [search, setSearch] = useState("");

  // Receive-against-PO (WF-04) modal state
  const [receivePO, setReceivePO] = useState<PurchaseOrder | null>(null);
  const [receiveRows, setReceiveRows] = useState<ReceiveRow[]>([]);
  const [receiveReference, setReceiveReference] = useState("");
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveSaving, setReceiveSaving] = useState(false);
  const [receiveResult, setReceiveResult] = useState<ReceiveResult | null>(null);
  const [receiveRowErrors, setReceiveRowErrors] = useState<Record<string, string>>({});
  /** Which line's sheet is being read, so only that row says "Reading…". */
  const [readingFor, setReadingFor] = useState<string | null>(null);

  /** Take the serials out of a sheet and drop them into a line's box.
   *
   * The same reader the inventory screen uses: the server does the reading,
   * what comes back fills the box, and it stays correctable by hand. */
  async function readSerialsInto(poItem: string, file: File | null) {
    if (!file) return;
    setReadingFor(poItem);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/inventory/products/read-serials/", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const found: string[] = data.serials ?? [];
      updateReceiveRow(poItem, { serials: found.join("\n") });
      toast.success(
        `${found.length} serial${found.length === 1 ? "" : "s"} read from ${file.name}`,
        { description: (data.notes ?? []).join(" ") || undefined },
      );
    } catch (err) {
      toast.error(getApiError(err, "Could not read that file"));
    } finally {
      setReadingFor(null);
    }
  }
  const [receiveError, setReceiveError] = useState<string | null>(null);

  // Receipts history for the expanded PO
  const [receipts, setReceipts] = useState<GoodsReceipt[] | null>(null);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptsVersion, setReceiptsVersion] = useState(0);

  const [tab, setTab] = useState<"orders" | "requisitions">("orders");
  // A notification lands on the order it is about.
  const params = useSearchParams();
  useEffect(() => {
    const po = params.get("po");
    if (params.get("tab") === "requisitions") setTab("requisitions");
    if (po) { setTab("orders"); setExpandedId(po); }
  }, [params]);

  const fetchOrders = useCallback(async () => {
    try {
      // The list filters and searches on the client, so it needs more than one page.
      const { data } = await api.get("/procurement/purchase-orders/", { params: { page_size: 200 } });
      setOrders(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load purchase orders"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    api.get("/suppliers/", { params: { page_size: 200 } })
      .then((r) => setSuppliers(r.data.results ?? r.data))
      .catch(() => {});
    api.get("/assets/device-models/", { params: { page_size: 200 } })
      .then((r) =>
        setDeviceModels(
          (r.data.results ?? r.data).map((m: { id: string; name: string; brand_name?: string }) => ({
            id: m.id,
            label: m.brand_name ? `${m.brand_name} ${m.name}` : m.name,
          }))
        )
      )
      .catch(() => {});
    api.get("/assets/material-types/", { params: { page_size: 200 } })
      .then((r) =>
        setMaterialTypes(
          (r.data.results ?? r.data).map((m: { id: string; name: string }) => ({ id: m.id, label: m.name }))
        )
      )
      .catch(() => {});
  }, [fetchOrders]);

  // Load goods receipts whenever a PO row is expanded (and after a new GRN).
  useEffect(() => {
    if (!expandedId) {
      setReceipts(null);
      return;
    }
    let cancelled = false;
    setReceiptsLoading(true);
    api.get("/inventory/receipts/", { params: { purchase_order: expandedId, page_size: 100 } })
      .then((r) => {
        if (!cancelled) setReceipts(r.data.results ?? r.data);
      })
      .catch(() => {
        if (!cancelled) setReceipts([]);
      })
      .finally(() => {
        if (!cancelled) setReceiptsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [expandedId, receiptsVersion]);

  function openCreate() {
    setSelected(null);
    setForm({ ...emptyPoForm(standardTerms), items: [{ ...emptyItem }] });
    setModalMode("create");
  }

  /** The order as a PDF, ready to send to the supplier. */
  async function downloadPurchaseOrder(po: PurchaseOrder) {
    setDownloadingPo(po.id);
    try {
      const res = await api.get(`/procurement/purchase-orders/${po.id}/document/`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${po.po_number || "purchase-order"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiError(err, "Could not produce the purchase order"));
    } finally {
      setDownloadingPo(null);
    }
  }

  async function openEdit(id: string) {
    try {
      const { data } = await api.get<PurchaseOrder>(`/procurement/purchase-orders/${id}/`);
      setSelected(data);
      setForm({
        supplier: data.supplier,
        supplier_details: data.supplier_details ?? "",
        currency: data.currency || "PKR",
        payment_choice: paymentChoiceOf(data),
        payment_note: data.payment_terms_note ?? "",
        order_date: data.order_date ?? "",
        expected_delivery: data.expected_delivery ?? "",
        notes: data.notes ?? "",
        terms: data.effective_terms ?? data.terms ?? "",
        items: data.items.length
          ? data.items.map((i) => ({
              id: i.id,
              kind: (i.is_charge
                ? "charge"
                : i.procured_device
                  ? "asset"
                  : i.inventory_unit_type
                    ? "unique"
                    : i.inventory_item
                      ? "generic"
                      : "custom") as PoLineKind,
              inventory_item: i.inventory_item ?? "",
              inventory_unit_type: i.inventory_unit_type ?? "",
              device: i.procured_device ?? "",
              device_model: i.device_model ?? "",
              material_type: i.material_type ?? "",
              description: i.description,
              quantity: String(i.quantity),
              unit_price: String(i.unit_price),
              received_quantity: i.received_quantity ?? 0,
            }))
          : [{ ...emptyItem }],
      });
      setModalMode("edit");
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load purchase order"));
    }
  }

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }


  function itemTypeLabel(item: POItem): string {
    if (item.is_charge) return "Free text";
    if ((item.procured_asset_codes ?? []).length > 0) return "Asset";
    if (item.inventory_unit_type) return "Unique component";
    if (item.inventory_item) return "Generic component";
    if (item.device_model) return deviceModels.find((m) => m.id === item.device_model)?.label ?? "Asset model";
    if (item.material_type) return materialTypes.find((m) => m.id === item.material_type)?.label ?? "Material";
    return "—";
  }


  async function handleSubmit() {
    if (!form.supplier) {
      toast.error("Choose the supplier to buy from");
      return;
    }
    if (!form.expected_delivery) {
      toast.error("Say when the goods are needed by");
      return;
    }
    const problem = poLinesProblem(form.items);
    if (problem) {
      toast.error(problem);
      return;
    }
    const items = form.items.filter((it) => !isPoLineEmpty(it)).map(poLinePayload);
    if (items.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    setSaving(true);
    const payload = {
      supplier: form.supplier,
      supplier_details: form.supplier_details.trim(),
      currency: form.currency,
      ...paymentTermsPayload(form),
      expected_delivery: form.expected_delivery || null,
      notes: form.notes,
      terms: form.terms,
      items,
    };
    try {
      if (modalMode === "create") {
        await api.post("/procurement/purchase-orders/", payload);
        toast.success("Purchase order created");
      } else if (selected) {
        await api.patch(`/procurement/purchase-orders/${selected.id}/`, payload);
        toast.success("Purchase order updated");
      }
      closeModal();
      fetchOrders();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save purchase order"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTransition(po: PurchaseOrder, status: POStatus, expectedDelivery?: string) {
    if (status === "cancelled" && !(await confirmAction(`Cancel PO ${po.po_number}? This cannot be undone.`))) return;
    // Leaving Draft without a delivery date: ask for it, then go.
    const leavingDraft = po.status === "draft" && status !== "draft" && status !== "cancelled";
    if (leavingDraft && !po.expected_delivery && !expectedDelivery) {
      setDeliveryAsk({ poId: po.id, status });
      setDeliveryDate("");
      return;
    }
    try {
      await api.post(`/procurement/purchase-orders/${po.id}/transition/`, {
        status,
        ...(expectedDelivery ? { expected_delivery: expectedDelivery } : {}),
      });
      setDeliveryAsk(null);
      toast.success(`Moved to ${statusLabel(status)}`);
      closeModal();
      fetchOrders();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Status change failed"));
    }
  }

  async function openReceive(id: string) {
    try {
      // Fresh detail fetch so received_quantity/outstanding are current.
      const { data } = await api.get<PurchaseOrder>(`/procurement/purchase-orders/${id}/`);
      closeModal();
      setReceivePO(data);
      setReceiveRows(
        (data.items ?? [])
          .filter((i): i is POItem & { id: string } => Boolean(i.id) && !i.is_charge)
          .map((i) => {
            const received = i.received_quantity ?? 0;
            return {
              po_item: i.id,
              description: i.description,
              // Assets and serialized inventory products both arrive with
              // serial numbers; generic stock does not.
              // Serials belong to parts. A complete asset is identified by
              // the asset code the registry gave it, so nothing is typed here.
              serialized: Boolean(i.device_model || i.inventory_unit_type),
              asset_codes: i.procured_asset_codes ?? [],
              ordered: i.quantity,
              received,
              outstanding: Math.max(i.quantity - received, 0),
              quantity: String(Math.max(i.quantity - received, 0)),
              batch_number: "",
              warranty_months: "",
              serials: "",
              rejected: "0",
              inspection_notes: "",
            };
          })
      );
      setReceiveReference("");
      setReceiveNotes("");
      setReceiveResult(null);
      setReceiveRowErrors({});
      setReceiveError(null);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load purchase order"));
    }
  }

  function closeReceive() {
    setReceivePO(null);
    setReceiveRows([]);
    setReceiveResult(null);
    setReceiveRowErrors({});
    setReceiveError(null);
  }

  function updateReceiveRow(poItem: string, patch: Partial<ReceiveRow>) {
    setReceiveRows((rows) => rows.map((r) => (r.po_item === poItem ? { ...r, ...patch } : r)));
    setReceiveRowErrors((errs) => {
      if (!(poItem in errs)) return errs;
      const next = { ...errs };
      delete next[poItem];
      return next;
    });
  }

  // Client-side blockers per row: over-receiving, or serial count ≠ quantity.
  function receiveRowProblem(r: ReceiveRow): string | null {
    const qty = Number(r.quantity) || 0;
    if (qty <= 0) return null;
    if (qty > r.outstanding) return `Only ${r.outstanding} outstanding on this line.`;
    const rejected = Number(r.rejected) || 0;
    if (rejected > qty) return `Cannot reject ${rejected} of ${qty} delivered.`;
    if (rejected > 0 && !r.inspection_notes.trim()) {
      return "Say what is wrong with the rejected goods.";
    }
    const keeping = qty - rejected;
    if (r.serialized && keeping > 0) {
      const count = parseSerials(r.serials).length;
      if (count !== keeping) {
        return `Enter exactly ${keeping} serial number(s) — the ones being kept — one per line; currently ${count}.`;
      }
    }
    return null;
  }

  const receiveActiveRows = receiveRows.filter((r) => (Number(r.quantity) || 0) > 0);
  const receiveBlocked =
    receiveActiveRows.length === 0 || receiveRows.some((r) => receiveRowProblem(r) !== null);

  async function handleReceiveSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!receivePO || receiveBlocked) return;
    // Payload order matters: the backend keys per-line errors "lines[<i>]".
    const rows = receiveActiveRows;
    const lines = rows.map((r) => ({
      po_item: r.po_item,
      quantity: Number(r.quantity),
      ...(r.batch_number.trim() ? { batch_number: r.batch_number.trim() } : {}),
      ...(r.serialized ? { serial_numbers: parseSerials(r.serials) } : {}),
      ...(r.warranty_months ? { warranty_months: Number(r.warranty_months) } : {}),
      // What was turned away, and why. The rest counts against the order.
      rejected_quantity: Number(r.rejected || 0),
      accepted_quantity: Number(r.quantity) - Number(r.rejected || 0),
      ...(r.inspection_notes.trim() ? { inspection_notes: r.inspection_notes.trim() } : {}),
    }));
    setReceiveSaving(true);
    setReceiveError(null);
    setReceiveRowErrors({});
    try {
      const { data } = await api.post<ReceiveResult>(
        `/procurement/purchase-orders/${receivePO.id}/receive/`,
        {
          reference: receiveReference.trim(),
          notes: receiveNotes.trim(),
          lines,
        }
      );
      setReceiveResult({ grn_number: data.grn_number, created_devices: data.created_devices ?? [] });
      toast.success(`Goods receipt ${data.grn_number} recorded`);
      fetchOrders();
      setReceiptsVersion((v) => v + 1);
    } catch (err: unknown) {
      const { general, perLine } = parseReceiveErrors(err);
      const rowErrs: Record<string, string> = {};
      for (const [idx, msg] of Object.entries(perLine)) {
        const row = rows[Number(idx)];
        if (row) rowErrs[row.po_item] = msg;
        else general.push(msg);
      }
      setReceiveRowErrors(rowErrs);
      const summary =
        general.length > 0
          ? general.join(" ")
          : Object.keys(rowErrs).length > 0
            ? "Fix the highlighted line(s) and try again."
            : getApiError(err, "Failed to record goods receipt");
      setReceiveError(summary);
      toast.error(Object.values(rowErrs)[0] ?? summary);
    } finally {
      setReceiveSaving(false);
    }
  }

  async function handleDelete(po: PurchaseOrder) {
    if (!(await confirmAction(`Delete PO "${po.po_number}"? This cannot be undone.`))) return;
    try {
      await api.delete(`/procurement/purchase-orders/${po.id}/`);
      toast.success("Purchase order deleted");
      fetchOrders();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — purchase order may have linked records"));
    }
  }

  function renderTransitionBar(po: PurchaseOrder) {
    // Each move is offered to whoever holds its signature; the API refuses
    // anyone else, so nobody is shown a button that only yields an error.
    const actions = (TRANSITIONS[po.status] ?? []).filter((a) =>
      a.status === "approved" ? canApprove
      : a.status === "cancelled" ? canCancel
      : a.status === "draft" && po.status === "pending_approval" ? canApprove || canEdit
      : canEdit
    );
    const receivable = RECEIVABLE_STATUSES.includes(po.status) && (canEdit || can("receive_goods"));
    if (actions.length === 0 && !receivable) return null;
    if (actions.length === 0 && !receivable) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3">
        {receivable && (
          <button
            type="button"
            onClick={() => openReceive(po.id)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all"
          >
            <PackageCheck className="h-3.5 w-3.5" /> Inspect delivery
          </button>
        )}
        {actions.length > 0 && (() => {
          // A line priced over plan has to be agreed by the side whose figure
          // it passed before the order can go up for signature. The server
          // refuses it either way; offering the button anyway only invites a
          // click and an error message.
          const unagreed = (po.items ?? []).filter(
            (i) => i.variance_status === "pending" || i.variance_status === "rejected",
          );
          const waitingOn = [...new Set(
            unagreed.map((i) => i.variance_owner_display).filter(Boolean),
          )].join(" and ");
          return (
            <>
              <span className="text-xs font-medium text-muted-foreground">Advance status:</span>
              {actions.map((a) => {
                const blocked = a.status === "pending_approval" && unagreed.length > 0;
                return (
                  <button
                    key={a.status}
                    type="button"
                    disabled={blocked}
                    title={blocked
                      ? `${unagreed.length} line(s) are priced over plan and not yet agreed by ${waitingOn}.`
                      : undefined}
                    onClick={() => handleTransition(po, a.status)}
                    className={`rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-card ${
                      a.status === "cancelled" ? "text-red-400 hover:text-red-400" : "text-foreground"
                    }`}
                  >
                    {a.label}
                  </button>
                );
              })}
              {unagreed.length > 0 && (
                <span className="text-2xs text-amber-600">
                  Waiting on {waitingOn} to agree {unagreed.length === 1 ? "a price" : `${unagreed.length} prices`}
                </span>
              )}
            </>
          );
        })()}
        {deliveryAsk?.poId === po.id && (
          <div className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-2">
            <label htmlFor={`delivery-${po.id}`} className="text-xs font-medium text-foreground">
              Required delivery *
            </label>
            <input
              id={`delivery-${po.id}`}
              type="date"
              autoFocus
              min={today}
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-primary/50 focus:outline-none"
            />
            <button
              type="button"
              disabled={!deliveryDate}
              onClick={() => handleTransition(po, deliveryAsk.status, deliveryDate)}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Set date and continue
            </button>
            <button type="button" onClick={() => setDeliveryAsk(null)} className="text-xs text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600">
            <ShoppingCart className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Procurement</h1>
            <p className="text-muted-foreground">Manage purchase orders and vendor procurement</p>
          </div>
        </div>
        {canEdit && tab === "orders" && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
            <Plus className="h-4 w-4" /> Add Purchase Order
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {([
          { key: "orders", label: "Purchase Orders" },
          { key: "requisitions", label: "Procurement Requests" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "requisitions" && <Requisitions onPoRaised={fetchOrders} />}

      {tab === "orders" && (
      <>
      <FilterBar
        filters={[
          { key: "status", label: "Status", options: Object.keys(STATUS_BADGES).map((s) => ({ value: s, label: statusLabel(s) })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by PO#, supplier..."
      />

      {(() => {
        const filtered = orders.filter((po) => {
          if (filterValues.status && po.status !== filterValues.status) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!po.po_number.toLowerCase().includes(q) && !(po.supplier_name || "").toLowerCase().includes(q) && !(po.ordered_by_name || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No orders found</h3>
          <p className="mt-2 text-sm text-muted-foreground">{orders.length > 0 ? "Try adjusting your filters." : "Create a purchase order to start managing procurement."}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <SortTh sort={sort} k="po_number" className={thClass}>PO Number</SortTh>
                  <SortTh sort={sort} k="for" className={thClass}>For</SortTh>
                  <SortTh sort={sort} k="supplier_name" className={thClass}>Supplier</SortTh>
                  <SortTh sort={sort} k="status" className={thClass}>Status</SortTh>
                  <SortTh sort={sort} k="items" className={thClass}>Items</SortTh>
                  <SortTh sort={sort} k="order_date" className={thClass}>Order Date</SortTh>
                  <SortTh sort={sort} k="expected_delivery" className={thClass}>Required Delivery</SortTh>
                  <SortTh sort={sort} k="total_amount" className={thClass}>Total Amount</SortTh>
                  <SortTh sort={sort} k="ordered_by_name" className={thClass}>Ordered By</SortTh>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortRows(filtered, sort, { for: (po) => po.raised_for?.label, items: (po) => po.items.length }).map((po) => (
                  <Fragment key={po.id}>
                  <tr onClick={() => setExpandedId((cur) => (cur === po.id ? null : po.id))} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-medium text-foreground`}>
                      <span className="inline-flex items-center gap-1.5">
                        {expandedId === po.id ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        {po.po_number}
                      </span>
                    </td>
                    {/* Who the order is for, read off what its lines point at. */}
                    <td className={tdClass}>
                      <span className={po.raised_for?.kind === "unknown" ? "text-muted-foreground" : "text-foreground"}>
                        {po.raised_for?.label ?? "—"}
                      </span>
                      {po.raised_for?.detail && (
                        <span className="block font-mono text-2xs text-muted-foreground">{po.raised_for.detail}</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{po.supplier_name || "-"}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGES[po.status] ?? "bg-secondary/500/10 text-muted-foreground ring-gray-500/20"}`}>
                        {statusLabel(po.status)}
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{po.items?.length ?? 0}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{po.order_date || "-"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{po.expected_delivery || "-"}</td>
                    <td className={`${tdClass} font-medium text-foreground`}>{po.prices_hidden ? <span className="text-xs text-muted-foreground">—</span> : `${po.currency} ${Number(po.total_amount).toLocaleString()}`}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{po.ordered_by_name || "-"}</td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(po.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => handleDelete(po)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === po.id && (
                    <tr className="border-b border-border bg-secondary/20">
                      <td colSpan={10} className="px-5 py-4">
                        <div className="space-y-3">
                          {po.items && po.items.length > 0 ? (
                            <div className="overflow-x-auto rounded-lg border border-border">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-border bg-secondary/40">
                                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Qty</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Unit Price</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Received</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {po.items.map((item, i) => (
                                    <tr key={item.id ?? i} className="border-b border-border last:border-0">
                                      <td className="px-4 py-2 text-foreground">
                                        {item.line_title ?? item.description}
                                        {item.line_detail && <span className="block text-2xs text-muted-foreground">{item.line_detail}</span>}
                                      </td>
                                      <td className="px-4 py-2 text-muted-foreground">{itemTypeLabel(item)}</td>
                                      <td className="px-4 py-2 text-right text-muted-foreground"><Qty value={item.quantity} unit={item.unit} /></td>
                                      <td className="px-4 py-2 text-right text-muted-foreground">
                                        {po.prices_hidden ? "—" : Number(item.unit_price).toLocaleString()}
                                        {/* Over what was planned: who has to agree it,
                                            and whether they have. */}
                                        {!po.prices_hidden && item.variance_status
                                          && item.variance_status !== "not_required" && (
                                          <span className={`mt-0.5 block text-2xs font-medium ${
                                            item.variance_status === "approved" ? "text-emerald-600"
                                            : item.variance_status === "rejected" ? "text-destructive"
                                            : "text-amber-600"
                                          }`}>
                                            {item.variance_percent != null && `+${item.variance_percent}% · `}
                                            {item.variance_status === "pending"
                                              ? `with ${item.variance_owner_display}`
                                              : item.variance_status_display}
                                            {item.variance_decided_by_name
                                              && ` · ${item.variance_decided_by_name}`}
                                          </span>
                                        )}
                                        {item.variance_status === "rejected" && item.variance_notes && (
                                          <span className="block text-2xs text-muted-foreground">
                                            {item.variance_notes}
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-2 text-right text-muted-foreground">{item.received_quantity ?? 0} / {item.quantity}</td>
                                      <td className="px-4 py-2 text-right font-medium text-foreground">
                                        {po.prices_hidden ? "—" : Number(item.line_total ?? Number(item.quantity) * Number(item.unit_price)).toLocaleString()}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot>
                                  <tr className="bg-secondary/30">
                                    <td colSpan={5} className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Grand Total</td>
                                    <td className="px-4 py-2 text-right font-semibold text-foreground">{po.prices_hidden ? "Prices not shown for your role" : `${po.currency} ${Number(po.total_amount).toLocaleString()}`}</td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No line items on this purchase order.</p>
                          )}
                          {/* When the supplier gets paid is part of the
                              order; it prints on the copy they receive. */}
                          <p className="text-sm text-muted-foreground">
                            <span className="font-medium text-foreground">Payment terms:</span>{" "}
                            {po.payment_terms_display ?? "Not set"}
                          </p>
                          {/* Each receipt stamps a line of its own into the
                              notes; a box that collapses newlines ran them
                              all together into one sentence. */}
                          {po.notes && (
                            <p className="whitespace-pre-line text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">Notes:</span> {po.notes}
                            </p>
                          )}
                          <div>
                            <button
                              onClick={() => downloadPurchaseOrder(po)}
                              disabled={downloadingPo === po.id}
                              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                            >
                              <Download className="h-4 w-4" />
                              {downloadingPo === po.id ? "Preparing…" : "Download PO"}
                            </button>
                          </div>
                          {RECEIPT_HISTORY_STATUSES.includes(po.status) && (
                            <div className="rounded-lg border border-border bg-card/60 p-3">
                              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Goods Receipts</h4>
                              {receiptsLoading ? (
                                <p className="mt-2 text-xs text-muted-foreground">Loading receipts…</p>
                              ) : receipts && receipts.length > 0 ? (
                                <ul className="mt-2 space-y-1.5">
                                  {receipts.map((g) => (
                                    <li key={g.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                                      <span className="font-medium text-foreground">{g.grn_number}</span>
                                      <span className="text-xs text-muted-foreground">{new Date(g.created_at).toLocaleDateString()}</span>
                                      {g.reference && <span className="text-xs text-muted-foreground">Ref: {g.reference}</span>}
                                      {g.received_by_name && <span className="text-xs text-muted-foreground">by {g.received_by_name}</span>}
                                      <span className="text-xs text-muted-foreground">
                                        {g.lines.map((l) => `${l.quantity} × ${l.po_item_description ?? l.inventory_item_name ?? "item"}`).join(", ")}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="mt-2 text-xs text-muted-foreground">No goods receipts recorded yet.</p>
                              )}
                            </div>
                          )}
                          {renderTransitionBar(po)}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
      })()}
      </>
      )}

      {modalMode && (
        <Modal open onClose={closeModal} title={modalMode === "create" ? "New Purchase Order" : `Edit ${selected?.po_number}`} size="wide"
          headerExtra={
            modalMode === "edit" && selected ? (
              <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGES[selected.status] ?? ""}`}>
                {statusLabel(selected.status)}
              </span>
            ) : null
          }
        >
            {modalMode === "edit" && selected && <div className="mb-4">{renderTransitionBar(selected)}</div>}

            <PurchaseOrderForm
              value={form}
              onChange={setForm}
              suppliers={suppliers}
              options={poOptions}
              poNumber={modalMode === "edit" ? selected?.po_number : undefined}
              // An older order may already carry a date that has passed;
              // it can be kept, but not moved further back.
              minDelivery={
                modalMode === "edit" && selected?.expected_delivery && selected.expected_delivery < today
                  ? selected.expected_delivery
                  : today
              }
              legacyLabel={(line) =>
                line.device_model
                  ? deviceModels.find((m) => m.id === line.device_model)?.label
                  : materialTypes.find((m) => m.id === line.material_type)?.label
              }
              saving={saving}
              submitLabel={modalMode === "create" ? "Create Order" : "Save Changes"}
              onSubmit={handleSubmit}
              onCancel={closeModal}
            />
          
      </Modal>
      )}

      {receivePO && (
        <Modal open onClose={closeReceive} title={`Inspect delivery — ${receivePO.po_number}`} size="wide"
        headerExtra={<><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGES[receivePO.status] ?? ""}`}>
                  {statusLabel(receivePO.status)}
                </span></>}>
            {receiveResult ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <p className="text-sm font-semibold text-emerald-500">
                    Goods receipt {receiveResult.grn_number} recorded
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {/* Nothing is on a shelf yet: the store counts it in,
                        which is a different person in a different place. */}
                    {receivePO.po_number} is updated with what was accepted. The goods now wait
                    at Inventory › Receiving to be counted into stock.
                  </p>
                </div>
                {receiveResult.created_devices.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Devices created ({receiveResult.created_devices.length})
                    </h3>
                    <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-secondary/40">
                            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Asset Code</th>
                            <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Serial Number</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receiveResult.created_devices.map((d) => (
                            <tr key={d.id} className="border-b border-border last:border-0">
                              <td className="px-4 py-2 font-medium text-foreground">{d.asset_code}</td>
                              <td className="px-4 py-2 text-muted-foreground">{d.serial_number || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeReceive}
                    className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleReceiveSubmit} className="space-y-4">
                {receiveError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                    {receiveError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className={labelClass}>Lines in this delivery</label>
                  {receiveRows.map((r) => {
                    const qty = Number(r.quantity) || 0;
                    // Serials belong to the units going into stock, not to
                    // the ones going back to the supplier.
                    const keeping = Math.max(qty - (Number(r.rejected) || 0), 0);
                    const problem = receiveRowProblem(r);
                    const serverError = receiveRowErrors[r.po_item];
                    const serialCount = parseSerials(r.serials).length;
                    const fullyReceived = r.outstanding === 0;
                    return (
                      <div
                        key={r.po_item}
                        className={`space-y-2 rounded-lg border p-3 ${
                          serverError ? "border-red-500/50" : "border-border"
                        } ${fullyReceived ? "opacity-60" : ""}`}
                      >
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{r.description}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Ordered {r.ordered} · Received {r.received} · Outstanding {r.outstanding}
                              {/* Every line says which kind it is. A line with
                                  no badge used to look like one nobody had got
                                  round to marking. */}
                              {r.asset_codes.length > 0 ? (
                                <span className="ml-2 inline-flex rounded-full bg-indigo-500/10 px-2 py-0.5 text-2xs font-medium text-indigo-400 ring-1 ring-indigo-500/20">
                                  Complete asset
                                </span>
                              ) : r.serialized ? (
                                <span className="ml-2 inline-flex rounded-full bg-indigo-500/10 px-2 py-0.5 text-2xs font-medium text-indigo-400 ring-1 ring-indigo-500/20">
                                  Unique · serial no. required
                                </span>
                              ) : (
                                <span className="ml-2 inline-flex rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium text-muted-foreground ring-1 ring-border">
                                  Generic · no serial no.
                                </span>
                              )}
                            </p>
                          </div>
                          {fullyReceived ? (
                            <span className="text-xs font-medium text-emerald-500">Fully received</span>
                          ) : (
                            <>
                              <div className="w-24 space-y-1">
                                <label className={labelClass}>Qty to receive</label>
                                <input
                                  type="number"
                                  min="0"
                                  max={r.outstanding}
                                  value={r.quantity}
                                  onChange={(e) => updateReceiveRow(r.po_item, { quantity: e.target.value })}
                                  className={inputClass}
                                />
                              </div>
                              <div className="w-24 space-y-1">
                                {/* The delivery is checked against the order
                                    here. What is turned away stays owed, so
                                    the supplier delivers it again. */}
                                <label className={labelClass}>Rejected</label>
                                <input
                                  type="number"
                                  min="0"
                                  max={qty}
                                  value={r.rejected}
                                  onChange={(e) => updateReceiveRow(r.po_item, { rejected: e.target.value })}
                                  className={inputClass}
                                />
                              </div>
                              <div className="w-40 space-y-1">
                                <label className={labelClass}>Batch number</label>
                                <input
                                  value={r.batch_number}
                                  onChange={(e) => updateReceiveRow(r.po_item, { batch_number: e.target.value })}
                                  placeholder="Optional"
                                  className={inputClass}
                                />
                              </div>
                            </>
                          )}
                        </div>
                        {Number(r.rejected || 0) > 0 && (
                          <div className="space-y-1">
                            <label className={labelClass}>What is wrong with the rejected goods? *</label>
                            <input
                              value={r.inspection_notes}
                              onChange={(e) => updateReceiveRow(r.po_item, { inspection_notes: e.target.value })}
                              placeholder="e.g. Three reels cut short of the stated length"
                              className={inputClass}
                            />
                            <p className="text-2xs text-muted-foreground">
                              {r.rejected} of {qty} stays owed on the order — the supplier delivers it again.
                            </p>
                          </div>
                        )}
                        {r.asset_codes.length > 0 && !fullyReceived && qty > 0 && (
                          <div className="space-y-1">
                            <label className={labelClass}>Assets arriving</label>
                            <div className="flex flex-wrap gap-1.5">
                              {r.asset_codes.map((code) => (
                                <span
                                  key={code}
                                  className="rounded-md bg-secondary px-2 py-1 font-mono text-xs text-foreground"
                                >
                                  {code}
                                </span>
                              ))}
                            </div>
                            <label htmlFor={`wty-${r.po_item}`} className={`${labelClass} mt-3 block`}>Vendor warranty (months, from today)</label>
                            <input
                              id={`wty-${r.po_item}`}
                              type="number"
                              min={1}
                              max={120}
                              value={r.warranty_months}
                              onChange={(e) => updateReceiveRow(r.po_item, { warranty_months: e.target.value })}
                              placeholder="Blank = no vendor warranty"
                              className={`${rowInputClass} w-56`}
                            />
                          </div>
                        )}
                        {r.serialized && !fullyReceived && keeping > 0 && (
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <label className={labelClass}>
                                Serial numbers {keeping !== qty && "of the units being kept "}(one per line)
                              </label>
                              <div className="flex items-center gap-3">
                                {/* Two hundred typed by hand is not a job to
                                    give anybody: the list the supplier sent is
                                    read instead, into the same box, still
                                    correctable afterwards. */}
                                <label className="inline-flex cursor-pointer items-center gap-1 text-2xs font-semibold text-primary hover:underline">
                                  <Upload className="h-3 w-3" />
                                  {readingFor === r.po_item ? "Reading…" : "Upload sheet"}
                                  <input
                                    type="file"
                                    accept=".xlsx,.xlsm,.csv,.txt"
                                    className="hidden"
                                    onChange={(e) => {
                                      readSerialsInto(r.po_item, e.target.files?.[0] ?? null);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                                <span className={`text-xs font-medium ${serialCount === keeping ? "text-emerald-500" : "text-amber-500"}`}>
                                  {serialCount} / {keeping}
                                </span>
                              </div>
                            </div>
                            <textarea
                              rows={Math.min(Math.max(keeping, 2), 6)}
                              value={r.serials}
                              onChange={(e) => updateReceiveRow(r.po_item, { serials: e.target.value })}
                              placeholder={"SN-0001\nSN-0002"}
                              className={`${inputClass} h-auto py-2 font-mono text-xs`}
                            />
                              <label htmlFor={`wty-${r.po_item}`} className={`${labelClass} mt-2 block`}>Component warranty (months, from today)</label>
                              <input
                                id={`wty-${r.po_item}`}
                                type="number"
                                min={1}
                                max={120}
                                value={r.warranty_months}
                                onChange={(e) => updateReceiveRow(r.po_item, { warranty_months: e.target.value })}
                                placeholder="Blank = no vendor warranty"
                                className={`${rowInputClass} w-56`}
                              />
                          </div>
                        )}
                        {problem && qty > 0 && <p className="text-xs text-amber-500">{problem}</p>}
                        {serverError && <p className="text-xs text-red-400">{serverError}</p>}
                      </div>
                    );
                  })}
                  {receiveRows.length === 0 && (
                    <p className="text-sm text-muted-foreground">This purchase order has no line items.</p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="receive_reference" className={labelClass}>Reference</label>
                    <input
                      id="receive_reference"
                      value={receiveReference}
                      onChange={(e) => setReceiveReference(e.target.value)}
                      placeholder="Delivery note / invoice no. (optional)"
                      className={inputClass}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="receive_notes" className={labelClass}>Notes</label>
                    <input
                      id="receive_notes"
                      value={receiveNotes}
                      onChange={(e) => setReceiveNotes(e.target.value)}
                      placeholder="Optional"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  {receiveActiveRows.length === 0 && receiveRows.length > 0 && (
                    <span className="mr-auto text-xs text-muted-foreground">
                      Enter a quantity on at least one line to record a receipt.
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={closeReceive}
                    className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={receiveSaving || receiveBlocked}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
                  >
                    <PackageCheck className="h-4 w-4" />
                    {receiveSaving ? "Recording…" : "Record Receipt"}
                  </button>
                </div>
              </form>
            )}
          
      </Modal>
      )}
    </div>
  );
}
