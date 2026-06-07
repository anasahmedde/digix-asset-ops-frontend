"use client";

import { Download, FileText, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/utils";

interface Doc {
  id: string;
  title: string;
  doc_type: string;
  file: string;
  file_size: number;
  description: string;
  device_code: string | null;
  site_name: string | null;
  project_name: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}

const typeIcons: Record<string, string> = {
  report: "text-blue-500",
  specification: "text-purple-500",
  drawing: "text-amber-500",
  manual: "text-emerald-500",
  contract: "text-cyan-500",
  invoice: "text-red-500",
  photo: "text-pink-500",
  other: "text-muted-foreground",
};

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ doc_type: "" });
  const [search, setSearch] = useState("");

  const fetchDocs = useCallback(async () => {
    try {
      const { data } = await api.get("/infrastructure/documents/", { params: { page_size: 100, ordering: "-created_at" } });
      setDocs(data.results ?? []);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load documents"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const filtered = docs.filter((d) => {
    if (filterValues.doc_type && d.doc_type !== filterValues.doc_type) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.title.toLowerCase().includes(q) && !(d.description || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <FileText className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Documents</h1>
            <p className="text-sm text-muted-foreground">Manage all project and asset documents</p>
          </div>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <Upload className="h-4 w-4" /> Upload Document
        </button>
      </div>

      <FilterBar
        filters={[
          {
            key: "doc_type", label: "Type",
            options: ["report", "specification", "drawing", "manual", "contract", "invoice", "photo", "other"].map((t) => ({
              value: t, label: t.charAt(0).toUpperCase() + t.slice(1),
            })),
          },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search documents..."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No documents</h3>
          <p className="mt-2 text-sm text-muted-foreground">Upload documents to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((doc) => (
            <div key={doc.id} className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3 mb-3">
                <FileText className={`h-8 w-8 shrink-0 ${typeIcons[doc.doc_type] || "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{doc.doc_type.replace(/_/g, " ")}</p>
                </div>
              </div>
              {doc.description && (
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{doc.description}</p>
              )}
              <div className="space-y-1 text-[10px] text-muted-foreground">
                {doc.device_code && <p>Device: {doc.device_code}</p>}
                {doc.site_name && <p>Site: {doc.site_name}</p>}
                {doc.project_name && <p>Project: {doc.project_name}</p>}
                <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
                  <span>{formatSize(doc.file_size)}</span>
                  <span>{formatDateTime(doc.created_at)}</span>
                </div>
              </div>
              <a
                href={doc.file}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Download className="h-3 w-3" /> Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
