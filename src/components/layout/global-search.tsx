"use client";

import {
  Building2,
  ClipboardList,
  HardDrive,
  MapPin,
  Package,
  ScrollText,
  Search,
  ShoppingCart,
  Ticket,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import api from "@/lib/api";
import { cn } from "@/lib/utils";

/** One place the search looks: the list endpoint, how a hit reads, where it opens. */
interface Source {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  title: (row: Record<string, unknown>) => string;
  detail?: (row: Record<string, unknown>) => string;
  href: (row: Record<string, unknown>) => string;
}

const s = (v: unknown) => (v == null ? "" : String(v));

// Every list endpoint already answers ?search= with the reader's own rights
// applied, so the palette asks them all and shows whatever comes back.
const SOURCES: Source[] = [
  { key: "devices", label: "Assets", icon: HardDrive, path: "/assets/devices/",
    title: (r) => s(r.asset_code), detail: (r) => [s(r.display_name), s(r.site_name)].filter(Boolean).join(" · "),
    href: (r) => `/assets?device=${r.id}` },
  { key: "projects", label: "Projects", icon: ClipboardList, path: "/teams/projects/",
    title: (r) => s(r.name), detail: (r) => [s(r.project_code), s(r.client_name)].filter(Boolean).join(" · "), href: (r) => `/projects?project=${r.id}` },
  { key: "sites", label: "Sites", icon: MapPin, path: "/sites/sites/",
    title: (r) => s(r.name), detail: (r) => [s(r.client_name), s(r.city)].filter(Boolean).join(" · "), href: (r) => `/sites?site=${r.id}` },
  { key: "tickets", label: "Tickets", icon: Ticket, path: "/tickets/",
    title: (r) => s(r.ticket_number), detail: (r) => s(r.title), href: (r) => `/tickets?open=${r.id}` },
  { key: "installations", label: "Installations", icon: Wrench, path: "/sites/installations/",
    title: (r) => s(r.device_code ?? r.asset_code ?? r.device_display_name), detail: (r) => s(r.site_name), href: (r) => `/installation-tracker?installation=${r.id}` },
  { key: "work-orders", label: "Work orders", icon: ScrollText, path: "/work-orders/",
    title: (r) => s(r.wo_number), detail: (r) => s(r.title), href: (r) => `/work-orders?wo=${r.id}` },
  { key: "orders", label: "Purchase orders", icon: ShoppingCart, path: "/procurement/orders/",
    title: (r) => s(r.po_number), detail: (r) => s(r.supplier_name), href: (r) => `/procurement?po=${r.id}` },
  { key: "items", label: "Generic components", icon: Package, path: "/inventory/items/",
    title: (r) => s(r.material_name), detail: (r) => s(r.sku), href: () => `/inventory?tab=generic` },
  { key: "products", label: "Unique components", icon: Package, path: "/inventory/products/",
    title: (r) => s(r.name), detail: (r) => s(r.type_code), href: () => `/inventory?tab=unique` },
  { key: "users", label: "People", icon: Users, path: "/accounts/users/",
    title: (r) => s(r.full_name) || s(r.username), detail: (r) => s(r.role_label ?? r.role), href: () => `/teams` },
  { key: "suppliers", label: "Vendors", icon: Truck, path: "/suppliers/",
    title: (r) => s(r.name), detail: (r) => s(r.code), href: () => `/suppliers` },
  { key: "clients", label: "Clients", icon: Building2, path: "/clients/",
    title: (r) => s(r.name), detail: (r) => s(r.code), href: () => `/clients` },
];

interface Hit { source: Source; row: Record<string, unknown> }

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQ(""); setHits([]); setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Ask every source at once; a source the reader may not see answers 403
  // and is simply left out.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setHits([]); setLoading(false); return; }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const results = await Promise.allSettled(
        SOURCES.map((src) => api.get(src.path, { params: { search: term, page_size: 5 } }))
      );
      if (mine !== seq.current) return;
      const found: Hit[] = [];
      results.forEach((res, i) => {
        if (res.status !== "fulfilled") return;
        const rows = res.value.data.results ?? res.value.data;
        if (!Array.isArray(rows)) return;
        rows.slice(0, 5).forEach((row) => found.push({ source: SOURCES[i], row }));
      });
      setHits(found);
      setCursor(0);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const grouped = useMemo(() => {
    const by = new Map<string, Hit[]>();
    hits.forEach((h) => by.set(h.source.key, [...(by.get(h.source.key) ?? []), h]));
    return [...by.values()];
  }, [hits]);

  function go(hit: Hit) {
    onClose();
    router.push(hit.source.href(hit.row));
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Enter" && hits[cursor]) { e.preventDefault(); go(hits[cursor]); }
    else if (e.key === "Escape") onClose();
  }

  if (!open || typeof document === "undefined") return null;
  let index = -1;
  // Under <body>, not inside the blurred header: a fixed box inside a
  // backdrop-filter ancestor is clipped to it.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose} role="dialog" aria-label="Search everything">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border/60 bg-card shadow-float" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search assets, tickets, projects, sites, orders, stock, people…"
            className="h-12 w-full border-0 bg-transparent text-sm text-foreground shadow-none outline-none ring-0 placeholder:text-muted-foreground focus:border-0 focus:outline-none focus:ring-0"
            aria-label="Search"
          />
          {loading && <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />}
          <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground sm:block">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {q.trim().length < 2 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Type a code, a name, a serial, a ticket number — anything.</p>
          ) : !loading && hits.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Nothing matches “{q.trim()}”.</p>
          ) : (
            grouped.map((group) => (
              <div key={group[0].source.key}>
                <p className="px-4 pb-1 pt-3 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{group[0].source.label}</p>
                {group.map((hit) => {
                  index += 1;
                  const i = index;
                  const Icon = hit.source.icon;
                  return (
                    <button
                      key={`${hit.source.key}-${s(hit.row.id)}`}
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={() => go(hit)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors",
                        i === cursor ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-secondary/60",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-medium">{hit.source.title(hit.row) || "—"}</span>
                      {hit.source.detail && <span className="max-w-[45%] truncate text-xs text-muted-foreground">{hit.source.detail(hit.row)}</span>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-2xs text-muted-foreground">
          <span><kbd className="rounded border border-border px-1">↑</kbd> <kbd className="rounded border border-border px-1">↓</kbd> move</span>
          <span><kbd className="rounded border border-border px-1">↵</kbd> open</span>
          <span className="ml-auto"><kbd className="rounded border border-border px-1">Ctrl</kbd> <kbd className="rounded border border-border px-1">K</kbd> from anywhere</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
