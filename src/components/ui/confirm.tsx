"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

import { Modal } from "@/components/ui/modal";

/**
 * The app's own "are you sure?" box, in place of the browser's.
 *
 * The browser's dialog says "localhost:3000 says", cannot be styled, and
 * runs every sentence together. This one is small, titled with the question,
 * and says what follows underneath.
 *
 *   if (!(await confirmAction({ title: "Delete X?", message: "This cannot be undone." }))) return;
 *
 * A plain sentence works too: its question becomes the title and the rest
 * the message.
 */
export interface ConfirmAsk {
  title: string;
  message?: string;
  /** The button that goes ahead; worked out from the question when left out. */
  confirmLabel?: string;
  /** Red for something that removes or stops; worked out when left out. */
  danger?: boolean;
}

type Pending = ConfirmAsk & { resolve: (ok: boolean) => void };
let show: ((p: Pending) => void) | null = null;

const DANGER = /^(delete|remove|cancel|deactivate|withdraw|pause|discard)\b/i;

function read(ask: ConfirmAsk | string): ConfirmAsk {
  if (typeof ask !== "string") return ask;
  // "Delete X? This cannot be undone." -> title "Delete X?", message the rest.
  const cut = ask.search(/\?\s/);
  return cut === -1
    ? { title: ask }
    : { title: ask.slice(0, cut + 1).trim(), message: ask.slice(cut + 1).trim() };
}

export function confirmAction(ask: ConfirmAsk | string): Promise<boolean> {
  const a = read(ask);
  if (!show) return Promise.resolve(window.confirm([a.title, a.message].filter(Boolean).join("\n\n")));
  return new Promise((resolve) => show!({ ...a, resolve }));
}

/** Mounted once, in the dashboard shell. */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    show = setPending;
    return () => { show = null; };
  }, []);
  // Escape answers this box only: caught first, so the dialog it was asked
  // from does not close underneath it.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      pending.resolve(false);
      setPending(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pending]);
  if (!pending) return null;

  const verb = pending.title.split(/\s/)[0].replace(/[^\w]/g, "");
  const danger = pending.danger ?? DANGER.test(pending.title);
  const goLabel = pending.confirmLabel
    ?? (DANGER.test(pending.title) ? (verb === "Cancel" ? pending.title.replace(/\?$/, "").split(/\s/).slice(0, 2).join(" ") : verb) : "Confirm");
  // "Cancel PO-001?" would offer two buttons both reading Cancel.
  const backLabel = verb === "Cancel" ? "Keep it" : "Cancel";
  const close = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };

  return (
    <Modal open onClose={() => close(false)} size="xs">
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          {danger && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-600">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-base font-semibold text-foreground">{pending.title}</h2>
            {pending.message && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{pending.message}</p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => close(false)}
            className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {backLabel}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            className={`inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium text-white transition-colors ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary/90"
            }`}
          >
            {goLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
