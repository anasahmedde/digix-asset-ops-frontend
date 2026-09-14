"use client";

import { PackageOpen, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

interface IssuanceRow {
  id: string;
  issue_number: string;
  item_name: string | null;
  quantity: number;
  site_name: string | null;
  project_name: string | null;
  issued_to_user_name: string | null;
  issued_by_name: string | null;
  reason: string;
  notes: string;
  created_at: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

/** Stock leaves for a project, a named person, or a site — the log says which. */
function destination(row: IssuanceRow): { name: string; kind: string } | null {
  if (row.project_name) return { name: row.project_name, kind: "Project" };
  if (row.issued_to_user_name) return { name: row.issued_to_user_name, kind: "Person" };
  if (row.site_name) return { name: row.site_name, kind: "Site" };
  return null;
}

export function IssuanceLog() {
  const [rows, setRows] = useState<IssuanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/issuances/", { params: { page_size: 500 } });
      const list: IssuanceRow[] = data.results ?? data;
      // Newest first, regardless of how the server ordered them.
      setRows([...list].sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (err) {
      toast.error(getApiError(err, "Could not load the issuance log"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      [row.issue_number, row.item_name, row.project_name, row.issued_to_user_name,
       row.site_name, row.reason, row.issued_by_name]
        .some((value) => (value ?? "").toLowerCase().includes(query)),
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Every issue of generic stock, newest first — what left the store, where it went, why it was
        needed, and who authorised it.
      </p>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by issue number, item, project, person or purpose..."
          className={inputClass}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <PackageOpen className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            {rows.length > 0 ? "No issues match that search" : "Nothing issued yet"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {rows.length > 0
              ? "Try a different item, project or person."
              : "Stock issued from the generic items list is recorded here."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Issue No.</th>
                  <th className={thClass}>Date</th>
                  <th className={thClass}>Item</th>
                  <th className={thClass}>Qty</th>
                  <th className={thClass}>Issued To</th>
                  <th className={thClass}>Purpose</th>
                  <th className={thClass}>Authorised By</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const to = destination(row);
                  return (
                    <tr key={row.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                      <td className={`${tdClass} font-mono text-foreground`}>{row.issue_number}</td>
                      <td className={`${tdClass} text-muted-foreground`}>
                        {new Date(row.created_at).toLocaleDateString()}
                      </td>
                      <td className={`${tdClass} text-foreground`}>{row.item_name ?? "—"}</td>
                      <td className={`${tdClass} font-medium text-foreground`}>{row.quantity}</td>
                      <td className={tdClass}>
                        {to ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-foreground">{to.name}</span>
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              {to.kind}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>{row.reason || row.notes || "—"}</td>
                      <td className={`${tdClass} text-muted-foreground`}>{row.issued_by_name ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
