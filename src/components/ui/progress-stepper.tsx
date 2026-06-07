"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

interface Step {
  key: string;
  label: string;
  status: "completed" | "in_progress" | "pending" | "skipped";
  icon?: React.ReactNode;
}

interface ProgressStepperProps {
  steps: Step[];
  className?: string;
}

const statusStyles = {
  completed: "bg-primary text-primary-foreground border-primary",
  in_progress: "bg-primary/20 text-primary border-primary ring-4 ring-primary/10",
  pending: "bg-secondary text-muted-foreground border-border",
  skipped: "bg-secondary text-muted-foreground/50 border-border",
};

const lineStyles = {
  completed: "bg-primary",
  in_progress: "bg-primary/30",
  pending: "bg-border",
  skipped: "bg-border",
};

export function ProgressStepper({ steps, className }: ProgressStepperProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      {steps.map((step, i) => (
        <div key={step.key} className="flex flex-1 items-center">
          <div className="flex flex-col items-center gap-2">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-bold transition-all",
                statusStyles[step.status]
              )}
            >
              {step.status === "completed" ? (
                <Check className="h-5 w-5" />
              ) : step.icon ? (
                step.icon
              ) : (
                i + 1
              )}
            </div>
            <span
              className={cn(
                "text-center text-xs font-medium max-w-20",
                step.status === "completed" || step.status === "in_progress"
                  ? "text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            <span
              className={cn(
                "text-[10px]",
                step.status === "completed"
                  ? "text-primary"
                  : step.status === "in_progress"
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {step.status === "completed"
                ? "Completed"
                : step.status === "in_progress"
                ? "In Progress"
                : step.status === "skipped"
                ? "Skipped"
                : "Pending"}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn("mx-2 h-0.5 flex-1 rounded-full", lineStyles[step.status])}
            />
          )}
        </div>
      ))}
    </div>
  );
}
