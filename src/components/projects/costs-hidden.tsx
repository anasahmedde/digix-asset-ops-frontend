import { EyeOff } from "lucide-react";

/** Shown in place of a project's money to a role without "See project costs". */
export function CostsHidden({ what }: { what: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-5">
      <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-sm font-semibold text-foreground">{what}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Project costs are not shown for your role. The Administrator can give it
          {" "}<span className="font-medium text-foreground">See project costs</span> under Teams › Roles &amp; Rights.
        </p>
      </div>
    </div>
  );
}
