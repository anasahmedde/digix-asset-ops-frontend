"use client";

import { ArrowDown, ArrowUp, Check, Factory, Pencil, Plus, Trash2, Truck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

export interface ProductionStep {
  id: string;
  device: string;
  step_number: number;
  name: string;
  location: "undecided" | "in_house" | "external";
  location_display: string;
  hold_reason?: string;
  /** True while the project still has to say where this operation happens. */
  decision_pending?: boolean;
  /** The live work order covering this operation, once raised. */
  work_order?: { id: string; wo_number: string; status: string; status_display: string } | null;
  workshop: string | null;
  workshop_name: string;
  workshop_display: string | null;
  status: string;
  status_display: string;
  allowed_transitions: string[];
  assigned_to: string | null;
  assigned_to_name: string | null;
  expected_days: number | null;
  sent_at: string | null;
  returned_at: string | null;
  completed_at: string | null;
  notes: string;
}
interface Ref { id: string; name: string }

const STATUS_BADGES: Record<string, string> = {
  pending: "bg-secondary text-muted-foreground ring-border",
  in_progress: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  sent_out: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  returned: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  skipped: "bg-secondary text-muted-foreground ring-border",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  sent_out: "Work order raised",
  returned: "Returned",
  completed: "Completed",
  skipped: "Skipped",
};

const rowInput =
  "h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";

/**
 * The build route for an in-house asset: the operations that turn components
 * into the finished thing, each done on our floor or at an outside workshop.
 */
export function ProductionRoute({
  deviceId,
  steps,
  onChanged,
  assetTypeName,
  readOnly = false,
  readOnlyReason,
  locked = false,
}: {
  deviceId: string;
  steps: ProductionStep[];
  onChanged: () => void;
  assetTypeName?: string | null;
  /** Vendor-built assets keep the section on screen but inert. */
  readOnly?: boolean;
  readOnlyReason?: string | null;
  /** Item 10: in execution the route is fixed — steps still move through their statuses. */
  locked?: boolean;
}) {
  const { canWrite } = useUser();
  const canEdit = canWrite("devices") && !readOnly;
  const canRestructure = canEdit && !locked;
  // Item 7: one step at a time can be renamed / re-timed in place.
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");


  function resetForm() {
    setName("");
  }

  async function addStep(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await api.post("/assets/production-steps/", {
        device: deviceId,
        // Steps are numbered in the order they are laid out; where each one
        // happens is the project's decision, made in Execution.
        step_number: (steps[steps.length - 1]?.step_number ?? 0) + 1,
        name: name.trim(),
      });
      toast.success("Step added to the route");
      resetForm();
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not add the step"));
    } finally {
      setAdding(false);
    }
  }

  async function advance(step: ProductionStep, status: string) {
    setBusy(step.id);
    try {
      await api.post(`/assets/production-steps/${step.id}/transition/`, { status });
      toast.success(`${step.name} → ${STATUS_LABELS[status] ?? status}`);
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "That move is not allowed"));
    } finally {
      setBusy(null);
    }
  }

  async function move(step: ProductionStep, direction: "up" | "down") {
    setBusy(step.id);
    try {
      await api.post(`/assets/production-steps/${step.id}/move/`, { direction });
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not move that step"));
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit() {
    if (!editing || !editing.name.trim()) return;
    setBusy(editing.id);
    try {
      await api.patch(`/assets/production-steps/${editing.id}/`, { name: editing.name.trim() });
      toast.success("Step updated");
      setEditing(null);
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not update the step"));
    } finally {
      setBusy(null);
    }
  }

  async function remove(step: ProductionStep) {
    if (!confirm(`Remove step "${step.name}" from the route?`)) return;
    try {
      await api.delete(`/assets/production-steps/${step.id}/`);
      toast.success("Step removed");
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not remove the step"));
    }
  }

  const done = steps.filter((s) => ["completed", "skipped"].includes(s.status)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2xs text-muted-foreground">
          {readOnly
            ? `${readOnlyReason ?? "This asset"} — the vendor builds it, so there is no in-house route to run.`
            : "The operations this asset is built through, in order. Where each one happens is the project's call, taken in Execution."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {locked && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-medium text-amber-700 ring-1 ring-amber-500/20">
              Route fixed — in execution
            </span>
          )}
          {steps.length > 0 && (
            <span className="text-2xs font-medium text-muted-foreground">
              {done} of {steps.length} done
            </span>
          )}
        </div>
      </div>

      {steps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          {readOnly ? (
            <p className="text-xs text-muted-foreground">
              No production route — this asset is not built in-house.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No production route yet — add the operations below in the order they happen.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Operation</th>
                <th className="px-3 py-2 font-medium">Where</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Out / Back</th>
                {canEdit && <th className="px-3 py-2 font-medium">Move</th>}
              </tr>
            </thead>
            <tbody>
              {steps.map((step, index) => (
                <tr key={step.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-muted-foreground">{step.step_number}</span>
                      {canRestructure && steps.length > 1 && (
                        <div className="flex flex-col">
                          <button
                            onClick={() => move(step, "up")}
                            disabled={busy === step.id || index === 0}
                            title="Move earlier in the route"
                            className="flex h-3.5 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => move(step, "down")}
                            disabled={busy === step.id || index === steps.length - 1}
                            title="Move later in the route"
                            className="flex h-3.5 w-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-25"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">
                    {editing?.id === step.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          aria-label="Operation"
                          className={`${rowInput} w-44`}
                        />
                      </div>
                    ) : (
                      <>
                        {step.name}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {/* Read off the operation itself. A new one is undecided
                        until the project says where it happens — saying
                        "In-house" before anyone chose would be a guess. */}
                    <span className={`inline-flex items-center gap-1 ${step.location === "undecided" ? "italic" : ""}`}>
                      {step.location === "external"
                        ? <Truck className="h-3 w-3 text-amber-500" />
                        : step.location === "undecided"
                          ? null
                          : <Factory className="h-3 w-3 text-muted-foreground" />}
                      {step.location === "external" ? (step.workshop_display ?? "Outside workshop")
                        : step.location === "undecided" ? "Not decided yet" : "In-house"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${STATUS_BADGES[step.status]}`}>
                      {step.status_display}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {step.sent_at ? new Date(step.sent_at).toLocaleDateString() : "—"}
                    {step.returned_at && ` → ${new Date(step.returned_at).toLocaleDateString()}`}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <select
                          value=""
                          disabled={busy === step.id || step.allowed_transitions.length === 0}
                          onChange={(e) => e.target.value && advance(step, e.target.value)}
                          className="h-7 rounded-lg border border-border bg-background px-1.5 text-2xs text-muted-foreground disabled:opacity-40"
                        >
                          <option value="">
                            {step.allowed_transitions.length === 0
                              ? (["completed", "skipped"].includes(step.status) ? "Finished" : step.location === "external" ? (step.work_order ? "Follows the work order" : "Awaiting the work order") : "Decide in Execution")
                              : "Move to…"}
                          </option>
                          {step.allowed_transitions.map((t) => (
                            <option key={t} value={t}>{STATUS_LABELS[t] ?? t}</option>
                          ))}
                        </select>
                        {canRestructure && (editing?.id === step.id ? (
                          <>
                            <button
                              onClick={saveEdit}
                              disabled={busy === step.id || !editing.name.trim()}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 transition-colors hover:text-emerald-700 disabled:opacity-40"
                              title="Save step"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setEditing(null)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                              title="Cancel"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => setEditing({ id: step.id, name: step.name })}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground"
                              title="Edit step"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => remove(step)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                              title="Remove step"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canRestructure && (
        <form onSubmit={addStep} className="flex flex-wrap items-end gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Operation (e.g. Panaflex pasting)"
            className={`${rowInput} w-72`}
          />
          <button
            type="submit"
            disabled={adding || !name.trim()}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add Step
          </button>
          <span className="text-2xs text-muted-foreground">
            Where each operation happens — in-house or on a work order — is decided in the project&apos;s Execution tab.
          </span>
        </form>
      )}
    </div>
  );
}
