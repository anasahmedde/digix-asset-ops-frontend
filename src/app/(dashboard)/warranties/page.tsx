import { Shield } from "lucide-react";

export default function WarrantiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Warranties</h1>
        <p className="text-muted-foreground">
          Track supplier and client warranty coverage
        </p>
      </div>

      <div className="rounded-lg border bg-card p-12 text-center">
        <Shield className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No warranties tracked</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Warranty management will be available after devices are registered.
        </p>
      </div>
    </div>
  );
}
