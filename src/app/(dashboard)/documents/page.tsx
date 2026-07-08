"use client";

import { Download, FileText, Upload, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
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
  ticket_title: string | null;
  work_order_number: string | null;
  uploaded_by_name: string | null;
  created_at: string;
}
interface Ref { id: string; label: string }

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";

const typeIcons: Record<string, string> = {
  report: "text-blue-500", specification: "text-purple-500", drawing: "text-amber-500",
  manual: "text-emerald-500", contract: "text-cyan-500", invoice: "text-red-500",
  photo: "text-pink-500", other: "text-muted-foreground",
};
const DOC_TYPES = ["report", "specification", "drawing", "manual", "contract", "invoice", "photo", "other"];

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function DocumentsPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("setup") || canWrite("devices");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ doc_type: "" });
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [devices, setDevices] = useState<Ref[]>([]);
  const [sites, setSites] = useState<Ref[]>([]);
  const [tickets, setTickets] = useState<Ref[]>([]);
  const [workOrders, setWorkOrders] = useState<Ref[]>([]);

  const fetchDocs = useCallback(async () => {
    try {
      const { data } = await api.get("/infrastructure/documents/", { params: { page_size: 100, ordering: "-created_at" } });
      setDocs(data.results ?? []);
    } catch (err) {
      toast.error(getApiError(err, "Failed to load documents"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
    api.get("/assets/devices/", { params: { page_size: 200 } }).then((r) => setDevices((r.data.results ?? r.data).map((d: { id: string; asset_code: string }) => ({ id: d.id, label: d.asset_code })))).catch(() => {});
    api.get("/sites/sites/", { params: { page_size: 200 } }).then((r) => setSites((r.data.results ?? r.data).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })))).catch(() => {});
    api.get("/tickets/", { params: { page_size: 200 } }).then((r) => setTickets((r.data.results ?? r.data).map((t: { id: string; title: string }) => ({ id: t.id, label: t.title })))).catch(() => {});
    api.get("/work-orders/", { params: { page_size: 200 } }).then((r) => setWorkOrders((r.data.results ?? r.data).map((w: { id: string; wo_number: string; title: string }) => ({ id: w.id, label: `${w.wo_number} — ${w.title}` })))).catch(() => {});
  }, [fetchDocs]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!(fd.get("file") as File)?.size) {
      toast.error("Please choose a file");
      return;
    }
    // Drop empty optional link fields so the API doesn't reject empty strings.
    for (const key of ["device", "site", "ticket", "work_order"]) {
      if (!fd.get(key)) fd.delete(key);
    }
    setSaving(true);
    try {
      await api.post("/infrastructure/documents/", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Document uploaded");
      setUploadOpen(false);
      form.reset();
      fetchDocs();
    } catch (err) {
      toast.error(getApiError(err, "Upload failed"));
    } finally {
      setSaving(false);
    }
  }

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
            <p className="text-sm text-muted-foreground">Link documents to assets, tickets, work orders &amp; sites</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={() => setUploadOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            <Upload className="h-4 w-4" /> Upload Document
          </button>
        )}
      </div>

      <FilterBar
        filters={[{ key: "doc_type", label: "Type", options: DOC_TYPES.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })) }]}
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
              {doc.description && <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{doc.description}</p>}
              <div className="space-y-1 text-[10px] text-muted-foreground">
                {doc.device_code && <p>Device: {doc.device_code}</p>}
                {doc.site_name && <p>Site: {doc.site_name}</p>}
                {doc.project_name && <p>Project: {doc.project_name}</p>}
                {doc.ticket_title && <p>Ticket: {doc.ticket_title}</p>}
                {doc.work_order_number && <p>Work Order: {doc.work_order_number}</p>}
                <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
                  <span>{formatSize(doc.file_size)}</span>
                  <span>{formatDateTime(doc.created_at)}</span>
                </div>
              </div>
              <a href={doc.file} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <Download className="h-3 w-3" /> Download
              </a>
            </div>
          ))}
        </div>
      )}

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload Document">
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="title" className={labelClass}>Title</label>
              <input id="title" name="title" required className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="doc_type" className={labelClass}>Type</label>
              <select id="doc_type" name="doc_type" defaultValue="other" className={inputClass}>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="file" className={labelClass}>File</label>
              <input id="file" name="file" type="file" required className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="description" className={labelClass}>Description</label>
              <textarea id="description" name="description" rows={2} className={`${inputClass} h-auto py-2`} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="device" className={labelClass}>Link to Asset</label>
              <select id="device" name="device" className={inputClass}><option value="">—</option>{devices.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="site" className={labelClass}>Link to Site</label>
              <select id="site" name="site" className={inputClass}><option value="">—</option>{sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ticket" className={labelClass}>Link to Ticket</label>
              <select id="ticket" name="ticket" className={inputClass}><option value="">—</option>{tickets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="work_order" className={labelClass}>Link to Work Order</label>
              <select id="work_order" name="work_order" className={inputClass}><option value="">—</option>{workOrders.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setUploadOpen(false)} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><X className="mr-1 h-4 w-4" />Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">{saving ? "Uploading..." : "Upload"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
