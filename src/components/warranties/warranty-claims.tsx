"use client";

import { CheckCircle2, FileWarning, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface Claim {
  id: string;
  ticket_number: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  device: string | null;
  device_code: string | null;
  inventory_unit: string | null;
  inventory_unit_serial: string | null;
  supplier_name: string | null;
  assigned_vendor: string | null;
  assigned_vendor_name: string | null;
  repair_cost: string | null;
  is_billable: boolean;
  charge_to: string;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
}
interface WarrantyOption {
  id: string;
  device: string;
  device_code: string | null;
  device_name: string | null;
  warranty_type: string;
  supplier: string | null;
  supplier_name: string | null;
  end_date: string;
}
interface PartOption {
  id: string;
  serial_number: string;
  material_name: string | null;
  unit_type_name: string | null;
  model_name: string;
  supplier: string | null;
  supplier_name: string | null;
  warranty_end: string | null;
  installed_in_code: string | null;
}
interface Vendor { id: string; name: string }

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const STATUS_BADGES: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  closed: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function WarrantyClaims() {
  const { canWrite } = useUser();
  const canRaise = canWrite("warranties");

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState<Claim | null>(null);

  const [warranties, setWarranties] = useState<WarrantyOption[]>([]);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // What the claim is against: an asset's vendor cover, or a part's own.
  const [against, setAgainst] = useState<"asset" | "part">("asset");
  const [warrantyId, setWarrantyId] = useState("");
  const [partId, setPartId] = useState("");
  const [vendorId, setVendorId] = useState("");

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/tickets/", {
        params: { category: "warranty_claim", page_size: 500 },
      });
      setClaims(data.results ?? data);
    } catch (err) {
      toast.error(getApiError(err, "Could not load warranty claims"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  // Claim targets load once, the first time someone opens the form.
  useEffect(() => {
    if (!raising || warranties.length > 0 || parts.length > 0) return;
    api.get("/warranties/", { params: { page_size: 500 } })
      .then((r) => setWarranties(((r.data.results ?? r.data) as WarrantyOption[])
        .filter((w) => w.warranty_type !== "client")))
      .catch(() => {});
    api.get("/inventory/units/", { params: { has_warranty: true, page_size: 500 } })
      .then((r) => setParts(r.data.results ?? r.data))
      .catch(() => {});
    api.get("/suppliers/", { params: { page_size: 500 } })
      .then((r) => setVendors(r.data.results ?? r.data))
      .catch(() => {});
  }, [raising, warranties.length, parts.length]);

  const selectedWarranty = useMemo(
    () => warranties.find((w) => w.id === warrantyId) ?? null, [warranties, warrantyId],
  );
  const selectedPart = useMemo(
    () => parts.find((p) => p.id === partId) ?? null, [parts, partId],
  );

  // Whoever supplied the thing being claimed is the vendor the claim goes to.
  useEffect(() => {
    const supplier = against === "asset" ? selectedWarranty?.supplier : selectedPart?.supplier;
    if (supplier) setVendorId(supplier);
  }, [against, selectedWarranty, selectedPart]);

  function closeForm() {
    setRaising(false);
    setWarrantyId("");
    setPartId("");
    setVendorId("");
    setAgainst("asset");
  }

  async function submitClaim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (against === "asset" && !warrantyId) {
      toast.error("Choose the asset warranty this claim is against.");
      return;
    }
    if (against === "part" && !partId) {
      toast.error("Choose the part this claim is against.");
      return;
    }
    const cost = String(fd.get("repair_cost") || "").trim();
    const payload: Record<string, unknown> = {
      title: fd.get("title"),
      description: fd.get("description"),
      category: "warranty_claim",
      priority: fd.get("priority"),
      assigned_vendor: vendorId || null,
      charge_to: "vendor",
      is_billable: false,
      ...(cost ? { repair_cost: cost } : {}),
    };
    if (against === "asset" && selectedWarranty) {
      payload.device = selectedWarranty.device;
      payload.warranty = selectedWarranty.id;
    } else if (selectedPart) {
      payload.inventory_unit = selectedPart.id;
    }

    setSaving(true);
    try {
      await api.post("/tickets/", payload);
      toast.success("Claim raised");
      closeForm();
      fetchClaims();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the claim"));
    } finally {
      setSaving(false);
    }
  }

  async function submitClose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!closing) return;
    const notes = String(new FormData(e.currentTarget).get("notes") || "").trim();
    setSaving(true);
    try {
      await api.post(`/tickets/${closing.id}/transition/`, { status: "closed", notes });
      toast.success("Claim closed");
      setClosing(null);
      fetchClaims();
    } catch (err) {
      toast.error(getApiError(err, "Could not close the claim"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Claims raised with the vendor or manufacturer for an asset under their cover, or for a
          warrantied part. Each one is tracked here until it is settled and closed.
        </p>
        {canRaise && (
          <button
            onClick={() => setRaising(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Raise Claim
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : claims.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <FileWarning className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No claims raised</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Raise a claim against a vendor warranty or a warrantied part to track it here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Claim #</th>
                  <th className={thClass}>Raised For</th>
                  <th className={thClass}>Against</th>
                  <th className={thClass}>Vendor</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Expected Cost</th>
                  <th className={thClass}>Raised</th>
                  <th className={thClass}>Action</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} whitespace-nowrap font-mono text-primary`}>
                      {claim.ticket_number || `#${claim.id.slice(0, 8)}`}
                    </td>
                    <td className={`${tdClass} text-foreground`}>{claim.title}</td>
                    <td className={tdClass}>
                      {claim.inventory_unit_serial ? (
                        <span>
                          <span className="font-mono text-foreground">{claim.inventory_unit_serial}</span>
                          <span className="block text-xs text-muted-foreground">Part</span>
                        </span>
                      ) : claim.device_code ? (
                        <span>
                          <span className="font-mono text-foreground">{claim.device_code}</span>
                          <span className="block text-xs text-muted-foreground">Asset</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {claim.assigned_vendor_name ?? claim.supplier_name ?? "—"}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                          STATUS_BADGES[claim.status] ?? "bg-secondary text-muted-foreground ring-border"
                        }`}
                      >
                        {formatLabel(claim.status)}
                      </span>
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{claim.repair_cost ?? "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {new Date(claim.created_at).toLocaleDateString()}
                    </td>
                    <td className={tdClass}>
                      {canRaise && claim.status !== "closed" ? (
                        <button
                          onClick={() => setClosing(claim)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-emerald-500/10 hover:text-emerald-600"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Close
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={raising} onClose={closeForm} title="Raise Warranty Claim">
        <form onSubmit={submitClaim} className="space-y-4">
          <div className="space-y-1.5">
            <span className={labelClass}>What is the claim against?</span>
            <div className="flex gap-2">
              {([["asset", "Asset warranty"], ["part", "Component warranty"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAgainst(key)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    against === key
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {against === "asset" ? (
            <div className="space-y-1.5">
              <label htmlFor="warranty" className={labelClass}>Asset warranty</label>
              <select
                id="warranty"
                value={warrantyId}
                onChange={(e) => setWarrantyId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Select the cover being claimed…</option>
                {warranties.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.device_code ?? "Asset"}{w.device_name ? ` · ${w.device_name}` : ""} — {w.supplier_name ?? "no vendor"} (ends {w.end_date})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="part" className={labelClass}>Component</label>
              <select
                id="part"
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
                className={inputClass}
                required
              >
                <option value="">Select the part being claimed…</option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.serial_number} — {p.material_name ?? p.unit_type_name ?? p.model_name}
                    {p.installed_in_code ? ` (in ${p.installed_in_code})` : " (in inventory)"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="title" className={labelClass}>What is wrong?</label>
            <input id="title" name="title" required className={inputClass} placeholder="e.g. Panel dead on arrival" />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="description" className={labelClass}>Details for the vendor</label>
            <textarea
              id="description"
              name="description"
              rows={3}
              className={`${inputClass} h-auto py-2`}
              placeholder="Fault found, when it appeared, what has been tried…"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="vendor" className={labelClass}>Claim with</label>
              <select id="vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputClass}>
                <option value="">Select vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="priority" className={labelClass}>Priority</label>
              <select id="priority" name="priority" defaultValue="medium" className={inputClass}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="repair_cost" className={labelClass}>Expected cost</label>
              <input id="repair_cost" name="repair_cost" type="number" step="0.01" min={0} className={inputClass} placeholder="Optional" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeForm} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Raising…" : "Raise Claim"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={closing !== null} onClose={() => setClosing(null)} title="Close Claim" size="sm">
        <form onSubmit={submitClose} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Closing {closing?.ticket_number}. Record how the vendor settled it.
          </p>
          <div className="space-y-1.5">
            <label htmlFor="notes" className={labelClass}>Outcome</label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className={`${inputClass} h-auto py-2`}
              placeholder="e.g. Replaced under warranty, new unit received"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setClosing(null)} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Closing…" : "Close Claim"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
