"use client";

import {
  BarChart3, Boxes, ClipboardList, Download, FileSpreadsheet, Handshake, Loader2, MapPin, Package,
  ShoppingCart, Ticket, Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SearchSelect } from "@/components/ui/search-select";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

type Kind = "text" | "int" | "qty" | "number" | "money" | "variance" | "percent" | "date" | "datetime";
interface Column { key: string; label: string; kind: Kind; total?: boolean }
interface Kpi { label: string; value: number | string | null; kind: Kind; tone?: "good" | "warn" | "bad" | null }
interface ReportMeta {
  key: string;
  title: string;
  group: string;
  description: string;
  filters: string[];
  date_label: string;
  statuses: { value: string; label: string }[];
}
interface ReportData {
  title: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  count: number;
  truncated: boolean;
  kpis: Kpi[];
  breakdown: { title: string; items: { label: string; value: number }[] } | null;
}
interface Option { id: string; label: string }

/** The one-project workbook sits in the catalogue beside the registers. */
const PROJECT_WORKBOOK = "project_workbook";

const ICONS: Record<string, typeof BarChart3> = {
  assets: Boxes, installations: MapPin, projects: ClipboardList, [PROJECT_WORKBOOK]: FileSpreadsheet,
  visits: Wrench, tickets: Ticket, purchase_orders: ShoppingCart, work_orders: ClipboardList,
  inventory: Package, suppliers: Handshake, clients: Handshake,
};
const GROUP_ORDER = ["Assets", "Projects", "Maintenance & Service", "Procurement & Stock", "Partners"];

const SHEETS = [
  ["Summary", "Project ID, client, sites, manager, phase, health, progress, every date, budget against actual, delivery counts."],
  ["Cost", "Planned against actual for each asset — components, production, installation — plus overheads and contingency."],
  ["Components", "Every part: quantity required and used, planned and actual unit price and total, and the variance."],
  ["Production", "Each operation on the build route, in-house or vendor, planned against actual."],
  ["Assets & installation", "Where each asset was installed — site, city, position, crew — and when it was booked, due, started, completed and handed over."],
  ["Site visits", "Every crew check-in and check-out at site."],
  ["Overheads", "Each overhead, planned against what it actually came to."],
  ["Milestones · Activity", "The milestones with their dates, and the project's full activity log."],
];

type Preset = "all" | "month" | "last_month" | "quarter" | "year" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "month", label: "This month" },
  { key: "last_month", label: "Last month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "Year to date" },
];

const iso = (d: Date) => d.toLocaleDateString("en-CA");
function rangeOf(p: Preset): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (p) {
    case "month": return { from: iso(new Date(y, m, 1)), to: iso(now) };
    case "last_month": return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "quarter": return { from: iso(new Date(y, Math.floor(m / 3) * 3, 1)), to: iso(now) };
    case "year": return { from: iso(new Date(y, 0, 1)), to: iso(now) };
    default: return { from: "", to: "" };
  }
}

const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const fmtNumber = (v: number, digits = 0) =>
  new Intl.NumberFormat("en-PK", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);

