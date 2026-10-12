"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { getApiError } from "@/lib/api-error";

/**
 * One edit dialog for the three warranties.
 *
 * What a warranty is about — the asset or part, who holds it, where it is,
 * which vendor gave it — is read from the work and shown, not typed. What
 * can change is the end date (the vendor extended it), the vendor's own
 * certificate number, and the notes; a client or vendor warranty can also
 * be voided.
 */
export interface Fact {
  label: string;
  value: React.ReactNode;
  /** Shown under the value in small print. */
  note?: string;
  mono?: boolean;
  /** Takes the whole row: a location or an asset name is not cut short. */
  wide?: boolean;
}

/** An asset or part named by its code, with its name beside it. */
export function Coded({ code, name }: { code: string | null | undefined; name?: string | null }) {
  return (
    <>
      <span className="font-mono text-xs text-primary">{code || "—"}</span>
      {name && <span className="text-foreground"> — {name}</span>}
    </>
  );
}

export interface WarrantyEditPayload {
  end_date: string;
  status?: string;
  vendor_reference?: string;
  coverage_details?: string;
  notes?: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";

/** The day after a YYYY-MM-DD date: the earliest a warranty can end. */
function dayAfter(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d + 1).toLocaleDateString("en-CA");
}

export function WarrantyEdit({
  title, facts, startDate, startNote, endDate, endNote, status, vendorReference, coverage, notes, onSave, onClose,
}: {
  title: string;
  facts: Fact[];
  startDate: string | null;
  /** Where the start comes from — activation, or the delivery inspection. */
  startNote: string;
  endDate: string;
  /** When the end date may move; the vendor extending it, unless said otherwise. */
  endNote?: string;
  /** Present for a client or vendor warranty; a part's cover is not voided. */
  status?: string;
  /** Present when the vendor's own certificate number is kept. */
  vendorReference?: string | null;
  /** Present when the warranty records what it covers. */
  coverage?: string | null;
  notes?: string | null;
  onSave: (payload: WarrantyEditPayload) => Promise<void>;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload: WarrantyEditPayload = { end_date: String(fd.get("end_date") || "") };
    if (status !== undefined) payload.status = String(fd.get("status") || "active");
    if (vendorReference !== undefined) payload.vendor_reference = String(fd.get("vendor_reference") || "");
    if (coverage !== undefined) payload.coverage_details = String(fd.get("coverage_details") || "");
    if (notes !== undefined) payload.notes = String(fd.get("notes") || "");
    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } catch (err) {
      toast.error(getApiError(err, "Could not save the warranty"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title} size="md">
      <form onSubmit={submit} className="space-y-5">
        {/* What it is about: read from the work, never typed here. */}
        <dl className="grid gap-x-4 gap-y-3 rounded-lg border border-border bg-secondary/30 p-3 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className={`min-w-0 ${f.wide ? "sm:col-span-2" : ""}`}>
              <dt className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{f.label}</dt>
              <dd className={`break-words text-sm leading-snug text-foreground ${f.mono ? "font-mono text-xs" : ""}`}>
                {f.value || "—"}
              </dd>
              {f.note && <dd className="text-2xs text-muted-foreground">{f.note}</dd>}
            </div>
          ))}
        </dl>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="we-start" className={labelClass}>Start Date</label>
            <input
              id="we-start"
              type="date"
              disabled
              readOnly
              value={startDate ?? ""}
              className={`${inputClass} bg-secondary/40 text-muted-foreground`}
            />
            <p className="text-2xs text-muted-foreground">{startNote}</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="we-end" className={labelClass}>End Date</label>
            <input
              id="we-end"
              name="end_date"
              type="date"
              required
              min={dayAfter(startDate)}
              defaultValue={endDate}
              className={inputClass}
            />
            <p className="text-2xs text-muted-foreground">{endNote ?? "Move it only when the vendor extends the cover; the term follows."}</p>
          </div>
        </div>

        {(status !== undefined || vendorReference !== undefined) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {status !== undefined && (
              <div className="space-y-1.5">
                <label htmlFor="we-status" className={labelClass}>Status</label>
                <select id="we-status" name="status" defaultValue={status === "void" ? "void" : "active"} className={inputClass}>
                  <option value="active">Valid</option>
                  <option value="void">Void</option>
                </select>
                <p className="text-2xs text-muted-foreground">Active, Expired and Pending are read from the dates and the asset.</p>
              </div>
            )}
            {vendorReference !== undefined && (
              <div className="space-y-1.5">
                <label htmlFor="we-vref" className={labelClass}>Vendor reference</label>
                <input
                  id="we-vref"
                  name="vendor_reference"
                  defaultValue={vendorReference ?? ""}
                  placeholder="Vendor's warranty certificate no."
                  className={inputClass}
                />
              </div>
            )}
          </div>
        )}

        {coverage !== undefined && (
          <div className="space-y-1.5">
            <label htmlFor="we-cover" className={labelClass}>Coverage Details</label>
            <textarea
              id="we-cover"
              name="coverage_details"
              rows={2}
              defaultValue={coverage ?? ""}
              placeholder="Describe what the warranty covers"
              className={`${inputClass} h-auto py-2`}
            />
          </div>
        )}
        {notes !== undefined && (
          <div className="space-y-1.5">
            <label htmlFor="we-notes" className={labelClass}>Notes</label>
            <textarea id="we-notes" name="notes" rows={2} defaultValue={notes ?? ""} className={`${inputClass} h-auto py-2`} />
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
