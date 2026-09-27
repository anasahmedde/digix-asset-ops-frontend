"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";

export const PER_PAGE = 10;

/**
 * The rows to show for the page in view.
 *
 * Lists here are fetched whole and filtered in the browser, so a page is a
 * slice of what is already on screen — no refetch. The page is clamped, so a
 * filter that shortens the list never leaves a blank table behind.
 */
export function pageSlice<T>(rows: T[], page: number, perPage = PER_PAGE): T[] {
  const pageCount = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(Math.max(page, 1), pageCount);
  return rows.slice((current - 1) * perPage, current * perPage);
}

interface PaginationProps {
  page: number;
  /** How many rows there are in all, after filtering. */
  total: number;
  onPage: (page: number) => void;
  perPage?: number;
  /** What is being counted, for the "1–10 of 42 assets" line. */
  noun?: string;
}

/** The page numbers worth offering: the ends, and a window around here. */
function pagesToShow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const window = new Set([1, pageCount, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => window.add(p));
  if (page >= pageCount - 2) [pageCount - 1, pageCount - 2, pageCount - 3].forEach((p) => window.add(p));
  const pages = [...window].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pagination({ page, total, onPage, perPage = PER_PAGE, noun = "rows" }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(page, 1), pageCount);

  // A filter has shortened the list under somebody standing on page 5.
  useEffect(() => {
    if (page !== current) onPage(current);
  }, [page, current, onPage]);

  // One page of everything is not worth a control.
  if (total <= perPage) return null;

  const first = (current - 1) * perPage + 1;
  const last = Math.min(current * perPage, total);
  const step =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-border px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
      <p className="text-xs text-muted-foreground">
        {first}–{last} of {total} {noun}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(current - 1)}
          disabled={current <= 1}
          aria-label="Previous page"
          className={`${step} text-muted-foreground hover:bg-secondary hover:text-foreground`}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pagesToShow(current, pageCount).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === current ? "page" : undefined}
              className={`${step} ${
                p === current
                  ? "border-primary bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => onPage(current + 1)}
          disabled={current >= pageCount}
          aria-label="Next page"
          className={`${step} text-muted-foreground hover:bg-secondary hover:text-foreground`}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
