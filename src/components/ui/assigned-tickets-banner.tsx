"use client";

import { AlertTriangle, ArrowRight, Ticket, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import api from "@/lib/api";

interface AssignedTicket {
  id: string;
  title: string;
  priority: string;
  status: string;
  category: string;
  due_date: string | null;
  created_at: string;
}

interface Summary {
  total: number;
  overdue: number;
  tickets: AssignedTicket[];
}

const priorityColor: Record<string, string> = {
  critical: "text-red-500",
  high: "text-orange-500",
  medium: "text-amber-500",
  low: "text-gray-400",
};

export function AssignedTicketsBanner() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications/notifications/assigned_tickets_summary/");
      if (data.total > 0) {
        setSummary(data);
      }
    } catch {
      /* silently fail */
    }
  }, []);

  useEffect(() => {
    const lastDismissed = sessionStorage.getItem("tickets_banner_dismissed");
    if (lastDismissed) {
      setDismissed(true);
      return;
    }
    fetchSummary();
  }, [fetchSummary]);

  if (dismissed || !summary || summary.total === 0) return null;

  function handleDismiss() {
    setDismissed(true);
    sessionStorage.setItem("tickets_banner_dismissed", "1");
  }

  return (
    <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Ticket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              You have {summary.total} active ticket{summary.total !== 1 ? "s" : ""} assigned to you
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {summary.overdue > 0 ? (
                <span className="inline-flex items-center gap-1 text-destructive font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  {summary.overdue} overdue
                </span>
              ) : (
                "All tickets are on track"
              )}
              {summary.overdue > 0 && summary.total - summary.overdue > 0 && (
                <span className="text-muted-foreground"> · {summary.total - summary.overdue} on schedule</span>
              )}
            </p>

            {expanded && (
              <div className="mt-3 space-y-1.5">
                {summary.tickets.slice(0, 5).map((t) => (
                  <Link
                    key={t.id}
                    href="/tickets"
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] transition-colors hover:bg-primary/5"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      t.priority === "critical" ? "bg-red-500" :
                      t.priority === "high" ? "bg-orange-500" :
                      t.priority === "medium" ? "bg-amber-500" : "bg-gray-400"
                    }`} />
                    <span className="flex-1 truncate font-medium text-foreground">{t.title}</span>
                    <span className={`shrink-0 text-[10px] font-medium ${priorityColor[t.priority] || "text-gray-400"}`}>
                      {t.priority.charAt(0).toUpperCase() + t.priority.slice(1)}
                    </span>
                    {t.due_date && new Date(t.due_date) < new Date() && (
                      <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[9px] font-bold text-destructive">
                        OVERDUE
                      </span>
                    )}
                  </Link>
                ))}
                {summary.tickets.length > 5 && (
                  <p className="px-2 text-[11px] text-muted-foreground">
                    +{summary.tickets.length - 5} more...
                  </p>
                )}
              </div>
            )}

            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[11px] font-medium text-primary hover:underline"
              >
                {expanded ? "Hide details" : "Show details"}
              </button>
              <Link
                href="/tickets"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Go to Tickets <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        <button
          onClick={handleDismiss}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Dismiss for this session"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
