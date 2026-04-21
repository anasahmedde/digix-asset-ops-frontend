import { BarChart3 } from "lucide-react";

export default function AnalyticsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics & Reports</h1>
        <p className="text-muted-foreground">
          Operational dashboards, KPIs, and exportable reports
        </p>
      </div>

      <div className="rounded-lg border bg-card p-12 text-center">
        <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">Not enough data</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Analytics and reporting will produce meaningful insights once operational data accumulates.
        </p>
      </div>
    </div>
  );
}
