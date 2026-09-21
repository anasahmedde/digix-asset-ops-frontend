"use client";

import { AlertTriangle, CalendarClock, Check, Pencil, Play, Plus, Ticket, Trash2, Wrench, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import { MultiSelect } from "@/components/ui/multi-select";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { formatDate } from "@/lib/utils";

interface MaintenanceSchedule {
  id: string;
  title: string;
  maintenance_type: string;
  frequency: string;
  priority: string;
  device: string | null;
  device_code: string | null;
  device_name: string | null;
  device_status: string | null;
  site: string | null;
  site_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  vendors: string[];
  vendor_names: string[];
  required_components: ReqRow[];
  /** The day the rounds begin, which stays put as next_due moves on. */
  start_date: string | null;
  next_due: string;
  instructions: string;
  status: string;
  status_display: string;
  effective_status: string;
  is_active: boolean;
  created_at: string;
}

interface Option { id: string; label: string }

/** A material the visit takes along — picked from inventory, or (on older
 *  schedules) a name typed by hand. */
type ReqRow = { name: string; quantity: number; inventory_item?: string; inventory_unit_type?: string };

interface StockOption {
  value: string;
  id: string;
  kind: "item" | "product";
  name: string;
  label: string;
  /** How this component is counted — metres of cable, not "12". */
  unit: string;
}

interface BillingDefaults {
  is_billable: boolean;
  charge_to: string; // "" | "company" | "client" | "vendor"
}

interface MaintenanceRecordRow {
  id: string;
  performed_at: string;
  status: string;
  notes: string;
  cost: string | null;
  is_billable: boolean;
  charge_to: string;
  performed_by_name: string | null;
}

const PRIORITY_BADGES: Record<string, string> = {
  low: "bg-slate-500/10 text-slate-600 ring-slate-500/20",
  medium: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  high: "bg-red-500/10 text-red-600 ring-red-500/20",
};

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass =
  "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

/** How far on the next round is, said the way somebody would say it. */
const CYCLE_LABELS: Record<string, string> = {
  daily: "a day on",
  weekly: "a week on",
  monthly: "a month on",
  quarterly: "a quarter on",
  yearly: "a year on",
};

const TYPE_BADGES: Record<string, string> = {
  preventive: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  corrective: "bg-red-500/10 text-red-600 ring-red-500/20",
};

const FREQ_LABEL: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  one_time: "One-time",
};

// Supplier-side warranty types (mirrors backend derive_billability).
const SUPPLIER_SIDE_TYPES = ["supplier", "manufacturer", "extended"];

