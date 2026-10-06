"use client";

import { ClipboardCheck, PackageCheck, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Modal } from "@/components/ui/modal";
import { Pagination, pageSlice } from "@/components/ui/pagination";
import { Qty } from "@/components/ui/qty";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

interface ReceiptLine {
  id: string;
  grn_number: string | null;
  po_number: string | null;
  supplier_name: string | null;
  po_item_description: string | null;
  material_type: string | null;
  material_name: string | null;
  device_model_name: string | null;
  /** What the purchase order line was bought for: a counted stock item, a
   *  serialised product, a whole asset — or null on a line typed by hand. */
  kind?: "generic" | "unique" | "asset" | null;
  /** The inventory item or unique product the goods will be filed under. */
  known_component?: string | null;
  /** Its code in the store — where the line lands once it passes. */
  component_code?: string | null;
  /** Where the line came from: a delivery, a project, a maintenance job. */
  source_display?: string | null;
  reference?: string | null;
  quantity: number;
  /** Unit of measure of the delivered line. */
  unit?: string;
  batch_number: string;
  serial_numbers: string[];
  inspection_status: string;
  /** Set once Procurement checked the delivery against the order. */
  accepted_quantity?: number | null;
  rejected_quantity?: number;
  inspection_notes?: string;
  inspected_by_name?: string | null;
  created_at: string;
}
interface Ref { id: string; name: string }
interface UnitRow {
  serial_number: string;
  model_name: string;
  /** Supplier cover on this unit, in months from the day it was received. */
  warranty_months: string;
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const smallInput =
  "h-9 w-full rounded-lg border border-border bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

function emptyUnit(serial = ""): UnitRow {
  return { serial_number: serial, model_name: "", warranty_months: "" };
}

export function PendingInspection({ onStocked }: { onStocked?: () => void }) {
  const { canWrite } = useUser();
  const canInspect = canWrite("inventory");
  const router = useRouter();

  const [lines, setLines] = useState<ReceiptLine[]>([]);
  const [receivingPage, setReceivingPage] = useState(1);
  const [materialTypes, setMaterialTypes] = useState<Ref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [active, setActive] = useState<ReceiptLine | null>(null);
  const [route, setRoute] = useState<"generic" | "unique">("generic");
  const [accepted, setAccepted] = useState(0);
  const [notes, setNotes] = useState("");
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [materialType, setMaterialType] = useState("");
  // Where the storekeeper is putting this delivery.
  const [storageLocation, setStorageLocation] = useState("");

  // Item 17: components coming back from a project or from maintenance.
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnForm, setReturnForm] = useState({
    source: "project_return",
    kind: "generic" as "generic" | "unique",
    inventory_item: "",
    unit_type: "",
    quantity: "1",
    serials: "",
    reference: "",
    notes: "",
  });
  const [genericItems, setGenericItems] = useState<{ id: string; sku: string; material_name: string | null }[]>([]);
  const [uniqueProducts, setUniqueProducts] = useState<{ id: string; type_code: string; name: string }[]>([]);

  function openReturn() {
    setReturnForm({ source: "project_return", kind: "generic", inventory_item: "", unit_type: "", quantity: "1", serials: "", reference: "", notes: "" });
    setReturnOpen(true);
    if (genericItems.length === 0) {
      api.get("/inventory/items/", { params: { page_size: 500 } }).then((r) => setGenericItems(r.data.results ?? r.data)).catch(() => {});
      api.get("/inventory/products/", { params: { page_size: 500 } }).then((r) => setUniqueProducts(r.data.results ?? r.data)).catch(() => {});
    }
  }

