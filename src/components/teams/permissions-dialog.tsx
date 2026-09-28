"use client";

import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";

/**
 * What one person is allowed to do.
 *
 * A role is the starting point: every capability shows what the role gives,
 * and a switch either agrees with it or overrides it. Anything that differs
 * from the role is marked, so nobody has to guess why somebody can do
 * something.
 */
interface CapabilityDef {
  key: string;
  label: string;
  module: string;
  description: string;
  sensitive: boolean;
}

interface Override {
  capability: string;
  allowed: boolean;
  reason: string;
  granted_by?: string | null;
}

interface Snapshot {
  role: string;
  role_defaults: string[];
  effective: string[];
  overrides: Override[];
  editable_by_me: boolean;
  why_not: string;
}

export function PermissionsDialog({
  userId, userName, roleLabel, onClose, onSaved,
}: {
  userId: string;
  userName: string;
  roleLabel: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [catalogue, setCatalogue] = useState<CapabilityDef[]>([]);
  const [modules, setModules] = useState<string[]>([]);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      api.get("/accounts/capabilities/"),
      api.get(`/accounts/users/${userId}/capabilities/`),
    ])
      .then(([cat, mine]) => {
        setCatalogue(cat.data.capabilities);
        setModules(cat.data.modules);
        setSnap(mine.data);
        setAllowed(new Set<string>(mine.data.effective));
      })
      .catch((err) => toast.error(getApiError(err, "Could not load permissions")));
  }, [userId]);

  useEffect(load, [load]);

  const defaults = useMemo(() => new Set(snap?.role_defaults ?? []), [snap]);
  const reasons = useMemo(
    () => new Map((snap?.overrides ?? []).map((o) => [o.capability, o])),
    [snap],
  );

  // Only what differs from the role is stored; the rest is the role talking.
  const changes = useMemo(
    () => catalogue.filter((c) => allowed.has(c.key) !== defaults.has(c.key)),
    [catalogue, allowed, defaults],
  );

  const dirty = useMemo(() => {
    const now = new Set(changes.map((c) => c.key));
    const was = new Set((snap?.overrides ?? []).map((o) => o.capability));
    return now.size !== was.size || [...now].some((k) => !was.has(k));
  }, [changes, snap]);

  function toggle(key: string) {
    setAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const { data } = await api.put(`/accounts/users/${userId}/capabilities/`, {
        overrides: changes.map((c) => ({ capability: c.key, allowed: allowed.has(c.key) })),
      });
      toast.success(
        changes.length === 0
          ? `${userName} is back to what ${roleLabel} allows`
          : `${changes.length} change${changes.length === 1 ? "" : "s"} saved for ${userName}`,
      );
      setSnap((s) => (s ? { ...s, effective: data.effective, overrides: data.overrides } : s));
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(getApiError(err, "Could not save permissions"));
    } finally {
      setSaving(false);
    }
  }

  const readOnly = snap ? !snap.editable_by_me : true;

  return (
    <Modal open onClose={onClose} title={`What ${userName} may do`} size="lg">
      {!snap ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 font-medium text-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" /> {roleLabel}
            </span>
            <span className="text-muted-foreground">
              {allowed.size} of {catalogue.length} allowed
            </span>
            {changes.length > 0 && (
              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 font-medium text-amber-600 ring-1 ring-amber-500/30">
                {changes.length} differ{changes.length === 1 ? "s" : ""} from the role
              </span>
            )}
          </div>

          {readOnly && (
            <p className="rounded-lg border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
              {snap.why_not || "You can see this, but not change it."}
            </p>
          )}

          <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
            {modules.map((mod) => {
              const rows = catalogue.filter((c) => c.module === mod);
              if (rows.length === 0) return null;
              return (
                <div key={mod} className="space-y-1.5">
                  <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{mod}</p>
                  <div className="overflow-hidden rounded-lg border border-border">
                    {rows.map((c, i) => {
                      const on = allowed.has(c.key);
                      const byDefault = defaults.has(c.key);
                      const overridden = on !== byDefault;
                      const note = reasons.get(c.key);
                      return (
                        <label
                          key={c.key}
                          htmlFor={`cap-${c.key}`}
                          className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 ${
                            i > 0 ? "border-t border-border/60" : ""
                          } ${overridden ? "bg-amber-500/5" : ""} ${readOnly ? "cursor-default" : "hover:bg-secondary/40"}`}
                        >
                          <input
                            id={`cap-${c.key}`}
                            type="checkbox"
                            checked={on}
                            disabled={readOnly}
                            onChange={() => toggle(c.key)}
                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[hsl(var(--primary))]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-medium text-foreground">{c.label}</span>
                              {c.sensitive && (
                                <AlertTriangle className="h-3 w-3 text-amber-500" aria-label="Hands over real authority" />
                              )}
                              {overridden && (
                                <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-2xs font-medium text-amber-600">
                                  {on ? "granted" : "withdrawn"} · role says {byDefault ? "yes" : "no"}
                                </span>
                              )}
                            </span>
                            <span className="block text-xs leading-snug text-muted-foreground">{c.description}</span>
                            {note?.granted_by && (
                              <span className="block text-2xs text-muted-foreground">
                                by {note.granted_by}{note.reason ? ` — ${note.reason}` : ""}
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-3">
            {!readOnly && changes.length > 0 && (
              <button
                type="button"
                onClick={() => setAllowed(new Set(snap.role_defaults))}
                className="mr-auto inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Back to what {roleLabel} allows
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {readOnly ? "Close" : "Cancel"}
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={save}
                disabled={saving || !dirty}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save permissions"}
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
