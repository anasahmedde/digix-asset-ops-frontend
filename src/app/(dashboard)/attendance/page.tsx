"use client";

import dynamic from "next/dynamic";
import { Clock, Fingerprint, LogOut, MapPin, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDateTime } from "@/lib/utils";

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
}
interface UserOpt { id: string; label: string }

const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";
const selectClass = "h-9 rounded-lg border border-border bg-card px-3 pr-8 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30";

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [summary, setSummary] = useState({ count: 0, currently_in: 0 });
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [checkType, setCheckType] = useState("");
  const [date, setDate] = useState("");

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { ordering: "-created_at", page_size: 300 };
      if (userId) params.user = userId;
      if (checkType) params.check_type = checkType;
      const { data } = await api.get("/attendance/records/", { params });
      let rows: AttendanceRow[] = data.results ?? data;
      if (date) rows = rows.filter((r) => r.created_at.slice(0, 10) === date);
      setRecords(rows);
    } catch (err) {
      toast.error(getApiError(err, "Failed to load attendance"));
    } finally {
      setLoading(false);
    }
  }, [userId, checkType, date]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    api.get("/attendance/records/today/").then((r) => setSummary({ count: r.data.count ?? 0, currently_in: r.data.currently_in ?? 0 })).catch(() => {});
    api.get("/accounts/users/", { params: { is_active: true, page_size: 200 } })
      .then((r) => setUsers((r.data.results ?? r.data).map((u: { id: string; full_name?: string; username: string }) => ({ id: u.id, label: u.full_name || u.username }))))
      .catch(() => {});
  }, []);

  const mapPoints = useMemo(() => records.filter((r) => r.latitude && r.longitude), [records]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
          <Fingerprint className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
          <p className="text-muted-foreground">Field-staff GPS check-ins &amp; check-outs</p>
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
        <select value={checkType} onChange={(e) => setCheckType(e.target.value)} className={selectClass}>
          <option value="">In &amp; Out</option>
          <option value="check_in">Check In</option>
          <option value="check_out">Check Out</option>
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={selectClass} />
        {(userId || checkType || date) && (
          <button onClick={() => { setUserId(""); setCheckType(""); setDate(""); }} className="h-9 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground hover:text-foreground">Clear</button>
        )}
      </div>

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
                  <th className={thClass}>Type</th>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Time</th>
                  <th className={thClass}>Coordinates</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} font-medium text-foreground`}>{r.user_name}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${r.check_type === "check_in" ? "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20" : "bg-slate-500/10 text-slate-500 ring-slate-500/20"}`}>
                        {r.check_type === "check_in" ? <Fingerprint className="h-3 w-3" /> : <LogOut className="h-3 w-3" />}
                        {r.check_type_display}
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{r.site_name || "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>{formatDateTime(r.created_at)}</td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {r.latitude && r.longitude ? (
                        <a href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {Number(r.latitude).toFixed(4)}, {Number(r.longitude).toFixed(4)}
                        </a>
                      ) : "—"}
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