  async function submitReturn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const qty = Number(returnForm.quantity || 0);
    const serials = returnForm.serials.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (returnForm.kind === "unique" && serials.length !== qty) {
      toast.error(`Give ${qty} serial number${qty === 1 ? "" : "s"} — one per unit coming back`);
      return;
    }
    setReturnSaving(true);
    try {
      const { data } = await api.post("/inventory/receipts/return/", {
        source: returnForm.source,
        inventory_item: returnForm.kind === "generic" ? returnForm.inventory_item || null : null,
        unit_type: returnForm.kind === "unique" ? returnForm.unit_type || null : null,
        quantity: qty,
        serial_numbers: returnForm.kind === "unique" ? serials : [],
        reference: returnForm.reference,
        notes: returnForm.notes,
      });
      toast.success(`${data.grn_number ?? "Return"} recorded — inspect it to put it back in stock`);
      setReturnOpen(false);
      fetchLines();
    } catch (err) {
      toast.error(getApiError(err, "Could not record the return"));
    } finally {
      setReturnSaving(false);
    }
  }

  /**
   * What is standing at the door, from both directions.
   *
   * A purchase delivery was already checked against the order in
   * Procurement, so the store only counts it in. Anything coming back — off
   * a project, out of a maintenance job — was never inspected by anybody,
   * so it still is here.
   */
  const fetchLines = useCallback(async () => {
    setLoading(true);
    try {
      const [toStock, toInspect] = await Promise.all([
        api.get("/inventory/receipt-lines/awaiting-stock/", { params: { page_size: 200 } }),
        api.get("/inventory/receipt-lines/pending/", { params: { page_size: 200 } }),
      ]);
      const passed = toStock.data.results ?? toStock.data ?? [];
      const pending = toInspect.data.results ?? toInspect.data ?? [];
      setLines([...passed, ...pending]);
    } catch (err) {
      toast.error(getApiError(err, "Failed to load what is waiting to be received"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLines();
    api.get("/assets/material-types/").then((r) => setMaterialTypes(r.data.results ?? r.data)).catch(() => {});
  }, [fetchLines]);

  /** How many units of a line actually go onto the shelf. */
  function keptOf(line: ReceiptLine): number {
    return line.accepted_quantity ?? line.quantity;
  }

  /** Was this delivery already checked against its order, in Procurement? */
  function alreadyJudged(line: ReceiptLine): boolean {
    return line.inspection_status === "passed";
  }

  // ── Receiving: counting in what Procurement already passed ──────────
  const [receiving, setReceiving] = useState<ReceiptLine | null>(null);
  const [tally, setTally] = useState<string[]>([]);
  const [receiveNote, setReceiveNote] = useState("");
  const [receiveBusy, setReceiveBusy] = useState(false);

  function openReceive(line: ReceiptLine) {
    const keeping = line.accepted_quantity ?? line.quantity;
    const given = line.serial_numbers ?? [];
    // The serials Procurement wrote down, padded to what is actually being
    // kept: the store corrects whichever does not match the box.
    setTally(
      line.kind === "unique"
        ? Array.from({ length: keeping }, (_, i) => given[i] ?? "")
        : [],
    );
    setReceiveNote("");
    setReceiving(line);
  }

  async function submitReceive() {
    if (!receiving) return;
    const keeping = receiving.accepted_quantity ?? receiving.quantity;
    if (receiving.kind === "unique") {
      const clean = tally.map((x) => x.trim()).filter(Boolean);
      if (clean.length !== keeping) {
        toast.error(`${keeping} serial number(s) are expected — ${clean.length} filled in`);
        return;
      }
      if (new Set(clean).size !== clean.length) {
        toast.error("Two units cannot carry the same serial number");
        return;
      }
    }
    setReceiveBusy(true);
    try {
      const body: Record<string, unknown> = { notes: receiveNote.trim() };
      if (receiving.kind === "unique") {
        body.route = "unique";
        body.units = tally.map((x) => ({ serial_number: x.trim() }));
      } else if (receiving.kind === "generic") {
        body.route = "generic";
      }
      await api.post(`/inventory/receipt-lines/${receiving.id}/receive/`, body);
      toast.success(`${receiving.component_code || "The goods"} received into stock`);
      setReceiving(null);
      fetchLines();
      onStocked?.();
    } catch (err) {
      toast.error(getApiError(err, "Could not receive that line"));
    } finally {
      setReceiveBusy(false);
    }
  }

  function openInspect(line: ReceiptLine) {
    setActive(line);
    setAccepted(line.quantity);
    setNotes("");
    setMaterialType(line.material_type ?? "");
    setStorageLocation("");
    // The order already says what this is; only a hand-typed line is asked.
    const preset = line.serial_numbers.length > 0;
    setRoute(line.kind === "unique" || line.kind === "generic" ? line.kind : preset ? "unique" : "generic");
    setUnits(
      preset
        ? line.serial_numbers.map((s) => emptyUnit(s))
        : Array.from({ length: line.quantity }, () => emptyUnit()),
    );
  }

  function setUnitCount(n: number) {
    setUnits((prev) => {
      if (n <= prev.length) return prev.slice(0, n);
      return [...prev, ...Array.from({ length: n - prev.length }, () => emptyUnit())];
    });
  }

  function patchUnit(i: number, patch: Partial<UnitRow>) {
    setUnits((prev) => prev.map((u, j) => (j === i ? { ...u, ...patch } : u)));
  }

  async function submitInspection() {
    if (!active) return;
    const rejected = active.quantity - accepted;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        accepted_quantity: accepted,
        rejected_quantity: rejected,
        notes,
      };
      if (accepted > 0) {
        payload.route = route;
        if (route === "generic") {
          payload.generic = {
            material_type: materialType || null,
            storage_location: storageLocation.trim(),
          };
        } else {
          payload.units = units.slice(0, accepted).map((u) => ({
            serial_number: u.serial_number,
            model_name: u.model_name,
            has_warranty: !!u.warranty_months,
            warranty_months: u.warranty_months ? Number(u.warranty_months) : null,
          }));
        }
      }
      const { data } = await api.post(`/inventory/receipt-lines/${active.id}/inspect/`, payload);
      const stocked = data.stocked_units?.length ?? 0;
      const withWarranty = route === "unique" && accepted > 0
        ? units.slice(0, accepted).filter((u) => u.warranty_months).length
        : 0;
      toast.success(
        accepted === 0
          ? "Line rejected — nothing stocked"
          : route === "unique"
            ? `${stocked} unique component${stocked === 1 ? "" : "s"} added to inventory`
            : `${accepted} added to generic stock`,
      );
      const ready: string[] = data.ready_requests ?? [];
      if (ready.length > 0) {
        toast.message(`Bought for a project line — the store issues it against ${ready.join(", ")} in Issue Requests`);
      }
      setActive(null);
      fetchLines();
      onStocked?.();
      // Item 23: the receipt ends where the cover it created is kept.
      if (withWarranty > 0) {
        toast.message(`${withWarranty} warrant${withWarranty === 1 ? "y" : "ies"} recorded from today — opening Warranties`);
        router.push("/warranties");
      }
    } catch (err) {
      toast.error(getApiError(err, "Inspection failed"));
    } finally {
      setSaving(false);
    }
  }

  const rejected = active ? active.quantity - accepted : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Everything coming into the store waits here. A purchase delivery was
          already checked against its order in Procurement — the store counts it onto the shelf and
          corrects any serial number that does not match the box. Components back from a project or
          a maintenance job never met an inspector, so they are inspected here.
        </p>
        {canInspect && (
          <button
            onClick={openReturn}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Undo2 className="h-4 w-4" /> Record a return
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : lines.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <PackageCheck className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">Nothing awaiting inspection</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Purchase deliveries, project leftovers and maintenance returns appear here for checking.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>GRN</th>
                  <th className={thClass}>Source</th>
                  <th className={thClass}>Component</th>
                  <th className={thClass}>Item Code</th>
                  <th className={thClass}>Kind</th>
                  <th className={thClass}>Received</th>
                  <th className={thClass}>Batch</th>
                  <th className={thClass}>Serial Nos</th>
                  {canInspect && <th className={thClass}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {pageSlice(lines, receivingPage).map((line) => (
                  <tr key={line.id} className="border-b border-border transition-colors hover:bg-secondary/30">
                    <td className={`${tdClass} whitespace-nowrap font-mono text-foreground`}>{line.grn_number ?? "—"}</td>
                    <td className={tdClass}>
                      {line.po_number ? (
                        <span>
                          <span className="font-mono text-foreground">{line.po_number}</span>
                          {line.supplier_name && <span className="block text-2xs text-muted-foreground">{line.supplier_name}</span>}
                        </span>
                      ) : (
                        <span>
                          {/* A return says where it came back from: leftovers
                              from a build and parts off a job are not the
                              same thing to whoever inspects them. */}
                          <span className="text-foreground">{line.source_display ?? "Return"}</span>
                          {line.reference && (
                            <span className="block text-2xs text-muted-foreground">{line.reference}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className={`${tdClass} text-foreground`}>
                      {line.known_component ?? line.po_item_description ?? line.material_name ?? line.device_model_name ?? "—"}
                    </td>
                    <td className={`${tdClass} whitespace-nowrap font-mono text-muted-foreground`}>
                      {line.component_code || "—"}
                    </td>
                    <td className={tdClass}>
                      {line.kind === "unique" || line.kind === "generic" ? (
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ${line.kind === "unique" ? "bg-indigo-500/10 text-indigo-600" : "bg-secondary text-muted-foreground"}`}>{line.kind === "unique" ? "Unique item" : "Generic stock"}</span>
                      ) : (
                        <span className="text-2xs text-muted-foreground">decided at inspection</span>
                      )}
                    </td>
                    <td className={`${tdClass} font-medium text-foreground`}>
                      {/* What is actually going onto the shelf. The delivered
                          figure is not it: anything the inspector turned away
                          never reaches the store. */}
                      <Qty value={keptOf(line)} unit={line.unit} />
                      {keptOf(line) !== line.quantity && (
                        <span className="block text-2xs font-normal text-amber-600">
                          of {line.quantity} delivered · {line.quantity - keptOf(line)} rejected
                        </span>
                      )}
                    </td>
                    <td className={`${tdClass} font-mono text-muted-foreground`}>{line.batch_number || "—"}</td>
                    <td className={`${tdClass} text-muted-foreground`}>
                      {/* The serials themselves: a unit is traced by its own
                          number, and a count traces nothing. Only the ones
                          being kept — the rest go back with the goods. */}
                      {line.kind === "generic" || line.serial_numbers.length === 0 ? (
                        "—"
                      ) : (
                        <span className="font-mono text-2xs">
                          {line.serial_numbers.slice(0, Math.min(keptOf(line), 3)).join(", ")}
                          {keptOf(line) > 3 && ` +${keptOf(line) - 3} more`}
                        </span>
                      )}
                    </td>
                    {canInspect && (
                      <td className={tdClass}>
                        {/* A delivery already judged in Procurement is only
                            counted in here. Anything else never met an
                            inspector, so it meets one now. */}
                        <button
                          onClick={() => (alreadyJudged(line) ? openReceive(line) : openInspect(line))}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90"
                        >
                          {alreadyJudged(line) ? (
                            <><PackageCheck className="h-3.5 w-3.5" /> Receive</>
                          ) : (
                            <><ClipboardCheck className="h-3.5 w-3.5" /> Inspect</>
                          )}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={receivingPage} total={lines.length} onPage={setReceivingPage} noun="lines" />
          </div>
        </div>
      )}

      {/* Receiving: no verdict, because one was already given against the
          order. The store counts the goods and corrects any serial that does
          not match what is in the box. */}
      <Modal
        open={receiving !== null}
        onClose={() => setReceiving(null)}
        title={receiving ? `Receive into stock — ${receiving.grn_number ?? ""}` : "Receive into stock"}
        size="lg"
      >
        {receiving && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">
              <p className="font-medium text-foreground">
                {receiving.po_item_description ?? receiving.material_name ?? "Delivery line"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {receiving.po_number ? `${receiving.po_number} · ` : ""}
                {receiving.supplier_name ?? "—"} · {receiving.accepted_quantity ?? receiving.quantity}{" "}
                {receiving.unit ?? "piece"} passed inspection
                {receiving.inspected_by_name ? ` · checked by ${receiving.inspected_by_name}` : ""}
              </p>
              {(receiving.rejected_quantity ?? 0) > 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  {receiving.rejected_quantity} turned away at inspection
                  {receiving.inspection_notes ? ` — ${receiving.inspection_notes}` : ""}. That
                  quantity stays owed on the order.
                </p>
              )}
            </div>

            {receiving.kind === "unique" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Serial numbers — tally against the goods</label>
                  <span className="text-2xs text-muted-foreground">
                    As entered by Procurement; correct any that do not match
                  </span>
                </div>
                {(receiving.serial_numbers ?? []).length > (receiving.accepted_quantity ?? receiving.quantity) && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-2xs text-amber-700 dark:text-amber-500">
                    Procurement recorded {(receiving.serial_numbers ?? []).length} serial numbers but only{" "}
                    {receiving.accepted_quantity ?? receiving.quantity} passed. The spares are not shown —
                    check the ones below against the box before receiving.
                  </p>
                )}
                <div className="max-h-72 space-y-1.5 overflow-y-auto">
                  {tally.map((value, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-2xs tabular-nums text-muted-foreground">{i + 1}</span>
                      <input
                        value={value}
                        onChange={(e) =>
                          setTally((rows) => rows.map((r, j) => (j === i ? e.target.value : r)))
                        }
                        placeholder="Serial number"
                        className={`${inputClass} font-mono text-xs`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                Counted stock — {receiving.accepted_quantity ?? receiving.quantity}{" "}
                {receiving.unit ?? "piece"} go onto the shelf. No serial numbers to tally.
              </p>
            )}

            <div className="space-y-1.5">
              <label htmlFor="receive_note" className={labelClass}>Note (optional)</label>
              <input
                id="receive_note"
                value={receiveNote}
                onChange={(e) => setReceiveNote(e.target.value)}
                placeholder="e.g. One serial corrected against the box"
                className={inputClass}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setReceiving(null)}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReceive}
                disabled={receiveBusy}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
              >
                <PackageCheck className="h-4 w-4" />
                {receiveBusy ? "Receiving…" : "Receive into stock"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={active !== null} onClose={() => setActive(null)} title="Inspect Delivery" size="xl">
        {active && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/20 p-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {active.known_component
                  ?? active.po_item_description
                  ?? active.material_name
                  ?? active.device_model_name
                  ?? "Not named on the delivery"}
              </span>
              {" · "}GRN <span className="font-mono">{active.grn_number}</span>
              {active.po_number && <> · PO <span className="font-mono">{active.po_number}</span></>}
              {active.batch_number && <> · Batch <span className="font-mono">{active.batch_number}</span></>}
              {" · "}{active.quantity} received
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="accepted" className={labelClass}>Accepted</label>
                <select
                  id="accepted"
                  value={accepted}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setAccepted(n);
                    if (route === "unique") setUnitCount(n);
                  }}
                  className={inputClass}
                >
                  {Array.from({ length: active.quantity + 1 }, (_, n) => n).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Rejected</label>
                <p className={`flex h-10 items-center rounded-lg border border-border px-3 text-sm ${rejected > 0 ? "bg-destructive/10 text-destructive" : "bg-secondary/40 text-muted-foreground"}`}>
                  {rejected}
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="route" className={labelClass}>File into</label>
                {active.kind === "generic" || active.kind === "unique" ? (
                  // Known from the purchase order: the component was opened in
                  // inventory before it was ever ordered, so nothing to decide.
                  <div>
                    <p id="route" className="flex h-10 items-center rounded-lg border border-border bg-secondary/40 px-3 text-sm text-foreground">
                      {active.kind === "unique" ? "Unique items" : "Generic stock"}
                      {active.known_component && (
                        <span className="ml-1.5 truncate text-muted-foreground">· {active.known_component}</span>
                      )}
                    </p>
                    <p className="mt-1 text-2xs text-muted-foreground">Set by the purchase order line.</p>
                  </div>
                ) : (
                  <select
                    id="route"
                    value={route}
                    disabled={accepted === 0}
                    onChange={(e) => {
                      const r = e.target.value as "generic" | "unique";
                      setRoute(r);
                      if (r === "unique") setUnitCount(accepted);
                    }}
                    className={`${inputClass} disabled:opacity-50`}
                  >
                    <option value="generic">Generic stock</option>
                    <option value="unique">Unique items</option>
                  </select>
                )}
              </div>
            </div>

            {accepted > 0 && route === "generic" && active.kind === "generic" && (
              <div className="grid gap-4 rounded-xl border border-border bg-secondary/20 p-4 sm:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className={labelClass}>Tops up</label>
                  <p className="flex h-10 items-center rounded-lg border border-border bg-secondary/40 px-3 text-sm text-foreground">
                    {active.known_component ?? active.material_name ?? "the stock item on the order"}
                  </p>
                  <p className="text-2xs text-muted-foreground">The accepted quantity is added to this stock item and journalled against GRN {active.grn_number}.</p>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ins_placed" className={labelClass}>Storage location</label>
                  <input
                    id="ins_placed"
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    placeholder="e.g. Rack A3"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* A component already belongs to a category, so naming it once
                settles both. */}
            {accepted > 0 && route === "generic" && active.kind !== "generic" && (
              <div className="grid gap-4 rounded-xl border border-border bg-secondary/20 p-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="ins_material" className={labelClass}>Component</label>
                  <select id="ins_material" value={materialType} onChange={(e) => setMaterialType(e.target.value)} className={inputClass}>
                    <option value="">From the purchase order</option>
                    {materialTypes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="ins_placed" className={labelClass}>Storage location</label>
                  <input
                    id="ins_placed"
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    placeholder="e.g. Rack A3"
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {accepted > 0 && route === "unique" && (
              <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-4">
                <p className="text-xs text-muted-foreground">
                  {active.kind === "unique" && active.known_component
                    ? <>One row per physical unit, filed under <span className="font-medium text-foreground">{active.known_component}</span>. Make, model, technical details, supplier, price and batch come from the product and the purchase order. A warranty term runs from today, the day the unit was received.</>
                    : <>One row per physical unit. Make, supplier, price and batch are taken from the purchase order. A warranty term runs from today, the day the unit was received.</>}
                </p>
                <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                  {units.slice(0, accepted).map((u, i) => (
                    <div key={i} className="grid items-center gap-2 sm:grid-cols-12">
                      <input
                        value={u.serial_number}
                        onChange={(e) => patchUnit(i, { serial_number: e.target.value })}
                        placeholder={`Serial no ${i + 1} *`}
                        className={`${smallInput} sm:col-span-4`}
                      />
                      {active.kind === "unique" ? (
                        <p className={`${smallInput} flex items-center bg-secondary/40 text-muted-foreground sm:col-span-3`} title="From the opened product">
                          {active.known_component}
                        </p>
                      ) : (
                        <input
                          value={u.model_name}
                          onChange={(e) => patchUnit(i, { model_name: e.target.value })}
                          placeholder="Model"
                          className={`${smallInput} sm:col-span-3`}
                        />
                      )}
                      <div className="flex items-center gap-2 sm:col-span-5">
                        <input
                          type="number"
                          min={1}
                          max={120}
                          value={u.warranty_months}
                          onChange={(e) => patchUnit(i, { warranty_months: e.target.value })}
                          placeholder="Warranty (months)"
                          title="Warranty months, counted from today"
                          className={`${smallInput} w-40`}
                        />
                        <span className="text-2xs text-muted-foreground">from today · blank = no warranty</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="ins_notes" className={labelClass}>Inspection notes</label>
              <textarea
                id="ins_notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={rejected > 0 ? "Why were items rejected?" : "Optional"}
                className={`${inputClass} h-auto py-2`}
              />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={() => setActive(null)}
                className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitInspection}
                disabled={saving}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50"
              >
                {saving ? "Filing…" : accepted === 0 ? "Reject Delivery" : "Accept & File to Inventory"}
              </button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title="Record a return" size="md">
        <form onSubmit={submitReturn} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Components coming back to the store. They are inspected like any delivery before they count as stock.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="ret_source" className={labelClass}>Coming back from *</label>
              <select id="ret_source" value={returnForm.source} onChange={(e) => setReturnForm({ ...returnForm, source: e.target.value })} className={inputClass}>
                <option value="project_return">A project (leftovers)</option>
                <option value="maintenance_return">Maintenance</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ret_kind" className={labelClass}>Kind of component *</label>
              <select
                id="ret_kind"
                value={returnForm.kind}
                onChange={(e) => setReturnForm({ ...returnForm, kind: e.target.value as "generic" | "unique", inventory_item: "", unit_type: "", serials: "" })}
                className={inputClass}
              >
                <option value="generic">Generic (counted)</option>
                <option value="unique">Unique (serialised)</option>
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="ret_component" className={labelClass}>Component *</label>
              {returnForm.kind === "generic" ? (
                <select id="ret_component" required value={returnForm.inventory_item} onChange={(e) => setReturnForm({ ...returnForm, inventory_item: e.target.value })} className={inputClass}>
                  <option value="">Select a generic component…</option>
                  {genericItems.map((it) => <option key={it.id} value={it.id}>{it.material_name ?? it.sku} · {it.sku}</option>)}
                </select>
              ) : (
                <select id="ret_component" required value={returnForm.unit_type} onChange={(e) => setReturnForm({ ...returnForm, unit_type: e.target.value })} className={inputClass}>
                  <option value="">Select a unique component…</option>
                  {uniqueProducts.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.type_code}</option>)}
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ret_qty" className={labelClass}>Quantity *</label>
              <input id="ret_qty" type="number" min={1} required value={returnForm.quantity} onChange={(e) => setReturnForm({ ...returnForm, quantity: e.target.value })} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="ret_ref" className={labelClass}>Reference</label>
              <input id="ret_ref" value={returnForm.reference} onChange={(e) => setReturnForm({ ...returnForm, reference: e.target.value })} placeholder="Project code, job number…" className={inputClass} />
            </div>
            {returnForm.kind === "unique" && (
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="ret_serials" className={labelClass}>Serial numbers (one per line) *</label>
                <textarea id="ret_serials" rows={3} value={returnForm.serials} onChange={(e) => setReturnForm({ ...returnForm, serials: e.target.value })} className={`${inputClass} h-auto py-2 font-mono`} />
              </div>
            )}
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="ret_notes" className={labelClass}>Notes</label>
              <textarea id="ret_notes" rows={2} value={returnForm.notes} onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })} className={`${inputClass} h-auto py-2`} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setReturnOpen(false)} className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
            <button type="submit" disabled={returnSaving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
              {returnSaving ? "Recording…" : "Record return"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
