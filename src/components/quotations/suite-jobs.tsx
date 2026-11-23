"use client";

import { ArrowRight, ExternalLink, FolderPlus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatCurrency } from "@/lib/currency";
import { formatDate } from "@/lib/utils";

interface SuiteLine {
  title: string;
  qty: number;
  unit_price: string | number | null;
  asset: boolean;
}

interface SuiteJob {
  record_id: string;
  quote_number: string;
  version: number | null;
  job_number: string;
  po_number: string;
  po_amount: string | number | null;
  client: string;
  project: string;
  location: string;
  target_date: string | null;
  stage: string;
  stage_display: string;
  /** Suite's figures: before GST, the GST, and the total with it (what comes here). */
  net: string | number;
  discount: string | number;
  gst_pct: string | number;
  gst: string | number;
  gross: string | number;
  lines: SuiteLine[];
  linked: null | {
    quotation: string;
    quote_number: string;
    project: string | null;
    project_code: string;
    project_status: string;
    suite_acknowledged_at: string | null;
    suite_completed_at: string | null;
    suite_sync_error: string;
  };
}

interface ClientOpt {
  id: string;
  name: string;
}

const assetCount = (job: SuiteJob) => job.lines.filter((l) => l.asset).reduce((n, l) => n + l.qty, 0);

// One column per value, so each reads under its own label.
const VALUE = "Value (incl. GST)";
const COLUMNS = ["Job order", "Quotation", "Project", "Location", "Client", VALUE, "PO number", "PO amount", "Assets", "Lines", "Target date", "Status", "Action"];
const RIGHT = new Set([VALUE, "PO amount", "Assets", "Lines", "Action"]);
const TD = "whitespace-nowrap px-3 py-3";
const WRAP = "px-3 py-3";
// The button stays in view when the table scrolls sideways on smaller screens.
// Its cell must look like the rest of the row: the row is solid here (the global
// table style makes it see-through) and the cell takes the row's hover colour.
// Dark mode tints a hovered row with 5% of the primary colour instead; the row
// gets that tint on a solid card too, so it and the pinned cell match exactly.
const ROW =
  "group !bg-card dark:hover:!bg-card " +
  "dark:hover:![background-image:linear-gradient(hsl(var(--primary)/0.05),hsl(var(--primary)/0.05))]";
const STICKY =
  "sticky right-0 bg-card transition-colors group-hover:bg-accent dark:group-hover:bg-card " +
  "dark:group-hover:[background-image:linear-gradient(hsl(var(--primary)/0.05),hsl(var(--primary)/0.05))]";

