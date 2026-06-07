"use client";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "error" | "info" | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20",
  error: "bg-red-500/10 text-red-500 ring-1 ring-red-500/20",
  info: "bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20",
  outline: "border border-border text-muted-foreground",
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: string;
  className?: string;
}

export function Badge({ children, variant = "default", dot, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dot }} />}
      {children}
    </span>
  );
}

const STATUS_MAP: Record<string, BadgeVariant> = {
  active: "success",
  installed: "success",
  completed: "success",
  on_track: "success",
  working: "success",
  open: "info",
  in_progress: "warning",
  at_risk: "warning",
  under_maintenance: "warning",
  pending: "warning",
  delayed: "error",
  decommissioned: "error",
  out_of_order: "error",
  critical: "error",
  closed: "outline",
  resolved: "success",
  blocked: "error",
  pending_review: "warning",
  approved: "success",
  rejected: "error",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const variant = STATUS_MAP[status] || "default";
  const displayLabel = label || status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return <Badge variant={variant}>{displayLabel}</Badge>;
}
