/** A cost's share of the whole project, as a percentage. */
export function pctOf(value: string | number | null | undefined, of: number): string {
  if (value == null || !of) return "—";
  const pct = (Number(value) / of) * 100;
  return `${pct > 0 && pct < 0.1 ? "<0.1" : pct.toFixed(1)}%`;
}

/** The share with a bar beside it, so the costliest lines stand out down the column. */
export function Share({ value, of }: { value: string | number | null | undefined; of: number }) {
  if (value == null || !of) return <span className="text-muted-foreground">—</span>;
  const pct = Math.max(0, Math.min(100, (Number(value) / of) * 100));
  return (
    <span className="inline-flex items-center justify-end gap-1" title={`${pctOf(value, of)} of the project`}>
      <span className="h-1.5 w-9 overflow-hidden rounded-full bg-secondary">
        <span className="block h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
      </span>
      <span className="w-10 text-right tabular-nums text-muted-foreground">{pctOf(value, of)}</span>
    </span>
  );
}
