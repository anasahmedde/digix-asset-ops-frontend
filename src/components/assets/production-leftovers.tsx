"use client";

import { PackageX } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Qty } from "@/components/ui/qty";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

interface Line {
  id: string;
  name: string;
  unit?: string;
  issued_quantity: number;
  returned_quantity?: number;
  returned_serials?: string[];
  issued_serials?: string[];
  inventory_unit_type: string | null;
}

/** After the build: what was issued for it and not used goes back to the
 *  store - counted parts by quantity, unique ones by serial - and waits in
 *  Receiving, as a maintenance visit's leftovers do. */
export function ProductionLeftovers({ deviceId, lines, routeFinished, canReturn, onChanged }: {
  deviceId: string;
  lines: Line[];
  routeFinished: boolean;
  canReturn: boolean;
  onChanged: () => void;
}) {
  const issued = lines.filter((l) => l.issued_quantity > 0);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  if (issued.length === 0) return null;
  const left = (l: Line) => l.issued_quantity - (l.returned_quantity ?? 0);
  const returnedAny = issued.some((l) => (l.returned_quantity ?? 0) > 0);

  async function send() {
    const rows = issued
      .map((l) => l.inventory_unit_type
        ? { component: l.id, quantity: (picked[l.id] ?? []).length, serials: picked[l.id] ?? [] }
        : { component: l.id, quantity: Number(qty[l.id] || 0) })
      .filter((r) => r.quantity > 0);
    if (rows.length === 0) {
      toast.error("Enter how much of each part is coming back");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post(`/assets/devices/${deviceId}/return-leftovers/`, { rows });
      toast.success(`Back to the store on ${data.return_grn} - it waits in Receiving`);
      setQty({});
      setPicked({});
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not return the leftovers"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-foreground">Return leftover parts</h4>
        {returnedAny && <span className="text-2xs text-muted-foreground">Returns wait in Inventory › Receiving</span>}
      </div>
      {!routeFinished ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-xs text-muted-foreground">
          Available once every operation on the production route is finished.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-left text-2xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 font-medium">Component</th>
                <th className="px-3 py-2 text-right font-medium">Issued</th>
                <th className="px-3 py-2 text-right font-medium">Returned</th>
                <th className="px-3 py-2 font-medium">Coming back</th>
              </tr>
            </thead>
            <tbody>
              {issued.map((l) => {
                const open = left(l);
                const back = l.returned_serials ?? [];
                const choices = (l.issued_serials ?? []).filter((s) => !back.includes(s));
                return (
                  <tr key={l.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{l.name}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground"><Qty value={l.issued_quantity} unit={l.unit} /></td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      <Qty value={l.returned_quantity ?? 0} unit={l.unit} />
                      {back.length > 0 && <span className="block font-mono text-2xs">{back.join(", ")}</span>}
                    </td>
                    <td className="px-3 py-2">
                      {open <= 0 ? (
                        <span className="text-muted-foreground">Nothing left to return</span>
                      ) : !canReturn ? (
                        <span className="text-muted-foreground">Up to {open}</span>
                      ) : l.inventory_unit_type ? (
                        // A unique part comes back by its own serial, one of those issued.
                        <span className="flex flex-wrap gap-1.5">
                          {choices.map((s) => {
                            const on = (picked[l.id] ?? []).includes(s);
                            return (
                              <label key={s} className={`inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 font-mono text-2xs ring-1 ${on ? "bg-primary/10 text-primary ring-primary/30" : "bg-secondary text-foreground ring-border"}`}>
                                <input type="checkbox" checked={on} className="h-3 w-3"
                                  onChange={() => setPicked((p) => ({ ...p, [l.id]: on ? (p[l.id] ?? []).filter((x) => x !== s) : [...(p[l.id] ?? []), s] }))} />
                                {s}
                              </label>
                            );
                          })}
                          {choices.length === 0 && <span className="text-muted-foreground">No serials on record for this line</span>}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <input type="number" min={0} max={open} value={qty[l.id] ?? ""} placeholder="0"
                            onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                            aria-label={`Quantity of ${l.name} coming back`}
                            className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-right text-xs text-foreground focus:border-primary/50 focus:outline-none" />
                          <span className="text-2xs text-muted-foreground">of {open}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {canReturn && issued.some((l) => left(l) > 0) && (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-secondary/20 px-3 py-2">
              <p className="text-2xs text-muted-foreground">The store counts them back onto the shelf from Receiving.</p>
              <button onClick={send} disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50">
                <PackageX className="h-3.5 w-3.5" /> Return to store
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
