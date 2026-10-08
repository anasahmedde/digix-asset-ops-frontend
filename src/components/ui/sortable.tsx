"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { type ReactNode, useState } from "react";

/**
 * Click a column heading to sort the list by it; click again to reverse;
 * a third click goes back to the list's own order.
 *
 * Every list in the app sorts the same way: numbers as numbers, dates as
 * dates, text alphabetically with "Site 2" before "Site 10", blanks last
 * whichever way round.
 *
 *   const sort = useSortState();                       // with the other state
 *   const rows = sortRows(filtered, sort, { client: (s) => s.client_name });
 *   <SortTh sort={sort} k="name" className={thClass}>Name</SortTh>
 */

type Value = string | number | boolean | null | undefined;
export type Accessors<T> = Record<string, (row: T) => Value>;

export interface SortState {
  key: string | null;
  dir: "asc" | "desc";
  toggle: (key: string) => void;
}

/** Which column a list is sorted by. One per table. */
export function useSortState(): SortState {
  const [state, setState] = useState<{ key: string | null; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
  return {
    ...state,
    toggle: (k) =>
      setState((s) =>
        s.key !== k ? { key: k, dir: "asc" } : s.dir === "asc" ? { key: k, dir: "desc" } : { key: null, dir: "asc" },
      ),
  };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const blank = (v: Value) => v === null || v === undefined || v === "";

function compare(a: Value, b: Value): number {
  if (typeof a === "boolean" || typeof b === "boolean") return Number(a) - Number(b);
  const na = Number(a);
  const nb = Number(b);
  // "1200.00" from the API is a number to the reader, so it sorts like one.
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return collator.compare(String(a), String(b));
}

/**
 * ``rows`` in the chosen column's order. A column reads ``row[key]`` unless
 * ``accessors`` says how to read it (a name off a nested object, a count).
 */
export function sortRows<T>(rows: T[], sort: SortState, accessors: Accessors<T> = {}): T[] {
  const key = sort.key;
  if (!key) return rows;
  const read = accessors[key] ?? ((r: T) => (r as Record<string, Value>)[key]);
  return [...rows].sort((x, y) => {
    const a = read(x);
    const b = read(y);
    if (blank(a) || blank(b)) return blank(a) === blank(b) ? 0 : blank(a) ? 1 : -1;
    const c = compare(a, b);
    return sort.dir === "asc" ? c : -c;
  });
}

/** A column heading that sorts its list. */
export function SortTh({
  sort, k, className, children,
}: {
  sort: SortState;
  k: string;
  className?: string;
  children: ReactNode;
}) {
  const on = sort.key === k;
  const Icon = !on ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      {/* A button, so the keyboard can sort too; it takes the heading's own
          case and spacing rather than the browser's button styling. */}
      <button
        type="button"
        onClick={() => sort.toggle(k)}
        title="Sort by this column"
        className={`inline-flex select-none items-center gap-1 rounded [text-transform:inherit] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 ${on ? "text-foreground" : ""}`}
      >
        {children}
        <Icon className={`h-3 w-3 shrink-0 ${on ? "" : "opacity-40"}`} />
      </button>
    </th>
  );
}
