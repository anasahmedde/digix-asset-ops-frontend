"use client";

import { Search, X } from "lucide-react";

interface FilterOption {
  value: string;
  label: string;
}

interface FilterDef {
  key: string;
  label: string;
  options: FilterOption[];
}

interface FilterBarProps {
  filters: FilterDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

export function FilterBar({ filters, values, onChange, search, onSearchChange, searchPlaceholder }: FilterBarProps) {
  const hasActive = Object.values(values).some((v) => v !== "") || (search && search.length > 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {onSearchChange !== undefined && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder || "Search..."}
            className="h-9 w-52 rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
          />
        </div>
      )}
      {filters.map((f) => (
        <select
          key={f.key}
          value={values[f.key] ?? ""}
          onChange={(e) => onChange(f.key, e.target.value)}
          className="h-9 rounded-lg border border-border bg-card px-3 pr-8 text-xs font-medium text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors"
        >
          <option value="">{f.label}: All</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}
      {hasActive && (
        <button
          onClick={() => {
            filters.forEach((f) => onChange(f.key, ""));
            if (onSearchChange) onSearchChange("");
          }}
          className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
        >
          <X className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  );
}
