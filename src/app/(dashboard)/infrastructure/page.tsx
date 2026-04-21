import { Zap } from "lucide-react";

export default function InfrastructurePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Infrastructure</h1>
        <p className="text-muted-foreground">
          Power monitoring and environmental conditions
        </p>
      </div>

      <div className="rounded-lg border bg-card p-12 text-center">
        <Zap className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No infrastructure data</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Infrastructure monitoring will be available in a later wave.
        </p>
      </div>
    </div>
  );
}
