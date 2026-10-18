"use client";

import { useState } from "react";

/** Serial numbers as small wrapping chips in a narrow column - a long run of
 *  them in one line stretched the table and pushed every other column right.
 *  With `max`, the rest fold behind "+N more". */
export function SerialList({ serials, max }: { serials: string[]; max?: number }) {
  const [open, setOpen] = useState(false);
  if (serials.length === 0) return null;
  const shown = max && !open ? serials.slice(0, max) : serials;
  const hidden = serials.length - shown.length;
  return (
    <span className="mt-1 flex max-w-[13rem] flex-wrap gap-1">
      {shown.map((s) => (
        <span key={s} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-2xs text-foreground">{s}</span>
      ))}
      {hidden > 0 && (
        <button type="button" onClick={() => setOpen(true)} title={serials.join(", ")}
          className="rounded px-1 py-0.5 text-2xs font-medium text-primary hover:underline">
          +{hidden} more
        </button>
      )}
      {max && open && serials.length > max && (
        <button type="button" onClick={() => setOpen(false)} className="rounded px-1 py-0.5 text-2xs font-medium text-primary hover:underline">
          less
        </button>
      )}
    </span>
  );
}
