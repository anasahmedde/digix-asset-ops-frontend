import { CreditCard } from "lucide-react";

export default function FinancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finance</h1>
        <p className="text-muted-foreground">
          Costs, payables, receivables, and payment records
        </p>
      </div>

      <div className="rounded-lg border bg-card p-12 text-center">
        <CreditCard className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No financial data</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Financial management will be available after procurement and vendor data is flowing.
        </p>
      </div>
    </div>
  );
}
