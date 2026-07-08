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
        "group rounded-xl border border-border bg-card p-5 transition-all duration-200 shadow-sm",
        onClick && "cursor-pointer hover:shadow-md hover:-translate-y-0.5",
        variant === "highlighted" && "border-primary/30 bg-primary/5",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground truncate">{label}</p>
          <p className="mt-2 text-2xl font-bold text-card-foreground">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {(subtitle || percentage !== undefined) && (
            <div className="mt-1 flex items-center gap-2">
              {subtitle && (
                <span className="text-xs text-muted-foreground">{subtitle}</span>
              )}
              {percentage !== undefined && (
                <span className="text-xs font-medium text-primary">
                  {percentage.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>
        <div className="ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
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
