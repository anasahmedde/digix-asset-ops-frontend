"use client";

import { CalendarPlus, Pencil, Search, Shield } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { SearchSelect } from "@/components/ui/search-select";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import { ExtendWarranty, type ExtendTarget } from "@/components/warranties/extend-warranty";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { formatDate, formatTerm, todayIso } from "@/lib/utils";

/** A unique part as the store holds it, with the vendor's cover on it. */
interface UnitWarranty {
  id: string;
  unit_code: string;
  serial_number: string;
  material_name: string | null;
  unit_type_name: string | null;
  model_name: string;
  brand_name: string | null;
  status: string;
  has_warranty: boolean;
  warranty_start: string | null;
  warranty_end: string | null;
  warranty_months: number | null;
  /** Ours, from the component-warranty series. */
  warranty_reference?: string;
  /** The vendor's own certificate number. */
  warranty_vendor_reference?: string;
  warranty_state: string;
  supplier: string | null;
  supplier_name: string | null;
  grn_number: string | null;
  installed_in_code: string | null;
  installed_in_name: string | null;
}

const searchClass =
  "flex h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
// The same table as the client and vendor lists, so the three read alike.
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

// Named and coloured as the other two lists name a warranty's state.
const STATE_BADGES: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  expired: "bg-red-500/10 text-red-600 ring-red-500/20",
};
const STATE_LABELS: Record<string, string> = { active: "Active", expired: "Expired" };

const partName = (u: UnitWarranty) => u.unit_type_name || u.material_name || u.model_name || "—";

/**
 * The vendor's cover on unique parts. Normally typed at inspection in
 * Procurement and carried onto each part; recorded here by hand when the
 * paperwork came later, and extended here when the vendor extends it.
 */
