"use client";

import { ArrowLeft, Check, Eye, HardDrive, ImagePlus, Pencil, Plus, Printer, QrCode, Trash2, Upload, X, Download, MapPin, Clock, Shield, Wrench, FileText, ChevronRight, Calendar, DollarSign, Package, Zap, Monitor, Sun } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { SegmentBar, StatTiles } from "@/components/ui/analytics-strip";
import { Pagination, pageSlice } from "@/components/ui/pagination";
import { ProductionRoute, type ProductionStep } from "@/components/assets/production-route";
import { Timeline, type TimelineItem, type TimelineTone } from "@/components/ui/timeline";
import { CopyButton } from "@/components/ui/copy-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { MultiSelect } from "@/components/ui/multi-select";
import { DeviceImage } from "@/components/ui/device-image";
import { StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import { Qty } from "@/components/ui/qty";
import { SortTh, sortRows, useSortState } from "@/components/ui/sortable";
import { confirmAction } from "@/components/ui/confirm";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDate, formatDateTime, formatTerm, todayIso } from "@/lib/utils";
import { useUser } from "@/lib/user-context";

interface Device {
  id: string;
  asset_code: string;
  /** The manufacturer's, where there is one. Assets go by their asset code. */
  serial_number: string | null;
  device_model: string;
  device_model_name: string | null;
  source_display: string;
  requires_production: boolean;
  /** In execution under an approved project: components and route are fixed. */
  is_locked?: boolean;
  requires_oversight: boolean;
  production_steps: ProductionStep[];
  route_template_available: boolean;
  component_template_available: boolean;
  supply_vendor_name: string;
  supply_vendor_contact: string;
  client_warranty: AssetWarranty | null;
  vendor_warranty: AssetWarranty | null;
  asset_type_name: string | null;
  display_name: string;
  status: string;
  /** The lifecycle stage as the API labels it (e.g. In Procurement). */
  status_display?: string;
  warranty_status: string;
  image: string | null;
  /** The picture to show: its own, else the gallery's primary photo. */
  display_image?: string | null;
  current_site: string | null;
  site_name: string | null;
  project: string | null;
  project_name: string | null;
  components?: AssetComponent[];
  assigned_client: string | null;
  client_name: string | null;
  client_names: string[];
  installation_date: string | null;
  created_at: string;
}

interface DeviceDetail extends Device {
  /** The sites this asset's project covers — where it may be installed. */
  project_sites?: { id: string; name: string; city?: string }[];
  /** What the asset has cost: building it, and keeping it running. */
  cost_of_ownership?: {
    development: {
      project: string; project_name: string;
      /** Bought complete from a vendor, rather than built. */
      vendor_asset: boolean;
      purchase_price: string | null; priced_from: string | null;
      materials: string | null; production: string | null;
      installation: string | null;
      /** What it cost to obtain, installation excluded. */
      obtained: string | null;
      total: string | null;
    } | null;
    maintenance: {
      preventive: { visits: number; total: string };
      corrective: { visits: number; total: string };
      total: string;
    };
    total: string;
  } | null;
  procurement_po_number?: string | null;
  procurement_requested_at?: string | null;
  route_complete?: boolean;
  source: string;
  /** The lifecycle stage as the API labels it (e.g. In Procurement). */
  status_display?: string;
  allowed_transitions?: string[];
  clients: string[];
  project_contract_type: "sold" | "rental" | "" | null;
  project_rental_end_date: string | null;
  brand_name: string | null;
  asset_type: string | null;
  length_in: string | null;
  width_in: string | null;
  depth_in: string | null;
  diagonal_inches: string | null;
  /** What the four sizes above were measured in. */
  dimension_unit?: string;
  specifications: Record<string, unknown>;
  hardware_revision: string;
  purchase_date: string | null;
  purchase_price: string | null;
  supplier: string | null;
  supplier_name: string | null;
  invoice_reference: string;
  batch_number: string;
  assigned_technician: string | null;
  technician_name: string | null;
  technician_employee_id: string | null;
  technician_job_title: string | null;
  technician_phone: string | null;
  /** The installing vendor, picked from the register kept under Vendors. */
  assigned_vendor: string | null;
  assigned_vendor_name: string;
  assigned_vendor_contact: string;
  assigned_to_display: string | null;
  notes: string;
  images: { id: string; image: string; caption: string; is_primary: boolean }[];
  /** When the asset last entered each status (dates on the lifecycle track). */
  stage_dates: Record<string, string>;
  lifecycle_events: {
    id: string;
    event_type: string;
    from_value: string;
    to_value: string;
    description: string;
    performed_by_name: string | null;
    created_at: string;
  }[];
  updated_at: string;
}

/** An asset's own cover, as opposed to a part's. */
/** The asset's job on the Installation Tracker. */
interface InstallationJob {
  id: string;
  site_name: string | null;
  installed_by_name: string | null;
  vendor_display: string | null;
  due_date: string | null;
  completed_at: string | null;
  progress: number;
  steps_done: number;
  steps_total: number;
}

interface AssetWarranty {
  id: string;
  start_date: string;
  end_date: string;
  months: number | null;
  status: string;
}

interface WarrantyItem {
  id: string;
  warranty_type: string;
  component: string | null;
  component_name: string | null;
  status: string;
  start_date: string;
  end_date: string;
  coverage_details: string;
  reference_number: string;
  supplier_name: string | null;
  is_expired: boolean;
}

interface MaintenanceItem {
  id: string;
  title: string;
  maintenance_type: string;
  frequency: string;
  next_due: string;
  status: string;
  is_active: boolean;
  assigned_to_name: string | null;
  /** The fault that raised it, when one did. */
  ticket?: string | null;
  ticket_number?: string | null;
}

interface DocumentItem {
  id: string;
  title: string;
  doc_type: string;
  file: string;
  uploaded_by_name: string | null;
  created_at: string;
}

interface Option { id: string; label: string }

/** A vendor as the register holds it, so choosing one brings its details. */
interface VendorOption extends Option {
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
}

/** The vendor's contact, as one line. `full` adds the email. */
function vendorContact(v?: VendorOption, full = false): string {
  if (!v) return "";
  const parts = [v.contact_person, v.contact_phone];
  if (full) parts.push(v.contact_email);
  return parts.filter(Boolean).join(" · ");
}

interface AssetComponent {
  /** The units actually fitted, by serial — a line for three takes three. */
  fitted_serials?: string[];
  id: string;
  device: string;
  name: string;
  component_type: string;
  /** The manufacturer's, where there is one. Assets go by their asset code. */
  serial_number: string | null;
  quantity: number;
  supplier: string | null;
  supplier_name: string | null;
  inventory_item: string | null;
  inventory_item_name: string | null;
  inventory_item_sku: string | null;
  inventory_unit: string | null;
  inventory_unit_code: string | null;
  inventory_unit_type: string | null;
  inventory_unit_type_name: string | null;
  available_quantity: number | null;
  outstanding_quantity: number;
  issued_quantity: number;
  fulfilment: string;
  po_number: string | null;
  source_label: string | null;
  unit?: string;
  active_warranty: { warranty_type: string; status: string; start_date: string; end_date: string; months: number | null } | null;
  notes: string;
}

interface StockItemRef {
  id: string;
  sku: string;
  material_name: string | null;
  quantity: number;
  /** Unit of measure the stock is counted in (piece, meter, kg…). */
  unit?: string | null;
}
interface StockProductRef {
  id: string;
  type_code: string;
  name: string;
  brand_name: string | null;
  model_name: string;
  in_stock_count: number;
  /** Unique items are counted one by one; the unit is normally "piece". */
  unit?: string | null;
}

const STATUSES = [
  { value: "procured", label: "In Procurement" },
  { value: "in_transit", label: "In Transit" },
  { value: "in_production", label: "In Production" },
  { value: "in_stock", label: "In Stock" },
  { value: "assigned", label: "Assigned" },
  { value: "installed", label: "Installed" },
  { value: "active", label: "Active" },
  { value: "under_maintenance", label: "Under Maintenance" },
  { value: "client_property", label: "Client Property" },
  { value: "decommissioned", label: "Decommissioned" },
  { value: "lost_stolen", label: "Lost/Stolen" },
  { value: "rma", label: "RMA" },
];

// The canonical procure→decommission chain, in lifecycle order (the client's
// requested lifecycle view). lost_stolen / rma sit outside the main flow.
// The build-and-deploy ladder in the order it actually happens. "In transit"
// is a movement state an asset can drop into later, not a step between being
// procured and being built, so it is not part of the chain.
const statusLabel = (s: string) => STATUSES.find((x) => x.value === s)?.label ?? s.replace(/_/g, " ");

// How each requirement is being covered — decided in the Project section.
const FULFILMENT_LABELS: Record<string, string> = {
  pending: "Not decided",
  from_stock: "From inventory",
  procurement: "To be procured",
  fulfilled: "Fulfilled",
};
const FULFILMENT_BADGES: Record<string, string> = {
  pending: "bg-secondary text-muted-foreground ring-border",
  from_stock: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  procurement: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  fulfilled: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
};

// The three delivery routes. Kept in sync with Device.Source on the backend;
// the API also returns `source_display`, which is preferred where available.
const SOURCE_LABELS: Record<string, string> = {
  inhouse: "In-house Production",
  vendor_supplied: "Vendor Supplied · Installed In-house",
  vendor_turnkey: "Vendor Supplied & Installed",
};

// The build-and-deploy line, in the order it actually happens.
const TRACK_ALL = ["procured", "in_production", "in_stock", "assigned", "installed", "active"] as const;
// Where an asset's life ends. Drawn as a spur, not more track: it is not the
// next step for every asset, and nothing comes back from it.
const TRACK_END = ["client_property", "decommissioned"] as const;
// States that take an asset off the line for a while.
const OFF_TRACK = ["in_transit", "rma", "lost_stolen"];

// The lifecycle follows the work. These two are the only stages nobody's work
// produces — handing the asset to the client, and retiring it — so they are the
// only ones a person sets by hand.
const MANUAL_STATUSES = ["client_property", "decommissioned"];

// What is actually moving the asset on, said plainly where the old dropdown was.
const LIFECYCLE_SOURCE: Record<string, string> = {
  procured: "Moves to In Production when components are issued, and to In Stock when the build is complete.",
  in_production: "Moves to In Stock once all components are issued and all operations are complete.",
  in_stock: "Assign it under Installation & Activation below to open the installation job.",
  assigned: "Marked Installed when the technician completes the installation checklist.",
  installed: "Marked Active when the technician confirms on site with a photo.",
  active: "Transfer to the client or decommission below. All other stages follow the work.",
  under_maintenance: "Returns to Active when the maintenance job is completed. Hand it to the client or decommission it below.",
};

function shortDate(iso: string | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "2-digit" }) });
}

/**
 * The asset's life drawn like a shipment tracker: a rail of checkpoints, each
 * dated with when the asset reached it. Maintenance is a detour off Active
 * (the asset comes back from it), so it branches below that checkpoint rather
 * than sitting on the line as if it came next.
 */
