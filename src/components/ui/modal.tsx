"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  children: React.ReactNode;
  className?: string;
}

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-6xl",
};

export function Modal({ open, onClose, title, size = "lg", children, className }: ModalProps) {
  // Rendered straight under <body>: a dialog inside the page's own tree is
  // at the mercy of every ancestor — a transformed wrapper pins "fixed" to
  // itself, a scrolled backdrop filter leaves a band along the top — and a
  // dialog has to cover the whole screen every time.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The page behind stays put while a dialog is open: a wheel over the
  // dialog must not scroll the document underneath it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      {/* The dimming and the blur live on their own layer, which never
          scrolls, so the backdrop is painted for the full viewport. */}
      <div className="veil-in absolute inset-0 bg-black/50 backdrop-blur-md" aria-hidden />
      {/* The scrolling happens out here, and the centring one level in.
          Centring a child that is taller than its scroll container pushes
          the top of it past the container's start edge, and scrollTop
          cannot go below zero — so a long form lost its heading and its
          close button off the top of the screen for good. With min-h-full
          the wrapper is at least a screen tall, so a short dialog still
          sits in the middle and a tall one starts at its own top. */}
      <div className="absolute inset-0 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full items-center justify-center p-4 sm:p-8">
          <div
            role="dialog"
            aria-modal="true"
            className={cn(
              "glass glass-pop relative w-full rounded-2xl",
              sizeClasses[size],
              className
            )}
          >
            {title && (
              // Pinned: on a form this long the way out should not be
              // something you have to scroll back up to find.
              <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl border-b border-[hsl(var(--glass-line))] bg-[rgb(var(--glass-tint)/0.92)] px-6 py-4 backdrop-blur-md">
                <h2 className="text-lg font-semibold text-card-foreground">{title}</h2>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
            <div className={cn("px-6 pb-6", title ? "pt-4" : "pt-6")}>{children}</div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
