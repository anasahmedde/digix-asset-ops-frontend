"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { Modal } from "@/components/ui/modal";

/**
 * A dashboard tile for a list that can grow.
 *
 * The tile is a fixed size whatever the list holds (SAP Fiori's fixed card
 * layout: a card never resizes the grid); it shows the first few entries
 * and a count, and "View all" opens the whole list in a dialog. The rows
 * are rendered by the caller, so the tile and the dialog read the same.
 */
export function ListTile({
  title, icon, tone = "default", subtitle, count, rows, preview = 4, empty, footer, action, fill = false, className = "",
}: {
  title: string;
  icon?: React.ReactNode;
  /** "alert" draws the tile in red: something needs a person. */
  tone?: "default" | "alert";
  subtitle?: React.ReactNode;
  /** How many entries the list holds (shown beside the title). */
  count: number;
  /** One node per entry, keyed; the tile shows the first `preview`. */
  rows: React.ReactNode[];
  preview?: number;
  empty: string;
  /** Shown under the rows, in the tile and the dialog alike. */
  footer?: React.ReactNode;
  /** A control that belongs to the tile's header (a picker, a link). */
  action?: React.ReactNode;
  /** Take the row's height (beside cards of their own size) instead of the fixed one. */
  fill?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const shown = rows.slice(0, preview);
  const more = rows.length - shown.length;
  const alert = tone === "alert";

  return (
    <div className={`flex ${fill ? "h-full min-h-[18rem]" : "h-[20rem]"} flex-col rounded-xl border bg-card p-5 ${alert ? "border-red-500/30" : "border-border"} ${className}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={`inline-flex items-center gap-2 text-sm font-semibold ${alert ? "text-red-500" : "text-foreground"}`}>
            {icon}
            {title}
            {count > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold tabular-nums ${alert ? "bg-red-500/10 text-red-500" : "bg-secondary text-muted-foreground"}`}>
                {count}
              </span>
            )}
          </h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {rows.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex items-center gap-0.5 text-2xs font-medium text-primary hover:underline"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {action && <div className="mb-2">{action}</div>}

      <div className={`min-h-0 flex-1 overflow-hidden ${rows.length === 0 ? "flex items-center justify-center" : "space-y-2"}`}>
        {rows.length === 0 ? (
          <p className="max-w-[18rem] text-center text-xs leading-relaxed text-muted-foreground">
            <span className={`mx-auto mb-2 block h-8 w-8 rounded-full ${alert ? "bg-emerald-500/10" : "bg-secondary"}`} aria-hidden>
              <span className={`block pt-1.5 text-center text-base ${alert ? "text-emerald-500" : "text-muted-foreground"}`}>{alert ? "✓" : "–"}</span>
            </span>
            {empty}
          </p>
        ) : shown}
      </div>

      {(more > 0 || footer) && (
        <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-2xs text-muted-foreground">
          <span>{footer}</span>
          {more > 0 && (
            <button type="button" onClick={() => setOpen(true)} className="font-medium text-primary hover:underline">
              +{more} more
            </button>
          )}
        </div>
      )}

      {open && (
        <Modal open onClose={() => setOpen(false)} title={`${title} (${count})`} size="lg">
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">{rows}</div>
          {footer && <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{footer}</div>}
        </Modal>
      )}
    </div>
  );
}
