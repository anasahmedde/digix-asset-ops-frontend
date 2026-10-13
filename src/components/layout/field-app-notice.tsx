"use client";

import { Smartphone } from "lucide-react";

import { useUser } from "@/lib/user-context";

/**
 * A technician on the desktop can read everything but starts nothing here:
 * field work is recorded from the phone, standing at the asset. Say so
 * where they will see it, rather than letting a button refuse them.
 */
export function FieldAppNotice() {
  const { user } = useUser();
  if (!user || user.role !== "technician") return null;
  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm sm:mx-6">
      <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p className="text-foreground">
        <span className="font-semibold">To start work, use the DIGIX Field app.</span>{" "}
        Check in at the site, scan the QR label on the asset, upload the asset&apos;s Before photo, then press Start.
        Your jobs are listed here to read; the Start, photo and completion buttons are on the phone only.
      </p>
    </div>
  );
}
