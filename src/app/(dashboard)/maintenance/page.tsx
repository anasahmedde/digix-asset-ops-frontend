import { Wrench } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance</h1>
        <p className="text-muted-foreground">
          Scheduled and reactive maintenance records
        </p>
      </div>

      <div className="rounded-lg border bg-card p-12 text-center">
        <Wrench className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No maintenance records</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Maintenance scheduling will be available after the ticketing system is active.
        </p>
      </div>
    </div>
  );
}