function show(value: unknown, kind: Kind): string {
  if (value == null || value === "") return "—";
  const n = num(value);
  switch (kind) {
    case "money": return `PKR ${fmtNumber(n ?? 0, 2)}`;
    case "variance": return n == null ? "—" : `${n > 0 ? "+" : n < 0 ? "−" : ""}PKR ${fmtNumber(Math.abs(n), 2)}`;
    case "int": return fmtNumber(n ?? 0);
    case "qty": return new Intl.NumberFormat("en-PK", { maximumFractionDigits: 3 }).format(n ?? 0);
    case "number": return fmtNumber(n ?? 0, 1);
    case "percent": return `${(n ?? 0).toFixed(1)}%`;
    case "date": return new Date(String(value)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    case "datetime": return new Date(String(value)).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    default: return String(value);
  }
}
const isNumeric = (k: Kind) => ["int", "qty", "number", "money", "variance", "percent"].includes(k);
const summed = (c: Column) => c.total ?? (c.kind === "money" || c.kind === "variance");

/** A column that holds a state reads as a chip, coloured by what the state means. */
const STATE_KEYS = new Set(["status", "state", "job", "late", "active", "outcome", "stock"]);
function toneOf(key: string, value: string): string {
  const v = value.toLowerCase();
  if (key === "late") return v === "yes" ? "bad" : "";
  if (/(delayed|overdue|out of stock|rejected|cancel|sent back|not fixed|inactive|removed)/.test(v)) return "bad";
  if (/(at risk|low|on hold|pending|due soon|open|in progress|not booked|planned|draft)/.test(v)) return "warn";
  if (/(on track|complete|^ok$|active|done|received|delivered|approved|handed|fixed|on time|issued|ordered)/.test(v)) return "good";
  return "";
}
const CHIP: Record<string, string> = {
  good: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  warn: "bg-amber-500/10 text-amber-700 ring-amber-500/20",
  bad: "bg-red-500/10 text-red-600 ring-red-500/20",
  "": "bg-secondary text-muted-foreground ring-border",
};
const KPI_TONE: Record<string, string> = {
  good: "text-emerald-600", warn: "text-amber-600", bad: "text-red-600",
};
// A slice's colour says what it means; anything neutral takes the next quiet colour.
const TONE_BAR: Record<string, string> = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500" };
const QUIET = ["bg-primary", "bg-sky-500", "bg-violet-500", "bg-slate-400", "bg-teal-300", "bg-indigo-300"];
const barColours = (labels: string[]) => {
  let q = 0;
  return labels.map((l) => TONE_BAR[toneOf("status", l)] ?? QUIET[q++ % QUIET.length]);
};
/** Long free text wraps; everything else — codes, dates, figures — stays on one line. */
const WRAP = new Set(["name", "asset", "title", "sites", "description", "categories", "job", "what", "detail", "project", "item"]);

async function saveFile(url: string, params: Record<string, string>, fallback: string) {
  const res = await api.get(url, { params, responseType: "blob" });
  const named = /filename="?([^";]+)"?/.exec(String(res.headers["content-disposition"] ?? ""));
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = named?.[1] ?? fallback;
  a.click();
  URL.revokeObjectURL(href);
}

function toCsv(columns: Column[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(","))].join("\n");
}

const control =
  "h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";
const label = "text-2xs font-medium uppercase tracking-wider text-muted-foreground";
const SHOWN = 500;

