import { Package } from "lucide-react";

export default function InventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventory</h1>
        <p className="text-muted-foreground">
          Stock levels, warehouse management, and spare parts
        </p>
      </div>

      <div className="rounded-lg border bg-card p-12 text-center">
        <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No inventory items</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Inventory management will be available after the supply chain modules are set up.
        </p>
      </div>
    </div>
  );
}
