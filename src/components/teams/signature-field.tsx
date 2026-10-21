"use client";

import { PenLine, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

/** The signature printed above this person's name on the documents they
 *  sign - PO and work order approvals, GRNs, issue slips, budgets, handovers. */
export function SignatureField({ userId, url, onChanged, mine = false }: {
  userId: string;
  url: string | null | undefined;
  onChanged: (url: string | null) => void;
  mine?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Keep the image under 2 MB");
      return;
    }
    const form = new FormData();
    form.append("signature", file);
    setBusy(true);
    try {
      const { data } = await api.post(`/accounts/users/${userId}/signature/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChanged(data.signature ?? null);
      toast.success("Signature saved - it now prints on the documents signed");
    } catch (err) {
      toast.error(getApiError(err, "Could not save the signature"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.delete(`/accounts/users/${userId}/signature/`);
      onChanged(null);
      toast.success("Signature removed");
    } catch (err) {
      toast.error(getApiError(err, "Could not remove the signature"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center gap-2">
        <PenLine className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium text-foreground">Signature</p>
      </div>
      <p className="text-2xs text-muted-foreground">
        Printed above {mine ? "your" : "their"} name on the documents {mine ? "you sign" : "they sign"}: approvals on purchase and
        work orders, GRNs, issue slips, budgets and handovers. A PNG with a clear background prints best.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-48 items-center justify-center rounded-lg border border-dashed border-border bg-white">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="Signature" className="max-h-14 max-w-[11rem] object-contain" />
          ) : (
            <span className="text-2xs text-muted-foreground">No signature yet</span>
          )}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
          aria-label="Signature image"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
        <button type="button" onClick={() => input.current?.click()} disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-50">
          <Upload className="h-3.5 w-3.5" /> {url ? "Replace" : "Upload"}
        </button>
        {url && (
          <button type="button" onClick={remove} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>
    </div>
  );
}
