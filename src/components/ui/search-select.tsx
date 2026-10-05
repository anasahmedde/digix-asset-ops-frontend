"use client";

import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  disabled?: boolean;
}

const control =
  "flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-sm transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * A dropdown with a search box in it.
 *
 * It used to be a bare text input that filtered as you typed, which had
 * two problems: nothing about it said it was a list, and once you had
 * picked something the box held that label — so reopening it filtered the
 * list down to the one thing already chosen. The search now lives inside
 * the panel, where it belongs, and the closed control shows the choice.
 */
export function SearchSelect({
  options, value, onChange, placeholder, name, required, className, disabled,
}: SearchSelectProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  const chosen = options.find((o) => o.id === value) ?? null;
  const matches = options
    .filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 100);

  // Clicking anywhere else puts it away, the same as a native select.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  // Opening lands the cursor in the search box: the point of opening it is
  // usually to look for something.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      const t = setTimeout(() => search.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div ref={box} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`${control} ${open ? "border-primary/50 ring-1 ring-primary/30" : ""}`}
      >
        <span className={`min-w-0 flex-1 truncate ${chosen ? "text-foreground" : "text-muted-foreground"}`}>
          {chosen ? chosen.label : placeholder ?? "Select…"}
        </span>
        {chosen && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Kept so the value still flows through a form submit. */}
      {name && <input type="hidden" name={name} value={value} />}
      {required && !value && (
        // Carries the browser's own "please fill this in" to the control,
        // without a second visible box to tab through.
        <input
          tabIndex={-1}
          aria-hidden
          required
          value=""
          onChange={() => {}}
          onFocus={() => setOpen(true)}
          className="pointer-events-none absolute bottom-0 left-3 h-0 w-0 opacity-0"
        />
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="border-b border-border p-1.5">
            <input
              ref={search}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, matches.length - 1)); }
                if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
                if (e.key === "Enter" && matches[active]) { e.preventDefault(); pick(matches[active].id); }
              }}
              placeholder="Type to search…"
              autoComplete="off"
              className="h-8 w-full rounded-md bg-secondary px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <div role="listbox" className="max-h-56 overflow-y-auto py-1">
            {matches.map((o, i) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={value === o.id}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  i === active ? "bg-primary/10" : ""
                } ${value === o.id ? "font-medium text-primary" : "text-foreground"}`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {value === o.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            ))}
            {matches.length === 0 && (
              <p className="px-3 py-3 text-center text-xs text-muted-foreground">
                {query.trim() ? `Nothing matches "${query.trim()}"` : "Nothing to choose from"}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
