"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

/** The goods received note as a PDF: what arrived, and who received,
 *  inspected and stocked it. Icon only in a table; labelled elsewhere. */
export function GrnDownload({ receiptId, grnNumber, label }: {
  receiptId: string;
  grnNumber?: string | null;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function download(e: React.MouseEvent) {
    // Rows that open on click stay as they are.
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await api.get(`/inventory/receipts/${receiptId}/document/`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${grnNumber || "goods-receipt"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getApiError(err, "Could not produce the goods received note"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      title={`Download ${grnNumber ?? "GRN"}`}
      aria-label={`Download ${grnNumber ?? "GRN"}`}
      className={label
        ? "inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
        : "inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-primary disabled:opacity-50"}
    >
      <Download className={label ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {label && (busy ? "Preparing…" : label)}
    </button>
  );
}
