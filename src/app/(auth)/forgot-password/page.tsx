"use client";

import Link from "next/link";
import { ArrowLeft, KeyRound, ShieldAlert } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md space-y-8 rounded-xl border bg-card p-8 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <KeyRound className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Reset Password</h1>
          <p className="text-sm text-muted-foreground">
            Password resets are handled by your administrator
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-4">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              For security, DIGIX accounts can only be reset by an
              administrator. Contact your operations manager or system
              administrator and they can set a new password for you from the
              Teams screen.
            </p>
          </div>

          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" /> Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
