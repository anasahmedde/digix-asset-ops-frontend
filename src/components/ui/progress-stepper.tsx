"use client";

import { Check, Minus, Pause } from "lucide-react";

import { cn } from "@/lib/utils";

type StepStatus = "completed" | "in_progress" | "on_hold" | "pending" | "skipped";

interface Step {
  key: string;
  label: string;
  status: StepStatus;
  icon?: React.ReactNode;
  /** A date or short note under the status — when it started or finished. */
  meta?: string;
}

interface ProgressStepperProps {
  steps: Step[];
  className?: string;
}

const NODE: Record<StepStatus, string> = {
  completed: "border-primary bg-primary text-primary-foreground",
  in_progress: "border-primary bg-card text-primary",
  // A blocked step is the one thing on the rail someone has to act on.
  on_hold: "border-red-500 bg-red-500/10 text-red-600",
  pending: "border-border bg-card text-muted-foreground",
  skipped: "border-dashed border-border bg-secondary text-muted-foreground/60",
};

const STATUS_TEXT: Record<StepStatus, string> = {
  completed: "text-primary",
  in_progress: "text-primary",
  on_hold: "font-semibold text-red-600",
  pending: "text-muted-foreground",
  skipped: "text-muted-foreground/70",
};

const STATUS_LABEL: Record<StepStatus, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  on_hold: "On Hold",
  pending: "Not Started",
  skipped: "Skipped",
};

/**
 * A process drawn as a rail: each segment fills once the step before it is
 * done, so how far along the job is reads at a glance. The step being worked
 * carries a soft halo; a blocked step turns the rail red at that point.
 */
export function ProgressStepper({ steps, className }: ProgressStepperProps) {
  return (
    <div className={cn("overflow-x-auto pb-1", className)}>
      <ol className="flex min-w-max" style={{ minWidth: `${steps.length * 104}px` }}>
        {steps.map((step, i) => {
          const next = steps[i + 1];
          // The segment leaving this node: solid once this step is done,
          // red where the next step is stuck, dashed past a skipped one.
          const segment =
            step.status === "skipped"
              ? "border-t-2 border-dashed border-border bg-transparent"
              : step.status === "completed"
                ? next?.status === "on_hold" ? "bg-red-400" : "bg-primary"
                : "bg-border";
          return (
            <li key={step.key} className="relative flex flex-1 flex-col items-center px-1 text-center">
              {next && (
                <span
                  aria-hidden
                  className={cn("absolute left-1/2 top-[17px] h-0.5 w-full", segment)}
                />
              )}
              <span className="relative flex h-9 w-9 items-center justify-center">
                {step.status === "in_progress" && (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-primary/25 motion-safe:animate-ping" />
                )}
                <span
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold shadow-sm transition-colors",
                    NODE[step.status],
                  )}
                >
                  {step.status === "completed" ? (
                    <Check className="h-4 w-4" strokeWidth={3} />
                  ) : step.status === "on_hold" ? (
                    <Pause className="h-4 w-4" />
                  ) : step.status === "skipped" ? (
                    <Minus className="h-4 w-4" />
                  ) : step.icon ? (
                    step.icon
                  ) : (
                    i + 1
                  )}
                </span>
              </span>
              <span
                className={cn(
                  "mt-2 max-w-24 text-xs font-medium leading-tight",
                  step.status === "pending" || step.status === "skipped" ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {step.label}
              </span>
              <span className={cn("mt-0.5 text-[10px]", STATUS_TEXT[step.status])}>{STATUS_LABEL[step.status]}</span>
              {step.meta && (
                <span className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{step.meta}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
