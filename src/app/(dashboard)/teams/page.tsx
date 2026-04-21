import { Plus, Users } from "lucide-react";

export default function TeamsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-muted-foreground">
            Manage field teams, attendance, and live tracking
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Add Member
        </button>
      </div>

      <div className="rounded-lg border bg-card p-12 text-center">
        <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No team members</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Add team members to start managing your workforce.
        </p>
      </div>
    </div>
  );
}
