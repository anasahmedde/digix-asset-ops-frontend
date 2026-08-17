"use client";

/* Clickable analytics strip shown above data tables: KPI tiles + a proportional
   segmented status bar. Clicking a tile/segment filters the table below;
   clicking it again clears that filter. */

export interface StripTile {
  key: string;
  label: string;
  value: number;
  tone?: "default" | "primary" | "amber" | "red" | "emerald" | "violet";
  active?: boolean;
  onClick?: () => void;
}

const TILE_TONES: Record<NonNullable<StripTile["tone"]>, { text: string; activeRing: string }> = {
  default: { text: "text-foreground", activeRing: "ring-primary/40 border-primary/40" },
  primary: { text: "text-primary", activeRing: "ring-primary/40 border-primary/40" },
  amber: { text: "text-amber-500", activeRing: "ring-amber-500/40 border-amber-500/40" },
  red: { text: "text-red-500", activeRing: "ring-red-500/40 border-red-500/40" },
  emerald: { text: "text-emerald-500", activeRing: "ring-emerald-500/40 border-emerald-500/40" },
  violet: { text: "text-violet-500", activeRing: "ring-violet-500/40 border-violet-500/40" },
};

export function StatTiles({ tiles }: { tiles: StripTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
      {tiles.map((t) => {
        const tone = TILE_TONES[t.tone ?? "default"];
        return (
          <button
            key={t.key}
            type="button"
            onClick={t.onClick}
            disabled={!t.onClick}
            className={`rounded-xl border bg-card px-3 py-2.5 text-left transition-all duration-150 ${
              t.active ? `ring-2 ${tone.activeRing}` : "border-border"
            } ${t.onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md" : "cursor-default"}`}
            title={t.onClick ? `Click to ${t.active ? "clear this filter" : "filter the table"}` : undefined}
          >
            <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t.label}</p>
            <p className={`text-xl font-bold ${tone.text}`}>{t.value}</p>
          </button>
        );
      })}
    </div>
  );
}

export interface Segment {
  key: string;
  label: string;
  count: number;
  color: string;
}

export function SegmentBar({
  segments,
  active,
  onSelect,
}: {
  segments: Segment[];
  active?: string;
  onSelect?: (key: string) => void;
}) {
  const total = segments.reduce((s, x) => s + x.count, 0);
  const nonZero = segments.filter((s) => s.count > 0);
  if (total === 0) return null;

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        {nonZero.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect?.(s.key)}
            className={`h-full transition-opacity ${active && active !== s.key ? "opacity-30" : ""} ${onSelect ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
            style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color, minWidth: 6 }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {nonZero.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect?.(s.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              active === s.key
                ? "border-primary/50 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
            } ${onSelect ? "cursor-pointer" : "cursor-default"}`}
            title={active === s.key ? "Click to clear this filter" : "Click to filter the table"}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
            <span className="font-bold text-foreground">{s.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
