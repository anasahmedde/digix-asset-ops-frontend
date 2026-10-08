/**
 * One look for every stock list.
 *
 * Generic and unique components are both items the store holds, so their
 * lists read the same: the same columns in the same order, numbers right
 * aligned, one stock status. Only the unique list adds its serial numbers.
 */

export const thClass = "px-4 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
export const thNum = thClass.replace("text-left", "text-right");
export const tdClass = "px-4 py-3.5";
export const tdNum = `${tdClass} whitespace-nowrap text-right tabular-nums`;
/** A component code: one unbroken line, whatever the column width. */
export const tdCode = `${tdClass} whitespace-nowrap font-mono text-foreground`;

/** A unit cost as the column prints it; the heading carries the currency. */
export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  return Number.isNaN(n) ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** In stock, low or out — the same rule the low-stock list uses. */
export function StockStatus({ onHand, reorderAt }: { onHand: number; reorderAt: number }) {
  const [label, tone] =
    onHand <= 0
      ? ["Out of stock", "bg-red-500/10 text-red-600 ring-red-500/20"]
      : onHand <= reorderAt
        ? ["Low stock", "bg-amber-500/10 text-amber-600 ring-amber-500/20"]
        : ["In stock", "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"];
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tone}`}>
      {label}
    </span>
  );
}

/** Where the stock is kept, with anything else worth knowing underneath. */
export function StockPlace({ places, note }: { places: string[]; note?: string }) {
  return (
    <div className="min-w-0">
      <span className={places.length ? "text-foreground" : "text-muted-foreground"}>
        {places.length ? places.slice(0, 2).join(", ") : "Not recorded"}
        {places.length > 2 && <span className="text-muted-foreground"> +{places.length - 2} more</span>}
      </span>
      {note && <span className="block text-2xs text-muted-foreground">{note}</span>}
    </div>
  );
}
