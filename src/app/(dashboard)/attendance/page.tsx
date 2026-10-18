"use client";

import dynamic from "next/dynamic";
import { Clock, Fingerprint, MapPin, Timer, Users } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Pagination, pageSlice } from "@/components/ui/pagination";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDateTime, todayIso } from "@/lib/utils";

const AttendanceMap = dynamic(() => import("@/components/map/attendance-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-xl border border-border bg-card">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  ),
});

interface AttendanceRow {
  id: string;
  user: string;
  user_name: string;
  check_type: string;
  check_type_display: string;
  latitude: string | null;
  longitude: string | null;
  accuracy: number | null;
  site: string | null;
  site_name: string | null;
  note: string;
  created_at: string;
  /** Kept on the phone without signal and sent later: created_at is when it happened. */
  recorded_offline?: boolean;
  uploaded_at?: string | null;
}
interface UserOpt { id: string; label: string }
/** Time in / Time out from the field app. */
interface DutyRow {
  id: string;
  user: string;
  user_name: string;
  kind: "time_in" | "time_out";
  at: string;
  latitude: string | null;
  longitude: string | null;
  accuracy: number | null;
  /** Started by a check-in at a job, not by pressing Time in. */
  automatic?: boolean;
  recorded_offline?: boolean;
  uploaded_at?: string | null;
}
/** One working day: a Time in and the Time out that ended it. */
interface Shift { key: string; user_name: string; start: DutyRow | null; end: DutyRow | null }
/** When and where something was stamped - a Time in, or a site check-in. */
type Stamp = Pick<DutyRow, "at" | "latitude" | "longitude" | "accuracy" | "automatic" | "recorded_offline" | "uploaded_at">;
/** One stay at a site: the check-in and the check-out that ended it. */
interface Visit { key: string; user_name: string; site_name: string; day: string; came: Stamp | null; left: Stamp | null }

const localDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA");
const stamp = (r: AttendanceRow): Stamp => ({ ...r, at: r.created_at });
const span = (mins: number) => (mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`);
const dayTitle = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function Place({ r }: { r: Stamp | null }) {
  if (!r) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="block">
      <span className="text-foreground">{formatDateTime(r.at)}</span>
      {r.automatic && (
        <span className="ml-2 inline-flex rounded-full bg-sky-500/10 px-2 py-0.5 text-2xs font-medium text-sky-600 ring-1 ring-sky-500/20"
          title="Not timed in by hand: the check-in at a job started the day">
          Automatic · at check-in
        </span>
      )}
      {r.recorded_offline && (
        <span className="ml-2 inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-medium text-amber-600 ring-1 ring-amber-500/20"
          title={r.uploaded_at ? `Uploaded ${formatDateTime(r.uploaded_at)}` : undefined}>
          Recorded offline
        </span>
      )}
      <span className="block text-xs">
        {r.latitude && r.longitude ? (
          <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary hover:underline">
            <MapPin className="h-3 w-3" />
            {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
            {r.accuracy ? <span className="text-muted-foreground"> ±{Math.round(r.accuracy)} m</span> : null}
          </a>
        ) : <span className="text-muted-foreground">No location</span>}
      </span>
    </span>
  );
}

const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";
const selectClass = "h-9 rounded-lg border border-border bg-card px-3 pr-8 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [recordPage, setRecordPage] = useState(1);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [summary, setSummary] = useState({ count: 0, currently_in: 0 });
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState("");
  const [duty, setDuty] = useState<DutyRow[]>([]);
  const [shiftPage, setShiftPage] = useState(1);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { ordering: "-created_at", page_size: 300 };
      if (userId) params.user = userId;
      const { data } = await api.get("/attendance/records/", { params });
      let rows: AttendanceRow[] = data.results ?? data;
      if (date) rows = rows.filter((r) => r.created_at.slice(0, 10) === date);
      setRecords(rows);
    } catch (err) {
      toast.error(getApiError(err, "Failed to load attendance"));
    } finally {
      setLoading(false);
    }
  }, [userId, date]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    api.get("/attendance/records/today/").then((r) => setSummary({ count: r.data.count ?? 0, currently_in: r.data.currently_in ?? 0 })).catch(() => {});
    api.get("/accounts/users/", { params: { is_active: true, page_size: 200 } })
      .then((r) => setUsers((r.data.results ?? r.data).map((u: { id: string; full_name?: string; username: string }) => ({ id: u.id, label: u.full_name || u.username }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Only the person's supervisor and the office get rows back.
    api.get("/attendance/duty/", { params: { ordering: "at", page_size: 1000, ...(userId ? { user: userId } : {}) } })
      .then((r) => setDuty(r.data.results ?? r.data))
      .catch(() => setDuty([]));
  }, [userId]);

  const shifts = useMemo(() => {
    const open: Record<string, Shift> = {};
    const out: Shift[] = [];
    for (const r of duty) {
      if (r.kind === "time_in") {
        const s: Shift = { key: r.id, user_name: r.user_name, start: r, end: null };
        open[r.user] = s;
        out.push(s);
      } else if (open[r.user]) {
        open[r.user].end = r;
        delete open[r.user];
      } else {
        out.push({ key: r.id, user_name: r.user_name, start: null, end: r });
      }
    }
    return out.reverse().filter((s) => !date || localDay((s.start ?? s.end)!.at) === date);
  }, [duty, date]);

  const mapPoints = useMemo(() => records.filter((r) => r.latitude && r.longitude), [records]);

  // A check-out closes that person's open stay at the same site; a stray
  // check-out (its check-in fell outside the view) stands alone.
  const visits = useMemo(() => {
    const open: Record<string, Visit> = {};
    const out: Visit[] = [];
    for (const r of [...records].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
      const k = `${r.user}|${r.site ?? ""}`;
      const base = { key: r.id, user_name: r.user_name, site_name: r.site_name || "—", day: localDay(r.created_at) };
      if (r.check_type === "check_in") {
        const v: Visit = { ...base, came: stamp(r), left: null };
        open[k] = v;
        out.push(v);
      } else if (open[k]) {
        open[k].left = stamp(r);
        delete open[k];
      } else {
        out.push({ ...base, came: null, left: stamp(r) });
      }
    }
    return out.reverse();
  }, [records]);
  const perDay = useMemo(() => {
    const n: Record<string, number> = {};
    for (const v of visits) n[v.day] = (n[v.day] ?? 0) + 1;
    return n;
  }, [visits]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
          <Fingerprint className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
          <p className="text-muted-foreground">Field staff Time in / Time out, and site check-ins</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10"><Users className="h-5 w-5 text-emerald-500" /></div>
          <div><p className="text-2xl font-bold text-foreground">{summary.currently_in}</p><p className="text-xs text-muted-foreground">Currently checked in</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10"><Clock className="h-5 w-5 text-blue-500" /></div>
          <div><p className="text-2xl font-bold text-foreground">{summary.count}</p><p className="text-xs text-muted-foreground">Check-ins today</p></div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10"><MapPin className="h-5 w-5 text-violet-500" /></div>
          <div><p className="text-2xl font-bold text-foreground">{mapPoints.length}</p><p className="text-xs text-muted-foreground">Geo-tagged (in view)</p></div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={selectClass}>
          <option value="">All staff</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
        <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={selectClass} />
        {(userId || date) && (
          <button onClick={() => { setUserId(""); setDate(""); }} className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:text-foreground">Clear</button>
        )}
      </div>

      {/* Time in / Time out */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-4">
          <Timer className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Time in / Time out</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium text-muted-foreground ring-1 ring-border">{shifts.length}</span>
          <p className="w-full text-xs text-muted-foreground">
            When and where field staff started and ended their day, from the field app. Shown to the person they report to and the office only.
          </p>
        </div>
        {shifts.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">No Time in yet for the staff you can see.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Staff</th>
                  <th className={thClass}>Time in</th>
                  <th className={thClass}>Time out</th>
                  <th className={thClass}>On duty</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice(shifts, shiftPage).map((s) => {
                  const mins = s.start && s.end ? Math.round((Date.parse(s.end.at) - Date.parse(s.start.at)) / 60000) : null;
                  return (
                    <tr key={s.key} className="border-b border-border align-top transition-colors hover:bg-secondary/30">
                      <td className={`${tdClass} font-medium text-foreground`}>{s.user_name}</td>
                      <td className={tdClass}><Place r={s.start} /></td>
                      <td className={tdClass}>
                        {s.end ? <Place r={s.end} /> : (
                          <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-500/20">
                            Still timed in
                          </span>
                        )}
                      </td>
                      <td className={`${tdClass} whitespace-nowrap text-foreground`}>
                        {mins === null ? "—" : `${Math.floor(mins / 60)} h ${mins % 60} min`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={shiftPage} total={shifts.length} onPage={setShiftPage} noun="days" />
          </div>
        )}
      </div>

      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Fingerprint className="h-4 w-4 text-primary" /> Site check-ins
      </h2>

      {/* Map */}
      <AttendanceMap points={mapPoints} />

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /></div>
      ) : records.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Fingerprint className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No attendance records</h3>
          <p className="mt-2 text-sm text-muted-foreground">Check-ins from the mobile app will appear here.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Staff</th>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Checked in</th>
                  <th className={thClass}>Checked out</th>
                  <th className={thClass}>On site</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice(visits, recordPage).map((v, i, page) => {
                  const mins = v.came && v.left ? Math.round((Date.parse(v.left.at) - Date.parse(v.came.at)) / 60000) : null;
                  return (
                    <Fragment key={v.key}>
                      {/* Each day starts a block: who went where that day reads at a glance. */}
                      {(i === 0 || page[i - 1].day !== v.day) && (
                        <tr className="border-b border-border bg-secondary/30">
                          <td colSpan={5} className="px-5 py-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {dayTitle(v.day)}
                            <span className="ml-2 font-normal normal-case tracking-normal">
                              {perDay[v.day]} visit{perDay[v.day] === 1 ? "" : "s"}
                            </span>
                          </td>
                        </tr>
                      )}
                      <tr className="border-b border-border align-top transition-colors hover:bg-secondary/30">
                        <td className={`${tdClass} font-medium text-foreground`}>{v.user_name}</td>
                        <td className={`${tdClass} text-foreground`}>{v.site_name}</td>
                        <td className={tdClass}>{v.came ? <Place r={v.came} /> : <span className="text-xs text-muted-foreground">Check-in not in view</span>}</td>
                        <td className={tdClass}>
                          {v.left ? <Place r={v.left} /> : (
                            <span className="inline-flex rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 ring-1 ring-emerald-500/20">
                              Still on site
                            </span>
                          )}
                        </td>
                        <td className={`${tdClass} whitespace-nowrap text-foreground`}>{mins === null ? "—" : span(mins)}</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={recordPage} total={visits.length} onPage={setRecordPage} noun="visits" />
          </div>
        </div>
      )}
    </div>
  );
}
