"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

/** Small inline icon button that copies `text` to the clipboard. */
export function CopyButton({ text, label, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied!" : `Copy ${label ?? text}`}
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-70 transition-colors hover:bg-secondary hover:text-foreground hover:opacity-100 ${className ?? ""}`}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}