function BillingChip({ billable, chargeTo }: { billable: boolean; chargeTo: string }) {
  const label = billable
    ? `Billable${chargeTo ? ` to ${chargeTo}` : ""}`
    : `Covered by warranty${chargeTo ? ` — ${chargeTo}` : ""}`;
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-2xs font-medium ring-1 ${
        billable
          ? "bg-amber-500/10 text-amber-600 ring-amber-500/20"
          : "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
      }`}
    >
      {label}
    </span>
  );
}

export default function MaintenancePage() {
  const { user, canWrite } = useUser();
  const canEdit = canWrite("maintenance");
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<MaintenanceSchedule | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ type: "", frequency: "", active: "" });
  const [search, setSearch] = useState("");
  const [deviceOptions, setDeviceOptions] = useState<Option[]>([]);
  const [userOptions, setUserOptions] = useState<Option[]>([]);
  const [formDevice, setFormDevice] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  // Start date and frequency decide when the next round falls, so the form
  // holds both and shows the answer rather than asking for a third date.
  const [formStart, setFormStart] = useState("");
  const [formFrequency, setFormFrequency] = useState("monthly");
  const [formVendors, setFormVendors] = useState<string[]>([]);
  const [reqComponents, setReqComponents] = useState<ReqRow[]>([]);
  const [stockOptions, setStockOptions] = useState<StockOption[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<Option[]>([]);
  const [formAssetInfo, setFormAssetInfo] = useState<{
    components: { name: string; quantity: number }[];
    dims: string | null;
    /** Where the asset stands — the schedule's site follows it. */
    siteName: string | null;
  } | null>(null);
  const [completeFor, setCompleteFor] = useState<MaintenanceSchedule | null>(null);
  const [completeComponents, setCompleteComponents] = useState<{ id: string; name: string }[]>([]);
  // The cover the billing answer turns on, and who would be billed without it.
  const [completeCover, setCompleteCover] = useState<{
    covered: boolean;
    label: string;
    until: string | null;
    clientName: string | null;
  } | null>(null);
  const [usedComponents, setUsedComponents] = useState<string[]>([]);
  const [completePhotos, setCompletePhotos] = useState<File[]>([]);
  const [completing, setCompleting] = useState(false);
  // MW-01/02 billing: derived defaults from the asset's active warranties
  // (null = unknown → server derives on save) and the user's explicit edits
  // (null = untouched → omitted from the payload).
  const [completeBilling, setCompleteBilling] = useState<BillingDefaults | null>(null);
  const [pastRecords, setPastRecords] = useState<MaintenanceRecordRow[]>([]);
  // Guards openEdit's past-records fetch against out-of-order responses from
  // a previously opened schedule (null = no edit modal open).
  const openScheduleIdRef = useRef<string | null>(null);
  const searchParams = useSearchParams();
  const autoOpenedRef = useRef(false);

  // What a visit can take along: generic stock and opened unique products.
  useEffect(() => {
    Promise.allSettled([
      api.get("/inventory/items/", { params: { page_size: 500 } }),
      api.get("/inventory/products/", { params: { page_size: 500 } }),
    ]).then(([items, products]) => {
      const opts: StockOption[] = [];
      if (items.status === "fulfilled") {
        for (const it of items.value.data.results ?? items.value.data) {
          const name = it.material_name ?? it.sku;
          opts.push({
            value: `item:${it.id}`, id: it.id, kind: "item", name,
            unit: it.unit || "piece",
            label: `${name} · ${it.quantity} ${it.unit || "piece"} in stock`,
          });
        }
      }
      if (products.status === "fulfilled") {
        for (const p of products.value.data.results ?? products.value.data) {
          const name = [p.name, p.model_name].filter(Boolean).join(" ");
          opts.push({
            value: `product:${p.id}`, id: p.id, kind: "product", name,
            unit: p.unit || "piece",
            label: `${name} · ${p.in_stock_count} ${p.unit || "piece"} in stock`,
          });
        }
      }
      setStockOptions(opts);
    });
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      const { data } = await api.get("/maintenance/schedules/", { params: { page_size: 1000 } });
      setSchedules(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load maintenance schedules"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadOptions = useCallback(async () => {
    const [dev, users, sups] = await Promise.allSettled([
      // Only a live asset can be serviced, and only a technician attends. The
      // site is not fetched: it comes from whichever asset is chosen.
      api.get("/assets/devices/", { params: { status: "active", page_size: 1000 } }),
      api.get("/accounts/users/", { params: { role: "technician", is_active: true, page_size: 200 } }),
      api.get("/suppliers/", { params: { page_size: 1000 } }),
    ]);
    if (dev.status === "fulfilled")
      setDeviceOptions((dev.value.data.results ?? []).map((d: { id: string; asset_code: string; display_name: string | null }) => ({
        id: d.id,
        label: d.display_name ? `${d.asset_code} — ${d.display_name}` : d.asset_code,
      })));
    if (users.status === "fulfilled")
      setUserOptions((users.value.data.results ?? []).map((u: { id: string; first_name: string; last_name: string; username: string }) => ({
        id: u.id,
        label: u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username,
      })));
    if (sups.status === "fulfilled")
      setSupplierOptions((sups.value.data.results ?? []).map((v: { id: string; name: string }) => ({ id: v.id, label: v.name })));
  }, []);

  useEffect(() => {
    fetchSchedules();
    loadOptions();
  }, [fetchSchedules, loadOptions]);

  async function handleFormDeviceChange(id: string) {
    setFormDevice(id);
    setFormAssetInfo(null);
    if (!id) return;
    try {
      const { data } = await api.get(`/assets/devices/${id}/`);
      const dims = data.length_in && data.width_in
        ? `${data.length_in} × ${data.width_in}${data.depth_in ? ` × ${data.depth_in}` : ""} in`
        : data.diagonal_inches
          ? `${data.diagonal_inches}"`
          : null;
      setFormAssetInfo({
        components: (data.components ?? []).map((c: { name: string; quantity: number }) => ({ name: c.name, quantity: c.quantity })),
        dims,
        siteName: data.site_name ?? null,
      });
    } catch { /* card stays hidden */ }
  }

  async function startWork(s: MaintenanceSchedule) {
    try {
      await api.patch(`/maintenance/schedules/${s.id}/`, { status: "in_process" });
      toast.success("Maintenance started");
      fetchSchedules();
    } catch (err) {
      toast.error(getApiError(err, "Failed to start maintenance"));
    }
  }

  async function openComplete(s: MaintenanceSchedule) {
    setCompleteFor(s);
    setUsedComponents([]);
    setCompletePhotos([]);
    setCompleteComponents([]);
    setCompleteBilling(null);
    if (s.device) {
      try {
        const { data } = await api.get(`/assets/devices/${s.device}/`);
        setCompleteComponents((data.components ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
        setCompleteCover((prev) => ({
          covered: prev?.covered ?? false,
          label: prev?.label ?? "",
          until: prev?.until ?? null,
          clientName: data.client_name ?? null,
        }));
      } catch { /* components stay empty */ }
      try {
        // Mirror the backend default: active client warranty → company (or
        // vendor when a supplier-side warranty is also active); none → client.
        const { data } = await api.get("/warranties/", {
          params: { device: s.device, status: "active", page_size: 100 },
        });
        const list: { warranty_type: string; warranty_type_display?: string; end_date?: string }[] =
          data.results ?? data;
        const client = list.find((w) => w.warranty_type === "client");
        const supplierSide = list.find((w) => SUPPLIER_SIDE_TYPES.includes(w.warranty_type));
        const cover = client ?? supplierSide;
        setCompleteCover((prev) => ({
          covered: Boolean(client),
          label: cover?.warranty_type_display ?? (cover ? cover.warranty_type : ""),
          until: cover?.end_date ?? null,
          clientName: prev?.clientName ?? null,
        }));
        setCompleteBilling(
          client
            ? { is_billable: false, charge_to: supplierSide ? "vendor" : "company" }
            : { is_billable: true, charge_to: "client" }
        );
      } catch { /* unknown — billing derived server-side, shown after submit */ }
    }
  }

  async function submitComplete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!completeFor) return;
    setCompleting(true);
    const fd = new FormData(e.currentTarget);
    try {
      const { data: record } = await api.post("/maintenance/records/", {
        schedule: completeFor.id,
        performed_at: new Date().toISOString(),
        status: "completed",
        notes: fd.get("notes") || "",
        cost: fd.get("cost") || null,
        components_used: usedComponents,
        // Billing is not sent: the server reads the asset's cover, which is
        // the same thing this dialog is showing.
      });
      for (const photo of completePhotos) {
        const photoForm = new FormData();
        photoForm.append("record", record.id);
        photoForm.append("image", photo);
        await api.post("/maintenance/record-photos/", photoForm, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      toast.success("Maintenance completed — schedule rolled to next cycle", {
        description: record.is_billable
          ? `Billable${record.charge_to ? ` to ${record.charge_to}` : ""}`
          : `Covered by warranty${record.charge_to ? ` — charged to ${record.charge_to}` : ""}`,
      });
      setCompleteFor(null);
      fetchSchedules();
    } catch (err) {
      toast.error(getApiError(err, "Failed to complete maintenance"));
    } finally {
      setCompleting(false);
    }
  }

  async function openEdit(s: MaintenanceSchedule) {
    setSelected(s);
    handleFormDeviceChange(s.device ?? "");
    setFormAssignee(s.assigned_to ?? "");
    setFormStart(s.start_date?.split("T")[0] ?? "");
    setFormFrequency(s.frequency ?? "monthly");
    setFormVendors(s.vendors ?? []);
    setReqComponents(s.required_components ?? []);
    setPastRecords([]);
    setModalMode("edit");
    const scheduleId = s.id;
    openScheduleIdRef.current = scheduleId;
    try {
      const { data } = await api.get("/maintenance/records/", {
        params: { schedule: scheduleId, ordering: "-performed_at", page_size: 50 },
      });
      // Discard out-of-order responses once another schedule (or none) is open.
      if (openScheduleIdRef.current !== scheduleId) return;
      setPastRecords(data.results ?? data);
    } catch { /* past-records section stays hidden */ }
  }

  useEffect(() => {
    if (autoOpenedRef.current || loading) return;
    const scheduleId = searchParams.get("schedule");
    if (!scheduleId) return;
    autoOpenedRef.current = true;
    const found = schedules.find((s) => s.id === scheduleId);
    if (found) openEdit(found);
  }, [searchParams, loading, schedules]);

  function closeModal() {
    openScheduleIdRef.current = null;
    setModalMode(null);
    setSelected(null);
    setPastRecords([]);
  }

  /** How a requirement row is counted, from the stock line it names. */
  function unitOf(row: ReqRow): string {
    const opt = stockOptions.find(
      (o) => (row.inventory_item && o.id === row.inventory_item)
        || (row.inventory_unit_type && o.id === row.inventory_unit_type),
    );
    return opt?.unit ?? "";
  }

  /** Assets free to be scheduled: everything live, less what is already on a
   *  round. The schedule being edited keeps its own asset, or the field it is
   *  bound to would open empty. */
  const assetChoices = useMemo(() => {
    const taken = new Set(
      schedules
        .filter((s) => s.device && s.is_active && (s.effective_status || s.status) !== "completed")
        .filter((s) => s.id !== selected?.id)
        .map((s) => s.device as string),
    );
    return deviceOptions.filter((d: Option) => !taken.has(d.id));
  }, [schedules, deviceOptions, selected]);

  /** When the round after `start` falls, one cycle on. A one-time job has none. */
  function dueAfter(start: string, frequency: string): string {
    if (!start || frequency === "one_time") return start;
    const d = new Date(`${start}T00:00:00`);
    if (frequency === "daily") d.setDate(d.getDate() + 1);
    else if (frequency === "weekly") d.setDate(d.getDate() + 7);
    else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
    else if (frequency === "quarterly") d.setMonth(d.getMonth() + 3);
    else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
    // Built by hand, not through toISOString: the date is local and that
    // converts to UTC, which rolls it back a day everywhere east of London.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      title: fd.get("title"),
      // Scheduled ahead, so preventive. The site follows the asset, which the
      // server reads off the asset itself rather than trusting this form.
      maintenance_type: "preventive",
      frequency: fd.get("frequency"),
      priority: fd.get("priority"),
      device: fd.get("device") || null,
      assigned_to: fd.get("assigned_to") || null,
      vendors: fd.getAll("vendors"),
      required_components: reqComponents.filter((r) => r.inventory_item || r.inventory_unit_type || r.name.trim()),
      // The server works the next round out from these two, so it is not sent:
      // a date from here could only disagree with the ones it comes from.
      start_date: fd.get("start_date"),
      instructions: fd.get("instructions"),
      // Status is not asked for: a schedule being written has not started, and
      // what happens to it afterwards is recorded by the work, not typed here.
    };
    try {
      if (modalMode === "create") {
        await api.post("/maintenance/schedules/", payload);
        toast.success("Schedule created");
      } else if (selected) {
        await api.patch(`/maintenance/schedules/${selected.id}/`, payload);
        toast.success("Schedule updated");
      }
      closeModal();
      fetchSchedules();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save schedule"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(schedule: MaintenanceSchedule) {
    if (!confirm(`Delete schedule "${schedule.title}"? This cannot be undone.`))
      return;
    try {
      await api.delete(`/maintenance/schedules/${schedule.id}/`);
      toast.success("Schedule deleted");
      fetchSchedules();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — schedule may have linked records"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-red-600">
            <Wrench className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Maintenance</h1>
            <p className="text-muted-foreground">
              Manage preventive and corrective maintenance schedules
            </p>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={() => {
              setSelected(null);
              setFormDevice("");
              setFormAssetInfo(null);
              setFormAssignee("");
              setFormStart("");
              setFormFrequency("monthly");
              setFormVendors([]);
              setReqComponents([]);
              setModalMode("create");
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all"
          >
            <Plus className="h-4 w-4" /> Add Schedule
          </button>
        )}
      </div>

      {/* What needs attention, before the full list: planned visits in the
          next week, and corrective jobs already past the date promised when
          the asset was taken out of service. */}
      {!loading && (() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekOut = new Date(today);
        weekOut.setDate(weekOut.getDate() + 7);
        const state = (s: MaintenanceSchedule) => s.effective_status || s.status;
        const upcoming = schedules
          .filter((s) => s.maintenance_type === "preventive" && state(s) !== "completed" && s.next_due)
          .filter((s) => { const d = new Date(s.next_due); return d >= today && d <= weekOut; })
          .sort((a, b) => a.next_due.localeCompare(b.next_due));
        const late = schedules
          .filter((s) => s.maintenance_type === "corrective" && state(s) === "overdue")
          .sort((a, b) => a.next_due.localeCompare(b.next_due));
        const daysLate = (due: string) => Math.max(1, Math.round((today.getTime() - new Date(due).getTime()) / 86400000));

        if (upcoming.length === 0 && late.length === 0) {
          return (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-700">
              <Check className="h-4 w-4" />
              Nothing planned in the next 7 days, and no corrective job is past its due date.
            </div>
          );
        }
        return (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold text-foreground">Upcoming planned maintenance</p>
                <span className="ml-auto rounded-full bg-blue-500/10 px-2 py-0.5 text-2xs font-semibold text-blue-600">{upcoming.length} in 7 days</span>
              </div>
              {upcoming.length === 0 ? (
                <p className="text-xs text-muted-foreground">No preventive visits due this week.</p>
              ) : (
                <ul className="space-y-1.5">
                  {upcoming.slice(0, 4).map((s) => (
                    <li key={s.id}>
                      <button onClick={() => openEdit(s)} className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-blue-500/10">
                        <span className="min-w-0 truncate text-foreground">{s.title} <span className="font-mono text-muted-foreground">{s.device_code ?? ""}</span></span>
                        <span className="shrink-0 font-medium text-blue-600">{new Date(s.next_due).toLocaleDateString()}</span>
                      </button>
                    </li>
                  ))}
                  {upcoming.length > 4 && <li className="px-2 text-2xs text-muted-foreground">+{upcoming.length - 4} more</li>}
                </ul>
              )}
            </div>
            <div className={`rounded-xl border p-4 ${late.length ? "border-red-500/25 bg-red-500/5" : "border-border bg-card"}`}>
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${late.length ? "text-red-600" : "text-muted-foreground"}`} />
                <p className="text-sm font-semibold text-foreground">Corrective maintenance past due</p>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-2xs font-semibold ${late.length ? "bg-red-500/10 text-red-600" : "bg-secondary text-muted-foreground"}`}>{late.length} overdue</span>
              </div>
              {late.length === 0 ? (
                <p className="text-xs text-muted-foreground">Every repair is within the date it was promised by.</p>
              ) : (
                <ul className="space-y-1.5">
                  {late.slice(0, 4).map((s) => (
                    <li key={s.id}>
                      <button onClick={() => openEdit(s)} className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-red-500/10">
                        <span className="min-w-0 truncate text-foreground">{s.title} <span className="font-mono text-muted-foreground">{s.device_code ?? ""}</span></span>
                        <span className="shrink-0 font-medium text-red-600">{daysLate(s.next_due)}d late</span>
                      </button>
                    </li>
                  ))}
                  {late.length > 4 && <li className="px-2 text-2xs text-muted-foreground">+{late.length - 4} more</li>}
                </ul>
              )}
            </div>
          </div>
        );
      })()}

      <FilterBar
        filters={[
          { key: "type", label: "Type", options: Object.keys(TYPE_BADGES).map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })) },
          { key: "frequency", label: "Frequency", options: Object.entries(FREQ_LABEL).map(([v, l]) => ({ value: v, label: l })) },
          { key: "status", label: "Status", options: [["active", "Active"], ["pending", "Pending"], ["in_process", "In Process"], ["on_hold", "On Hold"], ["overdue", "Over Due"], ["completed", "Completed"]].map(([v, l]) => ({ value: v, label: l })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by title, site, device..."
      />

      {(() => {
        const filtered = schedules.filter((s) => {
          if (filterValues.type && s.maintenance_type !== filterValues.type) return false;
          if (filterValues.frequency && s.frequency !== filterValues.frequency) return false;
          if (filterValues.status && (s.effective_status || s.status) !== filterValues.status) return false;
          if (search) {
            const q = search.toLowerCase();
            if (!s.title.toLowerCase().includes(q) && !(s.site_name || "").toLowerCase().includes(q) && !(s.device_code || "").toLowerCase().includes(q) && !(s.assigned_to_name || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Wrench className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No schedules found</h3>
          <p className="mt-2 text-sm text-muted-foreground">{schedules.length > 0 ? "Try adjusting your filters." : "Add a schedule to start tracking maintenance activities."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Title</th>
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Frequency</th>
                  <th className={thClass}>Priority</th>
                  <th className={thClass}>Next Due</th>
                  <th className={thClass}>Asset ID</th>
                  <th className={thClass}>Asset Name</th>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Assigned To</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => openEdit(s)}
                    className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30"
                  >
                    <td className={`${tdClass} font-medium text-foreground`}>
                      {s.title}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${TYPE_BADGES[s.maintenance_type] ?? "bg-secondary/500/10 text-muted-foreground ring-gray-500/20"}`}
                      >
                        {s.maintenance_type}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className="inline-flex rounded-full bg-secondary/500/10 px-2.5 py-0.5 text-xs font-medium text-muted-foreground ring-1 ring-gray-500/20">
                        {FREQ_LABEL[s.frequency] ?? s.frequency}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ${PRIORITY_BADGES[s.priority] ?? PRIORITY_BADGES.medium}`}>
                        {s.priority || "medium"}
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {s.next_due
                        ? new Date(s.next_due).toLocaleDateString()
                        : "-"}
                    </td>
                    <td className={`${tdClass} font-mono text-muted-foreground`}>
                      {s.device_code || "-"}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {s.device_name || "-"}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {s.site_name || "-"}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {s.assigned_to_name || "-"}
                      {(s.vendor_names ?? []).length > 0 && (
                        <span className="block text-xs">Vendors: {s.vendor_names.join(", ")}</span>
                      )}
                    </td>
                    <td className={tdClass}>
                      {(() => {
                        const st = s.effective_status || s.status || "active";
                        const styles: Record<string, string> = {
                          active: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
                          pending: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
                          in_process: "bg-cyan-500/10 text-cyan-600 ring-cyan-500/20",
                          on_hold: "bg-slate-500/10 text-slate-600 ring-slate-500/20",
                          overdue: "bg-red-500/10 text-red-600 ring-red-500/20",
                          completed: "bg-gray-500/10 text-gray-600 ring-gray-500/20",
                        };
                        const labels: Record<string, string> = { in_process: "In Process", on_hold: "On Hold", overdue: "Over Due" };
                        const text = labels[st] || st.charAt(0).toUpperCase() + st.slice(1);
                        return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${styles[st] || styles.active}`}>{text}</span>;
                      })()}
                    </td>
                    <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                      {(canEdit || user?.id === s.assigned_to) ? (
                        <div className="flex items-center gap-1">
                          {["active", "pending", "overdue"].includes(s.effective_status || s.status) && (
                            <button
                              onClick={() => startWork(s)}
                              className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-2xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20"
                              title="Start maintenance"
                            >
                              <Play className="h-3 w-3" /> Start
                            </button>
                          )}
                          {s.maintenance_type === "preventive" && s.device && (
                            <Link
                              href={`/tickets?create=1&device=${s.device}&category=repair`}
                              className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-2xs font-medium text-red-600 transition-colors hover:bg-red-500/20"
                              title="Found a major fault? Raise a maintenance ticket"
                            >
                              <Ticket className="h-3 w-3" /> Ticket
                            </Link>
                          )}
                          {(s.effective_status || s.status) !== "completed" && (
                            <button
                              onClick={() => openComplete(s)}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-2xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/20"
                              title="Complete this cycle"
                            >
                              <Check className="h-3 w-3" /> Complete
                            </button>
                          )}
                          {canEdit && (
                          <button
                            onClick={() => openEdit(s)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          )}
                          {canEdit && (() => {
                            // A fault is closed, not deleted: deleting the open
                            // job would strand the asset out of service.
                            const stranding =
                              s.maintenance_type === "corrective" &&
                              (s.effective_status || s.status) !== "completed" &&
                              s.device_status === "under_maintenance";
                            return (
                          <button
                            onClick={() => handleDelete(s)}
                            disabled={stranding}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                            title={stranding ? "The asset is out of service on this job — complete it instead" : "Delete"}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                            );
                          })()}
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
      );
      })()}

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 py-8 backdrop-blur-sm">
          <div className="my-auto max-h-none w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl sm:max-h-[90vh] sm:overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {modalMode === "create"
                  ? "Add New Schedule"
                  : "Edit Schedule"}
              </h2>
              <button
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="title" className={labelClass}>
                  Title
                </label>
                <input
                  id="title"
                  name="title"
                  required
                  defaultValue={selected?.title ?? ""}
                  className={inputClass}
                  placeholder="e.g. Monthly HVAC Filter Replacement"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  {/* Work planned ahead is preventive by definition.
                      Corrective work is raised by a fault, from a ticket or
                      from the asset going down, never scheduled here. */}
                  <label className={labelClass}>Maintenance Type</label>
                  <div className={`${inputClass} flex items-center justify-between gap-2`}>
                    <span className="text-foreground">Preventive</span>
                    <span className="text-2xs text-muted-foreground">scheduled work</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="frequency" className={labelClass}>
                    Frequency
                  </label>
                  <select
                    id="frequency"
                    name="frequency"
                    value={formFrequency}
                    onChange={(e) => setFormFrequency(e.target.value)}
                    className={inputClass}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                    <option value="one_time">One-time</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  {/* Only live assets are serviceable, so the list is short
                      enough to read rather than search. */}
                  <label htmlFor="device" className={labelClass}>Asset</label>
                  <select
                    id="device"
                    name="device"
                    value={formDevice}
                    onChange={(e) => handleFormDeviceChange(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select asset…</option>
                    {assetChoices.map((d) => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  {/* Where the asset stands is recorded on the asset when it
                      is installed. Asking again would only invite a second
                      answer that disagrees with the first. */}
                  <label htmlFor="m-site" className={labelClass}>Site</label>
                  <div id="m-site" className={`${inputClass} flex items-center justify-between gap-2`}>
                    <span className="truncate text-foreground">
                      {formAssetInfo?.siteName ?? (formDevice ? "No site on this asset" : "Pick an asset first")}
                    </span>
                    {formAssetInfo?.siteName && (
                      <span className="shrink-0 text-2xs text-muted-foreground">from the asset</span>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {/* Few enough technicians to read at a glance, so a list
                      rather than a type-ahead nobody can guess into. */}
                  <label htmlFor="assigned_to" className={labelClass}>Assign To</label>
                  <select
                    id="assigned_to"
                    name="assigned_to"
                    value={formAssignee}
                    onChange={(e) => setFormAssignee(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Unassigned</option>
                    {userOptions.map((u) => (
                      <option key={u.id} value={u.id}>{u.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={labelClass}>Vendors (can be multiple)</label>
                  <MultiSelect
                    options={supplierOptions}
                    values={formVendors}
                    onChange={setFormVendors}
                    name="vendors"
                    placeholder="Select vendors…"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="m-priority" className={labelClass}>Priority</label>
                  <select id="m-priority" name="priority" defaultValue={selected?.priority ?? "medium"} className={inputClass}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              {formAssetInfo && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
                  <p className="mb-1 font-semibold text-foreground">
                    Asset components: {formAssetInfo.components.length}
                    {formAssetInfo.dims ? ` · dimensions ${formAssetInfo.dims}` : ""}
                  </p>
                  {formAssetInfo.components.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {formAssetInfo.components.map((c, i) => (
                        <span key={i} className="rounded-full bg-card px-2 py-0.5 text-2xs text-muted-foreground ring-1 ring-border">
                          {c.name} ×{c.quantity}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Single-unit asset — no components recorded.</p>
                  )}
                </div>
              )}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Components required for this maintenance</label>
                  <button
                    type="button"
                    onClick={() => setReqComponents((rows) => [...rows, { name: "", quantity: 1 }])}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-2xs font-medium text-primary transition-colors hover:bg-primary/5"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
                {reqComponents.length === 0 ? (
                  <p className="text-2xs text-muted-foreground">None added — pick what the technician takes along from inventory.</p>
                ) : (
                  <div className="space-y-2">
                    {reqComponents.map((row, i) => (
                      <div key={i} className="flex gap-2">
                        <select
                          value={row.inventory_item ? `item:${row.inventory_item}` : row.inventory_unit_type ? `product:${row.inventory_unit_type}` : ""}
                          onChange={(e) => {
                            const opt = stockOptions.find((o) => o.value === e.target.value);
                            setReqComponents((rows) => rows.map((r, j) => (j === i
                              ? {
                                  quantity: r.quantity,
                                  name: opt?.name ?? "",
                                  ...(opt?.kind === "item" ? { inventory_item: opt.id } : {}),
                                  ...(opt?.kind === "product" ? { inventory_unit_type: opt.id } : {}),
                                }
                              : r)));
                          }}
                          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
                        >
                          <option value="">
                            {row.name && !row.inventory_item && !row.inventory_unit_type ? `${row.name} (typed by hand)` : "Select from inventory…"}
                          </option>
                          <optgroup label="Stock items">
                            {stockOptions.filter((o) => o.kind === "item").map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                          <optgroup label="Unique items">
                            {stockOptions.filter((o) => o.kind === "product").map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </optgroup>
                        </select>
                        {/* A bare number says nothing: twelve of a cable is
                            twelve metres, twelve of a mount is twelve of them. */}
                        <div className="flex h-9 w-32 shrink-0 items-center rounded-lg border border-border bg-card pr-2 focus-within:border-primary/50">
                          <input
                            type="number"
                            min={1}
                            value={row.quantity}
                            onChange={(e) => setReqComponents((rows) => rows.map((r, j) => (j === i ? { ...r, quantity: Number(e.target.value) || 1 } : r)))}
                            title="Quantity"
                            placeholder="Qty"
                            className="h-full w-full min-w-0 rounded-l-lg bg-transparent px-3 text-sm text-foreground focus:outline-none"
                          />
                          <span className="shrink-0 text-2xs text-muted-foreground">
                            {unitOf(row) || "qty"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReqComponents((rows) => rows.filter((_, j) => j !== i))}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-destructive"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="start_date" className={labelClass}>
                    Start Date
                  </label>
                  <input
                    id="start_date"
                    name="start_date"
                    type="date"
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-2xs text-muted-foreground">The day these rounds begin.</p>
                </div>
                {/* A one-time job happens once, on its start date, so there is
                    no next round to report. */}
                {formFrequency !== "one_time" && (
                  <div className="space-y-1.5">
                    <label htmlFor="next_due" className={labelClass}>Next Due Date</label>
                    <div id="next_due" className={`${inputClass} flex items-center justify-between gap-2`}>
                      <span className="text-foreground">
                        {formStart ? formatDate(dueAfter(formStart, formFrequency)) : "Pick a start date"}
                      </span>
                      {formStart && (
                        <span className="shrink-0 text-2xs text-muted-foreground">{CYCLE_LABELS[formFrequency] ?? ""}</span>
                      )}
                    </div>
                    <p className="text-2xs text-muted-foreground">
                      Worked out from the start date and how often the round repeats.
                    </p>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="instructions" className={labelClass}>
                  Instructions
                </label>
                <textarea
                  id="instructions"
                  name="instructions"
                  rows={3}
                  defaultValue={selected?.instructions ?? ""}
                  className={`${inputClass} h-auto py-2`}
                  placeholder="Step-by-step maintenance instructions..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
                >
                  {saving
                    ? "Saving..."
                    : modalMode === "create"
                      ? "Create Schedule"
                      : "Save Changes"}
                </button>
              </div>
            </form>
            {modalMode === "edit" && pastRecords.length > 0 && (
              <div className="mt-5 border-t border-border pt-4">
                <p className="mb-2 text-xs font-semibold text-foreground">
                  Past records ({pastRecords.length})
                </p>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {pastRecords.map((r) => (
                    <div key={r.id} className="rounded-lg border border-border bg-secondary/20 p-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-foreground">
                          {new Date(r.performed_at).toLocaleDateString()}
                        </span>
                        <BillingChip billable={r.is_billable} chargeTo={r.charge_to} />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                        <span className="capitalize">{r.status.replace(/_/g, " ")}</span>
                        {r.performed_by_name && <span>by {r.performed_by_name}</span>}
                        {r.cost && <span>Cost: {r.cost}</span>}
                      </div>
                      {r.notes && <p className="mt-1 text-muted-foreground">{r.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Complete-maintenance modal */}
      {completeFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 py-8 backdrop-blur-sm">
          <div className="my-auto max-h-none w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl sm:max-h-[90vh] sm:overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Complete — {completeFor.title}</h2>
              <button onClick={() => setCompleteFor(null)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitComplete} className="space-y-4">
              {completeFor.maintenance_type === "preventive" && completeFor.device && (
                <p className="rounded-lg border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground">
                  Found something this visit cannot fix?{" "}
                  <Link href={`/tickets?create=1&device=${completeFor.device}&category=repair`} className="font-medium text-primary hover:underline">
                    Raise a maintenance ticket
                  </Link>
                  {" "}— it follows the normal ticket workflow.
                </p>
              )}
              {(completeFor.required_components ?? []).length > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="mb-1 text-xs font-semibold text-foreground">Required for this maintenance</p>
                  <div className="flex flex-wrap gap-1.5">
                    {completeFor.required_components.map((rc, i) => (
                      <span key={i} className="rounded-full bg-card px-2 py-0.5 text-2xs text-muted-foreground ring-1 ring-border">
                        {rc.name} ×{rc.quantity}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {completeComponents.length > 0 && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Components used / serviced</label>
                  <div className="flex flex-wrap gap-2">
                    {completeComponents.map((c) => {
                      const on = usedComponents.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setUsedComponents((cur) => (on ? cur.filter((v) => v !== c.id) : [...cur, c.id]))}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                            on ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {on && <Check className="h-3 w-3" />}
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="mc-notes" className={labelClass}>Work done / notes</label>
                <textarea id="mc-notes" name="notes" rows={3} className={`${inputClass} h-auto py-2`} placeholder="What was done, parts replaced, observations…" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="mc-cost" className={labelClass}>Cost (optional)</label>
                  <input id="mc-cost" name="cost" type="number" step="0.01" className={inputClass} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="mc-photos" className={labelClass}>Photos</label>
                  <input
                    id="mc-photos"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setCompletePhotos(Array.from(e.target.files ?? []))}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary"
                  />
                  {completePhotos.length > 0 && (
                    <p className="text-2xs text-muted-foreground">{completePhotos.length} photo{completePhotos.length > 1 ? "s" : ""} selected</p>
                  )}
                </div>
              </div>
              <div className="space-y-2.5 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">Billing</p>
                  {completeBilling ? (
                    <BillingChip billable={completeBilling.is_billable} chargeTo={completeBilling.charge_to} />
                  ) : (
                    <span className="text-2xs text-muted-foreground">Derived from the asset&apos;s warranty on save</span>
                  )}
                </div>
                {/* Cover decides who pays, so it is stated rather than asked
                    for — a tick box here could only contradict the warranty. */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-0.5">
                    <p className="text-2xs uppercase tracking-wider text-muted-foreground">Warranty</p>
                    {completeCover === null ? (
                      <p className="text-sm text-muted-foreground">Checking the asset&apos;s cover…</p>
                    ) : completeCover.covered ? (
                      <p className="text-sm font-medium text-emerald-600">
                        Under warranty
                        <span className="block text-2xs font-normal text-muted-foreground">
                          {[completeCover.label, completeCover.until ? `to ${formatDate(completeCover.until)}` : null]
                            .filter(Boolean).join(" · ")}
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm font-medium text-amber-600">
                        Not under warranty
                        <span className="block text-2xs font-normal text-muted-foreground">
                          No active client cover on this asset.
                        </span>
                      </p>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-2xs uppercase tracking-wider text-muted-foreground">Charged to</p>
                    <p className="text-sm font-medium text-foreground">
                      {completeBilling === null
                        ? "Worked out on save"
                        : completeBilling.charge_to === "client"
                          ? completeCover?.clientName ?? "The client"
                          : completeBilling.charge_to === "vendor"
                            ? "The vendor, under its warranty"
                            : "Us, under the client's warranty"}
                      <span className="block text-2xs font-normal text-muted-foreground">
                        From the asset&apos;s cover — not entered here.
                      </span>
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-2xs text-muted-foreground">
                Completing logs a maintenance record and rolls the schedule to its next {FREQ_LABEL[completeFor.frequency]?.toLowerCase() ?? ""} cycle{completeFor.frequency === "one_time" ? " (one-time schedules close out)" : ""}.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCompleteFor(null)} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                  Cancel
                </button>
                <button type="submit" disabled={completing} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                  {completing ? "Saving..." : "Complete Maintenance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
