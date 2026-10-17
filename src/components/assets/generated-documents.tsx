"use client";

import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDate } from "@/lib/utils";

/** A document the system produced for the asset: printed fresh on download. */
export interface GeneratedDocument {
  kind: "purchase_order" | "goods_receipt" | "work_order" | "issue_slip" | "handover";
  title: string;
  detail: string;
  at: string;
  url: string;
  filename: string;
}

const TINT: Record<GeneratedDocument["kind"], string> = {
  purchase_order: "bg-violet-500/10 text-violet-500",
  goods_receipt: "bg-emerald-500/10 text-emerald-600",
  work_order: "bg-amber-500/10 text-amber-600",
  issue_slip: "bg-sky-500/10 text-sky-600",
  handover: "bg-primary/10 text-primary",
};

/** The PO that bought it, its GRNs, work orders, issue slips, handover - in order. */
export function GeneratedDocuments({ docs }: { docs: GeneratedDocument[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (docs.length === 0) return null;

  async function download(doc: GeneratedDocument) {
    setBusy(doc.url);
    try {
      const res = await api.get(doc.url, { responseType: "blob" });
      const href = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = doc.filename;
      a.click();
      URL.revokeObjectURL(href);
    } catch (err) {
      toast.error(getApiError(err, `Could not produce ${doc.title}`));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        From the system · printed on download
      </p>
      {docs.map((doc) => (
        <div key={doc.url} className="flex items-center gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-secondary/30">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TINT[doc.kind]}`}>
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{doc.title}</p>
            <p className="text-2xs text-muted-foreground">{doc.detail} · {formatDate(doc.at)}</p>
          </div>
          <button
            type="button"
            onClick={() => download(doc)}
            disabled={busy === doc.url}
            title={`Download ${doc.title}`}
            aria-label={`Download ${doc.title}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
