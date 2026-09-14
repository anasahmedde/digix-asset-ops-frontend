"use client";

import { ArrowDown, ArrowUp, BookmarkPlus, Factory, Plus, Trash2, Truck, Wand2 } from "lucide-react";
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
  location: "in_house" | "external";
  location_display: string;
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
  sent_out: "Sent to Workshop",
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
  templateAvailable,
  readOnly = false,
  readOnlyReason,
}: {
  deviceId: string;
  steps: ProductionStep[];
  onChanged: () => void;
  /** Routes are held per asset type, so both are needed to reuse one. */
  assetTypeName?: string | null;
  templateAvailable?: boolean;
  /** Vendor-built assets keep the section on screen but inert. */
  readOnly?: boolean;
  readOnlyReason?: string | null;
}) {
  const { canWrite } = useUser();
  const canEdit = canWrite("devices") && !readOnly;

  const [suppliers, setSuppliers] = useState<Ref[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState<"in_house" | "external">("in_house");
  const [workshop, setWorkshop] = useState("");
  const [workshopManual, setWorkshopManual] = useState("");
  const [expectedDays, setExpectedDays] = useState("");

  const loadSuppliers = useCallback(async () => {
    try {
      const { data } = await api.get("/suppliers/", { params: { page_size: 500 } });
      setSuppliers(data.results ?? data);
    } catch {
      /* the picker degrades to manual entry */
    }
  }, []);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);

  function resetForm() {
    setName("");
    setLocation("in_house");
    setWorkshop("");
    setWorkshopManual("");
    setExpectedDays("");
  }

  async function addStep(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await api.post("/assets/production-steps/", {
        device: deviceId,
        // Steps are numbered in the order they are laid out.
        step_number: (steps[steps.length - 1]?.step_number ?? 0) + 1,
        name: name.trim(),
        location,
        workshop: location === "external" && workshop ? workshop : null,
        workshop_name: location === "external" && !workshop ? workshopManual.trim() : "",
        expected_days: expectedDays ? Number(expectedDays) : null,
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

  async function applyTemplate() {
    setBusy("template");
    try {
      const { data } = await api.post(`/assets/devices/${deviceId}/apply-route-template/`, {});
      toast.success(`${data.applied} step(s) loaded from the saved route`);
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not load the saved route"));
    } finally {
      setBusy(null);
    }
  }

  async function saveTemplate() {
    setBusy("template");
    try {
      const { data } = await api.post(`/assets/devices/${deviceId}/save-route-template/`, {});
      toast.success(data.detail ?? "Saved as the standard route");
      onChanged();
    } catch (err) {
      toast.error(getApiError(err, "Could not save the route"));
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
        <p className="text-[11px] text-muted-foreground">
          {readOnly
            ? `${readOnlyReason ?? "This asset"} — the vendor builds it, so there is no in-house route to run.`
            : "How this asset gets built. Mark each operation as done on our own floor or at an outside workshop, so the asset says where it physically is while it is away."}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {steps.length > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {done} of {steps.length} done
            </span>
          )}
          {canEdit && steps.length > 0 && assetTypeName && (
            <button
              onClick={saveTemplate}
              disabled={busy === "template"}
              title="Save this sequence as the standard route for this asset type"
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
            >
              <BookmarkPlus className="h-3 w-3" /> Save as standard route
            </button>
          )}
        </div>
      </div>

      {steps.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          {templateAvailable && !readOnly ? (
            <>
              <p className="text-xs text-foreground">
                A standard route already exists for this asset type.
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Start from it, or build a new one step by step below.
              </p>
              {canEdit && (
                <button
                  onClick={applyTemplate}
                  disabled={busy === "template"}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Use saved route
                </button>
              )}
            </>
          ) : readOnly ? (
            <p className="text-xs text-muted-foreground">
              No production route — this asset is not built in-house.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              No production route defined for this asset type yet — add the steps below, then save
              them as the standard route.
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
                      {canEdit && steps.length > 1 && (
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
                  <td className="px-3 py-2 font-medium text-foreground">{step.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      {step.location === "external"
                        ? <Truck className="h-3 w-3 text-amber-500" />
                        : <Factory className="h-3 w-3 text-muted-foreground" />}
                      {step.workshop_display ?? "In-house"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${STATUS_BADGES[step.status]}`}>
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
                          className="h-7 rounded-lg border border-border bg-background px-1.5 text-[11px] text-muted-foreground disabled:opacity-40"
                        >
                          <option value="">
                            {step.allowed_transitions.length === 0 ? "Finished" : "Move to…"}
                          </option>
                          {step.allowed_transitions.map((t) => (
                            <option key={t} value={t}>{STATUS_LABELS[t] ?? t}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => remove(step)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                          title="Remove step"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <form onSubmit={addStep} className="flex flex-wrap items-end gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Operation (e.g. Panaflex pasting)"
            className={`${rowInput} w-56`}
          />
          <select
            value={location}
            onChange={(e) => { setLocation(e.target.value as "in_house" | "external"); setWorkshop(""); setWorkshopManual(""); }}
            className={`${rowInput} w-36`}
          >
            <option value="in_house">In-house</option>
            <option value="external">Outside workshop</option>
          </select>

          {location === "external" && (
            <>
              <select
                value={workshop}
                onChange={(e) => setWorkshop(e.target.value)}
                className={`${rowInput} w-48`}
              >
                <option value="">Select workshop…</option>
                {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
              </select>
              {!workshop && (
                <input
                  value={workshopManual}
                  onChange={(e) => setWorkshopManual(e.target.value)}
                  placeholder="…or name it by hand"
                  className={`${rowInput} w-44`}
                />
              )}
            </>
          )}

          <input
            type="number"
            min={1}
            value={expectedDays}
            onChange={(e) => setExpectedDays(e.target.value)}
            placeholder="Days"
            title="Expected days"
            className={`${rowInput} w-20`}
          />
          <button
            type="submit"
            disabled={adding || !name.trim() || (location === "external" && !workshop && !workshopManual.trim())}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add Step
          </button>
        </form>
      )}
    </div>
  );
}
