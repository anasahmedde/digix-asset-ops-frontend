/**
 * A quantity with its unit of measure, shown the same way everywhere:
 * the number, then the unit in small muted type — "3 piece", "20 meter".
 */
export function Qty({
  value,
  unit,
  prefix,
  className,
}: {
  value: number | string | null | undefined;
  unit?: string | null;
  /** Rendered before the number, e.g. "×". */
  prefix?: string;
  className?: string;
}) {
  if (value == null || value === "") return <span className={className}>—</span>;
  return (
    <span className={className}>
      {prefix}
      {value} <span className="text-2xs font-normal text-muted-foreground">{unit || "piece"}</span>
    </span>
  );
}
