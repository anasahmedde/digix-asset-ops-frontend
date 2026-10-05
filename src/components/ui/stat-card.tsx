"use client";

import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
  percentage?: number;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "highlighted";
  className?: string;
  onClick?: () => void;
}

export function StatCard({
  label,
  value,
  icon,
  subtitle,
  percentage,
  variant = "default",
  className,
  onClick,
}: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        // Fills whatever cell it is put in. A grid stretches its items,
        // but the card inside only took its content height — so a tile
        // whose subtitle wrapped onto two lines stood taller than the
        // one beside it that fitted on one.
        "group card-lift h-full rounded-xl border border-border bg-card p-5 shadow-sm",
        onClick && "cursor-pointer",
        variant === "highlighted" && "border-primary/30 bg-primary/5",
        className
      )}
    >
      {/* The icon sits against the number, not against the whole tile:
          centring it on a block whose height depends on how long the
          subtitle wraps is what left the four of them misaligned. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold leading-none text-card-foreground">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {(subtitle || percentage !== undefined) && (
            <div className="mt-1.5 flex items-start gap-2">
              {subtitle && (
                /* Two lines at most. A tile that grows a third line is a
                   tile taller than the three beside it. */
                <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {subtitle}
                </span>
              )}
              {percentage !== undefined && (
                <span className="text-xs font-medium text-primary">
                  {percentage.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>
        <div className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-colors duration-200 group-hover:bg-primary/10 group-hover:text-primary">
          {icon}
        </div>
      </div>
      {percentage !== undefined && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}
