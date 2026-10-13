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
 *
 * Across the page from sm up; down the page on a phone, where a sideways
 * rail of eight steps left most of them off the edge with nothing to say so.
 */
export function ProgressStepper({ steps, className }: ProgressStepperProps) {
  return (
    <div className={cn("sm:no-scrollbar sm:overflow-x-auto sm:overflow-y-hidden sm:pb-1", className)}>
      <ol
        className="flex flex-col sm:min-w-[var(--rail-min)] sm:flex-row"
        // 84px a step before the rail scrolls: eight steps fit a tablet.
        style={{ ["--rail-min" as string]: `${steps.length * 84}px` }}
      >
        {steps.map((step, i) => {
          const next = steps[i + 1];
          // The segment leaving this node: solid once this step is done,
          // red where the next step is stuck, dashed past a skipped one.
          const segment =
            step.status === "skipped"
              ? "border-dashed border-border bg-transparent max-sm:border-l-2 sm:border-t-2"
              : step.status === "completed"
                ? next?.status === "on_hold" ? "bg-red-400" : "bg-primary"
                : "bg-border";
          return (
            <li
              key={step.key}
              className="relative flex gap-3 pb-5 last:pb-0 sm:flex-1 sm:flex-col sm:items-center sm:gap-0 sm:px-1 sm:pb-0 sm:text-center"
            >
              {next && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute bottom-0 left-[17px] top-9 w-0.5 sm:bottom-auto sm:left-1/2 sm:top-[17px] sm:h-0.5 sm:w-full",
                    segment,
                  )}
                />
              )}
              <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
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
              <span className="flex min-w-0 flex-col pt-1 sm:items-center sm:pt-0">
                <span
                  className={cn(
                    "text-sm font-medium leading-tight sm:mt-2 sm:max-w-full sm:text-xs",
                    step.status === "pending" || step.status === "skipped" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {step.label}
                </span>
                <span className={cn("mt-0.5 text-2xs", STATUS_TEXT[step.status])}>{STATUS_LABEL[step.status]}</span>
                {step.meta && (
                  <span className="mt-0.5 text-2xs tabular-nums text-muted-foreground">{step.meta}</span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
