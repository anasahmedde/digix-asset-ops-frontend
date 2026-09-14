"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export interface MultiOption {
  id: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiOption[];
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  /** Renders one hidden input per selected value so FormData.getAll(name) works. */
  name?: string;
  className?: string;
}

/** Dropdown multi-select: button trigger, searchable checklist panel. */
export function MultiSelect({ options, values, onChange, placeholder, name, className }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const selected = options.filter((o) => values.includes(o.id));
  const matches = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  function toggle(id: string) {
    onChange(values.includes(id) ? values.filter((v) => v !== id) : [...values, id]);
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30"
      >
        <span className={`flex min-w-0 flex-wrap items-center gap-1 ${selected.length === 0 ? "text-muted-foreground" : ""}`}>
          {selected.length === 0
            ? placeholder ?? "Select…"
            : selected.map((s) => (
                <span key={s.id} className="inline-flex max-w-40 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <span className="truncate">{s.label}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); toggle(s.id); }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); toggle(s.id); } }}
                    className="rounded-full hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </span>
                </span>
              ))}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {name && values.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-card shadow-xl">
          <div className="relative border-b border-border p-2">
            <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoComplete="off"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {matches.map((o) => {
              const active = values.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggle(o.id)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10 ${active ? "font-medium text-primary" : "text-foreground"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${active ? "border-primary bg-primary text-white" : "border-border"}`}>
                    {active && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{o.label}</span>
                </button>
              );
            })}
            {matches.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>}
          </div>
        </div>
      )}
    </div>
  );
}
