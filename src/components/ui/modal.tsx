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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden />
      <div className="absolute inset-0 flex items-center justify-center overflow-y-auto py-8">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            "relative w-full rounded-2xl border border-border bg-card p-6 shadow-2xl",
            sizeClasses[size],
            className
          )}
        >
          {title && (
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-card-foreground">{title}</h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
