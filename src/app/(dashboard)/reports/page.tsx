"use client";

import { BarChart3, Download, FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

interface Column { key: string; label: string }
interface ReportData {
  type: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  count: number;
  summary: Record<string, unknown>;
}

const REPORT_TYPES = [
  { value: "assets", label: "Assets" },
  { value: "tickets", label: "Tickets" },
  { value: "work_orders", label: "Work Orders" },
  { value: "inventory", label: "Inventory" },
  { value: "suppliers", label: "Suppliers" },
  { value: "clients", label: "Customers" },
  { value: "teams", label: "Teams / Projects" },
];

const inputClass =
  "flex h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";

function toCsv(columns: Column[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export default function ReportsPage() {
  const [type, setType] = useState("assets");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);

  async function generate() {
    setLoading(true);
    try {
      const params: Record<string, string> = { type };
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const { data } = await api.get<ReportData>("/reports/generate/", { params });
      setReport(data);
    } catch (err) {
      toast.error(getApiError(err, "Failed to generate report"));
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!report) return;
    const csv = toCsv(report.columns, report.rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.type}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
          <BarChart3 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-muted-foreground">Generate and export reports across the platform</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <label className={labelClass}>Report</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputClass} w-48`}>
            {REPORT_TYPES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
        </div>
        <button onClick={generate} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
          <BarChart3 className="h-4 w-4" /> {loading ? "Generating..." : "Generate"}
        </button>
        {report && report.rows.length > 0 && (
          <button onClick={exportCsv} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        )}
      </div>

      {/* Summary */}
      {report && (
        <div className="flex flex-wrap gap-3">
          <div className="rounded-xl border border-border bg-card px-5 py-3">
            <p className="text-xs text-muted-foreground">Rows</p>
            <p className="text-xl font-bold text-foreground">{report.count.toLocaleString()}</p>
          </div>
          {typeof report.summary.total === "number" && (
            <div className="rounded-xl border border-border bg-card px-5 py-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold text-foreground">{(report.summary.total as number).toLocaleString()}</p>
            </div>
          )}
          {typeof report.summary.total_value === "number" && (
            <div className="rounded-xl border border-border bg-card px-5 py-3">
              <p className="text-xs text-muted-foreground">Total Value</p>
              <p className="text-xl font-bold text-foreground">{(report.summary.total_value as number).toLocaleString()}</p>
            </div>
          )}
          {typeof report.summary.low_stock === "number" && (
            <div className="rounded-xl border border-border bg-card px-5 py-3">
              <p className="text-xs text-muted-foreground">Low Stock</p>
              <p className="text-xl font-bold text-red-500">{report.summary.low_stock as number}</p>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {report ? (
        report.rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">No data</h3>
            <p className="mt-2 text-sm text-muted-foreground">No records match this report and date range.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    {report.columns.map((c) => (
                      <th key={c.key} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, i) => (
                    <tr key={i} className="border-b border-border transition-colors hover:bg-secondary/30">
                      {report.columns.map((c) => (
                        <td key={c.key} className="px-4 py-2.5 text-muted-foreground">{row[c.key] == null || row[c.key] === "" ? "-" : String(row[c.key])}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">Choose a report</h3>
          <p className="mt-2 text-sm text-muted-foreground">Pick a report type and date range, then Generate.</p>
        </div>
      )}
    </div>
  );
}
