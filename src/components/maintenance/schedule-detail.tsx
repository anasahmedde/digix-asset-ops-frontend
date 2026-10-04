"use client";

import { ArrowLeft, CalendarClock, Check, Package, Pause, Pencil, Play, Plus, Ticket as TicketIcon, Trash2, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { Modal } from "@/components/ui/modal";
import { SearchSelect } from "@/components/ui/search-select";
import { useUser } from "@/lib/user-context";
import { formatDate, formatDateTime } from "@/lib/utils";

/** A part a technician has asked for on this job, and the answer given. */
interface PartRequest {
  id: string;
  item: string | null;
  unit_type: string | null;
  name: string;
  what: string;
  unit: string;
  quantity_requested: number;
  quantity_approved: number | null;
  status: string;
  status_display: string;
  requested_by_name: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string;
  issue_number: string | null;
  issue_status: string | null;
  quantity_issued: number | null;
  issued_serials: string[];
  /** The round this line was asked for on. */
  visit: string | null;
  /** Null until the visit that used them was closed out. */
  quantity_used: number | null;
  quantity_returned: number;
  return_reference: string;
  created_at: string;
}

/** One round of the schedule: planned, under way, or closed out. */
interface Visit {
  id: string;
  due_date: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  status: string;
  status_display: string;
  started_at: string | null;
  record: string | null;
  performed_at: string | null;
  performed_by_name: string | null;
  cost: string | null;
  is_billable: boolean | null;
  charge_to: string;
  record_notes: string;
  component_names: string[];
  photos: { id: string }[];
}

interface StockOption {
  value: string;
  id: string;
  kind: "item" | "product";
  name: string;
  label: string;
  unit: string;
}

/** The job as the list knows it — the detail fills in the rest itself. */
export interface ScheduleSummary {
  id: string;
  title: string;
  maintenance_type: string;
  frequency: string;
  priority: string;
  status: string;
  status_display?: string;
  effective_status?: string;
  device: string | null;
  device_code: string | null;
  device_name: string | null;
  site_name: string | null;
  assigned_to_name: string | null;
  vendor_names?: string[];
  start_date: string | null;
  next_due: string;
  instructions: string;
  is_active: boolean;
  /** The fault that raised this job, when it came in as a ticket. */
  ticket?: string | null;
  ticket_number?: string | null;
  /** Changes whenever the job does — the visits list reads it as its cue. */
  updated_at?: string;
}

const card = "rounded-xl border border-border bg-card p-5";
const label = "text-2xs font-semibold uppercase tracking-wider text-muted-foreground";
const inputClass =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";

const PART_BADGES: Record<string, string> = {
  requested: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  rejected: "bg-red-500/10 text-red-600 ring-red-500/20",
  cancelled: "bg-secondary text-muted-foreground ring-border",
};

function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={label}>{name}</p>
      <div className="mt-0.5 text-sm text-foreground">{children ?? "—"}</div>
    </div>
  );
}

