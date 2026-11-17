"use client";

import { FilePlus2, Landmark } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { FinancialInventory, type InventoryData } from "@/components/finance/inventory";
import { ClientInvoiceModal, DraftInvoices, InvoiceModal, type DraftInvoice } from "@/components/finance/invoices";
import {
  DEFAULT_PARAMS, ExportButtons, LedgerTable, exportFile, money, queryOf,
  type ByCurrency, type LedgerParams, type LedgerRow, type Option,
} from "@/components/finance/ledger";
import { FinancialOverview, type Overview } from "@/components/finance/overview";
import { Tabs } from "@/components/ui/tabs";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

type Tab = "dashboard" | "payable" | "receivable" | "inventory";
interface Ledger { rows: LedgerRow[]; totals: ByCurrency; uninvoiced?: Record<string, { amount: number; quotations: number }> }

const named = (rows: { id: string; name: string }[]): Option[] => rows.map((x) => ({ id: x.id, label: x.name }));
const listOf = <T,>(data: { results?: T[] } | T[]) => (Array.isArray(data) ? data : data.results ?? []);

/** The Financial module, for higher management: the company's payables
 *  (from purchase orders), receivables (from approved client invoices), the
 *  net worth between them, and the inventory it holds at cost. */
export default function FinancePage() {
  const { can, canAny } = useUser();
  const params = useSearchParams();
  const router = useRouter();
  const tab = (["payable", "receivable", "inventory"].includes(params.get("tab") ?? "") ? params.get("tab") : "dashboard") as Tab;
  const setTab = (t: string) => router.replace(t === "dashboard" ? "/finance" : `/finance?tab=${t}`, { scroll: false });

  const [overview, setOverview] = useState<Overview | null>(null);
  const [payables, setPayables] = useState<Ledger | null>(null);
  const [receivables, setReceivables] = useState<Ledger | null>(null);
  const [drafts, setDrafts] = useState<DraftInvoice[]>([]);
  const [inventory, setInventory] = useState<InventoryData | null>(null);
  const [invoiceModal, setInvoiceModal] = useState<{ editing: DraftInvoice | null } | null>(null);
  const [clientInvoice, setClientInvoice] = useState(false);
  const [payParams, setPayParams] = useState<LedgerParams>(DEFAULT_PARAMS);
  const [recParams, setRecParams] = useState<LedgerParams>(DEFAULT_PARAMS);
  const [lists, setLists] = useState<{ suppliers: Option[]; clients: Option[]; projects: Option[] }>({ suppliers: [], clients: [], projects: [] });

  const manage = can("manage_finance");
  const approve = can("approve_invoice");

  const loadPayables = useCallback(async (p: LedgerParams) => {
    try {
      setPayables((await api.get("/finance/payables/", { params: queryOf(p) })).data);
    } catch (err) {
      toast.error(getApiError(err, "Could not load the payables"));
    }
  }, []);
  const loadReceivables = useCallback(async (p: LedgerParams) => {
    try {
      const [r, d] = await Promise.all([
        api.get("/finance/receivables/", { params: queryOf(p) }),
        api.get("/finance/invoices/", { params: { invoice_type: "receivable", status: "draft", page_size: 200 } }),
      ]);
      setReceivables(r.data);
      setDrafts(d.data.results ?? d.data);
    } catch (err) {
      toast.error(getApiError(err, "Could not load the receivables"));
    }
  }, []);

  const loadRest = useCallback(async () => {
    try {
      const [o, i] = await Promise.all([api.get("/finance/overview/"), api.get("/finance/inventory/")]);
      setOverview(o.data);
      setInventory(i.data);
    } catch (err) {
      toast.error(getApiError(err, "Could not load the financial figures"));
    }
  }, []);
  useEffect(() => { loadRest(); }, [loadRest]);

  // The lists follow their filters; typing a search waits for a pause.
  const payTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const recTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(payTimer.current);
    payTimer.current = setTimeout(() => loadPayables(payParams), 300);
  }, [payParams, loadPayables]);
  useEffect(() => {
    clearTimeout(recTimer.current);
    recTimer.current = setTimeout(() => loadReceivables(recParams), 300);
  }, [recParams, loadReceivables]);

  // The supplier, client and project pickers of the filters.
  useEffect(() => {
    Promise.allSettled([
      api.get("/suppliers/", { params: { page_size: 1000 } }),
      api.get("/clients/", { params: { page_size: 1000 } }),
      api.get("/teams/projects/", { params: { page_size: 1000, ordering: "-created_at" } }),
    ]).then(([s, c, p]) => {
      const rows = (r: PromiseSettledResult<{ data: { results?: { id: string; name: string }[] } | { id: string; name: string }[] }>) =>
        (r.status === "fulfilled" ? listOf(r.value.data) : []);
      setLists({ suppliers: named(rows(s)), clients: named(rows(c)), projects: named(rows(p)) });
    });
  }, []);

  const reload = () => { loadRest(); loadPayables(payParams); loadReceivables(recParams); };
  const count = (l: Ledger | null) => l?.rows.filter((r) => r.balance > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary">
            <Landmark className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Finance</h1>
            <p className="text-muted-foreground">Payables, receivables, net worth and inventory in hand</p>
          </div>
        </div>
      </div>

      <Tabs
        tabs={[
          { key: "dashboard", label: "Dashboard" },
          { key: "payable", label: "Payable", count: count(payables) },
          { key: "receivable", label: "Receivable", count: count(receivables) },
          { key: "inventory", label: "Inventory" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {!overview ? (
        <div className="py-20 text-center text-sm text-muted-foreground">Loading the figures…</div>
      ) : tab === "dashboard" ? (
        <FinancialOverview data={overview} onOpen={setTab} />
      ) : tab === "payable" && payables ? (
        <LedgerTable side="payable" rows={payables.rows} totals={payables.totals} canPay={manage} canSetDue={manage} onChanged={reload}
          params={payParams} onParams={setPayParams} parties={lists.suppliers} projects={lists.projects} />
      ) : tab === "receivable" && receivables ? (
        <div className="space-y-4">
          <DraftInvoices drafts={drafts} canEdit={manage} canApprove={approve} onChanged={reload}
            onEdit={(d) => setInvoiceModal({ editing: d })} />
          {Object.entries(receivables.uninvoiced ?? {}).map(([cur, u]) => (
            <div key={cur} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                <span className="font-semibold tabular-nums text-foreground">{money(u.amount, cur)}</span> of {u.quotations} accepted
                {u.quotations === 1 ? " quotation is" : " quotations is"} not invoiced yet. It becomes a receivable once invoiced and approved.
              </span>
              <Link href="/quotations?status=accepted" className="text-xs font-semibold text-primary hover:underline">Generate invoices from quotations</Link>
            </div>
          ))}
          <LedgerTable side="receivable" rows={receivables.rows} totals={receivables.totals} canPay={manage} onChanged={reload}
            params={recParams} onParams={setRecParams} parties={lists.clients} projects={lists.projects}
            toolbar={manage ? (
              <button onClick={() => setClientInvoice(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                <FilePlus2 className="h-3.5 w-3.5" /> Client invoice
              </button>
            ) : undefined} />
        </div>
      ) : tab === "inventory" && inventory ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <ExportButtons onExport={(fmt) => exportFile("/finance/inventory/", {}, fmt, "inventory-in-hand")} />
          </div>
          <FinancialInventory data={inventory} canHold={canAny("manage_finance", "manage_stock")} onChanged={loadRest} />
        </div>
      ) : null}

      {invoiceModal && (
        <InvoiceModal editing={invoiceModal.editing} onClose={() => setInvoiceModal(null)}
          onSaved={() => { setInvoiceModal(null); reload(); }} />
      )}
      {clientInvoice && (
        <ClientInvoiceModal onClose={() => setClientInvoice(false)} onSaved={() => { setClientInvoice(false); reload(); }} />
      )}
    </div>
  );
}
