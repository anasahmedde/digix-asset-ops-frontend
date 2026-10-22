"use client";

import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { confirmAction } from "@/components/ui/confirm";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

/** Time in / Time out from the website, for the office team - the field
 *  team does it from the field app. The register (when and where) is seen by
 *  the person's own line and the office, not by the person. */
export function TimeInOut() {
  const [state, setState] = useState<{ on_duty: boolean; since: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/attendance/duty/status/").then((r) => setState(r.data)).catch(() => setState(null));
  }, []);

  if (!state) return null;

  function here(): Promise<{ latitude?: string; longitude?: string; accuracy?: number }> {
    // Where they are, if the browser will say; nothing is lost without it.
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({
          latitude: p.coords.latitude.toFixed(7), longitude: p.coords.longitude.toFixed(7),
          accuracy: Math.round(p.coords.accuracy),
        }),
        () => resolve({}),
        { timeout: 5000, maximumAge: 60000 },
      );
    });
  }

  async function toggle() {
    const kind = state!.on_duty ? "time_out" : "time_in";
    const ok = await confirmAction({
      title: kind === "time_in" ? "Time in?" : "Time out?",
      message: kind === "time_in" ? "Start your working day now." : "End your working day now.",
      confirmLabel: kind === "time_in" ? "Time in" : "Time out",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post("/attendance/duty/", { kind, ...(await here()) });
      const { data } = await api.get("/attendance/duty/status/");
      setState(data);
      toast.success(kind === "time_in" ? "Timed in" : "Timed out");
    } catch (err) {
      toast.error(getApiError(err, "Could not record it"));
    } finally {
      setBusy(false);
    }
  }

  const since = state.since ? new Date(state.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={state.on_duty ? `Timed in since ${since} - click to time out` : "Time in for the day"}
      className={`hidden h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 sm:inline-flex ${
        state.on_duty
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15"
          : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
      }`}
    >
      <Clock className="h-3.5 w-3.5" />
      {state.on_duty ? `In since ${since}` : "Time in"}
    </button>
  );
}