export function ComponentWarranties({ addTick = 0 }: { addTick?: number }) {
  const { canWrite } = useUser();
  const canEdit = canWrite("warranties");
  const [units, setUnits] = useState<UnitWarranty[]>([]);
  const sort = useSortState();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [extendFor, setExtendFor] = useState<ExtendTarget | null>(null);
  // Recording cover: on a part chosen here (new), or on the row clicked (edit).
  const [recording, setRecording] = useState<UnitWarranty | "new" | null>(null);

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

  // The page header's "Add Warranty" opens the form here.
  useEffect(() => {
    if (addTick > 0) setRecording("new");
  }, [addTick]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return units.filter((unit) => {
      if (state && unit.warranty_state !== state) return false;
      if (!query) return true;
      return [unit.serial_number, unit.unit_code, unit.material_name, unit.unit_type_name, unit.model_name,
              unit.installed_in_code, unit.installed_in_name, unit.supplier_name, unit.warranty_reference, unit.warranty_vendor_reference]
        .some((value) => (value ?? "").toLowerCase().includes(query));
    });
  }, [units, search, state]);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        The vendor&apos;s cover on unique parts — typed at inspection in Procurement, one row per
        physical part, showing where that part is now.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by serial, part, asset, vendor or reference..."
            className={searchClass}
          />
        </div>
        <select
          value={state}
          onChange={(e) => setState(e.target.value)}
          className="h-10 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
        >
          <option value="">Status: All</option>
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
              : "Cover typed at inspection in Procurement appears here, one row per part."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <SortTh sort={sort} k="serial_number" className={thClass}>Serial No.</SortTh>
                  <SortTh sort={sort} k="part" className={thClass}>Component</SortTh>
                  <SortTh sort={sort} k="warranty_state" className={thClass}>Status</SortTh>
                  <SortTh sort={sort} k="warranty_start" className={thClass}>Start Date</SortTh>
                  <SortTh sort={sort} k="warranty_end" className={thClass}>Valid Till</SortTh>
                  <SortTh sort={sort} k="warranty_months" className={thClass}>Term</SortTh>
                  <SortTh sort={sort} k="supplier_name" className={thClass}>Vendor</SortTh>
                  <SortTh sort={sort} k="reference" className={thClass}>Reference #</SortTh>
                  <SortTh sort={sort} k="installed_in_code" className={thClass}>Installed In</SortTh>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortRows(filtered, sort, { part: partName, reference: (u) => u.warranty_reference }).map((unit) => (
                  <tr key={unit.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} whitespace-nowrap font-mono text-foreground`}>{unit.serial_number}</td>
                    <td className={`${tdClass} text-foreground`}>
                      {partName(unit)}
                      {unit.brand_name && <span className="block text-xs text-muted-foreground">{unit.brand_name}</span>}
                    </td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATE_BADGES[unit.warranty_state] ?? "bg-secondary text-muted-foreground ring-border"}`}>
                        {STATE_LABELS[unit.warranty_state] ?? unit.warranty_state}
                      </span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>{unit.warranty_start ? formatDate(unit.warranty_start) : "—"}</td>
                    <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>{unit.warranty_end ? formatDate(unit.warranty_end) : "—"}</td>
                    <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>{unit.warranty_months ? formatTerm(unit.warranty_months) : "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{unit.supplier_name || "—"}</td>
                    <td className={`${tdClass} whitespace-nowrap font-mono text-xs text-muted-foreground`}>
                      {unit.warranty_reference || "—"}
                      {unit.warranty_vendor_reference && (
                        <span className="block font-sans text-2xs" title="Vendor's reference">Vendor: {unit.warranty_vendor_reference}</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      {unit.installed_in_code ? (
                        <span>
                          <span className="font-mono text-primary">{unit.installed_in_code}</span>
                          {unit.installed_in_name && (
                            <span className="block text-xs text-muted-foreground">{unit.installed_in_name}</span>
                          )}
                        </span>
                      ) : (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">In store</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      {canEdit ? (
                        <div className="flex items-center gap-1">
                          {unit.warranty_end && (
                            <button
                              onClick={() => setExtendFor({
                                endpoint: `/inventory/units/${unit.id}/extend-warranty/`,
                                label: unit.serial_number,
                                kind: "Component",
                                currentEnd: unit.warranty_end!,
                              })}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
                              title="Extend this warranty"
                            >
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setRecording(unit)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title="Edit the cover"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ExtendWarranty target={extendFor} onClose={() => setExtendFor(null)} onDone={fetchUnits} />
      {recording && (
        <RecordCover
          unit={recording === "new" ? null : recording}
          onClose={() => setRecording(null)}
          onDone={fetchUnits}
        />
      )}
    </div>
  );
}

/** Record the vendor's cover on one part: which part, from when, for how long. */
function RecordCover({
  unit, onClose, onDone,
}: {
  unit: UnitWarranty | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [parts, setParts] = useState<UnitWarranty[]>([]);
  const [partId, setPartId] = useState(unit?.id ?? "");
  const [vendors, setVendors] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/suppliers/", { params: { page_size: 500 } })
      .then((r) => setVendors(r.data.results ?? r.data))
      .catch(() => {});
    if (!unit) {
      api.get("/inventory/units/", { params: { page_size: 1000 } })
        .then((r) => setParts(r.data.results ?? r.data))
        .catch(() => {});
    }
  }, [unit]);

  const chosen = unit ?? parts.find((p) => p.id === partId) ?? null;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chosen) {
      toast.error("Pick the part by its serial number");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const months = String(fd.get("months") || "");
    const endDate = String(fd.get("end_date") || "");
    if (!months && !endDate) {
      toast.error("Give the cover in months, or its end date");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/inventory/units/${chosen.id}/warranty/`, {
        start_date: String(fd.get("start_date") || ""),
        ...(endDate ? { end_date: endDate } : { months: Number(months) }),
        supplier: String(fd.get("supplier") || "") || null,
        vendor_reference: String(fd.get("vendor_reference") || ""),
      });
      toast.success(`Warranty recorded on ${chosen.serial_number}`);
      onClose();
      onDone();
    } catch (err) {
      toast.error(getApiError(err, "Could not record the warranty"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={unit ? `Component warranty — ${unit.serial_number}` : "Add component warranty"}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label className={labelClass}>Part (serial number) *</label>
          {unit ? (
            <p className={`${inputClass} items-center bg-secondary/40`}>
              <span className="font-mono">{unit.serial_number}</span>
              <span className="ml-2 text-muted-foreground">{partName(unit)}</span>
            </p>
          ) : (
            <SearchSelect
              options={parts.map((p) => ({ id: p.id, label: `${p.serial_number} — ${partName(p)}` }))}
              value={partId}
              onChange={setPartId}
              placeholder="Search by serial number or part…"
            />
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="cw-start" className={labelClass}>Start date</label>
            <input
              id="cw-start"
              name="start_date"
              type="date"
              max={todayIso()}
              defaultValue={chosen?.warranty_start ?? todayIso()}
              key={chosen?.id ?? "none"}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cw-months" className={labelClass}>Term (months)</label>
            <input id="cw-months" name="months" type="number" min={1} defaultValue={chosen?.warranty_months ?? ""} key={`m-${chosen?.id ?? "none"}`} placeholder="e.g. 12" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cw-end" className={labelClass}>…or valid till</label>
            <input id="cw-end" name="end_date" type="date" className={inputClass} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="cw-vendor" className={labelClass}>Vendor</label>
            <select key={`v-${vendors.length}-${chosen?.id ?? ""}`} id="cw-vendor" name="supplier" defaultValue={chosen?.supplier ?? ""} className={inputClass}>
              <option value="">—</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cw-ref" className={labelClass}>Vendor reference</label>
            <input id="cw-ref" name="vendor_reference" defaultValue={chosen?.warranty_vendor_reference ?? ""} key={`r-${chosen?.id ?? "none"}`} placeholder="Vendor's warranty certificate no." className={inputClass} />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Warranty"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
