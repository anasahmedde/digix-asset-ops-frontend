"use client";

import { cn } from "@/lib/utils";

export type TimelineTone = "primary" | "success" | "warning" | "danger" | "muted";

export interface TimelineItem {
  key: string;
  title: React.ReactNode;
  description?: string | null;
  /** Who did it; events with nobody behind them read as "System". */
  actor?: string | null;
  at: string | null;
  tone?: TimelineTone;
}

const DOT: Record<TimelineTone, string> = {
  primary: "bg-primary ring-primary/15",
  success: "bg-emerald-500 ring-emerald-500/15",
  warning: "bg-amber-500 ring-amber-500/15",
  danger: "bg-red-500 ring-red-500/15",
  muted: "bg-muted-foreground/50 ring-muted-foreground/10",
};

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago", then a date. */
export function timeAgo(iso: string): string {
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round((startOfDay(new Date()).getTime() - startOfDay(then).getTime()) / 86400000);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function dayLabel(iso: string): string {
  const days = Math.round((startOfDay(new Date()).getTime() - startOfDay(new Date(iso)).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/**
 * A vertical activity trail: one continuous rail, a dot per event coloured by
 * what kind of event it was, and who did it and when. Grouped by day so a
 * long history reads like a log rather than a pile.
 */
export function Timeline({
  items,
  compact = false,
  groupByDay = true,
  empty = "Nothing recorded yet.",
}: {
  items: TimelineItem[];
  /** Tighter spacing and one-line descriptions, for sidebars. */
  compact?: boolean;
  groupByDay?: boolean;
  empty?: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">{empty}</p>;
  }

  const groups: { label: string; items: TimelineItem[] }[] = [];
  for (const item of items) {
    const label = groupByDay && item.at ? dayLabel(item.at) : "";
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {groups.map((group, g) => (
        <section key={`${group.label}-${g}`}>
          {group.label && (
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </p>
          )}
          <ol>
            {group.items.map((item, i) => (
              <li key={item.key} className={cn("relative flex gap-3", i < group.items.length - 1 && (compact ? "pb-3" : "pb-4"))}>
                {/* The rail: from this event down to the next one. */}
                {i < group.items.length - 1 && (
                  <span aria-hidden className="absolute bottom-0 left-[4.5px] top-4 w-0.5 rounded-full bg-muted-foreground/20" />
                )}
                <span
                  aria-hidden
                  className={cn("relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full ring-4", DOT[item.tone ?? "primary"])}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs leading-snug text-foreground">{item.title}</div>
                  {item.description && (
                    <p
                      className={cn("mt-0.5 text-[11px] text-muted-foreground", compact && "truncate")}
                      title={compact ? item.description : undefined}
                    >
                      {item.description}
                    </p>
                  )}
                  <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                    <span className="font-medium">{item.actor || "System"}</span>
                    {item.at && (
                      <>
                        {" · "}
                        <time dateTime={item.at} title={new Date(item.at).toLocaleString()}>
                          {timeAgo(item.at)}
                        </time>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