export function ScheduleDetail({
  schedule,
  onBack,
  onChanged,
  onComplete,
  onEdit,
}: {
  schedule: ScheduleSummary;
  onBack: () => void;
  onChanged: () => void;
  /** Completing and editing belong to the job, not to a list row. */
  onComplete: () => void;
  onEdit?: () => void;
}) {
  const { user } = useUser();
  const [parts, setParts] = useState<PartRequest[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [technicians, setTechnicians] = useState<{ id: string; label: string }[]>([]);
  const [planning, setPlanning] = useState(false);
  const [stock, setStock] = useState<StockOption[]>([]);
  const [asking, setAsking] = useState(false);
  // The kind is settled first: counted stock and individually tracked units
  // behave differently, and mixing them in one list hides that.
  const [askKind, setAskKind] = useState<"generic" | "unique">("generic");
  const [askPart, setAskPart] = useState("");
  const [askQty, setAskQty] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  // How much of a line the supervisor is releasing, while they decide.
  const [cutTo, setCutTo] = useState<Record<string, number>>({});
  const [cover, setCover] = useState<{ covered: boolean; label: string; until: string | null } | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  // Asked at the moment somebody sets off: coming back for a part is the
  // expensive mistake, and the question costs one tap.
  const [askingBeforeStart, setAskingBeforeStart] = useState(false);

  const role = user?.role ?? "";
  const canDecide = ["super_admin", "group_head", "ops_manager", "supervisor"].includes(role);
  const canAsk = canDecide || role === "technician";

  const loadParts = useCallback(async () => {
    try {
      const { data } = await api.get("/maintenance/part-requests/", {
        params: { schedule: schedule.id, page_size: 200 },
      });
      setParts(data.results ?? data);
    } catch { /* the panel shows nothing rather than a stale list */ }
  }, [schedule.id]);

  const loadVisits = useCallback(async () => {
    try {
      const { data } = await api.get("/maintenance/visits/", {
        params: { schedule: schedule.id, ordering: "due_date", page_size: 100 },
      });
      setVisits(data.results ?? data);
    } catch { /* the rounds section says there are none rather than a stale list */ }
  }, [schedule.id]);

  // Re-read when the schedule itself changes: closing a round rolls it, and
  // its updated_at is the cue that there is a new one to plan.
  useEffect(() => {
    loadVisits();
    loadParts();
  }, [schedule.updated_at, loadVisits, loadParts]);

  // Who can be put on a round. A schedule comes round every month and whoever
  // is free attends, so the list is the technicians, not one name.
  useEffect(() => {
    api.get("/accounts/users/", { params: { role: "technician", is_active: true, page_size: 200 } })
      .then(({ data }) => setTechnicians(
        (data.results ?? data).map((u: { id: string; full_name?: string; username: string }) => ({
          id: u.id, label: (u.full_name || "").trim() || u.username,
        })),
      ))
      .catch(() => {});
  }, []);

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
      setStock(opts);
    });
  }, []);

  // The asset decides who pays and whether it is under cover.
  useEffect(() => {
    if (!schedule.device) return;
    api.get(`/assets/devices/${schedule.device}/`)
      .then(({ data }) => setClientName(data.client_name ?? null))
      .catch(() => {});
    api.get("/warranties/", { params: { device: schedule.device, status: "active", page_size: 100 } })
      .then(({ data }) => {
        const list: { warranty_type: string; warranty_type_display?: string; end_date?: string }[] =
          data.results ?? data;
        const client = list.find((w) => w.warranty_type === "client");
        const any = client ?? list[0];
        setCover({
          covered: Boolean(client),
          label: any?.warranty_type_display ?? any?.warranty_type ?? "",
          until: any?.end_date ?? null,
        });
      })
      .catch(() => {});
  }, [schedule.device]);

  /** What the chosen kind has in it, for the searchable picker. */
  const choices = stock
    .filter((o) => (askKind === "generic" ? o.kind === "item" : o.kind === "product"))
    .map((o) => ({ id: o.value, label: o.label }));

  async function ask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const opt = stock.find((o) => o.value === askPart);
    if (!opt) { toast.error("Pick the component you need"); return; }
    setAsking(true);
    try {
      await api.post("/maintenance/part-requests/", {
        schedule: schedule.id,
        quantity_requested: askQty,
        name: opt.name,
        ...(opt.kind === "item" ? { item: opt.id } : { unit_type: opt.id }),
      });
      setAskPart(""); setAskQty(1);
      await loadParts();
      toast.success("Request raised — a supervisor decides next");
    } catch (err) {
      toast.error(getApiError(err, "Could not raise that request"));
    } finally {
      setAsking(false);
    }
  }

  async function decide(line: PartRequest, approve: boolean) {
    setBusy(line.id);
    try {
      await api.post(`/maintenance/part-requests/${line.id}/decide/`, {
        approve,
        ...(approve ? { quantity: cutTo[line.id] ?? line.quantity_requested } : {}),
      });
      await loadParts();
      onChanged();
      toast.success(approve ? "Approved — it is on the store's queue" : "Rejected");
    } catch (err) {
      toast.error(getApiError(err, "Could not record that decision"));
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(line: PartRequest) {
    setBusy(line.id);
    try {
      await api.delete(`/maintenance/part-requests/${line.id}/`);
      await loadParts();
      toast.success("Withdrawn");
    } catch (err) {
      toast.error(getApiError(err, "Could not withdraw that line"));
    } finally {
      setBusy(null);
    }
  }

  const openVisit = visits.find((v) => v.status === "planned" || v.status === "in_progress") ?? null;
  // A breakdown is one visit, not an arrangement that comes round: there is
  // nothing to plan after it and no list of past rounds to keep.
  const oneOff = schedule.maintenance_type === "corrective" || schedule.frequency === "one_time";
  // Newest first, and numbered in the order they happened.
  const pastVisits = visits
    .filter((v) => v.status === "completed" || v.status === "skipped")
    .sort((a, b) => (b.performed_at ?? b.due_date).localeCompare(a.performed_at ?? a.due_date));
  const visitNumber: Record<string, number> = {};
  pastVisits.forEach((v, i) => { visitNumber[v.id] = pastVisits.length - i; });
  /** The visit this screen is about: the open one, or the one that was done. */
  const shownVisit = openVisit ?? (oneOff ? pastVisits[0] ?? null : null);
  const visitDone = shownVisit?.status === "completed";

  /** Move the open round: who is going, or which day. */
  async function plan(patch: { assigned_to?: string | null; due_date?: string }) {
    if (!openVisit) return;
    setPlanning(true);
    try {
      await api.patch(`/maintenance/visits/${openVisit.id}/`, patch);
      await loadVisits();
      onChanged();
      toast.success(patch.due_date ? "Visit moved" : "Visit assigned");
    } catch (err) {
      toast.error(getApiError(err, "Could not plan this visit"));
    } finally {
      setPlanning(false);
    }
  }

  async function startVisit() {
    if (!openVisit) return;
    setPlanning(true);
    try {
      await api.post(`/maintenance/visits/${openVisit.id}/start/`, {});
      await loadVisits();
      onChanged();
      toast.success("Work started");
    } catch (err) {
      toast.error(getApiError(err, "Could not start this visit"));
    } finally {
      setPlanning(false);
    }
  }

  const state = schedule.effective_status || schedule.status;
  const started = state === "in_process";
  // An asset out of service, a site shut for the season: the rounds stop
  // falling due, but the job and everything recorded against it stay.
  const paused = state !== "completed" && (!schedule.is_active || state === "on_hold");

  async function togglePaused() {
    if (!paused && !confirm(`Pause "${schedule.title}"? No further rounds fall due until it is resumed.`))
      return;
    setBusy("schedule");
    try {
      await api.patch(
        `/maintenance/schedules/${schedule.id}/`,
        paused ? { status: "active", is_active: true } : { status: "on_hold", is_active: false },
      );
      toast.success(paused ? "Schedule resumed" : "Schedule paused");
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, paused ? "Failed to resume the schedule" : "Failed to pause the schedule"));
    } finally {
      setBusy(null);
    }
  }
  /** What this visit has asked for; other rounds keep their own lines. */
  const visitParts = shownVisit ? parts.filter((p) => p.visit === shownVisit.id) : [];
  const waiting = visitParts.filter((p) => p.status === "requested");

  return (
    <div className="space-y-5">
      {askingBeforeStart && (
        <Modal open onClose={() => setAskingBeforeStart(false)} size="sm">
            <h2 className="text-base font-semibold text-foreground">
              Do you need additional components for maintenance of this asset?
            </h2>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => {
                  setAskingBeforeStart(false);
                  startVisit();
                }}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                No
              </button>
              <button
                onClick={() => {
                  // Straight to the list, without starting: a visit that
                  // cannot be finished is not one to have begun.
                  setAskingBeforeStart(false);
                  const form = document.getElementById("ask-for-a-part");
                  form?.scrollIntoView({ behavior: "smooth", block: "center" });
                  // The kind is settled first, so that is where the cursor goes.
                  setTimeout(() => document.getElementById("ask-kind")?.focus(), 400);
                }}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
              >
                Yes
              </button>
            </div>
        </Modal>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Back to the maintenance board"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-foreground">{schedule.title}</h1>
          <p className="text-xs text-muted-foreground">
            {schedule.maintenance_type === "preventive" ? "Preventive" : "Corrective"} ·{" "}
            {schedule.frequency.replace("_", " ")} · {schedule.priority} priority
            {schedule.ticket_number && (
              <>
                {" · "}
                <Link href={`/tickets?ticket=${schedule.ticket}`} className="font-medium text-primary hover:underline">
                  {schedule.ticket_number}
                </Link>
              </>
            )}
          </p>
        </div>
        <span className={`ml-auto inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
          started
            ? "bg-amber-500/10 text-amber-600 ring-amber-500/20"
            : state === "completed"
              ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
              : "bg-secondary text-muted-foreground ring-border"
        }`}>
          {paused ? "Paused" : started ? "In progress" : schedule.status_display ?? state}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {schedule.device && schedule.maintenance_type !== "corrective" && (
          <Link
            href={`/tickets?create=1&device=${schedule.device}&category=repair`}
            title="Found something this visit cannot fix? Raise a ticket"
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/20"
          >
            <TicketIcon className="h-3.5 w-3.5" /> Raise a ticket
          </Link>
        )}
        {onEdit && schedule.maintenance_type !== "corrective" && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit schedule
          </button>
        )}
        {canDecide && state !== "completed" && (
          <button
            onClick={togglePaused}
            disabled={busy === "schedule"}
            title={
              paused
                ? "Put this schedule back in service"
                : "Stop the rounds falling due, without losing the job"
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? "Resume schedule" : "Pause schedule"}
          </button>
        )}
      </div>

      <div className={card}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field name="Asset">
            {schedule.device_code ? (
              <>
                <span className="font-mono">{schedule.device_code}</span>
                {schedule.device_name && (
                  <span className="block text-xs text-muted-foreground">{schedule.device_name}</span>
                )}
              </>
            ) : "—"}
          </Field>
          <Field name="Site">{schedule.site_name}</Field>
          <Field name="Client">{clientName}</Field>
          <Field name="Last assigned technician">{schedule.assigned_to_name}</Field>
          <Field name="Starts">{schedule.start_date ? formatDate(schedule.start_date) : null}</Field>
          <Field name="Next due">{schedule.next_due ? formatDate(schedule.next_due) : null}</Field>
          <Field name="Warranty">
            {cover === null ? (
              <span className="text-muted-foreground">Checking…</span>
            ) : cover.covered ? (
              <span className="font-medium text-emerald-600">
                Under warranty
                <span className="block text-xs font-normal text-muted-foreground">
                  {[cover.label, cover.until ? `to ${formatDate(cover.until)}` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            ) : (
              <span className="font-medium text-amber-600">
                Not under warranty
                <span className="block text-xs font-normal text-muted-foreground">Work is billable to the client.</span>
              </span>
            )}
          </Field>
          <Field name="Vendors">{(schedule.vendor_names ?? []).join(", ") || null}</Field>
        </div>
        {schedule.instructions && (
          <div className="mt-4 border-t border-border pt-3">
            <p className={label}>Instructions</p>
            <p className="mt-1 whitespace-pre-line text-sm text-foreground">{schedule.instructions}</p>
          </div>
        )}
      </div>

      {shownVisit && (!paused || visitDone) && (
      <div className="rounded-xl border border-primary/30 bg-card p-5 ring-1 ring-primary/10">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">
              {oneOff
                ? "Visit details"
                : `Next visit${pastVisits.length > 0 ? ` · round ${pastVisits.length + 1}` : ""}`}
            </h2>
          </div>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
            shownVisit.status === "in_progress"
              ? "bg-amber-500/10 text-amber-600 ring-amber-500/20"
              : visitDone
                ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
                : "bg-secondary text-muted-foreground ring-border"
          }`}>
            {shownVisit.status === "in_progress" ? "In progress" : visitDone ? "Done" : "Planned"}
          </span>
        </div>

        {/* A schedule comes round again and again, so each round says when it
            falls and who is going before anybody sets off. */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <label htmlFor="visit-due" className={label}>Due on</label>
            {canDecide && !visitDone ? (
              <input
                id="visit-due"
                type="date"
                value={shownVisit.due_date}
                disabled={planning}
                onChange={(e) => e.target.value && plan({ due_date: e.target.value })}
                className={inputClass}
              />
            ) : (
              <p className="text-sm text-foreground">{formatDate(shownVisit.due_date)}</p>
            )}
          </div>
          <div className="space-y-1">
            <label htmlFor="visit-tech" className={label}>Assigned to</label>
            {canDecide && !visitDone ? (
              <select
                id="visit-tech"
                value={shownVisit.assigned_to ?? ""}
                disabled={planning}
                onChange={(e) => plan({ assigned_to: e.target.value || null })}
                className={inputClass}
              >
                <option value="">Nobody yet</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-foreground">{shownVisit.assigned_to_name ?? "Nobody yet"}</p>
            )}
          </div>
          {visitDone ? (
            <>
              <Field name="Carried out">
                {shownVisit.started_at
                  ? formatDateTime(shownVisit.started_at)
                  : shownVisit.performed_at
                    ? formatDateTime(shownVisit.performed_at)
                    : null}
                {shownVisit.performed_by_name && (
                  <span className="block text-2xs text-muted-foreground">
                    closed by {shownVisit.performed_by_name}
                  </span>
                )}
              </Field>
              <Field name="Cost">
                {shownVisit.cost ? `PKR ${shownVisit.cost}` : null}
                <span className={`block text-2xs ${
                  shownVisit.is_billable ? "text-amber-600" : "text-emerald-600"
                }`}>
                  {shownVisit.is_billable
                    ? `Billable${shownVisit.charge_to ? ` · ${shownVisit.charge_to}` : ""}`
                    : "Under warranty"}
                </span>
              </Field>
            </>
          ) : (
            <div className="space-y-1 sm:col-span-2">
              <p className={label}>This visit</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  // Only worth asking when nothing has been asked for yet:
                  // somebody who has already listed what they need has answered it.
                  onClick={() => (visitParts.length === 0 ? setAskingBeforeStart(true) : startVisit())}
                  disabled={shownVisit.status === "in_progress" || planning}
                  title={shownVisit.status === "in_progress" ? "This visit is already under way" : undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 disabled:pointer-events-none disabled:bg-secondary disabled:text-muted-foreground"
                >
                  <Play className="h-3.5 w-3.5" />
                  {shownVisit.status === "in_progress" ? "Work started" : "Start work"}
                </button>
                <button
                  onClick={onComplete}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" /> Complete visit
                </button>
              </div>
            </div>
          )}
        </div>
        {visitDone && shownVisit.record_notes && (
          <div className="mt-3 border-t border-border pt-3">
            <p className={label}>Work done</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-foreground">{shownVisit.record_notes}</p>
          </div>
        )}

        <div className="mt-4 border-t border-border pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Components for this visit</h2>
          </div>
          {waiting.length > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-2xs font-medium text-amber-600 ring-1 ring-amber-500/20">
              {waiting.length} awaiting approval
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          The technician asks, a supervisor releases, the store issues.
        </p>

        {visitParts.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Nothing asked for.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left">
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">Component</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">Kind</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">Asked</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">Approved</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">Store</th>
                  <th className="px-3 py-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">Decision</th>
                </tr>
              </thead>
              <tbody>
                {visitParts.map((line) => (
                  <tr key={line.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2.5 text-foreground">
                      {line.what}
                      <span className="block text-2xs text-muted-foreground">
                        asked by {line.requested_by_name ?? "—"} · {formatDate(line.created_at)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {/* Counted stock and individually tracked units behave
                          differently, so a line says which it is. */}
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ${
                        line.unit_type
                          ? "bg-indigo-500/10 text-indigo-600"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {line.unit_type ? "Unique item" : "Stock item"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {line.quantity_requested} {line.unit}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${PART_BADGES[line.status] ?? PART_BADGES.cancelled}`}>
                        {line.status === "approved"
                          ? `${line.quantity_approved} ${line.unit}`
                          : line.status_display}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      {line.issue_number ? (
                        <>
                          <span className="font-mono text-2xs">{line.issue_number}</span>
                          <span className="block text-2xs">
                            {line.quantity_issued ? `${line.quantity_issued} ${line.unit} issued` : "awaiting issue"}
                          </span>
                          {/* A unique item is a particular one: the store hands
                              over these serials and no others. */}
                          {(line.issued_serials ?? []).length > 0 && (
                            <span className="block font-mono text-2xs text-foreground">
                              {line.issued_serials.join(", ")}
                            </span>
                          )}
                          {line.quantity_used !== null && (
                            <span className="block text-2xs">
                              {line.quantity_used} {line.unit} used
                              {line.quantity_returned > 0
                                ? ` · ${line.quantity_returned} back to the store on ${line.return_reference}`
                                : ""}
                            </span>
                          )}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      {line.status === "requested" ? (
                        <>
                        {line.decision_note && (
                          <span className="mb-1 block text-2xs italic text-muted-foreground">
                            {line.decision_note}
                          </span>
                        )}
                        {canDecide ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={line.quantity_requested}
                              value={cutTo[line.id] ?? line.quantity_requested}
                              onChange={(e) => setCutTo((c) => ({ ...c, [line.id]: Number(e.target.value) || 1 }))}
                              title={`Release up to ${line.quantity_requested} ${line.unit}`}
                              className="h-8 w-16 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:outline-none"
                            />
                            <button
                              onClick={() => decide(line, true)}
                              disabled={busy === line.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-2xs font-medium text-white disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" /> Approve
                            </button>
                            <button
                              onClick={() => decide(line, false)}
                              disabled={busy === line.id}
                              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-2xs font-medium text-muted-foreground hover:text-destructive disabled:opacity-50"
                            >
                              <X className="h-3 w-3" /> Reject
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-2xs text-muted-foreground">Waiting on a supervisor</span>
                            {canAsk && (
                              <button
                                onClick={() => withdraw(line)}
                                disabled={busy === line.id}
                                title="Withdraw this line"
                                className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                        </>
                      ) : (
                        <span className="text-2xs text-muted-foreground">
                          {line.decided_by_name ? `${line.decided_by_name}` : "—"}
                          {line.decided_at && <span className="block">{formatDateTime(line.decided_at)}</span>}
                          {line.decision_note && <span className="block italic">{line.decision_note}</span>}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* A visit that is over cannot need anything more. */}
        {canAsk && !visitDone && (
          <form id="ask-for-a-part" onSubmit={ask} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="w-36 space-y-1">
              <label htmlFor="ask-kind" className={label}>Kind</label>
              <select
                id="ask-kind"
                value={askKind}
                onChange={(e) => {
                  setAskKind(e.target.value as "generic" | "unique");
                  setAskPart("");
                }}
                className={inputClass}
              >
                <option value="generic">Stock item</option>
                <option value="unique">Unique item</option>
              </select>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <label className={label}>Component</label>
              <SearchSelect
                options={choices}
                value={askPart}
                onChange={setAskPart}
                name="ask-part"
                placeholder={askKind === "generic" ? "Search stock items…" : "Search unique items…"}
              />
            </div>
            <div className="w-32 space-y-1">
              <label htmlFor="ask-qty" className={label}>Quantity</label>
              <div className="flex h-9 items-center rounded-lg border border-border bg-card pr-2 focus-within:border-primary/50">
                <input
                  id="ask-qty"
                  type="number"
                  min={1}
                  value={askQty}
                  onChange={(e) => setAskQty(Number(e.target.value) || 1)}
                  className="h-full w-full min-w-0 bg-transparent px-3 text-sm text-foreground focus:outline-none"
                />
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {stock.find((o) => o.value === askPart)?.unit ?? "qty"}
                </span>
              </div>
            </div>
            <button
              type="submit"
              disabled={asking || !askPart}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> {asking ? "Raising…" : "Raise request"}
            </button>
          </form>
        )}
        </div>
      </div>
      )}

      {paused && (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Paused — no rounds are falling due.
        </p>
      )}

      {!oneOff && (
      <div className={card}>
        <div className="mb-2 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Past visits</h2>
          {pastVisits.length > 0 && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium text-muted-foreground ring-1 ring-border">
              {pastVisits.length}
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Rounds already closed out.
        </p>
        {pastVisits.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            None yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-left">
                  {["#", "Due", "Carried out", "Technician", "Work done", "Components", "Cost"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pastVisits.map((v) => {
                  const used = parts.filter((p) => p.visit === v.id);
                  return (
                    <tr key={v.id} className="border-b border-border/60 last:border-0 align-top">
                      <td className="px-3 py-2.5 text-muted-foreground">{visitNumber[v.id]}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                        {formatDate(v.due_date)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-foreground">
                        {/* When somebody was on site, which is rarely the day
                            it fell due. */}
                        {v.started_at ? formatDate(v.started_at) : v.performed_at ? formatDate(v.performed_at) : "—"}
                        {/* Only worth saying when it was closed out on a
                            different day from the one it was worked. */}
                        {v.performed_at && v.started_at
                          && formatDate(v.performed_at) !== formatDate(v.started_at) && (
                          <span className="block text-2xs text-muted-foreground">
                            closed {formatDate(v.performed_at)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-foreground">
                        {v.assigned_to_name || "—"}
                        {v.performed_by_name && v.performed_by_name !== v.assigned_to_name && (
                          <span className="block text-2xs text-muted-foreground">
                            closed by {v.performed_by_name}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {v.record_notes || (v.status === "completed" ? "—" : v.status_display)}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {used.length === 0 ? "—" : used.map((p) => (
                          <span key={p.id} className="block">
                            {p.what} · {p.quantity_used} {p.unit}
                            {p.quantity_returned > 0 && `, ${p.quantity_returned} back on ${p.return_reference}`}
                            {(p.issued_serials ?? []).length > 0 && (
                              <span className="block font-mono text-2xs">{p.issued_serials.join(", ")}</span>
                            )}
                          </span>
                        ))}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {v.cost ? <span className="text-foreground">PKR {v.cost}</span> : "—"}
                        <span className={`mt-0.5 block text-2xs ${
                          v.is_billable ? "text-amber-600" : "text-emerald-600"
                        }`}>
                          {v.is_billable ? `Billable${v.charge_to ? ` · ${v.charge_to}` : ""}` : "Warranty"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
