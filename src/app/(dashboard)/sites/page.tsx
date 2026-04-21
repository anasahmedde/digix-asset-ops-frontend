import { MapPin, Plus } from "lucide-react";

export default function SitesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sites</h1>
          <p className="text-muted-foreground">
            Manage client sites and device locations
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Site
        </button>
      </div>

      <div className="rounded-lg border bg-card p-12 text-center">
        <MapPin className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No sites added</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Add your first client site to start managing device locations.
        </p>
      </div>
    </div>
  );
}
