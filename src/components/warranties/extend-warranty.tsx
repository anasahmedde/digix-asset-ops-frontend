"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDate } from "@/lib/utils";

/**
 * Extend any warranty: the client's, the vendor's on an asset, or the
 * vendor's on a part. Same warranty, later expiry, the change on record.
 */
export interface ExtendTarget {
  /** Where the extension is posted. */
  endpoint: string;
  /** What is covered: an asset code or a part's serial. */
  label: string;
  kind: "Client" | "Vendor" | "Component";
  currentEnd: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";

export function ExtendWarranty({
  target, onClose, onDone,
}: {
  target: ExtendTarget | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target) return;
    const fd = new FormData(e.currentTarget);
    const endDate = String(fd.get("end_date") || "");
    const months = String(fd.get("months") || "");
    if (!endDate && !months) {
      toast.error("Give the months to add, or the new expiry date.");
      return;
    }
    setSaving(true);
    try {
      await api.post(target.endpoint, {
        ...(endDate ? { end_date: endDate } : { months: Number(months) }),
        reference_number: String(fd.get("reference_number") || ""),
        notes: String(fd.get("notes") || ""),
      });
      toast.success("Warranty extended");
      onClose();
      onDone();
    } catch (err) {
      toast.error(getApiError(err, "Could not extend the warranty"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!target} onClose={onClose} title={target ? `Extend warranty — ${target.label}` : "Extend warranty"}>
      {target && (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-secondary/30 p-3 text-xs">
            <div>
              <p className="text-muted-foreground">Warranty</p>
              <p className="font-medium text-foreground">{target.kind}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Valid till</p>
              <p className="font-medium text-foreground">{formatDate(target.currentEnd)}</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="ext-months" className={labelClass}>Extend by (months)</label>
              <input id="ext-months" name="months" type="number" min={1} placeholder="e.g. 12" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ext-end" className={labelClass}>…or new expiry date</label>
              <input id="ext-end" name="end_date" type="date" min={target.currentEnd} className={inputClass} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ext-ref" className={labelClass}>
              {target.kind === "Client" ? "Reference (approval, letter)" : "Vendor reference"}
            </label>
            <input
              id="ext-ref"
              name="reference_number"
              placeholder={target.kind === "Client" ? "e.g. goodwill approval email" : "Extension certificate / email ref"}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ext-notes" className={labelClass}>Notes</label>
            <textarea id="ext-notes" name="notes" rows={2} placeholder="What the extension covers" className={`${inputClass} h-auto py-2`} />
          </div>
          <p className="text-2xs text-muted-foreground">
            The warranty keeps its start date and its history — each extension is written onto it.
          </p>
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
              {saving ? "Saving…" : "Extend Warranty"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
