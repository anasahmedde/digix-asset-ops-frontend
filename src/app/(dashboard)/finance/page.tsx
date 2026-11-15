"use client";

import { Landmark } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { FinancialInventory, type InventoryData } from "@/components/finance/inventory";
import { DraftInvoices, InvoiceModal, NewInvoiceButton, type DraftInvoice } from "@/components/finance/invoices";
import { LedgerTable, type ByCurrency, type LedgerRow } from "@/components/finance/ledger";
import { FinancialOverview, type Overview } from "@/components/finance/overview";
import { Tabs } from "@/components/ui/tabs";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

type Tab = "dashboard" | "payable" | "receivable" | "inventory";
interface Ledger { rows: LedgerRow[]; totals: ByCurrency }

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

  const manage = can("manage_finance");
  const approve = can("approve_invoice");

  const load = useCallback(async () => {
    try {
      const [o, p, r, d, i] = await Promise.all([
        api.get("/finance/overview/"),
        api.get("/finance/payables/"),
        api.get("/finance/receivables/"),
        api.get("/finance/invoices/", { params: { invoice_type: "receivable", status: "draft", page_size: 200 } }),
        api.get("/finance/inventory/"),
      ]);
      setOverview(o.data);
      setPayables(p.data);
      setReceivables(r.data);
      setDrafts(d.data.results ?? d.data);
      setInventory(i.data);
    } catch (err) {
      toast.error(getApiError(err, "Could not load the financial figures"));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

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
        <LedgerTable side="payable" rows={payables.rows} totals={payables.totals} canPay={manage} canSetDue={manage} onChanged={load} />
      ) : tab === "receivable" && receivables ? (
        <div className="space-y-4">
          <DraftInvoices drafts={drafts} canEdit={manage} canApprove={approve} onChanged={load}
            onEdit={(d) => setInvoiceModal({ editing: d })} />
          <LedgerTable side="receivable" rows={receivables.rows} totals={receivables.totals} canPay={manage} onChanged={load}
            toolbar={manage ? <NewInvoiceButton onClick={() => setInvoiceModal({ editing: null })} /> : undefined} />
        </div>
      ) : tab === "inventory" && inventory ? (
        <FinancialInventory data={inventory} canHold={canAny("manage_finance", "manage_stock")} onChanged={load} />
      ) : null}

      {invoiceModal && (
        <InvoiceModal editing={invoiceModal.editing} onClose={() => setInvoiceModal(null)}
          onSaved={() => { setInvoiceModal(null); load(); }} />
      )}
    </div>
  );
}
