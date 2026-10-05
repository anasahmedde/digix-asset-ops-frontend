"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A photograph at full size, over everything.
 *
 * Rendered straight under <body> for the same reason a dialog is: inside the
 * page's own tree, an ancestor with a transform or a backdrop filter becomes
 * what "fixed" is fixed to, and the overlay then covers that box instead of
 * the screen — which is the pale band along the top of the window.
 */
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Escape closes it, and the page behind stays where it was.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);
  if (!mounted) return null;

  return createPortal(
    <div
      className="veil-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={onClose}
    >
      <button
        aria-label="Close"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Full size"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
      />
    </div>,
    document.body
  );
}
