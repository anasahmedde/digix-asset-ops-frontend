"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";

import { money } from "./ledger";

interface Line {
  id: string;
  name: string;
  value: number | null;
  // Material
  where?: string;
  quantity?: number;
  unit?: string;
  // Assets
  asset_code?: string;
  asset_type?: string;
  held_as?: string;
  status?: string;
  status_display?: string;
}
interface Group { key: string; label: string; total: number; unpriced: number; lines: Line[] }
export interface InventoryData { groups: Group[]; total: number }

/** An asset's category, set once when it is registered (same list as the
 *  asset register). Rented or sold stock not yet delivered is still a
 *  finished product in hand. */
export const ASSET_CATEGORIES = [
  { value: "stock", label: "Finished Product" },
  { value: "rented", label: "Rented" },
  { value: "sold", label: "Sold" },
  { value: "office_display", label: "Office Display" },
  { value: "foc_sample", label: "FOC Sample" },
];
const HELD = ASSET_CATEGORIES;

const ABOUT: Record<string, string> = {
  stock: "Assets built or bought that are in stock, waiting to be rented or sold (or rented or sold and not yet delivered), at what it cost to make or buy them.",
  rented: "Assets out at a client on rent: still ours, at what it cost to make or buy them. Rented by their category or by a Rental project.",
  foc_sample: "Free-of-charge samples, in stock or placed at a client: still ours, at cost. By their category or a Sample (FOC) project.",
  sample_paid: "Assets on a Sample (Paid) project, in stock or placed at a client, at cost.",
  office_display: "Assets kept on display at the office, at cost.",
};

const th = "whitespace-nowrap px-4 py-3 text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground";
const td = "px-4 py-2.5 text-sm";

/** Everything in hand at cost, under the four headings the dashboard adds up. */
export function FinancialInventory({ data, canHold, onChanged }: { data: InventoryData; canHold: boolean; onChanged: () => void }) {
  const [active, setActive] = useState(data.groups[0]?.key ?? "material");
  const group = data.groups.find((g) => g.key === active) ?? data.groups[0];
  const isMaterial = group?.key === "material";

  async function hold(device: string, held_as: string) {
    try {
      await api.post("/finance/inventory/hold/", { device, held_as });
      toast.success(`Now counted as ${HELD.find((h) => h.value === held_as)?.label.toLowerCase()}`);
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not change that"));
    }
  }

  if (!group) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {data.groups.map((g) => (
          <button key={g.key} onClick={() => setActive(g.key)}
            className={cn("min-w-0 rounded-xl border p-3 text-left transition-colors sm:p-4",
              g.key === active ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/40")}>
            <p className="text-xs font-medium text-muted-foreground">{g.label}</p>
            <p className="mt-1 text-base font-bold tabular-nums text-foreground sm:text-xl">{money(g.total)}</p>
            <p className="text-2xs text-muted-foreground">{g.lines.length} {g.key === "material" ? (g.lines.length === 1 ? "line" : "lines") : g.lines.length === 1 ? "asset" : "assets"}</p>
          </button>
        ))}
        <div className="col-span-2 rounded-xl bg-primary p-4 text-primary-foreground lg:col-span-1">
          <p className="text-xs font-medium opacity-80">Inventory in hand</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{money(data.total)}</p>
          <p className="text-2xs opacity-80">Total of every heading</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
          <p className="text-2xs text-muted-foreground">
            {isMaterial
              ? "Generic stock at what each batch cost, pigeon holes and unique items in the store."
              : ABOUT[group.key] ?? "Assets in stock at what it cost to build or buy them."}
            {group.unpriced > 0 && <span className="text-amber-700 dark:text-amber-300"> {group.unpriced} have no cost and count as zero.</span>}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-secondary/60">
              <tr>
                <th className={th}>{isMaterial ? "Item" : "Asset"}</th>
                <th className={th}>{isMaterial ? "Where" : "Type"}</th>
                {!isMaterial && <th className={th}>Where</th>}
                {isMaterial && <th className={cn(th, "text-right")}>Quantity</th>}
                {!isMaterial && <th className={th}>Counted as</th>}
                <th className={cn(th, "text-right")}>Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {group.lines.map((l) => (
                <tr key={l.id} className="hover:bg-secondary/30">
                  <td className={td}>
                    {isMaterial ? l.name : (
                      <Link href={`/assets?device=${l.id}`} className="hover:text-primary">
                        <span className="font-mono text-xs font-semibold text-primary">{l.asset_code}</span>
                        <span className="block text-xs text-muted-foreground">{l.name}</span>
                      </Link>
                    )}
                  </td>
                  <td className={cn(td, "text-muted-foreground")}>{isMaterial ? l.where : l.asset_type || "—"}</td>
                  {!isMaterial && <td className={cn(td, "text-muted-foreground")}>{l.where || "—"}</td>}
                  {isMaterial && <td className={cn(td, "text-right tabular-nums")}>{l.quantity} {l.unit}</td>}
                  {!isMaterial && (
                    <td className={td}>
                      {canHold && l.status === "in_stock" ? (
                        <select value={l.held_as} onChange={(e) => hold(l.id, e.target.value)} aria-label={`What ${l.asset_code} is kept as`}
                          className="h-8 rounded-lg border border-border bg-card px-2 text-xs text-foreground focus:border-primary/50 focus:outline-none">
                          {HELD.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                        </select>
                      ) : HELD.find((h) => h.value === l.held_as)?.label}
                    </td>
                  )}
                  <td className={cn(td, "text-right font-medium tabular-nums")}>{l.value == null ? <span className="text-amber-700 dark:text-amber-300">No cost</span> : money(l.value)}</td>
                </tr>
              ))}
              {group.lines.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-10 text-center text-sm text-muted-foreground">
                  {isMaterial ? "Nothing in the store." : group.key === "stock"
                    ? "No finished assets in stock."
                    : `No ${group.label.toLowerCase().replace("assets on ", "")} assets.`}
                </td></tr>
              )}
            </tbody>
            {group.lines.length > 0 && (
              <tfoot className="border-t-2 border-border bg-secondary/40">
                <tr>
                  <td className={cn(td, "font-semibold")} colSpan={isMaterial ? 3 : 4}>Total</td>
                  <td className={cn(td, "text-right font-bold tabular-nums")}>{money(group.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