export default function ReportsPage() {
  const [catalog, setCatalog] = useState<ReportMeta[] | null>(null);
  const [workbook, setWorkbook] = useState(false);
  const [key, setKey] = useState("");
  const [preset, setPreset] = useState<Preset>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [lists, setLists] = useState<{ projects: Option[]; sites: Option[]; people: Option[] }>({ projects: [], sites: [], people: [] });
  const [project, setProject] = useState("");
  const sort = useSortState();

  useEffect(() => {
    api.get("/reports/catalog/").then(({ data }) => {
      setCatalog(data.reports);
      setWorkbook(!!data.project_workbook);
      setKey((k) => k || data.reports[0]?.key || (data.project_workbook ? PROJECT_WORKBOOK : ""));
    }).catch((err) => { setCatalog([]); toast.error(getApiError(err, "Could not load the reports")); });
  }, []);

  const meta = catalog?.find((r) => r.key === key) ?? null;
  const needs = useMemo(() => new Set(meta?.filters ?? []), [meta]);

  // The pickers a report filters by, fetched the first time one is needed.
  useEffect(() => {
    const wants = key === PROJECT_WORKBOOK || needs.has("project") || needs.has("site") || needs.has("technician");
    if (!wants || lists.projects.length) return;
    Promise.allSettled([
      api.get("/teams/projects/", { params: { page_size: 1000, ordering: "-created_at" } }),
      api.get("/sites/sites/", { params: { page_size: 1000 } }),
      api.get("/accounts/users/", { params: { role: "technician", is_active: true, page_size: 300 } }),
    ]).then(([p, s, u]) => {
      const rows = (r: PromiseSettledResult<{ data: { results?: unknown[] } | unknown[] }>) =>
        r.status === "fulfilled" ? ((r.value.data as { results?: unknown[] }).results ?? (r.value.data as unknown[])) : [];
      setLists({
        projects: (rows(p) as { id: string; name: string; project_code?: string }[])
          .map((x) => ({ id: x.id, label: x.project_code ? `${x.project_code} · ${x.name}` : x.name })),
        sites: (rows(s) as { id: string; name: string }[]).map((x) => ({ id: x.id, label: x.name })),
        people: (rows(u) as { id: string; first_name: string; last_name: string; username: string }[])
          .map((x) => ({ id: x.id, label: `${x.first_name} ${x.last_name}`.trim() || x.username })),
      });
    });
  }, [key, needs, lists.projects.length]);

  const params = useMemo(() => {
    const p: Record<string, string> = { type: key };
    if (from) p.date_from = from;
    if (to) p.date_to = to;
    for (const [k, v] of Object.entries(extra)) if (v && needs.has(k === "low_stock" ? "low_stock" : k)) p[k] = v;
    return p;
  }, [key, from, to, extra, needs]);

  const run = useCallback(async () => {
    if (!key || key === PROJECT_WORKBOOK) return;
    setLoading(true);
    setShowAll(false);
    try {
      const { data } = await api.get<ReportData>("/reports/generate/", { params });
      setData(data);
    } catch (err) {
      setData(null);
      toast.error(getApiError(err, "Could not run the report"));
    } finally {
      setLoading(false);
    }
  }, [key, params]);

  useEffect(() => { run(); }, [run]);

  function pick(next: string) {
    if (next === key) return;
    setKey(next);
    setData(null);
    setExtra({});
    setPreset("all");
    setFrom("");
    setTo("");
  }
  function choosePreset(p: Preset) {
    setPreset(p);
    const r = rangeOf(p);
    setFrom(r.from);
    setTo(r.to);
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await saveFile("/reports/generate/", { ...params, export: "xlsx" }, `${key}-report.xlsx`);
    } catch (err) {
      toast.error(getApiError(err, "Could not export the report"));
    } finally {
      setExporting(false);
    }
  }
  function exportCsv() {
    if (!data) return;
    const href = URL.createObjectURL(new Blob([toCsv(data.columns, data.rows)], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = href;
    a.download = `${key}-report-${iso(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(href);
  }
  async function downloadProject() {
    if (!project) return;
    setExporting(true);
    try {
      await saveFile(`/reports/project/${project}/`, {}, "project-report.xlsx");
      toast.success("Project report downloaded");
    } catch (err) {
      toast.error(getApiError(err, "Could not build the project report"));
    } finally {
      setExporting(false);
    }
  }

  const groups = useMemo(() => {
    const all = [...(catalog ?? [])];
    const by: Record<string, { key: string; title: string; description: string }[]> = {};
    for (const r of all) (by[r.group] ??= []).push(r);
    if (workbook) {
      (by.Projects ??= []).push({
        key: PROJECT_WORKBOOK, title: "Project Report",
        description: "One project in full, planned against actual — as an Excel workbook.",
      });
    }
    return GROUP_ORDER.filter((g) => by[g]).map((g) => [g, by[g]] as const);
  }, [catalog, workbook]);

  const rows = data ? sortRows(data.rows, sort) : [];
  const visible = showAll ? rows : rows.slice(0, SHOWN);
  const totals = data?.columns.some(summed) && rows.length > 0;
  const breakdownTotal = data?.breakdown?.items.reduce((s, i) => s + i.value, 0) ?? 0;
  const colours = barColours(data?.breakdown?.items.map((i) => i.label) ?? []);
  const title = key === PROJECT_WORKBOOK ? "Project Report" : meta?.title ?? "";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">Registers and summaries across the operation — on screen, or as Excel.</p>
        </div>
      </div>

      {catalog === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading reports…</div>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No reports are open to you. Ask an Administrator for the rights to the areas you report on.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
          {/* The catalogue: a list on wide screens, a picker on a phone. */}
          <div className="lg:hidden">
            <select value={key} onChange={(e) => pick(e.target.value)} className={`${control} w-full`} aria-label="Report">
              {groups.map(([g, items]) => (
                <optgroup key={g} label={g}>
                  {items.map((r) => <option key={r.key} value={r.key}>{r.title}</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <nav className="hidden self-start rounded-xl border border-border bg-card p-2 lg:sticky lg:top-24 lg:block" aria-label="Reports">
            {groups.map(([g, items]) => (
              <div key={g} className="mb-2 last:mb-0">
                <p className={`${label} px-2 pb-1 pt-2`}>{g}</p>
                {items.map((r) => {
                  const Icon = ICONS[r.key] ?? BarChart3;
                  const on = r.key === key;
                  return (
                    <button
                      key={r.key}
                      onClick={() => pick(r.key)}
                      className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${on ? "bg-primary/10" : "hover:bg-secondary"}`}
                    >
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${on ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="min-w-0">
                        <span className={`block text-sm font-medium ${on ? "text-primary" : "text-foreground"}`}>
                          {r.title}
                          {r.key === PROJECT_WORKBOOK && <span className="ml-1.5 rounded bg-emerald-500/10 px-1 py-px text-2xs font-semibold text-emerald-700">XLSX</span>}
                        </span>
                        <span className="line-clamp-2 text-2xs text-muted-foreground">{r.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          <section className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-foreground">{title}</h2>
                <p className="text-sm text-muted-foreground">
                  {key === PROJECT_WORKBOOK
                    ? "Everything about one project in a single workbook, planned against actual, ready to share."
                    : meta?.description}
                </p>
              </div>
              {key !== PROJECT_WORKBOOK && (
                <div className="flex gap-2">
                  <button
                    onClick={exportExcel}
                    disabled={!data || exporting}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Export Excel
                  </button>
                  <button
                    onClick={exportCsv}
                    disabled={!data || !data.rows.length}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" /> CSV
                  </button>
                </div>
              )}
            </div>

            {key === PROJECT_WORKBOOK ? (
              <div className="space-y-4 rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-64 flex-1 space-y-1.5">
                    <p className={label}>Project</p>
                    <SearchSelect options={lists.projects} value={project} onChange={setProject} placeholder="Find a project by ID or name…" />
                  </div>
                  <button
                    onClick={downloadProject}
                    disabled={!project || exporting}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                  >
                    {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Download Excel
                  </button>
                </div>
                <div>
                  <p className={`${label} mb-2`}>What the workbook holds</p>
                  <ol className="grid gap-2 sm:grid-cols-2">
                    {SHEETS.map(([sheet, about], i) => (
                      <li key={sheet} className="flex gap-3 rounded-lg border border-border/70 px-3 py-2.5">
                        <span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                        <span>
                          <span className="block text-sm font-medium text-foreground">{sheet}</span>
                          <span className="text-2xs text-muted-foreground">{about}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <p className="mt-3 text-2xs text-muted-foreground">
                    The cost sheets are included only for people allowed to see project costs.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Filters */}
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
                  {needs.has("date") && meta?.date_label && (
                    <div className="space-y-1.5">
                      <p className={label}>{meta.date_label}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {PRESETS.map((p) => (
                          <button
                            key={p.key}
                            onClick={() => choosePreset(p.key)}
                            className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors ${preset === p.key ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}
                          >
                            {p.label}
                          </button>
                        ))}
                        <input type="date" aria-label="From" value={from} max={to || undefined} onChange={(e) => { setPreset("custom"); setFrom(e.target.value); }} className={control} />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input type="date" aria-label="To" value={to} min={from || undefined} onChange={(e) => { setPreset("custom"); setTo(e.target.value); }} className={control} />
                      </div>
                    </div>
                  )}
                  {needs.has("status") && (meta?.statuses.length ?? 0) > 0 && (
                    <div className="space-y-1.5">
                      <p className={label}>Status</p>
                      <select value={extra.status ?? ""} onChange={(e) => setExtra({ ...extra, status: e.target.value })} className={`${control} w-44`}>
                        <option value="">All</option>
                        {meta!.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  )}
                  {needs.has("project") && (
                    <div className="w-56 space-y-1.5">
                      <p className={label}>Project</p>
                      <SearchSelect options={[{ id: "", label: "All projects" }, ...lists.projects]} value={extra.project ?? ""} onChange={(v) => setExtra({ ...extra, project: v })} placeholder="All projects" />
                    </div>
                  )}
                  {needs.has("site") && (
                    <div className="w-52 space-y-1.5">
                      <p className={label}>Site</p>
                      <SearchSelect options={[{ id: "", label: "All sites" }, ...lists.sites]} value={extra.site ?? ""} onChange={(v) => setExtra({ ...extra, site: v })} placeholder="All sites" />
                    </div>
                  )}
                  {needs.has("technician") && (
                    <div className="w-48 space-y-1.5">
                      <p className={label}>Technician</p>
                      <select value={extra.technician ?? ""} onChange={(e) => setExtra({ ...extra, technician: e.target.value })} className={`${control} w-full`}>
                        <option value="">All</option>
                        {lists.people.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                    </div>
                  )}
                  {needs.has("group_by") && (
                    <div className="space-y-1.5">
                      <p className={label}>Show</p>
                      <select value={extra.group_by ?? ""} onChange={(e) => setExtra({ ...extra, group_by: e.target.value })} className={`${control} w-44`}>
                        <option value="">Each visit</option>
                        <option value="technician">By technician</option>
                        <option value="site">By site</option>
                        <option value="project">By project</option>
                      </select>
                    </div>
                  )}
                  {needs.has("low_stock") && (
                    <label className="flex h-9 items-center gap-2 text-sm text-foreground">
                      <input type="checkbox" checked={extra.low_stock === "true"} onChange={(e) => setExtra({ ...extra, low_stock: e.target.checked ? "true" : "" })} className="h-4 w-4 accent-[hsl(var(--primary))]" />
                      Low and out of stock only
                    </label>
                  )}
                  {loading && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>

                {/* Headline figures */}
                {data && data.kpis.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    {data.kpis.map((k) => (
                      <div key={k.label} className="rounded-xl border border-border bg-card px-4 py-3">
                        <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{k.label}</p>
                        <p className={`mt-1 text-xl font-bold tabular-nums ${k.tone ? KPI_TONE[k.tone] : "text-foreground"}`}>
                          {k.value == null ? "—" : show(k.value, k.kind === "money" ? "money" : k.kind)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* How the rows split */}
                {data?.breakdown && breakdownTotal > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="mb-2 text-sm font-medium text-foreground">{data.breakdown.title}</p>
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-secondary">
                      {data.breakdown.items.map((it, i) => (
                        <div key={it.label} className={colours[i]} style={{ width: `${(it.value / breakdownTotal) * 100}%` }} title={`${it.label}: ${it.value}`} />
                      ))}
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
                      {data.breakdown.items.map((it, i) => (
                        <span key={it.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={`h-2 w-2 rounded-full ${colours[i]}`} />
                          {it.label} <span className="font-medium tabular-nums text-foreground">{it.value}</span>
                          <span className="tabular-nums">({((it.value / breakdownTotal) * 100).toFixed(0)}%)</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* The register */}
                {data && (
                  data.rows.length === 0 ? (
                    <div className="rounded-xl border border-border bg-card p-12 text-center">
                      <FileSpreadsheet className="mx-auto h-10 w-10 text-muted-foreground/30" />
                      <p className="mt-3 text-sm font-medium text-foreground">Nothing matches</p>
                      <p className="mt-1 text-sm text-muted-foreground">Widen the dates or clear a filter.</p>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
                        <span>
                          {data.count.toLocaleString()} {data.count === 1 ? "row" : "rows"}
                          {data.truncated && " — the first 5,000; narrow the filters or export for a smaller set"}
                        </span>
                        <span>Click a heading to sort</span>
                      </div>
                      <div className="max-h-[70vh] overflow-auto">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 z-10 bg-secondary">
                            <tr className="border-b border-border">
                              {data.columns.map((c) => (
                                <SortTh key={c.key} sort={sort} k={c.key} className={`whitespace-nowrap px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground ${isNumeric(c.kind) ? "text-right" : "text-left"}`}>
                                  {c.label}
                                </SortTh>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((row, i) => (
                              <tr key={i} className="border-b border-border/60 transition-colors hover:bg-secondary/40">
                                {data.columns.map((c, ci) => {
                                  const v = row[c.key];
                                  const text = show(v, c.kind);
                                  if (STATE_KEYS.has(c.key) && v) {
                                    return (
                                      <td key={c.key} className="whitespace-nowrap px-4 py-2">
                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${CHIP[toneOf(c.key, String(v))]}`}>{text}</span>
                                      </td>
                                    );
                                  }
                                  const n = num(v);
                                  return (
                                    <td
                                      key={c.key}
                                      className={`px-4 py-2 ${isNumeric(c.kind) ? "whitespace-nowrap text-right tabular-nums" : WRAP.has(c.key) ? "min-w-44 max-w-xs" : "whitespace-nowrap"} ${
                                        c.kind === "variance" && n ? (n > 0 ? "text-red-600" : "text-emerald-600")
                                          : ci === 0 ? "font-medium text-foreground" : "text-muted-foreground"
                                      }`}
                                    >
                                      {text}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                          {totals && (
                            <tfoot className="sticky bottom-0 bg-secondary">
                              <tr className="border-t-2 border-foreground/20 font-semibold text-foreground">
                                {data.columns.map((c, i) => (
                                  <td key={c.key} className={`whitespace-nowrap px-4 py-2.5 ${isNumeric(c.kind) ? "text-right tabular-nums" : ""}`}>
                                    {summed(c) ? show(rows.reduce((s, r) => s + (num(r[c.key]) ?? 0), 0), c.kind) : i === 0 ? "Total" : ""}
                                  </td>
                                ))}
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      {rows.length > SHOWN && !showAll && (
                        <button onClick={() => setShowAll(true)} className="w-full border-t border-border py-2.5 text-xs font-medium text-primary hover:bg-secondary/40">
                          Show all {rows.length.toLocaleString()} rows (showing {SHOWN})
                        </button>
                      )}
                    </div>
                  )
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