/** Where the Suite job stands, in Suite's own words once it follows a project here. */
function suiteState(job: SuiteJob) {
  if (!job.linked) return { text: "Waiting for a project", tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  if (job.linked.suite_completed_at) return { text: "Suite: sent to Sales check", tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
  if (job.linked.suite_acknowledged_at) return { text: "Suite: in Execution", tone: "bg-sky-500/10 text-sky-700 dark:text-sky-400" };
  return { text: "Suite: not updated yet", tone: "bg-muted text-muted-foreground" };
}

/** DIGIX Suite jobs at Production Go-Ahead: each one is made into a project here. */
export function SuiteJobs({ clients, canEdit, onCreated }: { clients: ClientOpt[]; canEdit: boolean; onCreated: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [jobs, setJobs] = useState<SuiteJob[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<SuiteJob | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/quotations/quotations/suite/");
      setEnabled(!!data.enabled);
      setJobs(data.jobs ?? []);
      setError(data.error ?? "");
    } catch (err: unknown) {
      setError(getApiError(err, "Suite jobs could not be loaded"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retry = async (job: SuiteJob) => {
    if (!job.linked) return;
    setRetrying(job.record_id);
    try {
      const { data } = await api.post(`/quotations/quotations/${job.linked.quotation}/suite-sync/`);
      if (data.suite_sync_error) toast.error(`Suite: ${data.suite_sync_error}`);
      else toast.success("Suite updated");
      load();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Suite could not be updated"));
    } finally {
      setRetrying(null);
    }
  };

  if (!enabled && !error) return null;
  const waiting = jobs.filter((j) => !j.linked).length;

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">From DIGIX Suite · Production Go-Ahead</h2>
          <p className="text-xs text-muted-foreground">
            {waiting ? `${waiting} waiting for a project` : "Every Go-Ahead has its project"} — the Suite job moves to Execution when its project is made, and to Sales check when the project is completed.
          </p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {error && <p className="px-4 py-3 text-sm text-red-600 dark:text-red-400">Suite: {error}</p>}
      {!error && !loading && jobs.length === 0 && (
        <p className="px-4 py-3 text-sm text-muted-foreground">No Suite quotation is at Production Go-Ahead.</p>
      )}

      {jobs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                {COLUMNS.map((c) => (
                  <th key={c} className={`whitespace-nowrap px-3 py-2 font-medium ${RIGHT.has(c) ? "text-right" : "text-left"} ${c === "Action" ? STICKY : ""}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const state = suiteState(job);
                return (
                  <Fragment key={job.record_id}>
                    <tr className={ROW}>
                      <td className={`${TD} font-semibold text-foreground`}>{job.job_number || "—"}</td>
                      <td className={`${WRAP} min-w-[7rem] text-muted-foreground`}>{job.quote_number}{job.version ? ` V${job.version}` : ""}</td>
                      <td className={`${WRAP} min-w-[10rem] text-foreground`}>{job.project || "—"}</td>
                      <td className={`${WRAP} min-w-[7rem] text-muted-foreground`}>{job.location || "—"}</td>
                      <td className={`${WRAP} text-foreground`}>{job.client || "—"}</td>
                      <td className={`${TD} text-right font-medium tabular-nums text-foreground`}>{formatCurrency(job.gross, "PKR")}</td>
                      <td className={`${TD} text-muted-foreground`}>{job.po_number || "—"}</td>
                      <td className={`${TD} text-right tabular-nums text-foreground`}>{formatCurrency(job.po_amount, "PKR")}</td>
                      <td className={`${TD} text-right tabular-nums text-foreground`}>{assetCount(job)}</td>
                      <td className={`${TD} text-right tabular-nums text-foreground`}>{job.lines.length}</td>
                      <td className={`${TD} text-muted-foreground`}>{job.target_date ? formatDate(job.target_date) : "—"}</td>
                      <td className={TD}>
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${state.tone}`}>{state.text}</span>
                      </td>
                      <td className={`${TD} ${STICKY} text-right`}>
                        {job.linked?.project ? (
                          <Link href={`/projects?project=${job.linked.project}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
                            {job.linked.project_code || "Project"} <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                        ) : (
                          canEdit && (
                            <button onClick={() => setPicked(job)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white">
                              <FolderPlus className="h-4 w-4" /> Create project
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                    {job.linked?.suite_sync_error && (
                      <tr>
                        <td colSpan={COLUMNS.length} className="px-4 pb-3">
                          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400">
                            <span className="min-w-0 flex-1">Suite was not updated: {job.linked.suite_sync_error}</span>
                            {canEdit && (
                              <button onClick={() => retry(job)} disabled={retrying === job.record_id} className="inline-flex items-center gap-1 rounded-md border border-red-500/30 px-2 py-1 font-medium disabled:opacity-50">
                                <RefreshCw className={`h-3 w-3 ${retrying === job.record_id ? "animate-spin" : ""}`} /> Try again
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {picked && (
        <CreateProjectModal
          job={picked}
          clients={clients}
          onClose={() => setPicked(null)}
          onDone={() => {
            setPicked(null);
            load();
            onCreated();
          }}
        />
      )}
    </section>
  );
}

function CreateProjectModal({ job, clients, onClose, onDone }: { job: SuiteJob; clients: ClientOpt[]; onClose: () => void; onDone: () => void }) {
  // Suite keeps the client as text; here it is one of our clients. Pre-pick an exact name match only.
  const match = useMemo(() => clients.find((c) => c.name.trim().toLowerCase() === job.client.trim().toLowerCase()), [clients, job.client]);
  const [client, setClient] = useState(match?.id ?? "");
  const [saving, setSaving] = useState(false);
  const assets = assetCount(job);

  const submit = async () => {
    if (!client) {
      toast.error("Choose the client");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post("/quotations/quotations/suite/create-project/", { record_id: job.record_id, client });
      toast.success(`Project ${data.project_code} created with ${data.assets} assets`, {
        action: { label: "Open", onClick: () => window.location.assign(`/projects?project=${data.project}`) },
      });
      if (data.suite_sync_error) toast.error(`Project made, but Suite was not moved to Execution: ${data.suite_sync_error}`);
      onDone();
    } catch (err: unknown) {
      toast.error(getApiError(err, "The project could not be created"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Create project from ${job.job_number || job.quote_number}`} size="wide">
      <div className="space-y-4">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Suite quotation</dt><dd className="text-foreground">{job.quote_number}{job.version ? ` · V${job.version}` : ""}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Job order / PO</dt><dd className="text-foreground">{job.job_number || "—"} · {job.po_number || "No PO"} · {formatCurrency(job.po_amount, "PKR")}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Value (incl. GST)</dt><dd className="font-medium text-foreground">{formatCurrency(job.gross, "PKR")}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Project</dt><dd className="text-foreground">{job.project || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Location</dt><dd className="text-foreground">{job.location || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Client in Suite</dt><dd className="font-medium text-foreground">{job.client || "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Target closing</dt><dd className="text-foreground">{job.target_date ? formatDate(job.target_date) : "—"}</dd></div>
        </dl>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">Client <span className="text-red-500">*</span></span>
          <select id="suite-client" value={client} onChange={(e) => setClient(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
            <option value="">Choose the client for “{job.client || "this job"}”</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr><th className="px-3 py-2 font-medium">Line</th><th className="px-3 py-2 text-right font-medium">Qty</th><th className="px-3 py-2 text-right font-medium">Unit price (excl. GST)</th><th className="px-3 py-2 font-medium">Becomes</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {job.lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 text-foreground">{l.title}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.qty}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatCurrency(l.unit_price, "PKR")}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{l.asset ? `${l.qty} asset${l.qty === 1 ? "" : "s"} + BOM` : "BOM line"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border text-sm">
              {Number(job.discount) > 0 && (
                <tr><td colSpan={2} className="px-3 py-1.5 text-right text-muted-foreground">Discount</td><td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">−{formatCurrency(job.discount, "PKR")}</td><td /></tr>
              )}
              <tr><td colSpan={2} className="px-3 py-1.5 text-right text-muted-foreground">GST {job.gst_pct}%</td><td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{formatCurrency(job.gst, "PKR")}</td><td /></tr>
              <tr><td colSpan={2} className="px-3 py-1.5 text-right font-semibold text-foreground">Total incl. GST</td><td className="whitespace-nowrap px-3 py-1.5 text-right font-semibold tabular-nums text-foreground">{formatCurrency(job.gross, "PKR")}</td><td /></tr>
            </tfoot>
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Creates the accepted quotation, its project with the BOM, and {assets} asset{assets === 1 ? "" : "s"} (one per product unit). Finance gets the invoice draft for {formatCurrency(job.gross, "PKR")} incl. GST. The Suite job moves to Execution. Fill in each asset&apos;s route, model and the rest on the project, as usual.
        </p>

        <div className="flex flex-wrap justify-end gap-2">
          {process.env.NEXT_PUBLIC_SUITE_URL && (
            <a href={process.env.NEXT_PUBLIC_SUITE_URL} target="_blank" rel="noopener noreferrer" className="mr-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ExternalLink className="h-3.5 w-3.5" /> Open Suite
            </a>
          )}
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium">Cancel</button>
          <button onClick={submit} disabled={saving || !client} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            <FolderPlus className="h-4 w-4" /> {saving ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