function LifecycleStepper({ status, stageDates, requiresProduction = true }: { status: string; stageDates: Record<string, string>; requiresProduction?: boolean }) {
  const label = (s: string) => STATUSES.find((x) => x.value === s)?.label ?? s;
  // A vendor-supplied asset is bought complete: its rail has no production stage.
  const TRACK_MAIN = requiresProduction ? TRACK_ALL : TRACK_ALL.filter((st) => st !== "in_production");
  const inMaintenance = status === "under_maintenance";
  const ended = (TRACK_END as readonly string[]).includes(status);
  const offTrack = OFF_TRACK.includes(status);
  const mainIdx = inMaintenance || ended
    ? TRACK_MAIN.length - 1
    : (TRACK_MAIN as readonly string[]).indexOf(status);
  const detour = inMaintenance || !!stageDates.under_maintenance;

  // One list, so the rail is laid out in one pass and the end states keep
  // their place on it without a second row.
  const stages = [
    ...TRACK_MAIN.map((stage, i) => {
      const reached = mainIdx >= 0 ? i <= mainIdx : !!stageDates[stage];
      const current = !inMaintenance && !ended && status === stage;
      return {
        stage,
        spur: false,
        reached,
        current,
        // Solid up to where the asset has got; the rest of the line is grey.
        filled: mainIdx >= 0 && i < mainIdx,
        state: current ? "In Progress" : reached ? "Completed" : "Not Started",
      };
    }),
    ...TRACK_END.map((stage) => {
      const current = status === stage;
      return {
        stage,
        spur: true,
        reached: current || !!stageDates[stage],
        current,
        filled: false,
        state: current ? "In Progress" : stageDates[stage] ? "Completed" : "Not Started",
      };
    }),
  ];

  return (
    <div className="pb-1">
      {/* Room under the rail for the maintenance detour, only when there is
          one to show. */}
      <ol className={`flex items-start ${detour ? "pb-14" : ""}`}>
        {stages.map((s, i) => {
          const date = shortDate(stageDates[s.stage]);
          const isLast = i === stages.length - 1;
          const next = stages[i + 1];
          return (
            <li key={s.stage} className="relative flex min-w-0 flex-1 basis-0 flex-col items-center px-0.5 text-center">
              {/* The line runs between node centres, behind them. An end
                  state hangs off a dashed segment: it is not the next step
                  for every asset, and nothing comes back from it. */}
              {!isLast && (
                <span
                  aria-hidden
                  className={
                    next?.spur
                      ? "absolute left-1/2 top-[17px] w-full border-t-2 border-dashed border-border"
                      : `absolute left-1/2 top-[17px] h-0.5 w-full ${s.filled ? "bg-primary" : "bg-border"}`
                  }
                />
              )}
              <span className="relative flex h-9 w-9 items-center justify-center">
                {s.current && !s.spur && (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-primary/25 motion-safe:animate-ping" />
                )}
                <span
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold shadow-sm transition-colors ${
                    s.current
                      ? "border-primary bg-primary text-primary-foreground"
                      : s.reached
                        ? s.spur
                          ? "border-slate-400 bg-slate-500 text-white"
                          : "border-primary bg-primary text-primary-foreground"
                        : s.spur
                          ? "border-dashed border-border bg-secondary text-muted-foreground/60"
                          : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {s.reached && !s.current ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                </span>
              </span>
              <span
                lang="en"
                className={`mt-2 hyphens-auto break-words [overflow-wrap:anywhere] max-w-full text-2xs font-medium leading-tight ${
                  s.reached || s.current ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label(s.stage)}
              </span>
              <span
                className={`mt-0.5 max-w-full break-words text-2xs leading-tight ${
                  s.current ? "font-semibold text-primary" : s.reached ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {s.state}
              </span>
              {s.reached && date && (
                <span
                  className="mt-0.5 text-2xs tabular-nums text-muted-foreground"
                  title={stageDates[s.stage] ? new Date(stageDates[s.stage]).toLocaleString() : undefined}
                >
                  {date}
                </span>
              )}

              {/* Maintenance: a detour hanging below Active, clear of the rail.
                  The asset comes back from it, so it is not on the line. */}
              {s.stage === "active" && detour && (
                <span className="absolute left-1/2 top-full z-10 flex w-28 -translate-x-1/2 flex-col items-center">
                  <span aria-hidden className={`h-4 border-l-2 border-dashed ${inMaintenance ? "border-amber-500" : "border-border"}`} />
                  <span className={`mt-1 rounded-full px-2.5 py-1 text-2xs font-semibold leading-tight ring-1 ${
                    inMaintenance ? "bg-amber-500/10 text-amber-600 ring-amber-500/30" : "bg-secondary text-muted-foreground ring-border"
                  }`}>
                    {inMaintenance ? "Under maintenance" : "Last maintenance"}
                  </span>
                  <span className="mt-0.5 text-2xs tabular-nums text-muted-foreground">
                    {inMaintenance ? `since ${shortDate(stageDates.under_maintenance) ?? "—"}` : shortDate(stageDates.under_maintenance)}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {offTrack && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-2xs font-medium text-red-600 ring-1 ring-red-500/20">
          Off the normal line: {label(status)}
          {stageDates[status] && <span className="font-normal text-red-500/80">· since {shortDate(stageDates[status])}</span>}
        </p>
      )}
    </div>
  );
}

/** Lifecycle events as timeline entries, coloured by what happened. */
function lifecycleItems(
  events: { id: string; event_type: string; from_value: string; to_value: string; description: string; performed_by_name: string | null; created_at: string }[],
): TimelineItem[] {
  const human = (v: string) => v.replace(/_/g, " ");
  const tone = (evt: { event_type: string; to_value: string }): TimelineTone => {
    if (evt.event_type === "note" || evt.event_type === "reassignment") return "muted";
    if (["active", "installed"].includes(evt.to_value)) return "success";
    if (evt.to_value === "under_maintenance") return "warning";
    if (["rma", "lost_stolen", "decommissioned"].includes(evt.to_value)) return "danger";
    return "primary";
  };
  return events.map((evt) => ({
    key: evt.id,
    title: evt.from_value && evt.to_value ? (
      <>
        <span className="capitalize">{human(evt.from_value)}</span>
        <span className="mx-1 text-muted-foreground">→</span>
        <span className="font-semibold capitalize">{human(evt.to_value)}</span>
      </>
    ) : evt.to_value ? (
      <>Registered as <span className="font-semibold capitalize">{human(evt.to_value)}</span></>
    ) : (
      <span className="capitalize">{human(evt.event_type)}</span>
    ),
    description: evt.description && evt.description !== "Registered" ? evt.description : null,
    actor: evt.performed_by_name,
    at: evt.created_at,
    tone: tone(evt),
  }));
}

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";

const WARRANTY_TYPE_LABELS: Record<string, string> = {
  // Named for who gives the cover: the part's maker, the vendor who supplied
  // the asset to us, or us to the client we installed it for.
  manufacturer: "Manufacturer Warranty",
  extended: "Extended Warranty",
  supplier: "Vendor Warranty",
  client: "Client Warranty",
};

const WARRANTY_COLORS: Record<string, string> = {
  manufacturer: "#3b82f6",
  extended: "#8b5cf6",
  supplier: "#06b6d4",
  client: "#10b981",
};

const MAINT_TYPE_BADGE: Record<string, string> = {
  preventive: "bg-blue-500/10 text-blue-600",
  corrective: "bg-red-500/10 text-red-600",
};

export default function AssetsPage() {
  const { can, canAny } = useUser();
  const canEdit = can("edit_assets");
  // Moving an asset through its lifecycle is its own right: the store moves
  // it into stock and handles RMAs without editing the registry.
  const canMove = canEdit || canAny("move_asset_stage", "assign_installation", "manage_maintenance");

  const [devices, setDevices] = useState<Device[]>([]);
  const [assetPage, setAssetPage] = useState(1);
  const sort = useSortState();
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<DeviceDetail | null>(null);
  const [detailView, setDetailView] = useState<DeviceDetail | null>(null);
  const [returnToDetailId, setReturnToDetailId] = useState<string | null>(null);
  const [additionalClients, setAdditionalClients] = useState<string[]>([]);
  // Components are drawn from inventory: generic stock (qty) or a unique unit.
  const [compSource, setCompSource] = useState<"generic" | "unique">("generic");
  const [compItemId, setCompItemId] = useState("");
  const [compUnitType, setCompUnitType] = useState("");
  // Empty until chosen: registering an asset means saying how it is made.
  const [assetSource, setAssetSource] = useState("");
  // A joiner works in feet, a screen is quoted in inches: the sizes are
  // stored as entered and carry the unit they were measured in.
  const [dimensionUnit, setDimensionUnit] = useState("in");
  const [compEdit, setCompEdit] = useState<{ id: string; quantity: number } | null>(null);
  // Item 8: a new asset can start as a copy of an existing one.
  const [copyFrom, setCopyFrom] = useState("");
  /** The asset being copied from, once it has been read.
   *
   * Picking one used to change nothing on screen — the copying happened on
   * the server at save time, so the form sat empty and the person filled
   * in by hand what they had just said to copy. */
  const [copyOf, setCopyOf] = useState<DeviceDetail | null>(null);
  useEffect(() => {
    if (!copyFrom) { setCopyOf(null); return; }
    let dropped = false;
    api.get(`/assets/devices/${copyFrom}/`)
      .then(({ data }) => {
        if (dropped) return;
        setCopyOf(data);
        // Everything that is required to register one of these follows the
        // asset being copied — the type, how it is made, and the units its
        // size is in. The name is the one thing the person must decide,
        // because two assets sharing a name is the problem this avoids.
        setFormAssetType(data.asset_type ?? "");
        setDimensionUnit(data.dimension_unit ?? "in");
        setAssetSource(data.source ?? "");
      })
      .catch(() => { if (!dropped) setCopyOf(null); });
    return () => { dropped = true; };
  }, [copyFrom]);
  // Components and a production route only belong to an asset we build ourselves.
  const buildsInHouse = assetSource === "inhouse";
  const [formAssetType, setFormAssetType] = useState("");
  const [compQty, setCompQty] = useState("1");
  const [stockItems, setStockItems] = useState<StockItemRef[]>([]);
  const [stockProducts, setStockProducts] = useState<StockProductRef[]>([]);

  // A component is a requirement, so availability never limits it — it is
  // shown purely so the user knows whether it will need procuring later.
  const selectedProduct = stockProducts.find((p) => p.id === compUnitType);
  const selectedStockItem = stockItems.find((s) => s.id === compItemId);
  const compAvailable =
    compSource === "generic"
      ? selectedStockItem?.quantity ?? 0
      : selectedProduct?.in_stock_count ?? 0;
  // The unit the chosen line is counted in, shown wherever its quantity is.
  const compUnit = (compSource === "generic" ? selectedStockItem?.unit : selectedProduct?.unit) || "piece";
  const compSelected = compSource === "generic" ? compItemId : compUnitType;

  const loadInventorySources = useCallback(async () => {
    // Components are requirements, so we offer what inventory *knows about* —
    // every stock item and every opened unique product — not only what is
    // currently on hand.
    const [items, products] = await Promise.allSettled([
      api.get("/inventory/items/", { params: { page_size: 500 } }),
      api.get("/inventory/products/", { params: { page_size: 500 } }),
    ]);
    if (items.status === "fulfilled") setStockItems(items.value.data.results ?? items.value.data);
    if (products.status === "fulfilled") setStockProducts(products.value.data.results ?? products.value.data);
  }, []);
  const [detailTab, setDetailTab] = useState("overview");
  /** The activity rail holds the whole journal; it starts folded. */
  const [allActivity, setAllActivity] = useState(false);
  const [saving, setSaving] = useState(false);
  const [labelModal, setLabelModal] = useState<{ url: string; format: "qr" | "code128" } | null>(null);
  const [labelLoading, setLabelLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLabelLoading, setBulkLabelLoading] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState<string | null>(null);
  // Assigning opens the asset's installation job, and a job happens somewhere.
  const [assignSite, setAssignSite] = useState("");
  // What the corrective job needs when an asset is taken out of service.
  const [maintDue, setMaintDue] = useState("");
  const [maintTech, setMaintTech] = useState("");
  const [maintPriority, setMaintPriority] = useState("high");
  const [maintInstructions, setMaintInstructions] = useState("");
  const [transitionReason, setTransitionReason] = useState("");
  // Moving an asset to "Assigned" must record who it went to: an internal
  // technician (from the manpower records) or an external vendor by hand.
  const [assignTechnician, setAssignTechnician] = useState("");
  // When the installation has to be finished — agreed as the job is handed out.
  const [assignDue, setAssignDue] = useState("");
  // The installing vendor, picked from the register kept under Vendors.
  const [assignVendorId, setAssignVendorId] = useState("");
  const [transitionLoading, setTransitionLoading] = useState(false);
  // Photo evidence of the installed asset, attached when moving to Active.
  const [activePhotos, setActivePhotos] = useState<File[]>([]);
  const [activePhotoPreviews, setActivePhotoPreviews] = useState<string[]>([]);
  const activePhotoInputRef = useRef<HTMLInputElement>(null);

  const [warranties, setWarranties] = useState<WarrantyItem[]>([]);
  const [maintSchedules, setMaintSchedules] = useState<MaintenanceItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  /** Put a file on the asset's record. The title is the file's own name —
      renaming it is a job for later, and asking now stops people filing. */
  async function uploadDocuments(deviceId: string, files: FileList | null) {
    if (!files?.length) return;
    setUploadingDoc(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("device", deviceId);
        form.append("title", file.name.replace(/\.[^.]+$/, ""));
        form.append("file", file);
        await api.post("/infrastructure/documents/", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      const { data } = await api.get("/infrastructure/documents/", { params: { device: deviceId } });
      setDocuments(data.results ?? data);
      toast.success(files.length === 1 ? "Document uploaded" : `${files.length} documents uploaded`);
    } catch (err) {
      toast.error(getApiError(err, "Could not upload that document"));
    } finally {
      setUploadingDoc(false);
    }
  }
  const [deviceTickets, setDeviceTickets] = useState<{ id: string; ticket_number: string; occurrence: number; title: string; status: string; created_at: string }[]>([]);
  // The asset's job on the Installation Tracker, when it has one.
  const [installation, setInstallation] = useState<InstallationJob | null>(null);
  const [installLoading, setInstallLoading] = useState(false);

  const [deviceModels, setDeviceModels] = useState<Option[]>([]);
  const [assetTypes, setAssetTypes] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<VendorOption[]>([]);
  const [technicians, setTechnicians] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "", asset_type: "", client: "", site: "", warranty: "", flag: "" });
  const [search, setSearch] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searchParams = useSearchParams();
  const autoOpenedRef = useRef(false);

  const fetchDevices = useCallback(async () => {
    try {
      const { data } = await api.get("/assets/devices/", { params: { page_size: 1000 } });
      const rows: Device[] = data.results ?? data;
      setDevices(rows);
      // Drop selections pointing at rows that no longer exist (e.g. deleted).
      setSelectedIds((prev) => {
        if (prev.size === 0) return prev;
        const valid = new Set(rows.map((r) => r.id));
        const next = new Set(Array.from(prev).filter((id) => valid.has(id)));
        return next.size === prev.size ? prev : next;
      });
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load devices"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  useEffect(() => { loadInventorySources(); }, [loadInventorySources]);

  // One-off instructions in the URL: a status filter, or "open the form".
  useEffect(() => {
    if (autoOpenedRef.current || loading) return;
    const statusParam = searchParams.get("status");
    if (statusParam) setFilterValues((prev) => ({ ...prev, status: statusParam }));
    // Sent here to define an asset — from a project's scope, say — so open the
    // registration form rather than making them find the button.
    if (searchParams.get("new") && !searchParams.get("device")) {
      autoOpenedRef.current = true;
      openCreate();
      loadOptions();
    }
  }, [searchParams, loading]);

  // Which asset is open lives in the address bar. It used to live only in
  // React state and the URL was read once, on arrival — so the URL still
  // said /assets while an asset was on screen, a reload went back to the
  // register, and so did Back after stepping out to a module the asset
  // linked to. Now the URL decides, every time it changes.
  const openDeviceId = searchParams.get("device");
  useEffect(() => {
    if (loading) return;
    // Editing from the detail view closes it for a moment so the edit form
    // can mount, then returns; the URL has not changed and must not be
    // acted on, or the form would be swallowed the instant it opened.
    if (returnToDetailId) return;
    if (!openDeviceId) {
      if (detailView) {
        setDetailView(null); setWarranties([]); setMaintSchedules([]); setDocuments([]);
        setTransitionTarget(null); setTransitionReason("");
      }
      return;
    }
    if (detailView?.id === openDeviceId) return;
    api.get(`/assets/devices/${openDeviceId}/`).then(({ data }) => {
      setDetailView(data);
      setDetailTab("overview");
      setTransitionTarget(null);
      setTransitionReason("");
      // Coming from a project's Execution tab: straight to the section that
      // assigns the site and technician and opens the installation.
      if (searchParams.get("assign") && (data.allowed_transitions ?? []).includes("assigned")) {
        setTimeout(() => {
          // The site is already settled, so land on what is still open.
          const field = document.getElementById("install_technician")
            ?? document.getElementById("install_site");
          field?.scrollIntoView({ behavior: "smooth", block: "center" });
          (field as HTMLSelectElement | null)?.focus();
        }, 700);
      }
      fetchRelatedData(data.id);
      // Deep-linking straight to an asset still needs the technician, site and
      // client pickers the detail view's own dialogs use.
      loadOptions();
    }).catch(() => toast.error("That asset could not be found."));
    // detailView is deliberately not a dependency: it is what this sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDeviceId, loading, returnToDetailId]);

  const router = useRouter();

  async function fetchRelatedData(deviceId: string) {
    const [warRes, maintRes, docRes, tickRes, instRes] = await Promise.allSettled([
      api.get("/warranties/", { params: { device: deviceId } }),
      api.get("/maintenance/schedules/", { params: { device: deviceId } }),
      api.get("/infrastructure/documents/", { params: { device: deviceId } }),
      api.get("/tickets/", { params: { device: deviceId, page_size: 100 } }),
      api.get("/sites/installations/", { params: { device: deviceId, ordering: "-installed_at", page_size: 5 } }),
    ]);
    if (instRes.status === "fulfilled") {
      const jobs: InstallationJob[] = instRes.value.data.results ?? instRes.value.data;
      // The live job if there is one, otherwise the most recent finished one.
      setInstallation(jobs.find((j) => !j.completed_at) ?? jobs[0] ?? null);
    } else {
      setInstallation(null);
    }
    if (tickRes.status === "fulfilled") setDeviceTickets(tickRes.value.data.results ?? tickRes.value.data);
    if (warRes.status === "fulfilled") setWarranties(warRes.value.data.results ?? warRes.value.data);
    if (maintRes.status === "fulfilled") setMaintSchedules(maintRes.value.data.results ?? maintRes.value.data);
    if (docRes.status === "fulfilled") setDocuments(docRes.value.data.results ?? docRes.value.data);
  }

  async function loadOptions() {
    const [dm, at, st, cl, su, tech, proj] = await Promise.allSettled([
      api.get("/assets/device-models/", { params: { page_size: 200 } }),
      api.get("/assets/asset-types/", { params: { page_size: 200 } }),
      api.get("/sites/sites/", { params: { page_size: 200 } }),
      api.get("/clients/", { params: { page_size: 200 } }),
      api.get("/suppliers/", { params: { page_size: 200 } }),
      api.get("/accounts/users/", { params: { is_field_staff: true, is_active: true, page_size: 200 } }),
      api.get("/teams/projects/", { params: { page_size: 200 } }),
    ]);
    if (dm.status === "fulfilled") setDeviceModels((dm.value.data.results ?? dm.value.data).map((m: { id: string; name: string; brand_name?: string }) => ({ id: m.id, label: m.brand_name ? `${m.brand_name} ${m.name}` : m.name })));
    if (at.status === "fulfilled") setAssetTypes((at.value.data.results ?? at.value.data).map((t: { id: string; name: string }) => ({ id: t.id, label: t.name })));
    if (st.status === "fulfilled") setSites((st.value.data.results ?? st.value.data).map((s: { id: string; name: string; city?: string }) => ({ id: s.id, label: s.city ? `${s.name} · ${s.city}` : s.name })));
    if (cl.status === "fulfilled") setClients((cl.value.data.results ?? cl.value.data).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })));
    if (su.status === "fulfilled") setSuppliers((su.value.data.results ?? su.value.data).map(
      (v: { id: string; name: string; contact_person?: string; contact_phone?: string; contact_email?: string }) => ({
        id: v.id, label: v.name,
        contact_person: v.contact_person, contact_phone: v.contact_phone, contact_email: v.contact_email,
      }),
    ));
    if (proj.status === "fulfilled") setProjects((proj.value.data.results ?? proj.value.data).map((x: { id: string; name: string }) => ({ id: x.id, label: x.name })));
    if (tech.status === "fulfilled") setTechnicians((tech.value.data.results ?? tech.value.data).map((u: {
      id: string; first_name: string; last_name: string; username: string;
      employee_id?: string | null; job_title?: string | null;
    }) => {
      // Identity comes from the manpower record so two same-named techs differ.
      const name = u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username;
      const detail = [u.employee_id, u.job_title].filter(Boolean).join(" · ");
      return { id: u.id, label: detail ? `${name} · ${detail}` : name };
    }));
  }

  function openCreate() {
    setAssetSource("");
    setDimensionUnit("in");
    setFormAssetType("");
    setAssignTechnician("");
    setAssignDue("");
    setAssignVendorId("");
    setSelected(null);
    setImageFiles([]);
    setImagePreviews([]);
    setAdditionalClients([]);
    setModalMode("create");
    loadOptions();
  }

  async function openEdit(device: Device) {
    try {
      const { data } = await api.get(`/assets/devices/${device.id}/`);
      setSelected(data);
      setImageFiles([]);
      setImagePreviews([]);
      setAdditionalClients(data.clients ?? []);
      // Seed the assignment controls from whichever assignee the asset has.
      setAssetSource(data.source ?? "inhouse");
      setDimensionUnit(data.dimension_unit ?? "in");
      setFormAssetType(data.asset_type ?? "");
      setAssignTechnician(data.assigned_technician ?? "");
      setAssignVendorId(data.assigned_vendor ?? "");
      setModalMode("edit");
      loadOptions();
      // The edit modal only exists in the list render; leaving the detail
      // view mounted would swallow it (Edit appeared to do nothing). Close
      // detail and remember it so we can return after save/cancel.
      if (detailView) {
        setReturnToDetailId(detailView.id);
        setDetailView(null);
      }
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load device details"));
    }
  }

  async function refreshDetail(deviceId: string) {
    try {
      const { data } = await api.get(`/assets/devices/${deviceId}/`);
      setDetailView(data);
    } catch { /* keep stale view */ }
  }

  async function handleAddComponent(e: React.FormEvent<HTMLFormElement>, deviceId: string) {
    e.preventDefault();
    // Name, type, serial, supplier and warranty are all imported from the
    // inventory record by the backend — nothing to retype here.
    if (!compSelected) return;
    const quantity = Number(compQty.trim());
    if (!compQty.trim() || !Number.isInteger(quantity) || quantity < 1) {
      toast.error("Enter how many are needed — a whole number, 1 or more");
      return;
    }
    try {
      await api.post("/assets/components/", {
        device: deviceId,
        ...(compSource === "generic"
          ? { inventory_item: compItemId }
          : { inventory_unit_type: compUnitType }),
        quantity,
      });
      toast.success("Requirement added");
      setCompItemId("");
      setCompUnitType("");
      setCompQty("1");
      refreshDetail(deviceId);
      loadInventorySources();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to add component"));
      refreshDetail(deviceId);
      loadInventorySources();
    }
  }

  /** Item 7/15: the one thing to change on a component is how many. */
  async function saveComponentEdit(deviceId: string) {
    if (!compEdit) return;
    try {
      await api.patch(`/assets/components/${compEdit.id}/`, { quantity: compEdit.quantity });
      toast.success("Quantity updated");
      setCompEdit(null);
      refreshDetail(deviceId);
    } catch (err) {
      toast.error(getApiError(err, "Could not update the component"));
    }
  }

  async function handleDeleteComponent(compId: string, deviceId: string) {
    try {
      await api.delete(`/assets/components/${compId}/`);
      toast.success("Component removed — stock returned");
      refreshDetail(deviceId);
      loadInventorySources();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to remove component"));
    }
  }

  function openDetail(device: Device) {
    // push, not replace: Back should come out of the asset, and Back from a
    // module opened out of it should come back in.
    router.push(`/assets?device=${device.id}`);
  }

  function clearActivePhotos() {
    activePhotoPreviews.forEach((url) => URL.revokeObjectURL(url));
    setActivePhotos([]);
    setActivePhotoPreviews([]);
    if (activePhotoInputRef.current) activePhotoInputRef.current.value = "";
  }

  function handleActivePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setActivePhotos((prev) => [...prev, ...files]);
    setActivePhotoPreviews((prev) => [...prev, ...files.map((f) => URL.createObjectURL(f))]);
  }

  function removeActivePhoto(idx: number) {
    setActivePhotos((prev) => prev.filter((_, i) => i !== idx));
    setActivePhotoPreviews((prev) => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  // A vendor-installed asset is put in by the vendor it was bought from:
  // offer them, with their contact, instead of an empty list to search.
  useEffect(() => {
    if (detailView?.source !== "vendor_turnkey" || !suppliers.length) return;
    const bought = detailView.supplier
      ?? suppliers.find((v) => v.label === detailView.supply_vendor_name)?.id;
    setAssignVendorId(detailView.assigned_vendor || bought || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailView?.id, suppliers]);

  function resetTransition() {
    setTransitionTarget(null);
    setTransitionReason("");
    clearActivePhotos();
    setAssignTechnician("");
    setAssignDue("");
    setAssignVendorId("");
    setAssignSite("");
    setMaintDue("");
    setMaintTech("");
    setMaintPriority("high");
    setMaintInstructions("");
  }

  /** Assign the asset for installation — that is what opens its tracker job. */
  async function openInstallationJob(deviceId: string) {
    const turnkey = detailView?.source === "vendor_turnkey";
    if (!assignTechnician || !assignDue || !(assignSite || detailView?.current_site)) return;
    if (turnkey && !assignVendorId) return;
    setInstallLoading(true);
    try {
      await api.post(`/assets/devices/${deviceId}/transition/`, {
        status: "assigned",
        reason: "Assigned for installation",
        assigned_technician: assignTechnician,
        // The date the installation has to be finished by.
        installation_date: assignDue,
        ...(assignSite ? { current_site: assignSite } : {}),
        ...(turnkey
          ? {
              assigned_vendor: assignVendorId,
              assigned_vendor_contact: vendorContact(suppliers.find((v) => v.id === assignVendorId)),
            }
          : {}),
      });
      toast.success("Installation opened — it runs on the Installation Tracker from here");
      resetTransition();
      refreshDetail(deviceId);
      fetchRelatedData(deviceId);
      fetchDevices();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Could not open the installation"));
    } finally {
      setInstallLoading(false);
    }
  }

  async function handleStatusTransition(deviceId: string) {
    if (!transitionTarget || !transitionReason.trim()) return;
    const assigning = transitionTarget === "assigned";
    const turnkey = detailView?.source === "vendor_turnkey";
    if (assigning && !assignTechnician) return;
    if (assigning && turnkey && !assignVendorId) return;
    if (assigning && !assignSite && !detailView?.current_site) return;
    const goingDown = transitionTarget === "under_maintenance";
    if (goingDown && (!maintDue || !maintTech)) return;
    setTransitionLoading(true);
    try {
      // Photos go up first: if the upload fails the asset must not already be
      // marked Active without its installation evidence.
      if (activePhotos.length > 0) {
        const existing = detailView?.images?.length ?? 0;
        for (let i = 0; i < activePhotos.length; i++) {
          const form = new FormData();
          form.append("device", deviceId);
          form.append("image", activePhotos[i]);
          form.append("caption", `Installed asset — ${statusLabel(transitionTarget)}`);
          form.append("is_primary", i === 0 && existing === 0 ? "true" : "false");
          await api.post("/assets/device-images/", form, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }
      }

      await api.post(`/assets/devices/${deviceId}/transition/`, {
        status: transitionTarget,
        reason: transitionReason.trim(),
        ...(assigning
          ? {
              assigned_technician: assignTechnician,
              ...(assignDue ? { installation_date: assignDue } : {}),
              ...(assignSite ? { current_site: assignSite } : {}),
              ...(turnkey
                ? {
                    assigned_vendor: assignVendorId,
                    assigned_vendor_contact: vendorContact(suppliers.find((v) => v.id === assignVendorId)),
                  }
                : {}),
            }
          : {}),
        ...(goingDown
          ? {
              maintenance_due: maintDue,
              maintenance_assigned_to: maintTech,
              maintenance_priority: maintPriority,
              maintenance_instructions: maintInstructions.trim(),
            }
          : {}),
      });
      toast.success(`Status changed to ${statusLabel(transitionTarget)}`);
      resetTransition();
      refreshDetail(deviceId);
      fetchDevices();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Status change failed"));
    } finally {
      setTransitionLoading(false);
    }
  }

  function closeModal() {
    setCopyFrom("");
    setModalMode(null);
    setSelected(null);
    setImageFiles([]);
    setImagePreviews([]);
    // If the edit was launched from the detail view, take the user back there.
    if (returnToDetailId) {
      const id = returnToDetailId;
      setReturnToDetailId(null);
      api.get(`/assets/devices/${id}/`).then(({ data }) => {
        setDetailView(data);
        fetchRelatedData(id);
      }).catch(() => { /* stay on list */ });
    }
  }

  async function generateLabel(deviceId: string, format: "qr" | "code128") {
    setLabelLoading(true);
    try {
      const { data } = await api.post(`/assets/devices/${deviceId}/label/`, { format });
      setLabelModal({ url: data.generated_file, format });
    } catch (err) {
      toast.error(getApiError(err, "Failed to generate label"));
    } finally {
      setLabelLoading(false);
    }
  }

  function printLabel(url: string, code: string) {
    const w = window.open("", "_blank", "width=420,height=540");
    if (!w) { toast.error("Allow pop-ups to print labels"); return; }
    w.document.write(
      `<!doctype html><html><head><title>${code} label</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh"><img src="${url}" style="width:60mm" onload="setTimeout(function(){window.print();window.close()},250)" /></body></html>`
    );
    w.document.close();
  }

  function toggleRowSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // WF-05 polish: one PDF with one label per page for every checked row,
  // opened in a new tab (mirrors the backend cap of 200 ids per batch).
  async function printBulkLabels() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (ids.length > 200) {
      toast.error("At most 200 labels per batch — narrow your selection.");
      return;
    }
    setBulkLabelLoading(true);
    try {
      const { data } = await api.post(
        "/assets/devices/labels/",
        { ids, format: "qr" },
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
      const w = window.open(url, "_blank");
      if (!w) toast.error("Allow pop-ups to view the labels PDF");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to generate labels"));
    } finally {
      setBulkLabelLoading(false);
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setImageFiles((prev) => [...prev, ...files]);
    const previews = files.map((f) => URL.createObjectURL(f));
    setImagePreviews((prev) => [...prev, ...previews]);
  }

  function removeNewImage(idx: number) {
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
    setImagePreviews((prev) => {
      URL.revokeObjectURL(prev[idx]);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const missing = [
      !formAssetType && "an asset type",
      !String(fd.get("display_name") ?? "").trim() && "a name",
      !assetSource && "a manufacturing route",
    ].filter(Boolean);
    if (missing.length) {
      toast.error(`Give the asset ${missing.join(", ")}`);
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      // No serial here: the platform generates the asset code (and its
      // QR/barcode label), and the serial defaults to it.
      source: assetSource,
      ...(modalMode === "create" && copyFrom ? { copy_from: copyFrom } : {}),
      asset_type: formAssetType || null,
      display_name: fd.get("display_name") || "",
      length_in: fd.get("length_in") || null,
      width_in: fd.get("width_in") || null,
      depth_in: fd.get("depth_in") || null,
      diagonal_inches: fd.get("diagonal_inches") || null,
      dimension_unit: dimensionUnit,
      notes: fd.get("notes"),
      // Only a turnkey job has an installing vendor; both vendor routes have a
      // supplying one, and an in-house build has neither.
      assigned_vendor: assetSource === "vendor_turnkey" ? (assignVendorId || null) : null,
      assigned_vendor_contact: assetSource === "vendor_turnkey"
        ? vendorContact(suppliers.find((v) => v.id === assignVendorId))
        : "",
      // Who supplies the asset is settled by its purchase order, so this
      // form neither asks for it nor overwrites it.
      // Client, project, technician, purchase and installation dates are
      // produced by the work — the project, the tracker, procurement — so this
      // form neither asks for them nor overwrites them.
    };
    // Status is read-only on update — existing assets change status only via
    // the guarded /transition/ action in the detail view.
    if (modalMode === "create") payload.status = fd.get("status");
    try {
      let deviceId: string;
      if (modalMode === "create") {
        const { data } = await api.post("/assets/devices/", payload);
        deviceId = data.id;
        toast.success("Device registered");
      } else if (selected) {
        await api.patch(`/assets/devices/${selected.id}/`, payload);
        deviceId = selected.id;
        toast.success("Device updated");
      } else {
        return;
      }

      if (imageFiles.length > 0) {
        for (let i = 0; i < imageFiles.length; i++) {
          const imgForm = new FormData();
          imgForm.append("device", deviceId);
          imgForm.append("image", imageFiles[i]);
          imgForm.append("is_primary", i === 0 && !selected?.images?.length ? "true" : "false");
          await api.post("/assets/device-images/", imgForm, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }
      }

      closeModal();
      fetchDevices();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save device"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(device: Device) {
    if (!(await confirmAction(`Delete device "${device.asset_code}"? This cannot be undone.`))) return;
    try {
      await api.delete(`/assets/devices/${device.id}/`);
      toast.success("Device deleted");
      fetchDevices();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — device has linked records"));
    }
  }

  async function exportExcel() {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterValues.status) params.status = filterValues.status;
      // Flag tiles (?flag=…) — the expired-warranty dropdown maps to the same
      // backend semantics as the Warranty Expired tile.
      if (filterValues.flag) params.flag = filterValues.flag;
      else if (filterValues.warranty === "expired") params.flag = "warranty_expired";
      const siteId = filterValues.site ? devices.find((d) => d.site_name === filterValues.site)?.current_site : null;
      if (siteId) params.current_site = siteId;
      // Asset type filter holds the type NAME; the filterset wants the id.
      // Options load lazily, so fall back to fetching them for the lookup.
      if (filterValues.asset_type) {
        let typeId = assetTypes.find((t) => t.label === filterValues.asset_type)?.id;
        if (!typeId) {
          try {
            const { data } = await api.get("/assets/asset-types/", { params: { page_size: 200 } });
            const list: { id: string; name: string }[] = data.results ?? data;
            typeId = list.find((t) => t.name === filterValues.asset_type)?.id;
          } catch { /* unresolved — fall through */ }
        }
        if (typeId) params.asset_type = typeId;
      }
      // Client filter holds a NAME that may come from the primary client or the
      // M2M list; resolve an id from loaded options or the rows' primary ids.
      if (filterValues.client) {
        const clientId =
          clients.find((c) => c.label === filterValues.client)?.id ??
          devices.find((d) => d.client_name === filterValues.client && d.assigned_client)?.assigned_client;
        if (clientId) params.assigned_client = clientId;
        else toast.warning("Client filter could not be applied to the export");
      }
      const res = await api.get("/assets/devices/export/", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `assets-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  }

  const filtered = devices.filter((d) => {
    if (filterValues.status && d.status !== filterValues.status) return false;
    if (filterValues.asset_type && (d.asset_type_name || "") !== filterValues.asset_type) return false;
    if (filterValues.client && !(d.client_names ?? []).includes(filterValues.client) && (d.client_name || "") !== filterValues.client) return false;
    if (filterValues.site && (d.site_name || "") !== filterValues.site) return false;
    if (filterValues.warranty && (d.warranty_status || "none") !== filterValues.warranty) return false;
    if (filterValues.flag === "operational" && !["active", "installed"].includes(d.status)) return false;
    if (filterValues.flag === "warranty_expired" && d.warranty_status !== "expired") return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.asset_code.toLowerCase().includes(q) && !(d.serial_number || "").toLowerCase().includes(q) && !(d.display_name || "").toLowerCase().includes(q) && !(d.site_name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ─── DETAIL VIEW ─── */
  if (detailView) {
    const d = detailView;
    // Where this asset may go up: its own project's sites. Nothing falls back
    // to the full register — an asset with no project has nowhere named yet,
    // and saying so beats offering every site on the books.
    const installSites = (d.project_sites ?? []).map((s) => ({
      id: s.id,
      label: s.city ? `${s.name} · ${s.city}` : s.name,
    }));
    const allImages = [
      ...(d.image ? [{ id: "primary", image: d.image, caption: "Primary", is_primary: true }] : []),
      ...(d.images ?? []),
    ];
    const primaryImg = allImages[0]?.image ?? null;

    // The asset's own two covers. Component-scoped rows are excluded: a
    // part's manufacturer warranty is not what the vendor gave us, and
    // neither is what we gave the client.
    const assetWarranties = warranties.filter((w) => !w.component);
    const vendorWarranty = assetWarranties.find(
      (w) => w.warranty_type === "supplier" || w.warranty_type === "manufacturer",
    );
    const clientWarranty = assetWarranties.find(
      (w) => w.warranty_type === "client" || w.warranty_type === "extended",
    );

    return (
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/assets")} className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Assets
          </button>
          <div className="ml-auto flex gap-2">
            {canEdit && (
              <button onClick={() => generateLabel(d.id, "qr")} disabled={labelLoading} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-60">
                <QrCode className="h-4 w-4" /> {labelLoading ? "Generating…" : "QR Label"}
              </button>
            )}
            {canEdit && (
              <button onClick={() => openEdit(d)} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
                <Pencil className="h-4 w-4" /> Edit Asset
              </button>
            )}
          </div>
        </div>

        {/* Hero Header — Image + Metadata Grid + Quick Overview */}
        <div className="grid gap-6 lg:grid-cols-4">
          {/* Image + Name */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="flex flex-col sm:flex-row gap-6 p-6">
                {/* Device image */}
                <div className="shrink-0">
                  {primaryImg ? (
                    <img src={primaryImg} alt={d.asset_code} className="h-36 w-52 rounded-xl object-cover border border-border" />
                  ) : (
                    <div className="flex h-36 w-52 items-center justify-center rounded-xl bg-secondary/50 border border-border">
                      <Monitor className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}
                  {allImages.length > 1 && (
                    <div className="mt-2 flex gap-1.5">
                      {allImages.slice(0, 4).map((img) => (
                        <img key={img.id} src={img.image} alt={img.caption} className="h-10 w-12 rounded-md object-cover border border-border" />
                      ))}
                      {allImages.length > 4 && (
                        <div className="flex h-10 w-12 items-center justify-center rounded-md bg-secondary/50 text-2xs font-medium text-muted-foreground">+{allImages.length - 4}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Name + metadata grid */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-3 mb-4">
                    <StatusBadge status={d.status} label={d.status_display ?? statusLabel(d.status)} />
                    <div>
                      <h1 className="text-xl font-bold text-foreground leading-tight">{d.display_name || d.asset_type_name || d.asset_code}</h1>
                      {d.brand_name && <p className="text-sm text-muted-foreground">{d.brand_name}</p>}
                    </div>
                    {/* PR-01 polish: project contract chip (rental vs sold outright) */}
                    {d.project_contract_type && (
                      <span
                        className={`ml-auto inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                          d.project_contract_type === "rental"
                            ? "bg-amber-500/10 text-amber-600 ring-amber-500/20"
                            : "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
                        }`}
                        title={d.project_name ? `Project: ${d.project_name}` : undefined}
                      >
                        {d.project_contract_type === "rental"
                          ? d.project_rental_end_date
                            ? `Rental until ${formatDate(d.project_rental_end_date)}`
                            : "Rental"
                          : "Sold Outright"}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                    <div className="flex items-end gap-1">
                      <MetaField label="Asset ID" value={d.asset_code} mono />
                      <CopyButton text={d.asset_code} label="asset code" className="mb-0.5" />
                    </div>
                    <MetaField label="Asset Type" value={d.asset_type_name} />
                    <MetaField label="Project" value={d.project_name} highlight />
                    <MetaField label="Manufacturing Route" value={d.source_display} />
                    <MetaField label="Installation Date" value={d.installation_date ? formatDate(d.installation_date) : null} />
                    <MetaField label="Location" value={d.site_name} highlight />
                    <MetaField label="Status" value={d.status_display ?? statusLabel(d.status)} />
                    <MetaField
                      label="Dimensions"
                      value={
                        d.length_in && d.width_in
                          ? `${d.length_in} × ${d.width_in}${d.depth_in ? ` × ${d.depth_in}` : ""} ${d.dimension_unit ?? "in"}`
                          : d.diagonal_inches
                            ? `${d.diagonal_inches} ${d.dimension_unit ?? "in"} diagonal`
                            : null
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Overview sidebar */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Quick Overview</h3>
            <div className="space-y-3">
              <OverviewRow icon={<Package className="h-4 w-4 text-blue-400" />} label="Components" value={d.requires_production ? String((d.components ?? []).length) : "—"} />
              <OverviewRow icon={<HardDrive className="h-4 w-4 text-cyan-400" />} label="Manufacturing Route" value={d.source_display} />
              <OverviewRow icon={<Zap className="h-4 w-4 text-amber-400" />} label="Production Steps" value={d.requires_production ? String((d.production_steps ?? []).length) : "—"} />
              <OverviewRow icon={<Clock className="h-4 w-4 text-green-400" />} label="Batch" value={d.batch_number || "—"} />
              <OverviewRow icon={<Wrench className="h-4 w-4 text-purple-400" />} label="Last Maintenance" value={maintSchedules.length > 0 ? formatDate(maintSchedules[0].next_due) : "—"} />
            </div>
            {d.current_site && (
              <a
                href={`/sites?site=${d.current_site}`}
                className="mt-4 flex items-center justify-center gap-2 rounded-lg border border-primary/30 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
              >
                <MapPin className="h-3.5 w-3.5" /> View in Map
              </a>
            )}
          </div>
        </div>

        {/* Tabs + Content */}
        <div className="grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Tabs
                tabs={[
                  { key: "overview", label: "Product Details" },
                  { key: "warranties", label: "Warranties", count: warranties.length },
                  { key: "costs", label: "Costs & Pricing" },
                  { key: "documents", label: "Documents", count: documents.length },
                  { key: "maintenance", label: "Maintenance History", count: maintSchedules.length },
                ]}
                active={detailTab}
                onChange={setDetailTab}
              />
              <div className="p-6">
                {/* Product Details */}
                {detailTab === "overview" && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Asset Lifecycle</h4>
                      <LifecycleStepper requiresProduction={d.requires_production} status={d.status} stageDates={d.stage_dates ?? {}} />
                      {canMove && (
                        <div className="mt-4 rounded-lg border border-border bg-secondary/20 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Next stage
                          </p>
                          {/* The lifecycle follows the work: the build moves it
                              into stock, the tracker moves it through
                              installation, maintenance brings it back. Only the
                              two end states below are somebody's decision. */}
                          <p className="mb-2 text-2xs text-muted-foreground">
                            {LIFECYCLE_SOURCE[d.status] ?? "Stages advance with the work. Client Property and Decommissioned are set here."}
                          </p>
                          {(d.allowed_transitions ?? []).filter((s) => MANUAL_STATUSES.includes(s)).length > 0 ? (
                            <>
                              <div className="flex flex-wrap gap-2">
                                {(d.allowed_transitions ?? []).filter((s) => MANUAL_STATUSES.includes(s)).map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => { const next = transitionTarget === s ? null : s; resetTransition(); setTransitionTarget(next); if (next === "under_maintenance") setMaintTech(d.assigned_technician ?? ""); }}
                                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${transitionTarget === s ? "bg-primary/10 text-primary ring-primary/30" : "text-muted-foreground ring-border hover:bg-secondary"}`}
                                  >
                                    <ChevronRight className="h-3 w-3" /> {statusLabel(s)}
                                  </button>
                                ))}
                              </div>
                              {transitionTarget && (
                                <div className="mt-3 space-y-2">
                                  <p className="text-xs font-medium text-foreground">
                                    Move from “{statusLabel(d.status)}” to “{statusLabel(transitionTarget)}”
                                  </p>
                                  {/* Assigning must say who it went to. */}
                                  {transitionTarget === "assigned" && (
                                    <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
                                      <p className="text-xs font-medium text-foreground">
                                        {d.source === "vendor_turnkey"
                                          ? "Installing vendor & oversight"
                                          : "Assign to technician"}
                                      </p>
                                      {/* Same rule as registration: only a
                                          turnkey job has an outside crew doing
                                          the installing. Who *supplied* the
                                          asset is recorded in Edit Asset. */}
                                      {d.source === "vendor_turnkey" && (
                                        <div className="grid gap-2 sm:grid-cols-2">
                                          <select
                                            value={assignVendorId}
                                            onChange={(e) => setAssignVendorId(e.target.value)}
                                            className={`${inputClass} h-9 text-xs`}
                                          >
                                            <option value="">Vendor installing it…</option>
                                            {suppliers.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                                          </select>
                                          <div className={`${inputClass} flex h-9 items-center text-xs`}>
                                            {vendorContact(suppliers.find((v) => v.id === assignVendorId))
                                              || <span className="text-muted-foreground">Contact comes from the vendor</span>}
                                          </div>
                                        </div>
                                      )}
                                      <select
                                        value={assignTechnician}
                                        onChange={(e) => setAssignTechnician(e.target.value)}
                                        className={`${inputClass} h-9 text-xs`}
                                      >
                                        <option value="">
                                          {d.source === "vendor_turnkey"
                                            ? "Technician overseeing…"
                                            : "Select technician…"}
                                        </option>
                                        {technicians.map((t) => (
                                          <option key={t.id} value={t.id}>{t.label}</option>
                                        ))}
                                      </select>
                                      <p className="text-2xs text-muted-foreground">
                                        {d.source === "vendor_turnkey"
                                          ? "The vendor supplies and installs it; our technician oversees."
                                          : d.source === "vendor_supplied"
                                            ? "The vendor supplies the asset; our own technician installs it."
                                            : "Details come from the manpower records."}
                                      </p>

                                      {/* Assigning opens the job on the
                                          Installation Tracker, which needs to
                                          know where the work happens. */}
                                      <select
                                        value={assignSite || d.current_site || ""}
                                        onChange={(e) => setAssignSite(e.target.value)}
                                        className={`${inputClass} h-9 text-xs`}
                                      >
                                        <option value="">Select site…</option>
                                        {sites.map((site) => (
                                          <option key={site.id} value={site.id}>{site.label}</option>
                                        ))}
                                      </select>
                                      <p className="text-2xs text-muted-foreground">
                                        This opens the asset&apos;s job on the Installation Tracker.
                                      </p>
                                    </div>
                                  )}

                                  {/* The registry and the maintenance register
                                      are two views of the same event, so say
                                      what this change does to the other one. */}
                                  {d.status === "under_maintenance" && (
                                    <p className="rounded-lg border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground">
                                      The open maintenance job is closed off with a completion record
                                      against your notes.
                                    </p>
                                  )}

                                  <textarea
                                    value={transitionReason}
                                    onChange={(e) => setTransitionReason(e.target.value)}
                                    placeholder={transitionTarget === "under_maintenance"
                                      ? "What is wrong with it? (required — becomes the job title)"
                                      : d.status === "under_maintenance"
                                        ? "What was done (required — filed as the completion record)"
                                        : "Reason for status change (required)"}
                                    rows={2}
                                    className={`${inputClass} h-auto py-2 text-xs`}
                                  />

                                  {transitionTarget === "under_maintenance" && (
                                    <div className="space-y-2.5 rounded-lg border border-border bg-secondary/20 p-3">
                                      <div>
                                        <p className="text-xs font-medium text-foreground">Corrective maintenance job</p>
                                        <p className="text-2xs text-muted-foreground">
                                          Raised in Maintenance the moment the asset goes down. When the technician
                                          completes it there, the asset returns to Active on its own.
                                        </p>
                                      </div>
                                      <div className="grid gap-2 sm:grid-cols-3">
                                        <div className="space-y-1">
                                          <label className="text-2xs font-medium text-muted-foreground">Technician *</label>
                                          <select
                                            value={maintTech}
                                            onChange={(e) => setMaintTech(e.target.value)}
                                            className={`${inputClass} h-9 text-xs`}
                                          >
                                            <option value="">Select…</option>
                                            {technicians.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                                          </select>
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-2xs font-medium text-muted-foreground">Repair due by *</label>
                                          <input
                                            type="date"
                                            value={maintDue}
                                            min={todayIso()}
                                            onChange={(e) => setMaintDue(e.target.value)}
                                            className={`${inputClass} h-9 text-xs`}
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <label className="text-2xs font-medium text-muted-foreground">Priority</label>
                                          <select
                                            value={maintPriority}
                                            onChange={(e) => setMaintPriority(e.target.value)}
                                            className={`${inputClass} h-9 text-xs`}
                                          >
                                            <option value="high">High</option>
                                            <option value="medium">Medium</option>
                                            <option value="low">Low</option>
                                          </select>
                                        </div>
                                      </div>
                                      <textarea
                                        value={maintInstructions}
                                        onChange={(e) => setMaintInstructions(e.target.value)}
                                        placeholder="Instructions for the technician (optional) — parts to take, access notes…"
                                        rows={2}
                                        className={`${inputClass} h-auto py-2 text-xs`}
                                      />
                                    </div>
                                  )}

                                  {/* Installation photos belong to the tracker
                                      now; what is left here is proof the asset
                                      is fixed and running again. */}
                                  {transitionTarget === "active" && (
                                    <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
                                      <p className="text-xs font-medium text-foreground">
                                        Photo of the repaired asset
                                      </p>
                                      <div className="flex flex-wrap gap-2">
                                        {activePhotoPreviews.map((src, i) => (
                                          <div key={src} className="group relative">
                                            <img
                                              src={src}
                                              alt={`Repair photo ${i + 1}`}
                                              className="h-20 w-20 rounded-lg border border-border object-cover"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => removeActivePhoto(i)}
                                              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white opacity-0 transition-opacity group-hover:opacity-100"
                                              title="Remove"
                                            >
                                              <X className="h-3 w-3" />
                                            </button>
                                          </div>
                                        ))}
                                        <button
                                          type="button"
                                          onClick={() => activePhotoInputRef.current?.click()}
                                          className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                                        >
                                          <ImagePlus className="h-5 w-5" />
                                          <span className="mt-1 text-2xs">Add Photo</span>
                                        </button>
                                        <input
                                          ref={activePhotoInputRef}
                                          type="file"
                                          accept="image/*"
                                          multiple
                                          capture="environment"
                                          className="hidden"
                                          onChange={handleActivePhotoSelect}
                                        />
                                      </div>
                                      <p className="text-2xs text-muted-foreground">
                                        {activePhotos.length > 0
                                          ? `${activePhotos.length} photo${activePhotos.length === 1 ? "" : "s"} will be attached to this asset.`
                                          : "Attach a photo of the asset back in service (optional)."}
                                      </p>
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      onClick={resetTransition}
                                      className="h-8 flex-1 rounded-lg border border-border text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleStatusTransition(d.id)}
                                      disabled={
                                        transitionLoading || !transitionReason.trim() ||
                                        (transitionTarget === "under_maintenance" && (!maintDue || !maintTech)) ||
                                        (transitionTarget === "assigned" && (
                                          !assignTechnician ||
                                          !(assignSite || d.current_site) ||
                                          (d.source === "vendor_turnkey" && !assignVendorId)
                                        ))
                                      }
                                      className="h-8 flex-1 rounded-lg bg-primary text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                                    >
                                      {transitionLoading ? "..." : "Confirm"}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              No action required at this stage.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Only an in-house build has a bill of materials of ours;
                        for vendor routes the section stays visible but inert. */}
                    {!d.requires_production && (
                      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-semibold text-foreground">Complete asset from the vendor</h4>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {d.source_display} — bought whole on a purchase order, so it has no components or
                              production route of its own. Its price and warranty come from the order.
                            </p>
                          </div>
                          <span className="rounded-full bg-card px-2.5 py-0.5 text-2xs font-medium text-indigo-600 ring-1 ring-indigo-500/20">
                            {d.status_display ?? statusLabel(d.status)}
                          </span>
                        </div>
                        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-4">
                          <div><dt className="text-2xs uppercase tracking-wider text-muted-foreground">Vendor</dt><dd className="text-foreground">{d.supply_vendor_name || d.supplier_name || "—"}</dd></div>
                          <div><dt className="text-2xs uppercase tracking-wider text-muted-foreground">Price</dt><dd className="text-foreground">{d.purchase_price ? `PKR ${Number(d.purchase_price).toLocaleString()}` : "—"}</dd></div>
                          <div><dt className="text-2xs uppercase tracking-wider text-muted-foreground">Purchase order</dt><dd className="font-mono text-foreground">{d.procurement_po_number ?? (d.procurement_requested_at ? "Awaiting PO" : "—")}</dd></div>
                          <div><dt className="text-2xs uppercase tracking-wider text-muted-foreground">Project</dt><dd className="text-foreground">{d.project_name ?? "—"}</dd></div>
                        </dl>
                        <p className="mt-3 text-2xs text-muted-foreground">
                          {d.status === "procured"
                            ? d.procurement_po_number
                              ? "On order — it comes into stock when the delivery is received against the PO."
                              : d.project_name
                                ? "Awaiting the project's Execution decision to procure it, then the PO in Procurement."
                                : "Awaiting its purchase order in Procurement → Procurement Requests."
                            : d.status === "in_stock"
                              ? "In stock — assign it to a site above to open its installation."
                              : ""}
                        </p>
                      </div>
                    )}
                    {d.requires_production && (<>
                    <div className={d.requires_production ? undefined : "opacity-60"}>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">Components</h4>
                        <div className="flex items-center gap-3">
                          {d.project_name && (
                            <span className="text-xs text-muted-foreground">Project: <span className="font-medium text-foreground">{d.project_name}</span></span>
                          )}
                        </div>
                      </div>
                      {!d.requires_production && (
                        <p className="mb-3 rounded-lg border border-dashed border-border px-3 py-2 text-2xs text-muted-foreground">
                          {d.source_display} — this asset arrives complete from the vendor, so it is
                          not built from our inventory.
                        </p>
                      )}
                      {d.is_locked && (
                        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-2xs text-amber-700">
                          Locked — this asset is in execution{d.project_name ? ` under ${d.project_name}` : ""}. Its components
                          and production route are fixed now; only its status can change.
                        </p>
                      )}
                      {(d.components ?? []).length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-border">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-border bg-secondary/50 text-left text-muted-foreground">
                                <th className="px-3 py-2 font-medium">Component</th>
                                <th className="px-3 py-2 font-medium">Type</th>
                                <th className="px-3 py-2 font-medium">Serial #</th>
                                <th className="px-3 py-2 font-medium">Required</th>
                                <th className="px-3 py-2 font-medium">In Stock</th>
                                <th className="px-3 py-2 font-medium">From Inventory</th>
                                <th className="px-3 py-2 font-medium">Fulfilment</th>
                                {canEdit && <th className="px-3 py-2" />}
                              </tr>
                            </thead>
                            <tbody>
                              {(d.components ?? []).map((cmp) => (
                                <tr key={cmp.id} className="border-b border-border/60 last:border-0">
                                  <td className="px-3 py-2 font-medium text-foreground">{cmp.name}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{cmp.component_type || "—"}</td>
                                  <td className="px-3 py-2 font-mono text-muted-foreground">
                                    {/* The particular units in this asset. */}
                                    {(cmp.fitted_serials ?? []).length > 0
                                      ? cmp.fitted_serials!.map((sn) => (
                                          <span key={sn} className="block text-foreground">{sn}</span>
                                        ))
                                      : cmp.serial_number || "—"}
                                  </td>
                                  <td className="px-3 py-2 text-foreground">
                                    {compEdit?.id === cmp.id ? (
                                      <input
                                        type="number"
                                        min={1}
                                        value={compEdit.quantity}
                                        onChange={(e) => setCompEdit({ id: cmp.id, quantity: Math.max(1, Number(e.target.value) || 1) })}
                                        aria-label="Quantity"
                                        className="h-7 w-16 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                                      />
                                    ) : (
                                      <Qty value={cmp.quantity} unit={cmp.unit} prefix="×" />
                                    )}
                                    {cmp.issued_quantity > 0 && (
                                      <span className="block text-2xs text-muted-foreground">
                                        {cmp.issued_quantity} issued
                                      </span>
                                    )}
                                  </td>
                                  <td className={`px-3 py-2 ${(cmp.available_quantity ?? 0) < cmp.outstanding_quantity ? "text-amber-600" : "text-muted-foreground"}`}>
                                    {cmp.available_quantity ?? "—"}
                                  </td>
                                  <td className="px-3 py-2 text-muted-foreground">{cmp.source_label || "—"}</td>
                                  <td className="px-3 py-2">
                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${
                                      FULFILMENT_BADGES[cmp.fulfilment] ?? "bg-secondary text-muted-foreground ring-border"
                                    }`}>
                                      {FULFILMENT_LABELS[cmp.fulfilment] ?? cmp.fulfilment}
                                    </span>
                                    {cmp.po_number && (
                                      <span className="block font-mono text-2xs text-muted-foreground">{cmp.po_number}</span>
                                    )}
                                  </td>
                                  {canEdit && (
                                    <td className="px-3 py-2 text-right">
                                      {compEdit?.id === cmp.id ? (
                                        <span className="inline-flex items-center gap-1.5">
                                          <button type="button" onClick={() => saveComponentEdit(d.id)} className="text-emerald-600 transition-colors hover:text-emerald-700" title="Save quantity">
                                            <Check className="h-3.5 w-3.5" />
                                          </button>
                                          <button type="button" onClick={() => setCompEdit(null)} className="text-muted-foreground transition-colors hover:text-foreground" title="Cancel">
                                            <X className="h-3.5 w-3.5" />
                                          </button>
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-2">
                                          <button type="button" onClick={() => setCompEdit({ id: cmp.id, quantity: cmp.quantity })} disabled={!d.requires_production || d.is_locked} className="text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50" title="Edit quantity">
                                            <Pencil className="h-3.5 w-3.5" />
                                          </button>
                                          <button onClick={() => handleDeleteComponent(cmp.id, d.id)} disabled={!d.requires_production || d.is_locked} className="text-muted-foreground transition-colors hover:text-destructive disabled:pointer-events-none disabled:opacity-50" title="Remove component">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </span>
                                      )}
                                    </td>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No components recorded — single-unit asset.</p>
                      )}
                      {canEdit && (
                        <form onSubmit={(e) => handleAddComponent(e, d.id)} noValidate className="mt-2">
                          <fieldset disabled={!d.requires_production || d.is_locked} className="space-y-2">
                            <p className="text-2xs text-muted-foreground">
                              What this asset is built from. Stock is not reduced here — the project decides
                              later whether to take each line from inventory or procure it.
                            </p>
                            <div className="flex flex-wrap items-end gap-2">
                              <select
                                value={compSource}
                                onChange={(e) => { setCompSource(e.target.value as "generic" | "unique"); setCompItemId(""); setCompUnitType(""); setCompQty("1"); }}
                                className="h-8 w-32 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                              >
                                <option value="generic">Stock item</option>
                                <option value="unique">Unique item</option>
                              </select>

                              {compSource === "generic" ? (
                                <select
                                  value={compItemId}
                                  onChange={(e) => setCompItemId(e.target.value)}
                                  required
                                  className="h-8 w-72 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                                >
                                  <option value="">Select stock item…</option>
                                  {/* Every known item, including ones at zero. */}
                                  {stockItems.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.material_name ?? s.sku} · {s.quantity} {s.unit || "piece"} in stock
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <select
                                  value={compUnitType}
                                  onChange={(e) => setCompUnitType(e.target.value)}
                                  required
                                  className="h-8 w-72 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                                >
                                  <option value="">
                                    {stockProducts.length === 0 ? "No unique items opened yet" : "Select unique item…"}
                                  </option>
                                  {stockProducts.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {[p.name, p.model_name].filter(Boolean).join(" ")} · {p.in_stock_count} {p.unit || "piece"} in stock
                                    </option>
                                  ))}
                                </select>
                              )}

                              <div className="flex items-center gap-1">
                                <label htmlFor="comp_qty" className="text-2xs text-muted-foreground">Qty needed</label>
                                <input
                                  id="comp_qty"
                                  type="number"
                                  min={1}
                                  value={compQty}
                                  onChange={(e) => setCompQty(e.target.value)}
                                  className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                                />
                                {compSelected && <span className="text-2xs text-muted-foreground">{compUnit}</span>}
                              </div>

                              <button
                                type="submit"
                                disabled={!compSelected}
                                className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                              >
                                Add
                              </button>
                            </div>

                            {compSelected && Number(compQty) > compAvailable && (
                              <p className="text-2xs text-amber-600">
                                Only {compAvailable} {compUnit} in stock — the shortfall can be procured from the project.
                              </p>
                            )}
                          </fieldset>
                        </form>
                      )}
                    </div>
                    <div className={d.requires_production ? undefined : "opacity-60"}>
                      <h4 className="mb-3 text-sm font-semibold text-foreground">Production Route</h4>
                      <ProductionRoute
                        deviceId={d.id}
                        steps={d.production_steps ?? []}
                        onChanged={() => refreshDetail(d.id)}
                        assetTypeName={d.asset_type_name}
                        readOnly={!d.requires_production}
                        readOnlyReason={d.source_display}
                        locked={d.is_locked}
                      />
                    </div>
                    </>)}
                    {/* Who puts it in and switches it on. Assigning here is
                        what opens the job on the Installation Tracker; the
                        technician's work there is what moves the asset to
                        Installed and then Active. */}
                    <div>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-sm font-semibold text-foreground">Installation &amp; Activation</h4>
                        {installation && (
                          <Link
                            href={`/installation-tracker?device=${d.id}`}
                            className="inline-flex items-center gap-1 text-2xs font-medium text-primary hover:underline"
                          >
                            Open in Installation Tracker <ChevronRight className="h-3 w-3" />
                          </Link>
                        )}
                      </div>
                      {installation ? (
                        <div className="rounded-xl border border-border p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <dl className="grid flex-1 gap-3 text-xs sm:grid-cols-4">
                              <div>
                                <dt className="text-2xs uppercase tracking-wider text-muted-foreground">Site</dt>
                                <dd className="text-foreground">{installation.site_name ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-2xs uppercase tracking-wider text-muted-foreground">Technician</dt>
                                <dd className="text-foreground">{installation.installed_by_name || installation.vendor_display || "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-2xs uppercase tracking-wider text-muted-foreground">Due</dt>
                                <dd className="text-foreground">{installation.due_date ?? "—"}</dd>
                              </div>
                              <div>
                                <dt className="text-2xs uppercase tracking-wider text-muted-foreground">Steps</dt>
                                <dd className="text-foreground">
                                  {installation.steps_done ?? 0} of {installation.steps_total ?? 0} done
                                </dd>
                              </div>
                            </dl>
                            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-2xs font-medium ring-1 ${
                              installation.completed_at
                                ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20"
                                : "bg-amber-500/10 text-amber-600 ring-amber-500/20"
                            }`}>
                              {installation.completed_at ? "Checklist complete" : "On site"}
                            </span>
                          </div>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${installation.progress ?? 0}%` }} />
                          </div>
                          <p className="mt-2 text-2xs text-muted-foreground">
                            {d.status === "active"
                              ? "Active — the technician activated it on site with a photo."
                              : d.status === "installed"
                                ? "Installed. It becomes Active when the technician activates it in the tracker, with a photo."
                                : "The asset becomes Installed when the checklist there is finished, and Active when the technician activates it."}
                          </p>
                        </div>
                      ) : canAny("edit_assets", "assign_installation") && (d.allowed_transitions ?? []).includes("assigned") ? (
                        <div className="space-y-2.5 rounded-xl border border-border p-4">
                          <p className="text-xs text-muted-foreground">
                            {d.current_site
                              ? "Say who puts it in. That opens the job on the Installation Tracker and the asset follows it from there — no status is typed in."
                              : "Say where it goes and who puts it in. That opens the job on the Installation Tracker and the asset follows it from there — no status is typed in."}
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {/* The site was settled when the asset was scoped to
                                the project. Asking again would let somebody send
                                it where the project never agreed to. */}
                            {d.current_site ? (
                              <div
                                id="install_site"
                                className={`${inputClass} flex h-9 items-center justify-between gap-2 text-xs`}
                              >
                                <span className="truncate text-foreground">{d.site_name ?? "Site set on the project"}</span>
                                <span className="shrink-0 text-2xs text-muted-foreground">from the project</span>
                              </div>
                            ) : (
                              <select
                                id="install_site"
                                value={assignSite}
                                onChange={(e) => setAssignSite(e.target.value)}
                                className={`${inputClass} h-9 text-xs`}
                              >
                                {/* An asset goes up at one of the places its
                                    own project is for. Offering all 23 sites
                                    on the books invited it to be sent
                                    somewhere the order never mentioned. */}
                                <option value="">
                                  {installSites.length ? "Select site…" : "No site on this project"}
                                </option>
                                {installSites.map((site) => (
                                  <option key={site.id} value={site.id}>{site.label}</option>
                                ))}
                              </select>
                            )}
                            <select
                              id="install_technician"
                              value={assignTechnician}
                              onChange={(e) => setAssignTechnician(e.target.value)}
                              className={`${inputClass} h-9 text-xs`}
                            >
                              <option value="">
                                {d.source === "vendor_turnkey" ? "Technician overseeing…" : "Select technician…"}
                              </option>
                              {technicians.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                            </select>
                          </div>
                          {d.source === "vendor_turnkey" && (
                            <div className="grid gap-2 sm:grid-cols-2">
                              <select
                                id="install_vendor"
                                value={assignVendorId}
                                onChange={(e) => setAssignVendorId(e.target.value)}
                                className={`${inputClass} h-9 text-xs`}
                              >
                                <option value="">Vendor installing it…</option>
                                {suppliers.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                              </select>
                              <div id="install_vendor_contact" className={`${inputClass} flex h-9 items-center text-xs`}>
                                {vendorContact(suppliers.find((v) => v.id === assignVendorId))
                                  || <span className="text-muted-foreground">Contact comes from the vendor</span>}
                              </div>
                            </div>
                          )}
                          {/* Agreed here, with whoever is taking the job, rather
                              than left blank on the tracker for somebody to
                              guess at afterwards. */}
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div className="space-y-1">
                              <label htmlFor="install_due" className="text-2xs font-medium text-muted-foreground">
                                Due by
                              </label>
                              <input
                                id="install_due"
                                type="date"
                                min={todayIso()}
                                value={assignDue}
                                onChange={(e) => setAssignDue(e.target.value)}
                                className={`${inputClass} h-9 text-xs`}
                              />
                            </div>
                          </div>
                          <p className="text-2xs text-muted-foreground">
                            {d.source === "vendor_turnkey"
                              ? "The vendor supplies and installs it; our technician oversees."
                              : d.source === "vendor_supplied"
                                ? "The vendor supplies the asset; our own technician installs it."
                                : "Details come from the manpower records."}
                          </p>
                          <button
                            type="button"
                            onClick={() => openInstallationJob(d.id)}
                            disabled={
                              installLoading || !assignTechnician || !assignDue ||
                              !(assignSite || d.current_site) ||
                              (d.source === "vendor_turnkey" && !assignVendorId)
                            }
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                          >
                            {installLoading ? "Opening…" : "Assign & open installation"}
                          </button>
                        </div>
                      ) : (
                        <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                          {["procured", "in_production"].includes(d.status)
                            ? d.requires_production
                              ? "Available once the build is finished and the asset is in stock."
                              : "Available once the asset has been received into stock."
                            : ["installed", "active", "under_maintenance", "client_property", "decommissioned"].includes(d.status)
                              ? "No installation job on record — this asset was not put in through the tracker."
                              : `Not available while the asset is “${statusLabel(d.status)}”.`}
                        </p>
                      )}
                    </div>
                    {/* One history, not two. A fault is reported as a
                        ticket and worked as a corrective job — listing
                        both put the same visit on the screen twice and
                        made three repairs look like seven. Each job is
                        one row, saying what set it off. */}
                    {(() => {
                      const ticketOf = new Map(
                        deviceTickets.map((t) => [t.id, t] as const),
                      );
                      const jobs = maintSchedules.map((m) => {
                        const corrective = m.maintenance_type === "corrective";
                        const t = m.ticket ? ticketOf.get(m.ticket) : undefined;
                        return {
                          ...m,
                          corrective,
                          ticket_number: m.ticket_number ?? t?.ticket_number ?? null,
                          occurrence: t?.occurrence ?? null,
                          done: m.status === "completed",
                        };
                      });
                      const corrective = jobs.filter((j) => j.corrective);
                      const preventive = jobs.filter((j) => !j.corrective);
                      const openNow = jobs.filter((j) => !j.done);
                      /* A ticket with no job behind it has not been worked
                         yet; it still belongs on the asset's history. */
                      const unworked = deviceTickets.filter(
                        (t) => !jobs.some((j) => j.ticket === t.id),
                      );

                      const Tile = ({ label, value, tone }: {
                        label: string; value: number; tone: string;
                      }) => (
                        <div className="rounded-lg bg-secondary/30 px-3 py-2">
                          <p className={`text-lg font-bold leading-tight ${tone}`}>{value}</p>
                          <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
                        </div>
                      );

                      return (
                        <div>
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <h4 className="text-sm font-semibold text-foreground">Service history</h4>
                            <button
                              type="button"
                              onClick={() => setDetailTab("maintenance")}
                              className="text-2xs font-medium text-primary hover:underline"
                            >
                              View all ({jobs.length + unworked.length}) →
                            </button>
                          </div>

                          <div className="rounded-xl border border-border p-4">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <Tile label="Jobs" value={jobs.length} tone="text-foreground" />
                              <Tile label="Corrective" value={corrective.length} tone="text-amber-600" />
                              <Tile label="Preventive" value={preventive.length} tone="text-sky-600" />
                              <Tile label="Open now" value={openNow.length}
                                tone={openNow.length ? "text-red-600" : "text-emerald-600"} />
                            </div>

                            {jobs.length === 0 && unworked.length === 0 ? (
                              <p className="mt-3 rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                                Nothing has been done to this asset yet.
                              </p>
                            ) : (
                              <div className="mt-3 divide-y divide-border/60">
                                {jobs.slice(0, 3).map((j) => (
                                  <Link
                                    key={j.id}
                                    href={`/maintenance?kind=${j.corrective ? "corrective" : "preventive"}#job-${j.id}`}
                                    className="flex items-center gap-3 px-1 py-2 text-xs transition-colors hover:bg-secondary/40"
                                  >
                                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${
                                      j.corrective
                                        ? "bg-amber-500/10 text-amber-600 ring-amber-500/20"
                                        : "bg-sky-500/10 text-sky-600 ring-sky-500/20"
                                    }`}>
                                      {j.corrective ? "Corrective" : "Preventive"}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-foreground">{j.title}</span>
                                    {/* What set it off: a fault somebody
                                        reported, or the calendar. */}
                                    <span className="hidden shrink-0 text-muted-foreground sm:block">
                                      {j.ticket_number
                                        ? `${j.ticket_number}${j.occurrence ? ` · #${j.occurrence}` : ""}`
                                        : j.frequency
                                          ? j.frequency.replace(/_/g, " ")
                                          : "Scheduled"}
                                    </span>
                                    <span className={`shrink-0 ${
                                      j.done ? "text-emerald-600" : "text-amber-600"
                                    }`}>
                                      {j.done ? "Completed" : j.status.replace(/_/g, " ")}
                                    </span>
                                  </Link>
                                ))}
                                {unworked.slice(0, Math.max(0, 3 - jobs.length)).map((t) => (
                                  <Link
                                    key={t.id}
                                    href={`/tickets?open=${t.id}`}
                                    className="flex items-center gap-3 px-1 py-2 text-xs transition-colors hover:bg-secondary/40"
                                  >
                                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-2xs font-medium text-muted-foreground ring-1 ring-border">
                                      Reported
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-foreground">{t.title}</span>
                                    <span className="hidden shrink-0 text-muted-foreground sm:block">
                                      {t.ticket_number}
                                    </span>
                                    <span className="shrink-0 text-muted-foreground">
                                      {t.status.replace(/_/g, " ")}
                                    </span>
                                  </Link>
                                ))}
                                {jobs.length + unworked.length > 3 && (
                                  <button
                                    type="button"
                                    onClick={() => setDetailTab("maintenance")}
                                    className="px-1 pt-2 text-2xs text-primary hover:underline"
                                  >
                                    +{jobs.length + unworked.length - 3} more in Maintenance History
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Assignment for Installation</h4>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <InfoCard label="Site" value={d.site_name} />
                        <InfoCard label="Client" value={(d.client_names ?? []).length > 0 ? d.client_names.join(", ") : d.client_name} />
                        <div className="rounded-lg bg-secondary/30 px-4 py-3">
                          <p className="mb-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">Assigned To</p>
                          <p className="text-sm font-medium text-foreground">
                            {d.assigned_to_display ?? d.technician_name ?? "—"}
                          </p>
                          {d.technician_phone && (
                            <p className="text-2xs text-muted-foreground">{d.technician_phone}</p>
                          )}
                        </div>
                        <InfoCard label="Installation Date" value={d.installation_date ? formatDate(d.installation_date) : null} />
                      </div>
                    </div>
                    {d.notes && (
                      <div>
                        <h4 className="text-sm font-semibold text-foreground mb-2">Notes</h4>
                        <p className="text-sm text-muted-foreground bg-secondary/30 rounded-lg p-3">{d.notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Warranties */}
                {detailTab === "warranties" && (() => {
                  // Two different things get called "warranty" on an asset, so
                  // they are shown apart rather than in one flat list:
                  //   · what covers the asset coming in — the parts' own cover
                  //     on an in-house build, or the vendor's cover on the
                  //     whole thing when we did not build it
                  //   · what we in turn warrant to the client
                  const ours = warranties.filter((w) => w.warranty_type === "client");
                  const componentCover = warranties.filter((w) => w.component);
                  const vendorCover = warranties.filter((w) => !w.component && w.warranty_type !== "client");
                  const incoming = [...vendorCover, ...componentCover];
                  const incomingLabel = d.requires_production
                    ? "Component Warranties"
                    : "Vendor Warranty";
                  const incomingHint = d.requires_production
                    ? "Cover the individual parts brought with them from inventory."
                    : "What the vendor warrants to us on the complete asset.";

                  return (
                    <div className="space-y-8">
                      <div>
                        <h4 className="text-sm font-semibold text-foreground">{incomingLabel}</h4>
                        <p className="mb-3 text-xs text-muted-foreground">{incomingHint}</p>
                        {incoming.length > 0 ? (
                          <div className="space-y-4">
                            {incoming.map((w) => (
                          <div key={w.id} className="rounded-xl border border-border p-5 flex flex-col sm:flex-row sm:items-start gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${WARRANTY_COLORS[w.warranty_type] ?? "#6366f1"}15` }}>
                              <Shield className="h-5 w-5" style={{ color: WARRANTY_COLORS[w.warranty_type] ?? "#6366f1" }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-semibold text-foreground">
                                  {w.component_name ?? (WARRANTY_TYPE_LABELS[w.warranty_type] ?? w.warranty_type)}
                                </h4>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ${w.is_expired ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"}`}>
                                  {w.is_expired ? "Expired" : "Active"}
                                </span>
                                {w.component_name && (
                                  <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs text-muted-foreground">
                                    {WARRANTY_TYPE_LABELS[w.warranty_type] ?? w.warranty_type}
                                  </span>
                                )}
                              </div>
                              {w.supplier_name && <p className="text-xs text-muted-foreground mb-1">Provider: {w.supplier_name}</p>}
                              <p className="text-xs text-muted-foreground">{w.coverage_details || "Comprehensive coverage"}</p>
                              <div className="flex items-center gap-4 mt-2">
                                <span className="text-2xs text-muted-foreground">
                                  <Calendar className="inline h-3 w-3 mr-1" />{formatDate(w.start_date)} → {formatDate(w.end_date)}
                                </span>
                                {w.reference_number && <span className="text-2xs text-muted-foreground">Ref: {w.reference_number}</span>}
                              </div>
                              <div className="mt-3">
                                <WarrantyTimeline start={w.start_date} end={w.end_date} color={WARRANTY_COLORS[w.warranty_type] ?? "#6366f1"} />
                              </div>
                            </div>
                          </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                            {d.requires_production
                              ? "None of this asset's components carry a warranty."
                              : "No vendor warranty recorded. Warranties are raised under Warranties."}
                          </p>
                        )}
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-foreground">Client Warranty</h4>
                        <p className="mb-3 text-xs text-muted-foreground">
                          What we warrant to the client the asset is installed for.
                        </p>
                        {ours.length > 0 ? (
                          <div className="space-y-4">
                            {ours.map((w) => (
                          <div key={w.id} className="rounded-xl border border-border p-5 flex flex-col sm:flex-row sm:items-start gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${WARRANTY_COLORS[w.warranty_type] ?? "#6366f1"}15` }}>
                              <Shield className="h-5 w-5" style={{ color: WARRANTY_COLORS[w.warranty_type] ?? "#6366f1" }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-semibold text-foreground">
                                  {w.component_name ?? (WARRANTY_TYPE_LABELS[w.warranty_type] ?? w.warranty_type)}
                                </h4>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ${w.is_expired ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-600"}`}>
                                  {w.is_expired ? "Expired" : "Active"}
                                </span>
                                {w.component_name && (
                                  <span className="rounded-full bg-secondary px-2 py-0.5 text-2xs text-muted-foreground">
                                    {WARRANTY_TYPE_LABELS[w.warranty_type] ?? w.warranty_type}
                                  </span>
                                )}
                              </div>
                              {w.supplier_name && <p className="text-xs text-muted-foreground mb-1">Provider: {w.supplier_name}</p>}
                              <p className="text-xs text-muted-foreground">{w.coverage_details || "Comprehensive coverage"}</p>
                              <div className="flex items-center gap-4 mt-2">
                                <span className="text-2xs text-muted-foreground">
                                  <Calendar className="inline h-3 w-3 mr-1" />{formatDate(w.start_date)} → {formatDate(w.end_date)}
                                </span>
                                {w.reference_number && <span className="text-2xs text-muted-foreground">Ref: {w.reference_number}</span>}
                              </div>
                              <div className="mt-3">
                                <WarrantyTimeline start={w.start_date} end={w.end_date} color={WARRANTY_COLORS[w.warranty_type] ?? "#6366f1"} />
                              </div>
                            </div>
                          </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                            {/* Cover is a commercial commitment, raised and
                                revised in one place. */}
                            No client warranty recorded. Warranties are raised under Warranties.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Costs & Pricing */}
                {detailTab === "costs" && (
                  <div className="space-y-6">
                    {/* Built once, kept running for years. Both halves are
                        read from where they are already added up — the
                        project's costing and the maintenance register — so
                        there is no second answer to go stale. */}
                    {(() => {
                      const c = d.cost_of_ownership;
                      if (!c) return null;
                      const dev = c.development;
                      const row = (label: string, value: string | null | undefined, muted = false) => (
                        <div className="flex items-center justify-between gap-4">
                          <span className={`text-sm ${muted ? "text-muted-foreground" : "text-foreground"}`}>{label}</span>
                          <span className={`text-sm tabular-nums ${muted ? "text-muted-foreground" : "font-medium text-foreground"}`}>
                            {value == null ? "—" : `PKR ${Number(value).toLocaleString()}`}
                          </span>
                        </div>
                      );
                      return (
                        <div className="rounded-xl border border-border p-5">
                          <h4 className="mb-1 text-sm font-semibold text-foreground">Asset cost</h4>
                          <p className="mb-4 text-2xs text-muted-foreground">
                            Building it, and keeping it running since.
                          </p>

                          <div className="space-y-3">
                            {/* Three headings, whichever way the asset got
                                here: what it cost to obtain, what it cost
                                to put up, and what it has cost since. */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-4">
                                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                  Procurement
                                </span>
                                {dev?.project_name && (
                                  <span className="text-2xs text-muted-foreground">{dev.project_name}</span>
                                )}
                              </div>
                              {dev ? (
                                <>
                                  {dev.vendor_asset ? (
                                    <>
                                      {row("Purchase price", dev.purchase_price, true)}
                                      {dev.priced_from && (
                                        <p className="text-2xs text-muted-foreground">{dev.priced_from}</p>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      {row("Materials", dev.materials, true)}
                                      {/* In-house work and anything paid out
                                          on a work order: one cost of making
                                          it, not two to add up. */}
                                      {row("Production", dev.production, true)}
                                    </>
                                  )}
                                  <div className="border-t border-border pt-2">
                                    {row("Procurement total", dev.obtained)}
                                  </div>
                                </>
                              ) : (
                                <p className="text-xs text-muted-foreground">
                                  This asset is not on a project, so there is nothing to read a cost from.
                                </p>
                              )}
                            </div>

                            <div className="space-y-2 border-t border-border pt-3">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Installation
                              </span>
                              {row("Installation and activation", dev?.installation, true)}
                              <div className="border-t border-border pt-2">
                                {row("Installation total", dev?.installation ?? "0")}
                              </div>
                            </div>

                            <div className="space-y-2 border-t border-border pt-3">
                              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Maintenance
                              </span>
                              {row(
                                `Preventive · ${c.maintenance.preventive.visits} visit${c.maintenance.preventive.visits === 1 ? "" : "s"}`,
                                c.maintenance.preventive.total, true,
                              )}
                              {row(
                                `Corrective · ${c.maintenance.corrective.visits} visit${c.maintenance.corrective.visits === 1 ? "" : "s"}`,
                                c.maintenance.corrective.total, true,
                              )}
                              <div className="border-t border-border pt-2">{row("Maintenance total", c.maintenance.total)}</div>
                            </div>

                            <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                              <span className="text-sm font-semibold text-foreground">Total cost</span>
                              <span className="text-base font-bold tabular-nums text-primary">
                                PKR {Number(c.total).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Documents */}
                {detailTab === "documents" && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        Invoices, warranty cards, site permissions — anything that belongs with this asset.
                      </p>
                      <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-primary px-3.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90 ${
                        uploadingDoc ? "pointer-events-none opacity-60" : ""
                      }`}>
                        <Upload className="h-3.5 w-3.5" />
                        {uploadingDoc ? "Uploading…" : "Upload document"}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => uploadDocuments(d.id, e.target.files)}
                        />
                      </label>
                    </div>
                    {documents.length > 0 ? (
                      <div className="space-y-2">
                        {documents.map((doc) => (
                          <div key={doc.id} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:bg-secondary/30 transition-colors">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                              <FileText className="h-4 w-4 text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{doc.title}</p>
                              <p className="text-2xs text-muted-foreground">{doc.doc_type} · {doc.uploaded_by_name} · {formatDate(doc.created_at)}</p>
                            </div>
                            {doc.file && (
                              <a href={doc.file} target="_blank" rel="noopener noreferrer" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground">
                                <Download className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={<FileText className="h-10 w-10" />} text="No documents uploaded for this device." />
                    )}
                  </div>
                )}

                {/* Maintenance History */}
                {detailTab === "maintenance" && (
                  <div>
                    {maintSchedules.length > 0 ? (
                      <div className="space-y-3">
                        {maintSchedules.map((m) => (
                          <div key={m.id} className="flex items-start gap-3 rounded-lg border border-border p-4">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10">
                              <Wrench className="h-4 w-4 text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="text-sm font-medium text-foreground">{m.title}</p>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset ring-current/20 ${MAINT_TYPE_BADGE[m.maintenance_type] ?? "bg-gray-500/10 text-gray-600"}`}>
                                  {m.maintenance_type}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Frequency: {m.frequency} · Next Due: {formatDate(m.next_due)}
                                {m.assigned_to_name && ` · Assigned: ${m.assigned_to_name}`}
                              </p>
                            </div>
                            <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-medium ${m.is_active ? "bg-green-500/10 text-green-600" : "bg-gray-500/10 text-gray-600"}`}>
                              {m.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={<Wrench className="h-10 w-10" />} text="No maintenance schedules for this device." />
                    )}
                  </div>
                )}

                {/* Lifecycle Events */}
              </div>
            </div>
          </div>

          {/* Right sidebar — warranty cards + recurring costs */}
          <div className="space-y-4">
            {vendorWarranty && (
              <WarrantyCard
                title="Vendor Warranty"
                duration={getWarrantyDuration(vendorWarranty.start_date, vendorWarranty.end_date)}
                detail={vendorWarranty.coverage_details || "Comprehensive Warranty"}
                validTill={vendorWarranty.end_date}
                color="#3b82f6"
                expired={vendorWarranty.is_expired}
              />
            )}
            {clientWarranty && (
              <WarrantyCard
                title="Client Warranty"
                duration={getWarrantyDuration(clientWarranty.start_date, clientWarranty.end_date)}
                detail={clientWarranty.coverage_details || "On-site Warranty"}
                validTill={clientWarranty.end_date}
                color="#06b6d4"
                expired={clientWarranty.is_expired}
              />
            )}
            {!vendorWarranty && !clientWarranty && (
              <div className="rounded-xl border border-border bg-card p-5 text-center">
                <Shield className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">No warranties on file</p>
              </div>
            )}

            {/* Activity — who changed what, and when. This is the asset's
                whole lifecycle journal; it used to be repeated in a tab of
                its own, which was the same list twice. */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Activity</h3>
                {(d.lifecycle_events ?? []).length > 0 && (
                  <button
                    onClick={() => setAllActivity((v) => !v)}
                    className="text-2xs font-medium text-primary hover:underline"
                  >
                    {allActivity ? "Show less" : `View all (${d.lifecycle_events.length})`}
                  </button>
                )}
              </div>
              {(d.lifecycle_events ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <div className={allActivity ? "max-h-[28rem] overflow-y-auto pr-1" : ""}>
                  <Timeline
                    compact
                    items={lifecycleItems(allActivity ? d.lifecycle_events : d.lifecycle_events.slice(0, 6))}
                  />
                </div>
              )}
            </div>

            {/* Warranty timeline summary */}
            {warranties.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Warranty Timeline</h3>
                <div className="space-y-3">
                  {warranties.map((w) => (
                    <div key={w.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{WARRANTY_TYPE_LABELS[w.warranty_type] ?? w.warranty_type}</span>
                        <span className="text-2xs text-muted-foreground">{formatDate(w.end_date)}</span>
                      </div>
                      <WarrantyTimeline start={w.start_date} end={w.end_date} color={WARRANTY_COLORS[w.warranty_type] ?? "#6366f1"} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* QR / Barcode label */}
        <Modal open={!!labelModal} onClose={() => setLabelModal(null)} title={`Asset Label — ${d.asset_code}`}>
          {labelModal && (
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg border border-border bg-white p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={labelModal.url} alt={`${d.asset_code} label`} className="max-h-72" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  <button
                    onClick={() => generateLabel(d.id, "qr")}
                    disabled={labelLoading}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${labelModal.format === "qr" ? "bg-primary/10 text-primary ring-primary/30" : "text-muted-foreground ring-border hover:bg-secondary"}`}
                  >
                    QR Code
                  </button>
                  <button
                    onClick={() => generateLabel(d.id, "code128")}
                    disabled={labelLoading}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-colors ${labelModal.format === "code128" ? "bg-primary/10 text-primary ring-primary/30" : "text-muted-foreground ring-border hover:bg-secondary"}`}
                  >
                    Barcode
                  </button>
                </div>
                <button
                  onClick={() => printLabel(labelModal.url, d.asset_code)}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Printer className="h-4 w-4" /> Print
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Stick this label on the device — scanning it with the DIGIX Field app opens this asset instantly.
              </p>
            </div>
          )}
        </Modal>
      </div>
    );
  }

  /* ─── LIST VIEW ─── */
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <HardDrive className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Asset Registry</h1>
            <p className="text-sm text-muted-foreground">Manage all assets from procurement to retirement</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportExcel}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
          >
            <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
          </button>
          {canEdit && selectedIds.size > 0 && (
            <button
              onClick={printBulkLabels}
              disabled={bulkLabelLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
            >
              <Printer className="h-4 w-4" /> {bulkLabelLoading ? "Generating…" : `Print labels (${selectedIds.size})`}
            </button>
          )}
          {canEdit && (
            <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Register Asset
            </button>
          )}
        </div>
      </div>

      {(() => {
        // One tile, one answer. The tiles and the status bar are ways of
        // asking for one slice of the registry, so choosing one lets go of
        // the others: "In Stock" on top of "Operational" is an empty table,
        // not a filter.
        const toggleFlag = (f: string) => setFilterValues((prev) => ({
          ...prev, status: "", flag: prev.flag === f ? "" : f,
          // The expired tile and the warranty dropdown ask the same question.
          warranty: f === "warranty_expired" && prev.flag !== f ? "" : prev.warranty,
        }));
        const pickStatus = (st: string) => setFilterValues((prev) => ({
          ...prev, flag: "", status: prev.status === st ? "" : st,
        }));
        const STATUS_HEX: Record<string, string> = {
          procured: "#8b5cf6", in_transit: "#ec4899", in_production: "#eab308", in_stock: "#6366f1", assigned: "#3b82f6",
          installed: "#06b6d4", active: "#22c55e", under_maintenance: "#f59e0b",
          client_property: "#14b8a6", decommissioned: "#ef4444", lost_stolen: "#dc2626", rma: "#f97316",
        };
        return (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <StatTiles
              tiles={[
                { key: "total", label: "Total Assets", value: devices.length, tone: "primary", active: !filterValues.flag && !filterValues.status, onClick: () => setFilterValues((prev) => ({ ...prev, status: "", flag: "" })) },
                // One tile per lifecycle stage, in the order an asset moves
                // through them. Installed and Active are one tile: both mean
                // the asset is up at the client's site.
                ...([
                  ["procured", "Procured"],
                  ["in_production", "In Production"],
                  ["in_stock", "In Stock"],
                  ["assigned", "Assigned"],
                ] as const).map(([st, label]) => ({
                  key: st, label, tone: "default" as const, value: devices.filter((d) => d.status === st).length,
                  active: filterValues.status === st, onClick: () => pickStatus(st),
                })),
                { key: "operational", label: "Installed & Active", value: devices.filter((d) => ["active", "installed"].includes(d.status)).length, tone: "emerald", active: filterValues.flag === "operational", onClick: () => toggleFlag("operational") },
                { key: "maint", label: "Under Maintenance", value: devices.filter((d) => d.status === "under_maintenance").length, tone: "amber", active: filterValues.status === "under_maintenance", onClick: () => pickStatus("under_maintenance") },
                { key: "client_property", label: "Client Property", value: devices.filter((d) => d.status === "client_property").length, tone: "violet", active: filterValues.status === "client_property", onClick: () => pickStatus("client_property") },
                { key: "decommissioned", label: "Decommissioned", value: devices.filter((d) => d.status === "decommissioned").length, tone: "red", active: filterValues.status === "decommissioned", onClick: () => pickStatus("decommissioned") },
              ]}
            />
            <SegmentBar
              segments={STATUSES.map((s) => ({
                key: s.value, label: s.label, color: STATUS_HEX[s.value] ?? "#94a3b8",
                count: devices.filter((d) => d.status === s.value).length,
              }))}
              active={filterValues.status || undefined}
              onSelect={pickStatus}
            />
          </div>
        );
      })()}

      <FilterBar
        filters={[
          { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s.value, label: s.label })) },
          { key: "asset_type", label: "Type", options: Array.from(new Set(devices.map((d) => d.asset_type_name).filter(Boolean))).sort().map((t) => ({ value: t as string, label: t as string })) },
          { key: "client", label: "Client", options: Array.from(new Set(devices.flatMap((d) => (d.client_names ?? []).length > 0 ? d.client_names : d.client_name ? [d.client_name] : []))).sort().map((c) => ({ value: c, label: c })) },
          { key: "site", label: "Site", options: Array.from(new Set(devices.map((d) => d.site_name).filter(Boolean))).sort().map((s) => ({ value: s as string, label: s as string })) },
          { key: "warranty", label: "Warranty", options: [{ value: "active", label: "Under Warranty" }, { value: "expired", label: "Expired" }, { value: "none", label: "No Warranty" }] },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({
          ...prev, [k]: v,
          // A status picked here replaces a tile's flag; an expired warranty
          // picked here is the Warranty Expired tile, and vice versa.
          ...(k === "status" && v ? { flag: "" } : {}),
          ...(k === "warranty" ? { flag: "" } : {}),
        }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by code, name, serial #..."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <HardDrive className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No assets registered</h3>
          <p className="mt-2 text-sm text-muted-foreground">Register your first asset to start tracking your fleet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  {canEdit && (
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all assets"
                        checked={filtered.length > 0 && filtered.every((d) => selectedIds.has(d.id))}
                        onChange={(e) => {
                          // Merge/subtract only the currently filtered ids so
                          // selections made under other filters survive.
                          const checked = e.target.checked;
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            for (const d of filtered) {
                              if (checked) next.add(d.id);
                              else next.delete(d.id);
                            }
                            return next;
                          });
                        }}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </th>
                  )}
                  <SortTh sort={sort} k="asset_code" className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Asset Code</SortTh>
                  <SortTh sort={sort} k="display_name" className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Name</SortTh>
                                    <SortTh sort={sort} k="asset_type_name" className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Type</SortTh>
                  <SortTh sort={sort} k="status" className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Status</SortTh>
                  <SortTh sort={sort} k="warranty_status" className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Warranty</SortTh>
                  <SortTh sort={sort} k="project_name" className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Project</SortTh>
                  <SortTh sort={sort} k="site_name" className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Site</SortTh>
                  <SortTh sort={sort} k="client" className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Client</SortTh>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageSlice(sortRows(filtered, sort, { client: (d) => ((d.client_names ?? []).length ? d.client_names.join(", ") : d.client_name) }), assetPage).map((d) => (
                  <tr key={d.id} onClick={() => openDetail(d)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    {canEdit && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${d.asset_code}`}
                          checked={selectedIds.has(d.id)}
                          onChange={() => toggleRowSelection(d.id)}
                          className="h-4 w-4 cursor-pointer accent-primary"
                        />
                      </td>
                    )}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {/* The photo it actually has: its own, else the
                            primary one in its gallery. */}
                        <DeviceImage src={d.display_image ?? d.image} alt={d.asset_code} size="sm" />
                        <span className="inline-flex items-center gap-1 font-mono text-sm font-medium text-primary">
                          {d.asset_code}
                          <CopyButton text={d.asset_code} label="asset code" />
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-foreground">{d.display_name || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{d.asset_type_name || "—"}</td>
                    <td className="px-5 py-3"><StatusBadge status={d.status} label={d.status_display ?? statusLabel(d.status)} /></td>
                    <td className="px-5 py-3">
                      {d.warranty_status === "active" ? (
                        <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500 ring-1 ring-emerald-500/20">Under Warranty</span>
                      ) : d.warranty_status === "expired" ? (
                        <span className="inline-flex rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500 ring-1 ring-red-500/20">Expired</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{d.project_name || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{d.site_name || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{(d.client_names ?? []).length > 0 ? d.client_names.join(", ") : d.client_name || "—"}</td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openDetail(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="View">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canEdit && (
                          <>
                            <button onClick={() => openEdit(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => handleDelete(d)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={assetPage} total={filtered.length} onPage={setAssetPage} noun="assets" />
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={!!modalMode} onClose={closeModal} title={modalMode === "create" ? "Register New Asset" : "Edit Asset"} size="xl">
        <form key={copyOf?.id ?? (copyFrom ? "loading" : "blank")} onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {modalMode === "edit" && selected && (
            <div className="space-y-1.5">
              <label className={labelClass}>Asset Code</label>
              <input type="text" value={selected.asset_code} disabled className="flex h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm font-mono text-primary" />
            </div>
          )}

          {modalMode === "create" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass}>Asset Code</label>
                {/* Generated on save, together with the QR/barcode label. */}
                <p className="flex h-10 items-center rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground">
                  Generated automatically
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="copy_from" className={labelClass}>Start from an existing asset</label>
                <select id="copy_from" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className={inputClass}>
                  <option value="">Blank — fill everything in</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.asset_code} · {d.display_name || d.asset_type_name || "Asset"}
                    </option>
                  ))}
                </select>
                <p className="text-2xs text-muted-foreground">
                  Fills in its type, manufacturing route, size, components and
                  production route. The name is yours to choose, and the code
                  and serial stay this asset&apos;s own.
                </p>
                {copyOf && copyOf.length_in == null && copyOf.width_in == null && (
                  /* An asset registered before size was asked for has none to
                     give. Saying so beats leaving two required boxes empty
                     with no explanation. */
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-2xs text-amber-700 dark:text-amber-500">
                    {copyOf.asset_code} has no size on record, so Length and Width
                    are still yours to fill in.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="asset_type" className={labelClass}>Asset Type *</label>
              {/* The list of types is maintained in Setup › Asset Types, so it
                  is chosen here, never invented on the registration form. */}
              <select
                id="asset_type"
                required
                value={formAssetType}
                onChange={(e) => setFormAssetType(e.target.value)}
                className={inputClass}
              >
                <option value="">Select…</option>
                {assetTypes.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="display_name" className={labelClass}>Asset Name *</label>
              <input id="display_name" name="display_name" required defaultValue={selected?.display_name ?? ""} className={inputClass} placeholder="e.g. Main entrance SMD wall" />
            </div>
          </div>


          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label htmlFor="dimension_unit" className={labelClass}>Measured in</label>
              <select
                id="dimension_unit"
                value={dimensionUnit}
                onChange={(e) => setDimensionUnit(e.target.value)}
                className={inputClass}
              >
                <option value="in">Inches (in)</option>
                <option value="cm">Centimetres (cm)</option>
                <option value="mm">Millimetres (mm)</option>
                <option value="ft">Feet (ft)</option>
                <option value="m">Metres (m)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="length_in" className={labelClass}>Length ({dimensionUnit}) *</label>
              <input id="length_in" name="length_in" type="number" step="0.01" min="0" required defaultValue={selected?.length_in ?? copyOf?.length_in ?? ""} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="width_in" className={labelClass}>Width ({dimensionUnit}) *</label>
              <input id="width_in" name="width_in" type="number" step="0.01" min="0" required defaultValue={selected?.width_in ?? copyOf?.width_in ?? ""} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="depth_in" className={labelClass}>Depth ({dimensionUnit})</label>
              <input id="depth_in" name="depth_in" type="number" step="0.01" defaultValue={selected?.depth_in ?? copyOf?.depth_in ?? ""} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="diagonal_inches" className={labelClass}>Diagonal ({dimensionUnit})</label>
              <input id="diagonal_inches" name="diagonal_inches" type="number" step="0.1" defaultValue={selected?.diagonal_inches ?? copyOf?.diagonal_inches ?? ""} className={inputClass} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="source" className={labelClass}>Manufacturing Route *</label>
              {/* Decides what the asset needs: an in-house build carries a
                  production route, a vendor-built one does not. */}
              <select
                id="source"
                name="source"
                required
                value={assetSource}
                onChange={(e) => setAssetSource(e.target.value)}
                className={inputClass}
              >
                {/* Chosen, not assumed: the route decides what the asset
                    needs, so registering one means saying which. */}
                <option value="">Select…</option>
                <option value="inhouse">In-house Production — built from inventory components</option>
                <option value="vendor_supplied">Vendor Supplied — installed by our technician</option>
                <option value="vendor_turnkey">Vendor Supplied &amp; Installed — our technician oversees</option>
              </select>
              <p className="text-2xs text-muted-foreground">
                {assetSource === "inhouse"
                  ? "You will define the production steps and draw components from inventory."
                  : assetSource === "vendor_turnkey"
                    ? "The vendor builds and installs it; assign a technician to oversee the work."
                    : "Bought complete from a vendor, installed by our own technician."}
              </p>
            </div>
            {modalMode === "edit" && (
              <div className="space-y-1.5 sm:col-span-2">
                <label className={labelClass}>Status</label>
                <input type="text" value={statusLabel(selected?.status ?? "")} disabled className="flex h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm text-foreground" />
                <p className="text-2xs text-muted-foreground">Tracked automatically — it moves as the asset is built, assigned and installed.</p>
              </div>
            )}
          </div>

          {assetSource === "vendor_turnkey" && (
            <div className="border-t border-border pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vendor Installation Details
              </p>
              <p className="mb-3 text-2xs text-muted-foreground">
                Who puts it up on site. Often the supplying vendor, but not always.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="assigned_vendor" className={labelClass}>Vendor</label>
                  {/* Kept under Vendors, so the installation links to the
                      vendor's own record rather than a typed name. */}
                  <select
                    id="assigned_vendor"
                    name="assigned_vendor"
                    value={assignVendorId}
                    onChange={(e) => setAssignVendorId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select vendor…</option>
                    {suppliers.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="assigned_vendor_contact" className={labelClass}>Contact</label>
                  {/* Straight off the vendor's record. */}
                  <div
                    id="assigned_vendor_contact"
                    title={vendorContact(suppliers.find((v) => v.id === assignVendorId), true)}
                    className={`${inputClass} items-center bg-secondary/20`}
                  >
                    <span className="truncate">
                      {assignVendorId
                        ? vendorContact(suppliers.find((v) => v.id === assignVendorId), true)
                          || <span className="text-muted-foreground">Nothing on this vendor&apos;s record — add it under Vendors</span>
                        : <span className="text-muted-foreground">Chosen with the vendor</span>}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {modalMode === "edit" && (
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Device Images</p>
            <div className="flex flex-wrap gap-3">
              {modalMode === "edit" && selected?.images?.map((img) => (
                <div key={img.id} className="relative group">
                  <img src={img.image} alt={img.caption || "Device"} className="h-20 w-20 rounded-lg object-cover border border-border" />
                  {img.is_primary && (
                    <span className="absolute -top-1.5 -left-1.5 rounded-full bg-primary px-1.5 py-0.5 text-2xs font-bold text-primary-foreground">Primary</span>
                  )}
                </div>
              ))}
              {imagePreviews.map((src, idx) => (
                <div key={idx} className="relative group">
                  <img src={src} alt="New upload" className="h-20 w-20 rounded-lg object-cover border border-primary/50" />
                  <button
                    type="button"
                    onClick={() => removeNewImage(idx)}
                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-20 w-20 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                <ImagePlus className="h-5 w-5" />
                <span className="mt-1 text-2xs">Add Image</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageSelect}
              />
            </div>
          </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="notes" className={labelClass}>Notes</label>
            <textarea id="notes" name="notes" rows={2} defaultValue={selected?.notes ?? ""} className={`${inputClass} h-auto py-2`} />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Saving..." : modalMode === "create" ? "Register Device" : "Save Changes"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

/* ─── Helper Components ─── */

function MetaField({ label, value, mono, highlight, capitalize: cap }: { label: string; value: string | null | undefined; mono?: boolean; highlight?: boolean; capitalize?: boolean }) {
  return (
    <div>
      <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm ${mono ? "font-mono" : ""} ${highlight ? "text-primary font-medium" : "text-foreground"} ${cap ? "capitalize" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg bg-secondary/30 px-4 py-3">
      <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}

function OverviewRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-sm font-semibold text-foreground">{value || "—"}</span>
    </div>
  );
}

function WarrantyCard({ title, duration, detail, validTill, color, expired }: { title: string; duration: string; detail: string; validTill: string; color: string; expired: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${color}15` }}>
          <Shield className="h-4 w-4" style={{ color }} />
        </div>
        <div>
          <h4 className="text-xs font-semibold text-foreground">{title}</h4>
          {expired && <span className="text-2xs text-red-400">Expired</span>}
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground mb-0.5">{duration}</p>
      <p className="text-xs text-muted-foreground mb-1">{detail}</p>
      <p className="text-2xs text-muted-foreground">Valid Till: {formatDate(validTill)}</p>
    </div>
  );
}

function WarrantyTimeline({ start, end, color }: { start: string; end: string; color: string }) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const nowMs = Date.now();
  const total = endMs - startMs;
  const elapsed = Math.max(0, Math.min(nowMs - startMs, total));
  const pct = total > 0 ? (elapsed / total) * 100 : 0;

  return (
    <div className="h-2 w-full rounded-full bg-secondary/50 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function getWarrantyDuration(start: string, end: string): string {
  const startD = new Date(start);
  const endD = new Date(end);
  const days = Math.round((endD.getTime() - startD.getTime()) / 86400000);
  if (days < 0) return "—";
  const months = (endD.getFullYear() - startD.getFullYear()) * 12 + (endD.getMonth() - startD.getMonth());
  // Under a month it is counted in days — "0 months" tells nobody anything.
  if (months < 1) return `${days} Day${days !== 1 ? "s" : ""}`;
  return formatTerm(months);
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40">
      {icon}
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
