"use client";

import { Bell, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { confirmAction } from "@/components/ui/confirm";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** One dated thing on the calendar: planned by somebody, or fixed by a project. */
interface Item {
  id: string;
  kind: "event" | "project_target" | "project_start" | "milestone";
  title: string;
  date: string;
  time: string | null;
  notes: string;
  project: string | null;
  project_name: string | null;
  mine: boolean;
  owner_name?: string;
  scope?: "self" | "team";
  remind_days_before?: number;
}
interface ProjectRef { id: string; name: string }

const KIND: Record<Item["kind"], { dot: string; label: string }> = {
  event: { dot: "bg-primary", label: "Planned" },
  project_target: { dot: "bg-amber-500", label: "Delivery" },
  project_start: { dot: "bg-sky-500", label: "Start" },
  milestone: { dot: "bg-violet-500", label: "Milestone" },
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const fromIso = (s: string) => new Date(s + "T00:00:00");
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const inputClass = "h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none";

/** The desk: the time, the week (or the month) with what is on it, and
 *  the button to plan something. Folded to a week it leaves the notes
 *  room; the month unfolds on demand. */
export function DeskClock() {
  const params = useSearchParams();
  const [now, setNow] = useState<Date | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // The month on show when unfolded; the week on show follows `selected`.
  const [anchor, setAnchor] = useState<Date | null>(null);
  const [monthView, setMonthView] = useState(true);
  const [byMonth, setByMonth] = useState<Record<string, Item[]>>({});
  const [adding, setAdding] = useState(false);
  const [projects, setProjects] = useState<ProjectRef[]>([]);
  const [saving, setSaving] = useState(false);

  // Rendered only on the client so the server's clock never disagrees with
  // the browser's. A ?date= link (a reminder) lands on that day.
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const linked = params.get("date");
    const start = linked && /^\d{4}-\d{2}-\d{2}$/.test(linked) ? fromIso(linked) : new Date();
    setSelected(iso(start));
    setAnchor(new Date(start.getFullYear(), start.getMonth(), 1));
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, [params]);

  useEffect(() => {
    api.get("/teams/projects/", { params: { page_size: 200 } })
      .then((r) => setProjects((r.data.results ?? r.data).map((p: ProjectRef) => ({ id: p.id, name: p.name }))))
      .catch(() => {});
  }, []);

  // The cells on show: the selected day's week, or the anchor month.
  const cells = useMemo<Date[]>(() => {
    if (!selected || !anchor) return [];
    if (!monthView) {
      const d = fromIso(selected);
      const monday = addDays(d, -((d.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    const start = addDays(first, -lead);
    const days = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    const rows = Math.ceil((lead + days) / 7);
    return Array.from({ length: rows * 7 }, (_, i) => addDays(start, i));
  }, [selected, anchor, monthView]);

  // Each month on show is fetched once and kept.
  const load = useCallback(async (key: string) => {
    try {
      const { data } = await api.get("/notifications/calendar/agenda/", { params: { month: key } });
      setByMonth((prev) => ({ ...prev, [key]: data.items }));
    } catch { /* the grid still shows without the dots */ }
  }, []);
  const wanted = useMemo(() => [...new Set(cells.map(monthKey))], [cells]);
  useEffect(() => { wanted.forEach((k) => { if (!(k in byMonth)) load(k); }); }, [wanted, byMonth, load]);
  const refresh = useCallback(() => { wanted.forEach(load); }, [wanted, load]);

  const items = useMemo(() => {
    const seen = new Set<string>();
    return Object.values(byMonth).flat().filter((i) => !seen.has(i.id) && seen.add(i.id)).sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  }, [byMonth]);

  if (!now || !selected || !anchor) return <div className="h-72 rounded-xl border border-border bg-card" />;

  const todayIso = iso(now);
  const byDay = new Map<string, Item[]>();
  items.forEach((i) => byDay.set(i.date, [...(byDay.get(i.date) ?? []), i]));
  const dayItems = byDay.get(selected) ?? [];
  const upcoming = items.filter((i) => i.date > selected).slice(0, dayItems.length >= 3 ? 1 : 2);
  const hh = now.getHours() % 12 || 12;
  const label = monthView
    ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : `${cells[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${cells[6].toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  function step(dir: -1 | 1) {
    if (monthView) {
      setAnchor(new Date(anchor!.getFullYear(), anchor!.getMonth() + dir, 1));
    } else {
      const next = addDays(fromIso(selected!), 7 * dir);
      setSelected(iso(next));
      setAnchor(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  }
  function pick(d: Date) {
    setSelected(iso(d));
    setAnchor(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  function goToday() {
    setSelected(todayIso);
    setAnchor(new Date(now!.getFullYear(), now!.getMonth(), 1));
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/notifications/calendar/", {
        title: fd.get("title"), date: fd.get("date"), time: fd.get("time") || null,
        project: fd.get("project") || null, scope: fd.get("scope"),
        remind_days_before: Number(fd.get("remind_days_before")), notes: fd.get("notes") || "",
      });
      toast.success("Added to the calendar");
      setAdding(false);
      const d = String(fd.get("date"));
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) { pick(fromIso(d)); load(monthKey(fromIso(d))); }
      refresh();
    } catch (err) {
      toast.error(getApiError(err, "Could not add the event"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Item) {
    if (!(await confirmAction(`Remove "${item.title}" from the calendar?`))) return;
    try {
      await api.delete(`/notifications/calendar/${item.id}/`);
      refresh();
    } catch (err) {
      toast.error(getApiError(err, "Could not remove it"));
    }
  }

  return (
    <div className="shrink-0 rounded-xl border border-border bg-card">
      {/* The time, and the day it is. */}
      <div className="flex items-baseline justify-between px-4 pt-4">
        <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
          {hh}:{String(now.getMinutes()).padStart(2, "0")}
          <span className="ml-1 text-xs font-medium text-muted-foreground">{now.getHours() < 12 ? "AM" : "PM"}</span>
        </p>
        <button type="button" onClick={goToday} className="text-xs text-muted-foreground hover:text-primary" title="Back to today">
          {now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        </button>
      </div>

      {/* The week on show, or the month: one row, or the whole grid. */}
      <div className="mt-3 flex items-center justify-between px-2">
        <button type="button" onClick={() => step(-1)} aria-label={monthView ? "Previous month" : "Previous week"} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setMonthView((v) => !v)}
          aria-expanded={monthView}
          aria-label={monthView ? "Fold to the week" : "Unfold the month"}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-foreground hover:bg-secondary"
        >
          {label}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", monthView && "rotate-180")} />
        </button>
        <button type="button" onClick={() => step(1)} aria-label={monthView ? "Next month" : "Next week"} className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-0.5 px-3 pb-3 text-center text-2xs">
        {DAYS.map((d) => <span key={d} className="pb-0.5 font-medium text-muted-foreground">{d}</span>)}
        {cells.map((d, i) => {
          const key = iso(d);
          const marks = byDay.get(key) ?? [];
          const isToday = key === todayIso;
          const isSel = key === selected;
          const outside = monthView && d.getMonth() !== anchor.getMonth();
          return (
            <button
              key={key}
              type="button"
              onClick={() => pick(d)}
              aria-label={key}
              aria-pressed={isSel}
              className={cn(
                "mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-full tabular-nums transition-colors",
                isSel
                  ? "bg-primary font-semibold text-primary-foreground shadow-glow"
                  : isToday
                    ? "font-semibold text-primary ring-1 ring-primary"
                    : outside
                      ? "text-muted-foreground/50 hover:bg-secondary"
                      : (i % 7) >= 5 ? "text-muted-foreground hover:bg-secondary" : "text-foreground hover:bg-secondary",
              )}
            >
              <span className="leading-none">{d.getDate()}</span>
              <span className="mt-0.5 flex h-1 gap-0.5">
                {[...new Set(marks.map((m) => m.kind))].slice(0, 3).map((k) => (
                  <span key={k} className={cn("h-1 w-1 rounded-full", isSel ? "bg-primary-foreground" : KIND[k].dot)} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {/* The day picked: what is on it, and the button to put something on it. */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-foreground">
            {fromIso(selected).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
            {selected === todayIso && <span className="ml-1 font-normal text-muted-foreground">· today</span>}
          </p>
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-medium text-primary hover:bg-primary/10">
            <Plus className="h-3 w-3" /> Plan
          </button>
        </div>
        <ul className="mt-2 max-h-28 space-y-1.5 overflow-y-auto [scrollbar-width:thin]">
          {dayItems.length === 0 && <li className="text-2xs text-muted-foreground">Nothing planned.</li>}
          {dayItems.map((it) => <Row key={it.id} item={it} onRemove={remove} />)}
        </ul>
        {upcoming.length > 0 && (
          <>
            <p className="mt-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Coming up</p>
            <ul className="mt-1.5 space-y-1.5">
              {upcoming.map((it) => <Row key={it.id} item={it} onRemove={remove} showDate onPick={() => pick(fromIso(it.date))} />)}
            </ul>
          </>
        )}
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Plan a date" size="sm">
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor="ev_title" className="text-xs font-medium text-muted-foreground">What</label>
            <input id="ev_title" name="title" required maxLength={200} className={inputClass} placeholder="e.g. Client handover at Dolmen Mall" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="ev_date" className="text-xs font-medium text-muted-foreground">Date</label>
              <input id="ev_date" name="date" type="date" required defaultValue={selected} className={inputClass} />
            </div>
            <div className="space-y-1">
              <label htmlFor="ev_time" className="text-xs font-medium text-muted-foreground">Time (optional)</label>
              <input id="ev_time" name="time" type="time" className={inputClass} />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="ev_project" className="text-xs font-medium text-muted-foreground">Project (optional)</label>
            <select id="ev_project" name="project" className={inputClass} defaultValue="">
              <option value="">Not tied to a project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="ev_remind" className="text-xs font-medium text-muted-foreground">Remind me</label>
              <select id="ev_remind" name="remind_days_before" className={inputClass} defaultValue="1">
                <option value="0">On the day</option>
                <option value="1">1 day before</option>
                <option value="3">3 days before</option>
                <option value="7">A week before</option>
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="ev_scope" className="text-xs font-medium text-muted-foreground">Who sees it</label>
              <select id="ev_scope" name="scope" className={inputClass} defaultValue="self">
                <option value="self">Only me</option>
                <option value="team">Whole team</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="ev_notes" className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea id="ev_notes" name="notes" rows={2} className={`${inputClass} h-auto py-2`} />
          </div>
          <p className="text-2xs text-muted-foreground">The reminder lands in Notifications. A project&apos;s manager gets it too.</p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setAdding(false)} className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-secondary">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Saving…" : "Add to calendar"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Row({ item, onRemove, showDate, onPick }: { item: Item; onRemove: (i: Item) => void; showDate?: boolean; onPick?: () => void }) {
  const k = KIND[item.kind];
  return (
    <li className="group flex items-start gap-2 text-xs">
      <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", k.dot)} />
      <button type="button" onClick={onPick} className={cn("min-w-0 flex-1 text-left", onPick && "hover:text-primary")}>
        <span className="block truncate font-medium text-foreground">{item.title}</span>
        <span className="block truncate text-2xs text-muted-foreground">
          {showDate && fromIso(item.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " · "}
          {item.time ? item.time.slice(0, 5) + " · " : ""}{k.label}{item.project_name && item.kind === "event" ? ` · ${item.project_name}` : ""}
          {item.kind === "event" && item.scope === "team" && item.owner_name ? ` · ${item.owner_name}` : ""}
        </span>
      </button>
      {item.kind === "event" && item.remind_days_before !== undefined && (
        <Bell className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-label={`Reminder ${item.remind_days_before === 0 ? "on the day" : `${item.remind_days_before} day(s) before`}`} />
      )}
      {item.kind === "event" && item.mine && (
        <button type="button" onClick={() => onRemove(item)} aria-label="Remove" className="mt-0.5 hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block">
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}
