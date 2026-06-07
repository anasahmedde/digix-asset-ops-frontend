"use client";

import { cn } from "@/lib/utils";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn("flex border-b border-border", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "relative px-4 py-3 text-sm font-medium transition-colors",
            active === tab.key
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <span className="flex items-center gap-2">
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold",
                  active === tab.key
                    ? "bg-primary/10 text-primary"
                    : "bg-secondary text-muted-foreground"
                )}
              >
                {tab.count}
              </span>
            )}
          </span>
          {active === tab.key && (
            <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}
