"use client";

import { FileWarning, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { SearchSelect } from "@/components/ui/search-select";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { formatDate, todayIso } from "@/lib/utils";

/**
 * Claims on a vendor's cover, the standard way: raised with the fault and the
 * day it failed, sent to the vendor (who gives their RMA / claim number), the
 * vendor approves or rejects, and an approved claim is settled and closed.
 */
interface Claim {
  id: string;
  claim_number: string;
  kind: "Vendor" | "Component";
  covered: string | null;
  covered_name: string | null;
  cover_reference: string | null;
  cover_end: string | null;
  supplier_name: string | null;
  fault: string;
  description: string;
  failure_date: string;
  expected_cost: string | null;
  evidence: string | null;
  status: string;
  status_display: string;
  vendor_reference: string;
  resolution_display: string;
  recovered_amount: string | null;
  history: string;
  raised_by_name: string | null;
  next_steps: string[];
  created_at: string;
}
interface CoverOption {
  id: string;
  label: string;
  supplier: string | null;
  start: string | null;
  end: string | null;
}
interface Vendor { id: string; name: string }

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const STATUS_BADGES: Record<string, string> = {
  raised: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  submitted: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  approved: "bg-teal-500/10 text-teal-600 ring-teal-500/20",
  rejected: "bg-red-500/10 text-red-600 ring-red-500/20",
  closed: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  withdrawn: "bg-secondary text-muted-foreground ring-border",
};

/** The button each next step is offered as. */
const STEP_LABELS: Record<string, string> = {
  submitted: "Send to vendor",
  approved: "Approved",
  rejected: "Rejected",
  closed: "Settle & close",
  withdrawn: "Withdraw",
};

const money = (v: string | null) => (v ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—");

export function WarrantyClaims() {
  const { can } = useUser();
  const canRaise = can("raise_claim");
  const canDecide = can("decide_claim");

  const [claims, setClaims] = useState<Claim[]>([]);
  const sort = useSortState();
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);
  const [step, setStep] = useState<{ claim: Claim; status: string } | null>(null);
  const [viewing, setViewing] = useState<Claim | null>(null);

  const fetchClaims = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/warranties/claims/", { params: { page_size: 500 } });
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Claims on a vendor or component warranty: raised with the fault, sent to the vendor, decided
          by them, then settled and closed.
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
            Raise a claim against a vendor or component warranty to track it here.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <SortTh sort={sort} k="claim_number" className={thClass}>Claim #</SortTh>
                  <SortTh sort={sort} k="covered" className={thClass}>Claimed On</SortTh>
                  <SortTh sort={sort} k="cover_reference" className={thClass}>Warranty</SortTh>
                  <SortTh sort={sort} k="supplier_name" className={thClass}>Vendor</SortTh>
                  <SortTh sort={sort} k="fault" className={thClass}>Fault</SortTh>
                  <SortTh sort={sort} k="failure_date" className={thClass}>Failed On</SortTh>
                  <SortTh sort={sort} k="status" className={thClass}>Status</SortTh>
                  <SortTh sort={sort} k="expected_cost" className={thClass}>Expected (PKR)</SortTh>
                  <SortTh sort={sort} k="recovered_amount" className={thClass}>Recovered (PKR)</SortTh>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortRows(claims, sort).map((c) => (
                  <tr key={c.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} whitespace-nowrap`}>
                      <button onClick={() => setViewing(c)} className="font-mono text-primary hover:underline">
                        {c.claim_number}
                      </button>
                    </td>
                    <td className={tdClass}>
                      <span className="font-mono text-foreground">{c.covered ?? "—"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {c.kind === "Component" ? "Component" : "Asset"}{c.covered_name ? ` · ${c.covered_name}` : ""}
                      </span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap font-mono text-xs text-muted-foreground`}>
                      {c.cover_reference ?? "—"}
                      {c.vendor_reference && <span className="block font-sans text-2xs">RMA: {c.vendor_reference}</span>}
                    </td>
                    <td className={`${tdClass} text-muted-foreground`}>{c.supplier_name ?? "—"}</td>
                    <td className={`${tdClass} max-w-56 text-foreground`}>{c.fault}</td>
                    <td className={`${tdClass} whitespace-nowrap text-muted-foreground`}>{formatDate(c.failure_date)}</td>
                    <td className={tdClass}>
                      <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGES[c.status] ?? STATUS_BADGES.withdrawn}`}>
                        {c.status_display}
                      </span>
                      {c.resolution_display && <span className="block pt-0.5 text-2xs text-muted-foreground">{c.resolution_display}</span>}
                    </td>
                    <td className={`${tdClass} text-right tabular-nums text-muted-foreground`}>{money(c.expected_cost)}</td>
                    <td className={`${tdClass} text-right tabular-nums text-muted-foreground`}>{money(c.recovered_amount)}</td>
                    <td className={tdClass}>
                      {canDecide && c.next_steps.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {c.next_steps.map((s) => (
                            <button
                              key={s}
                              onClick={() => setStep({ claim: c, status: s })}
                              className={`whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                                s === "rejected" || s === "withdrawn"
                                  ? "border-border text-muted-foreground hover:bg-red-500/10 hover:text-red-600"
                                  : "border-primary/30 text-primary hover:bg-primary/10"
                              }`}
                            >
                              {STEP_LABELS[s] ?? s}
                            </button>
                          ))}
                        </div>
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

      {raising && <RaiseClaim onClose={() => setRaising(false)} onDone={fetchClaims} />}
      {step && <ClaimStep claim={step.claim} status={step.status} onClose={() => setStep(null)} onDone={fetchClaims} />}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `Claim ${viewing.claim_number}` : "Claim"} size="md">
        {viewing && (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-foreground">{viewing.fault}</p>
            {viewing.description && <p className="text-muted-foreground">{viewing.description}</p>}
            {viewing.evidence && (
              <a href={viewing.evidence} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-primary hover:underline">
                Open the evidence
              </a>
            )}
            <div className="rounded-lg border border-border bg-secondary/30 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">History</p>
              <p className="whitespace-pre-line text-xs text-foreground">{viewing.history || "—"}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Raise a claim: on what cover, what failed and when, what it should cost. */
function RaiseClaim({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [against, setAgainst] = useState<"vendor" | "component">("vendor");
  const [covers, setCovers] = useState<{ vendor: CoverOption[]; component: CoverOption[] }>({ vendor: [], component: [] });
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [coverId, setCoverId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const today = todayIso();
    // Only cover still running can be claimed on.
    api.get("/warranties/", { params: { warranty_type: "supplier", page_size: 500 } })
      .then((r) => setCovers((c) => ({
        ...c,
        vendor: (r.data.results ?? r.data)
          .filter((w: { status: string; end_date: string }) => ["active", "claimed"].includes(w.status) && w.end_date >= today)
          .map((w: { id: string; device_code: string | null; device_name: string | null; reference_number: string; supplier: string | null; start_date: string; end_date: string }) => ({
            id: w.id,
            label: `${w.device_code ?? "Asset"}${w.device_name ? ` · ${w.device_name}` : ""} — ${w.reference_number} (till ${formatDate(w.end_date)})`,
            supplier: w.supplier, start: w.start_date, end: w.end_date,
          })),
      })))
      .catch(() => {});
    api.get("/inventory/units/", { params: { has_warranty: true, warranty: "active", page_size: 1000 } })
      .then((r) => setCovers((c) => ({
        ...c,
        component: (r.data.results ?? r.data).map((u: { id: string; serial_number: string; unit_type_name: string | null; model_name: string; warranty_reference: string; supplier: string | null; warranty_start: string | null; warranty_end: string | null }) => ({
          id: u.id,
          label: `${u.serial_number} — ${u.unit_type_name || u.model_name}${u.warranty_reference ? ` · ${u.warranty_reference}` : ""}${u.warranty_end ? ` (till ${formatDate(u.warranty_end)})` : ""}`,
          supplier: u.supplier, start: u.warranty_start, end: u.warranty_end,
        })),
      })))
      .catch(() => {});
    api.get("/suppliers/", { params: { page_size: 500 } })
      .then((r) => setVendors(r.data.results ?? r.data))
      .catch(() => {});
  }, []);

  const options = covers[against];
  const chosen = useMemo(() => options.find((o) => o.id === coverId) ?? null, [options, coverId]);

  // The claim goes to whoever gave the cover, unless changed.
  useEffect(() => {
    if (chosen?.supplier) setVendorId(chosen.supplier);
  }, [chosen]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chosen) {
      toast.error(against === "vendor" ? "Choose the asset's vendor warranty" : "Choose the part");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const body = new FormData();
    body.append(against === "vendor" ? "warranty" : "inventory_unit", chosen.id);
    body.append("fault", String(fd.get("fault") || ""));
    body.append("description", String(fd.get("description") || ""));
    body.append("failure_date", String(fd.get("failure_date") || ""));
    const cost = String(fd.get("expected_cost") || "").trim();
    if (cost) body.append("expected_cost", cost);
    if (vendorId) body.append("supplier", vendorId);
    const file = fd.get("evidence");
    if (file instanceof File && file.size) body.append("evidence", file);
    setSaving(true);
    try {
      const { data } = await api.post("/warranties/claims/", body, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Claim ${data.claim_number} raised`);
      onClose();
      onDone();
    } catch (err) {
      toast.error(getApiError(err, "Could not raise the claim"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Raise Warranty Claim">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <span className={labelClass}>Claim on</span>
          <div className="flex gap-2">
            {([["vendor", "Vendor warranty (asset)"], ["component", "Component warranty (part)"]] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => { setAgainst(key); setCoverId(""); }}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  against === key ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>{against === "vendor" ? "Asset and its warranty *" : "Part and its warranty *"}</label>
          <SearchSelect
            options={options.map((o) => ({ id: o.id, label: o.label }))}
            value={coverId}
            onChange={setCoverId}
            placeholder={options.length ? "Search…" : "Nothing under a running warranty"}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cl-fault" className={labelClass}>What failed? *</label>
          <input id="cl-fault" name="fault" required maxLength={300} placeholder="e.g. Panel dead, no display" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cl-desc" className={labelClass}>Details for the vendor</label>
          <textarea id="cl-desc" name="description" rows={3} placeholder="When it appeared, what has been tried…" className={`${inputClass} h-auto py-2`} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label htmlFor="cl-failed" className={labelClass}>Failed on *</label>
            <input
              id="cl-failed"
              name="failure_date"
              type="date"
              required
              min={chosen?.start ?? undefined}
              max={todayIso()}
              defaultValue={todayIso()}
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cl-vendor" className={labelClass}>Claim with *</label>
            <select id="cl-vendor" required value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputClass}>
              <option value="">Select vendor…</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cl-cost" className={labelClass}>Expected cost (PKR)</label>
            <input id="cl-cost" name="expected_cost" type="number" min={0} step="0.01" className={inputClass} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="cl-evidence" className={labelClass}>Evidence (photo, report)</label>
          <input id="cl-evidence" name="evidence" type="file" accept="image/*,.pdf" className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-medium" />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            {saving ? "Raising…" : "Raise Claim"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** One step of a claim, asking only what that step needs. */
function ClaimStep({ claim, status, onClose, onDone }: { claim: Claim; status: string; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const needsReason = status === "rejected" || status === "withdrawn";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    try {
      await api.post(`/warranties/claims/${claim.id}/transition/`, {
        status,
        notes: String(fd.get("notes") || ""),
        vendor_reference: String(fd.get("vendor_reference") || ""),
        resolution: String(fd.get("resolution") || ""),
        recovered_amount: String(fd.get("recovered_amount") || ""),
      });
      toast.success(`${claim.claim_number}: ${STEP_LABELS[status] ?? status}`);
      onClose();
      onDone();
    } catch (err) {
      toast.error(getApiError(err, "Could not update the claim"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${STEP_LABELS[status] ?? status} — ${claim.claim_number}`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        {status === "submitted" && (
          <div className="space-y-1.5">
            <label htmlFor="st-ref" className={labelClass}>Vendor&apos;s RMA / claim number</label>
            <input id="st-ref" name="vendor_reference" defaultValue={claim.vendor_reference} placeholder="As the vendor gives it" className={inputClass} />
          </div>
        )}
        {status === "closed" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="st-res" className={labelClass}>Settled by *</label>
              <select id="st-res" name="resolution" required defaultValue="" className={inputClass}>
                <option value="" disabled>Select…</option>
                <option value="repaired">Repaired</option>
                <option value="replaced">Replaced</option>
                <option value="credit_note">Credit Note</option>
                <option value="refund">Refund</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="st-amt" className={labelClass}>Recovered (PKR)</label>
              <input id="st-amt" name="recovered_amount" type="number" min={0} step="0.01" className={inputClass} />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="st-notes" className={labelClass}>{needsReason ? "Reason *" : "Notes"}</label>
          <textarea id="st-notes" name="notes" rows={3} required={needsReason} className={`${inputClass} h-auto py-2`} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
            {saving ? "Saving…" : STEP_LABELS[status] ?? "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
