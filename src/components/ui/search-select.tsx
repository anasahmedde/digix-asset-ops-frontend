"use client";

import { useEffect, useState } from "react";

export interface SearchOption {
  id: string;
  label: string;
}

interface SearchSelectProps {
  options: SearchOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Renders a hidden input so the value flows through FormData. */
  name?: string;
  required?: boolean;
  className?: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";

/** Searchable single-select: type to filter, click to pick (same pattern as the ticket asset picker). */
export function SearchSelect({ options, value, onChange, placeholder, name, required, className }: SearchSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  // Keep the visible text in sync when the value is set programmatically.
  useEffect(() => {
    const current = options.find((o) => o.id === value);
    if (current) setQuery(current.label);
    else if (!value) setQuery("");
  }, [value, options]);

  const matches = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())).slice(0, 50);

  return (
    <div className={`relative ${className ?? ""}`}>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange("");
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Search…"}
        className={inputClass}
        autoComplete="off"
        required={required && !value}
      />
      {name && <input type="hidden" name={name} value={value} />}
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
          {matches.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={() => {
                onChange(o.id);
                setQuery(o.label);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10 ${value === o.id ? "bg-primary/5 font-medium text-primary" : "text-foreground"}`}
            >
              {o.label}
            </button>
          ))}
          {matches.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No matches for &quot;{query}&quot;</p>}
        </div>
      )}
    </div>
  );
}
