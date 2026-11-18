"use client";

import { ArrowDownLeft, ArrowUpRight, Boxes, Scale } from "lucide-react";

import { cn, formatDate } from "@/lib/utils";

import { AgingBars, money, type ByCurrency } from "./ledger";

export interface InventoryGroup { key: string; label: string; total: number; unpriced: number; count: number }
export interface Overview {
  as_of: string;
  currencies: string[];
  payable: ByCurrency;
  receivable: ByCurrency;
  net_worth: Record<string, number>;
  inventory: { total: number; groups: InventoryGroup[] };
}

type Tab = "payable" | "receivable" | "inventory";

/** The dashboard: what the company owes, what it is owed, the difference
 *  between them, and what it holds at cost. */
export function FinancialOverview({ data, onOpen }: { data: Overview; onOpen: (tab: Tab) => void }) {
  const others = data.currencies.filter((c) => c !== "PKR");
  const pay = data.payable.PKR;
  const rec = data.receivable.PKR;
  const net = data.net_worth.PKR ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Total payables" icon={<ArrowUpRight className="h-4 w-4" />} tone="text-red-600 dark:text-red-400 bg-red-500/10"
          value={money(pay?.balance ?? 0)} onClick={() => onOpen("payable")}
          lines={[
            `${pay?.open ?? 0} purchase orders with a balance`,
            pay?.overdue ? `${money(pay.overdue)} overdue` : "Nothing overdue",
          ]}
          urgent={!!pay?.overdue}
          extra={others.filter((c) => data.payable[c]).map((c) => money(data.payable[c].balance, c))}
        />
        <Tile
          label="Total receivables" icon={<ArrowDownLeft className="h-4 w-4" />} tone="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
          value={money(rec?.balance ?? 0)} onClick={() => onOpen("receivable")}
          lines={[
            `${rec?.open ?? 0} approved invoices with a balance`,
            rec?.overdue ? `${money(rec.overdue)} overdue` : "Nothing overdue",
          ]}
          urgent={!!rec?.overdue}
          extra={others.filter((c) => data.receivable[c]).map((c) => money(data.receivable[c].balance, c))}
        />
        <Tile
          label="Net worth" icon={<Scale className="h-4 w-4" />} tone="text-primary bg-primary/10" highlight
          value={money(net)} valueTone={net < 0 ? "text-red-600 dark:text-red-400" : undefined}
          lines={["Receivables less payables"]}
          extra={others.map((c) => money(data.net_worth[c], c))}
        />
        <Tile
          label="Inventory in hand" icon={<Boxes className="h-4 w-4" />} tone="text-sky-700 dark:text-sky-300 bg-sky-500/10"
          value={money(data.inventory.total)} onClick={() => onOpen("inventory")}
          lines={["At cost: material, finished products, rented, samples and display"]}
        />
      </div>

      {/* Every inventory heading at cost, then their sum. */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Inventory cost</h2>
          <button onClick={() => onOpen("inventory")} className="text-xs font-medium text-primary hover:underline">See every item</button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {data.inventory.groups.map((g) => (
            <div key={g.key} className="rounded-lg bg-secondary/60 px-4 py-3">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{g.label}</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{money(g.total)}</p>
                <p className="text-2xs text-muted-foreground">
                  {g.count} {g.key === "material" ? "lines" : g.count === 1 ? "asset" : "assets"}
                  {g.unpriced > 0 && <span className="text-amber-700 dark:text-amber-300"> · {g.unpriced} without a cost</span>}
                </p>
              </div>
            </div>
          ))}
          <div className="rounded-lg bg-primary px-4 py-3 text-primary-foreground">
            <p className="text-2xs font-medium uppercase tracking-wider opacity-80">Inventory in hand</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{money(data.inventory.total)}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <AgingBars title="Payables aging · how late the unpaid balance is" aging={pay?.aging ?? emptyAging} currency="PKR" />
        <AgingBars title="Receivables aging · how late the money owed to us is" aging={rec?.aging ?? emptyAging} currency="PKR" />
      </div>
      <p className="text-2xs text-muted-foreground">
        As of {formatDate(data.as_of)}. Amounts in different currencies are not added together.
        Overdue days run from the due date to today.
      </p>
    </div>
  );
}

const emptyAging = [
  { key: "current", label: "Not yet due", amount: 0 },
  { key: "1_30", label: "1-30 days", amount: 0 },
  { key: "31_60", label: "31-60 days", amount: 0 },
  { key: "61_90", label: "61-90 days", amount: 0 },
  { key: "90_plus", label: "Over 90 days", amount: 0 },
];

function Tile({
  label, icon, tone, value, valueTone, lines, extra = [], urgent, highlight, onClick,
}: {
  label: string; icon: React.ReactNode; tone: string; value: string; valueTone?: string;
  lines: string[]; extra?: string[]; urgent?: boolean; highlight?: boolean; onClick?: () => void;
}) {
  const Box = onClick ? "button" : "div";
  return (
    <Box onClick={onClick}
      className={cn("card-lift flex h-full flex-col rounded-xl border bg-card p-5 text-left shadow-sm",
        highlight ? "border-primary/30 bg-primary/5" : "border-border", onClick && "cursor-pointer")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone)}>{icon}</span>
      </div>
      <p className={cn("mt-2 text-2xl font-bold leading-tight tabular-nums text-card-foreground", valueTone)}>{value}</p>
      {extra.map((e) => <p key={e} className="text-sm font-semibold tabular-nums text-muted-foreground">{e}</p>)}
      <div className="mt-auto pt-2 text-xs leading-snug text-muted-foreground">
        {lines.map((l, i) => (
          <p key={l} className={cn(i === 1 && urgent && "font-medium text-red-600 dark:text-red-400")}>{l}</p>
        ))}
      </div>
    </Box>
  );
}
