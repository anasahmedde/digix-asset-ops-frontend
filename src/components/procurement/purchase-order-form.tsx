"use client";

import { type ReactNode, useEffect, useState } from "react";

import { PoLineItems, poLineTotal, type PoLine, type PoOptions } from "@/components/procurement/po-line-items";
import api from "@/lib/api";
import { CURRENCIES } from "@/lib/currency";

/**
 * The purchase order window.
 *
 * A new order and one raised from procurement requests are the same document,
 * so they are the same window. The only difference is that a raised order
 * arrives with its requested lines and delivery date already filled in.
 */

const OTHER = "__other__";

export interface PoFormValues {
  supplier: string;
  /** The supplier's particulars for this order, where they differ from the record. */
  supplier_details: string;
  currency: string;
  /** A catalogue term's id, "__other__" for terms typed in the box, or blank. */
  payment_choice: string;
  payment_note: string;
  /** Read only: stamped when the Group Head approves. */
  order_date: string;
  expected_delivery: string;
  notes: string;
  terms: string;
  items: PoLine[];
}

export const emptyPoForm = (terms = ""): PoFormValues => ({
  supplier: "",
  supplier_details: "",
  currency: "PKR",
  payment_choice: "",
  payment_note: "",
  order_date: "",
  expected_delivery: "",
  notes: "",
  terms,
  items: [],
});

/** The house standard terms. A new order opens with them, ready to edit. */
export function useStandardPoTerms(): string {
  const [terms, setTerms] = useState("");
  useEffect(() => {
    api.get("/procurement/purchase-orders/default-terms/")
      .then((r) => setTerms(r.data.terms ?? ""))
      .catch(() => {});
  }, []);
  return terms;
}

/** The picker's value for an order as saved. */
export const paymentChoiceOf = (o: { payment_terms?: string | null; payment_terms_note?: string | null }) =>
  o.payment_terms ?? (o.payment_terms_note ? OTHER : "");

/** The payment fields as the API stores them. */
export const paymentTermsPayload = (v: PoFormValues) => ({
  payment_terms: v.payment_choice === OTHER ? null : v.payment_choice || null,
  payment_terms_note: v.payment_choice === OTHER ? v.payment_note.trim() : "",
});

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";

interface Props {
  value: PoFormValues;
  onChange: (value: PoFormValues) => void;
  suppliers: { id: string; name: string }[];
  options: PoOptions;
  /** Shown in the PO Number box once the order has one. */
  poNumber?: string;
  /** The earliest delivery date accepted. */
  minDelivery: string;
  deliveryHint?: ReactNode;
  /** What a raised order brings from its requests, above the lines typed here. */
  requestedLines?: ReactNode;
  requestedTotal?: number;
  legacyLabel?: (line: PoLine) => string | undefined;
  saving: boolean;
  submitLabel: string;
  canSubmit?: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function PurchaseOrderForm({
  value, onChange, suppliers, options, poNumber, minDelivery, deliveryHint, requestedLines,
  requestedTotal = 0, legacyLabel, saving, submitLabel, canSubmit = true, onSubmit, onCancel,
}: Props) {
  const set = (changes: Partial<PoFormValues>) => onChange({ ...value, ...changes });
  const [showSupplierDetails, setShowSupplierDetails] = useState(Boolean(value.supplier_details));
  const [termOptions, setTermOptions] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api.get("/setup/payment-terms/", { params: { is_active: true } })
      .then((r) => setTermOptions(r.data.results ?? r.data))
      .catch(() => {});
  }, []);

  const total = requestedTotal + value.items.reduce((sum, l) => sum + poLineTotal(l), 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className={labelClass}>PO Number</label>
          <div className={`${inputClass} items-center bg-secondary/30 text-muted-foreground`}>
            {poNumber ?? "Auto-generated on save"}
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="po_supplier" className={labelClass}>Supplier *</label>
          <select id="po_supplier" required value={value.supplier} onChange={(e) => set({ supplier: e.target.value })} className={inputClass}>
            <option value="">Select supplier…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {/* A contact, a quote reference, a delivery address for this
              order — printed under the supplier on the PO. */}
          {showSupplierDetails ? (
            <textarea
              id="po_supplier_details"
              rows={2}
              value={value.supplier_details}
              onChange={(e) => set({ supplier_details: e.target.value })}
              placeholder="Contact, quote reference, delivery address for this order"
              className={`${inputClass} h-auto py-2`}
            />
          ) : (
            <button type="button" onClick={() => setShowSupplierDetails(true)} className="text-xs font-medium text-primary">
              + Supplier details for this order
            </button>
          )}
        </div>
        <div className="space-y-1.5">
          <label htmlFor="po_currency" className={labelClass}>Currency</label>
          <select id="po_currency" value={value.currency} onChange={(e) => set({ currency: e.target.value })} className={inputClass}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="po_payment_terms" className={labelClass}>Payment Terms *</label>
          <select
            id="po_payment_terms"
            required
            value={value.payment_choice}
            onChange={(e) => set({ payment_choice: e.target.value })}
            className={inputClass}
          >
            <option value="">Select payment terms…</option>
            {termOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            <option value={OTHER}>Other — type the terms…</option>
          </select>
          {value.payment_choice === OTHER && (
            <input
              id="po_payment_note"
              value={value.payment_note}
              onChange={(e) => set({ payment_note: e.target.value })}
              required
              maxLength={200}
              placeholder="e.g. 30% on order, balance on commissioning"
              className={inputClass}
              autoFocus
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelClass}>Order Date</label>
            <p className={`${inputClass} items-center bg-secondary/30 text-muted-foreground`}>
              {value.order_date || "On approval"}
            </p>
            {!value.order_date && (
              <p className="text-2xs text-muted-foreground">Stamped when the Group Head signs it off.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="po_delivery" className={labelClass}>Required Delivery *</label>
            {/* A supplier cannot be held to a date that has gone. */}
            <input
              id="po_delivery"
              type="date"
              required
              min={minDelivery}
              value={value.expected_delivery}
              onChange={(e) => set({ expected_delivery: e.target.value })}
              className={inputClass}
            />
            {value.expected_delivery && value.expected_delivery < minDelivery && (
              <p className="text-2xs font-medium text-destructive">
                That date has passed — set one the supplier can still meet.
              </p>
            )}
          </div>
        </div>
      </div>
      {deliveryHint && <p className="text-2xs text-muted-foreground">{deliveryHint}</p>}

      {requestedLines}

      <PoLineItems
        lines={value.items}
        onChange={(items) => set({ items })}
        currency={value.currency}
        options={options}
        legacyLabel={legacyLabel}
        label={requestedLines ? "Additional Line Items" : "Line Items *"}
      />

      <div className="text-right text-sm font-medium text-foreground">
        Grand Total: {value.currency} {total.toLocaleString()}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="po_notes" className={labelClass}>Notes</label>
        <textarea
          id="po_notes"
          rows={3}
          value={value.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Anything the supplier or approver should know"
          className={`${inputClass} h-auto py-2`}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="po_terms" className={labelClass}>Terms &amp; Conditions</label>
        <textarea
          id="po_terms"
          rows={11}
          value={value.terms}
          onChange={(e) => set({ terms: e.target.value })}
          className={`${inputClass} h-auto py-2 font-mono text-xs leading-relaxed`}
        />
        <p className="text-xs text-muted-foreground">
          Starts from the house standard. Edit for a deal agreed on different terms.
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !canSubmit}
          className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
