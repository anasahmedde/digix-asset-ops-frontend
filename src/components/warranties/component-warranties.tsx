"use client";

import { Search, Shield } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

/** A warrantied unique item, as the inventory holds it. */
interface UnitWarranty {
  id: string;
  unit_code: string;
  serial_number: string;
  material_name: string | null;
  unit_type_name: string | null;
  model_name: string;
  brand_name: string | null;
  status: string;
  warranty_type: string;
  warranty_start: string | null;
  warranty_end: string | null;
  warranty_state: string;
  supplier_name: string | null;
  installed_in_code: string | null;
  installed_in_name: string | null;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const STATE_BADGES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  expired: "bg-red-500/10 text-red-600 ring-red-500/20",
  none: "bg-secondary text-muted-foreground ring-gray-500/20",
};
const STATE_LABELS: Record<string, string> = { active: "Active", expired: "Expired", none: "No cover" };
const TYPE_LABELS: Record<string, string> = {
  manufacturer: "Manufacturer",
  extended: "Extended",
  supplier: "Supplier",
  client: "Client",
};

export function ComponentWarranties() {
  const [units, setUnits] = useState<UnitWarranty[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");

  const fetchUnits = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/units/", {
        params: { has_warranty: true, page_size: 500, ordering: "warranty_end" },
      });
      setUnits(data.results ?? data);
    } catch (err) {
      toast.error(getApiError(err, "Could not load component warranties"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return units.filter((unit) => {
      if (state && unit.warranty_state !== state) return false;
      if (!query) return true;
      return [unit.serial_number, unit.unit_code, unit.material_name, unit.unit_type_name,
              unit.model_name, unit.installed_in_code, unit.installed_in_name, unit.supplier_name]
        .some((value) => (value ?? "").toLowerCase().includes(query));
    });
  }, [units, search, state]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Cover that came with the unique items registered in inventory — one row per physical part,
        showing where that part is now.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by serial, part, asset or supplier..."
            className={inputClass}
          />
        </div>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
        >
          <option value="">All cover</option>
          <option value="active">Active</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Shield className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">
            {units.length > 0 ? "No parts match that search" : "No component warranties yet"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {units.length > 0
              ? "Try a different serial, part or asset."
              : "Warranty details entered against unique items in inventory appear here."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Sr. No.</th>
                  <th className={thClass}>Serial Number</th>
                  <th className={thClass}>Component</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Cover</th>
                  <th className={thClass}>Start</th>
                  <th className={thClass}>End</th>
                  <th className={thClass}>Installed In</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((unit, index) => (
                  <tr key={unit.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} text-muted-foreground`}>{index + 1}</td>
                    <td className={`${tdClass} font-mono text-foreground`}>{unit.serial_number}</td>
                    <td className={`${tdClass} text-foreground`}>
                      {unit.material_name ?? unit.unit_type_name ?? unit.model_name ?? "—"}
                      {unit.brand_name && (
                        <span className="block text-xs text-muted-foreground">{unit.brand_name}</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {TYPE_LABELS[unit.warranty_type] ?? unit.warranty_type ?? "—"}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                          STATE_BADGES[unit.warranty_state] ?? STATE_BADGES.none
                        }`}
                      >
                        {STATE_LABELS[unit.warranty_state] ?? unit.warranty_state}
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{unit.warranty_start ?? "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{unit.warranty_end ?? "—"}</td>
                    <td className={tdClass}>
                      {unit.installed_in_code ? (
                        <span>
                          <span className="font-mono text-primary">{unit.installed_in_code}</span>
                          {unit.installed_in_name && (
                            <span className="block text-xs text-muted-foreground">{unit.installed_in_name}</span>
                          )}
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                          Inventory
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
