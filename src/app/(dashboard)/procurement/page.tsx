import { ShoppingCart } from "lucide-react";

export default function ProcurementPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Procurement</h1>
        <p className="text-muted-foreground">
          Requisitions, purchase orders, and delivery tracking
        </p>
      </div>

      <div className="rounded-lg border bg-card p-12 text-center">
        <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No procurement activity</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Procurement pipeline will be available after vendor and inventory modules are set up.
        </p>
      </div>
    </div>
  );
}
