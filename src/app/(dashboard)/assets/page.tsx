"use client";

import { ArrowLeft, Check, Eye, HardDrive, ImagePlus, Pencil, Plus, Printer, QrCode, Trash2, X, Download, MapPin, Clock, Shield, Wrench, FileText, ChevronRight, Calendar, DollarSign, Package, Zap, Monitor, Sun } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { SegmentBar, StatTiles } from "@/components/ui/analytics-strip";
import { ProductionRoute, type ProductionStep } from "@/components/assets/production-route";
import { Timeline, type TimelineItem, type TimelineTone } from "@/components/ui/timeline";
import { SelectOrCreate } from "@/components/ui/select-or-create";
import { CopyButton } from "@/components/ui/copy-button";
import { FilterBar } from "@/components/ui/filter-bar";
import { MultiSelect } from "@/components/ui/multi-select";
import { DeviceImage } from "@/components/ui/device-image";
import { StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDate, formatDateTime } from "@/lib/utils";
import { useUser } from "@/lib/user-context";

interface Device {
  id: string;
  asset_code: string;
  serial_number: string;
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

interface AssetComponent {
  id: string;
  device: string;
  name: string;
  component_type: string;
  serial_number: string;
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
}
interface StockProductRef {
  id: string;
  type_code: string;
  name: string;
  brand_name: string | null;
  model_name: string;
  in_stock_count: number;
}

interface NewComponentRow {
  source: "generic" | "unique";
  inventory_item: string;
  inventory_unit_type: string;
  quantity: number;
}

const EMPTY_COMPONENT: NewComponentRow = {
  source: "generic", inventory_item: "", inventory_unit_type: "", quantity: 1,
};

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

  const node = (reached: boolean, current: boolean, tone: "primary" | "amber" | "slate" = "primary") =>
    current
      ? tone === "amber"
        ? "border-amber-500 bg-amber-500 text-white"
        : "border-primary bg-primary text-primary-foreground"
      : reached
        ? tone === "slate"
          ? "border-slate-500 bg-slate-500 text-white"
          : "border-primary bg-primary/15 text-primary"
        : "border-border bg-card text-muted-foreground";

  return (
    <div className="overflow-x-auto pb-1">
      <ol className="flex min-w-max items-start">
        {TRACK_MAIN.map((stage, i) => {
          const reached = mainIdx >= 0 ? i <= mainIdx : !!stageDates[stage];
          const current = !inMaintenance && !ended && status === stage;
          const date = shortDate(stageDates[stage]);
          const isLast = i === TRACK_MAIN.length - 1;
          const filled = mainIdx >= 0 && i < mainIdx;
          return (
            <li key={stage} className="relative flex w-[92px] flex-col items-center text-center">
              <span
                aria-hidden
                className={`absolute left-1/2 top-[13px] w-full ${
                  isLast ? "border-t-2 border-dashed border-border" : `h-0.5 ${filled ? "bg-primary" : "bg-border"}`
                }`}
              />
              <span className="relative flex h-7 w-7 items-center justify-center">
                {current && <span aria-hidden className="absolute inset-0 rounded-full bg-primary/25 motion-safe:animate-ping" />}
                <span className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 text-2xs font-bold ${node(reached, current)}`}>
                  {reached && !current ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
              </span>
              <span className={`mt-1.5 text-2xs leading-tight ${current ? "font-semibold text-primary" : reached ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                {label(stage)}
              </span>
              <span className="text-2xs tabular-nums text-muted-foreground" title={stageDates[stage] ? new Date(stageDates[stage]).toLocaleString() : undefined}>
                {reached && date ? date : " "}
              </span>

              {/* Maintenance: a detour hanging off Active. */}
              {stage === "active" && (inMaintenance || stageDates.under_maintenance) && (
                <span className="mt-1 flex flex-col items-center">
                  <span aria-hidden className={`h-3 border-l-2 border-dashed ${inMaintenance ? "border-amber-500" : "border-border"}`} />
                  <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-semibold ring-1 ${
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

        {/* End of life: a spur off the line. */}
        {TRACK_END.map((stage, i) => {
          const current = status === stage;
          const reached = current || !!stageDates[stage];
          return (
            <li key={stage} className="relative flex w-[92px] flex-col items-center text-center">
              {i === 0 && <span aria-hidden className="absolute left-1/2 top-[13px] w-full border-t-2 border-dashed border-border" />}
              <span className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-dashed text-2xs font-bold ${node(reached, false, "slate")}`}>
                {reached ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : "•"}
              </span>
              <span className={`mt-1.5 text-2xs leading-tight ${current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {label(stage)}
              </span>
              <span className="text-2xs tabular-nums text-muted-foreground">
                {reached ? shortDate(stageDates[stage]) ?? " " : " "}
              </span>
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
  predictive: "bg-purple-500/10 text-purple-600",
};

export default function AssetsPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("devices");

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<DeviceDetail | null>(null);
  const [detailView, setDetailView] = useState<DeviceDetail | null>(null);
  const [returnToDetailId, setReturnToDetailId] = useState<string | null>(null);
  const [additionalClients, setAdditionalClients] = useState<string[]>([]);
  const [newComponents, setNewComponents] = useState<NewComponentRow[]>([]);
  // Components are drawn from inventory: generic stock (qty) or a unique unit.
  const [compSource, setCompSource] = useState<"generic" | "unique">("generic");
  const [compItemId, setCompItemId] = useState("");
  const [compUnitType, setCompUnitType] = useState("");
  const [assetSource, setAssetSource] = useState("inhouse");
  const [compEdit, setCompEdit] = useState<{ id: string; quantity: number } | null>(null);
  // Item 8: a new asset can start as a copy of an existing one.
  const [copyFrom, setCopyFrom] = useState("");
  // Components and a production route only belong to an asset we build ourselves.
  const buildsInHouse = assetSource === "inhouse";
  const [formAssetType, setFormAssetType] = useState("");
  const [compQty, setCompQty] = useState(1);
  const [stockItems, setStockItems] = useState<StockItemRef[]>([]);
  const [stockProducts, setStockProducts] = useState<StockProductRef[]>([]);

  // A component is a requirement, so availability never limits it — it is
  // shown purely so the user knows whether it will need procuring later.
  const selectedProduct = stockProducts.find((p) => p.id === compUnitType);
  const compAvailable =
    compSource === "generic"
      ? stockItems.find((s) => s.id === compItemId)?.quantity ?? 0
      : selectedProduct?.in_stock_count ?? 0;
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
  const [assignVendorName, setAssignVendorName] = useState("");
  const [assignVendorContact, setAssignVendorContact] = useState("");
  const [supplyVendorName, setSupplyVendorName] = useState("");
  const [supplyVendorContact, setSupplyVendorContact] = useState("");
  const [transitionLoading, setTransitionLoading] = useState(false);
  // Photo evidence of the installed asset, attached when moving to Active.
  const [activePhotos, setActivePhotos] = useState<File[]>([]);
  const [activePhotoPreviews, setActivePhotoPreviews] = useState<string[]>([]);
  const activePhotoInputRef = useRef<HTMLInputElement>(null);

  const [warranties, setWarranties] = useState<WarrantyItem[]>([]);
  const [maintSchedules, setMaintSchedules] = useState<MaintenanceItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [deviceTickets, setDeviceTickets] = useState<{ id: string; ticket_number: string; occurrence: number; title: string; status: string; created_at: string }[]>([]);

  const [deviceModels, setDeviceModels] = useState<Option[]>([]);
  const [assetTypes, setAssetTypes] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
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

  useEffect(() => {
    if (autoOpenedRef.current || loading) return;
    const statusParam = searchParams.get("status");
    if (statusParam) setFilterValues((prev) => ({ ...prev, status: statusParam }));
    const deviceId = searchParams.get("device");
    if (!deviceId) return;
    autoOpenedRef.current = true;
    api.get(`/assets/devices/${deviceId}/`).then(({ data }) => {
      setDetailView(data);
      setDetailTab("overview");
      // Coming from a project's Execution tab: straight to assigning the site and technician.
      if (searchParams.get("assign") && (data.allowed_transitions ?? []).includes("assigned")) {
        setTransitionTarget("assigned");
      }
      fetchRelatedData(data.id);
      // Deep-linking straight to an asset still needs the technician, site and
      // client pickers the detail view's own dialogs use.
      loadOptions();
    }).catch(() => {});
  }, [searchParams, loading]);

  async function fetchRelatedData(deviceId: string) {
    const [warRes, maintRes, docRes, tickRes] = await Promise.allSettled([
      api.get("/warranties/", { params: { device: deviceId } }),
      api.get("/maintenance/schedules/", { params: { device: deviceId } }),
      api.get("/infrastructure/documents/", { params: { device: deviceId } }),
      api.get("/tickets/", { params: { device: deviceId, page_size: 100 } }),
    ]);
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
    if (st.status === "fulfilled") setSites((st.value.data.results ?? st.value.data).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })));
    if (cl.status === "fulfilled") setClients((cl.value.data.results ?? cl.value.data).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })));
    if (su.status === "fulfilled") setSuppliers((su.value.data.results ?? su.value.data).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })));
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
    setAssetSource("inhouse");
    setFormAssetType("");
    setAssignTechnician("");
    setAssignVendorName("");
    setAssignVendorContact("");
    setSupplyVendorName("");
    setSupplyVendorContact("");
    setSelected(null);
    setImageFiles([]);
    setImagePreviews([]);
    setAdditionalClients([]);
    setNewComponents([]);
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
      setFormAssetType(data.asset_type ?? "");
      setAssignTechnician(data.assigned_technician ?? "");
      setAssignVendorName(data.assigned_vendor_name ?? "");
      setAssignVendorContact(data.assigned_vendor_contact ?? "");
      setSupplyVendorName(data.supply_vendor_name ?? "");
      setSupplyVendorContact(data.supply_vendor_contact ?? "");
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
    if (!compSelected || compQty < 1) return;
    try {
      await api.post("/assets/components/", {
        device: deviceId,
        ...(compSource === "generic"
          ? { inventory_item: compItemId }
          : { inventory_unit_type: compUnitType }),
        quantity: compQty,
      });
      toast.success("Requirement added");
      setCompItemId("");
      setCompUnitType("");
      setCompQty(1);
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

  async function openDetail(device: Device) {
    try {
      const { data } = await api.get(`/assets/devices/${device.id}/`);
      setDetailView(data);
      setDetailTab("overview");
      setTransitionTarget(null);
      setTransitionReason("");
      fetchRelatedData(data.id);
      loadOptions();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load device details"));
    }
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

  function resetTransition() {
    setTransitionTarget(null);
    setTransitionReason("");
    clearActivePhotos();
    setAssignTechnician("");
    setAssignVendorName("");
    setAssignVendorContact("");
    setSupplyVendorName("");
    setSupplyVendorContact("");
    setAssignSite("");
    setMaintDue("");
    setMaintTech("");
    setMaintPriority("high");
    setMaintInstructions("");
  }

  async function handleStatusTransition(deviceId: string) {
    if (!transitionTarget || !transitionReason.trim()) return;
    const assigning = transitionTarget === "assigned";
    const turnkey = detailView?.source === "vendor_turnkey";
    if (assigning && !assignTechnician) return;
    if (assigning && turnkey && !assignVendorName.trim()) return;
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
              ...(assignSite ? { current_site: assignSite } : {}),
              ...(turnkey
                ? {
                    assigned_vendor_name: assignVendorName.trim(),
                    assigned_vendor_contact: assignVendorContact.trim(),
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
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      // No serial here: the platform generates the asset code (and its
      // QR/barcode label), and the serial defaults to it.
      source: assetSource,
      ...(modalMode === "create" && copyFrom ? { copy_from: copyFrom } : {}),
      batch_number: fd.get("batch_number") || "",
      asset_type: formAssetType || null,
      display_name: fd.get("display_name") || "",
      length_in: fd.get("length_in") || null,
      width_in: fd.get("width_in") || null,
      depth_in: fd.get("depth_in") || null,
      diagonal_inches: fd.get("diagonal_inches") || null,
      notes: fd.get("notes"),
      current_site: fd.get("current_site") || null,
      assigned_client: fd.get("assigned_client") || null,
      clients: fd.getAll("clients"),
      project: fd.get("project") || null,
      // The route decides who can be assigned: only a turnkey job carries a
      // vendor, and it carries an overseeing technician alongside it.
      assigned_technician: assignTechnician || null,
      // Only a turnkey job has an installing vendor; both vendor routes have a
      // supplying one, and an in-house build has neither.
      assigned_vendor_name: assetSource === "vendor_turnkey" ? assignVendorName.trim() : "",
      assigned_vendor_contact: assetSource === "vendor_turnkey" ? assignVendorContact.trim() : "",
      supply_vendor_name: buildsInHouse ? "" : supplyVendorName.trim(),
      supply_vendor_contact: buildsInHouse ? "" : supplyVendorContact.trim(),
      supplier: fd.get("supplier") || null,
      purchase_date: fd.get("purchase_date") || null,
      purchase_price: fd.get("purchase_price") || null,
      installation_date: fd.get("installation_date") || null,
      // Only a vendor route has one; the API ignores it on an in-house build.
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

      // Rows may linger if the route was switched after they were added.
      if (modalMode === "create" && buildsInHouse && newComponents.length > 0) {
        for (const row of newComponents) {
          const isUnique = row.source === "unique";
          // Skip rows where no inventory item was picked.
          if (!(isUnique ? row.inventory_unit_type : row.inventory_item)) continue;
          await api.post("/assets/components/", {
            device: deviceId,
            inventory_item: isUnique ? null : row.inventory_item,
            inventory_unit_type: isUnique ? row.inventory_unit_type : null,
            quantity: row.quantity || 1,
          });
        }
        loadInventorySources();
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
    if (!confirm(`Delete device "${device.asset_code}"? This cannot be undone.`)) return;
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
      if (!d.asset_code.toLowerCase().includes(q) && !d.serial_number.toLowerCase().includes(q) && !(d.display_name || "").toLowerCase().includes(q) && !(d.site_name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ─── DETAIL VIEW ─── */
  if (detailView) {
    const d = detailView;
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
    const customerWarranty = assetWarranties.find(
      (w) => w.warranty_type === "client" || w.warranty_type === "extended",
    );

    return (
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setDetailView(null); setWarranties([]); setMaintSchedules([]); setDocuments([]); setTransitionTarget(null); setTransitionReason(""); }} className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
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
                    <MetaField label="Dimensions" value={d.length_in && d.width_in ? `${d.length_in} × ${d.width_in}${d.depth_in ? ` × ${d.depth_in}` : ""} in` : d.diagonal_inches ? `${d.diagonal_inches}"` : null} />
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
                  { key: "history", label: "Lifecycle", count: d.lifecycle_events?.length ?? 0 },
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
                      {canEdit && (
                        <div className="mt-4 rounded-lg border border-border bg-secondary/20 p-3">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Change Status</p>
                          {/* Installed and Active are recorded on site, in the
                              tracker, with the technician's photo — not typed
                              in here — so say where they come from. */}
                          {["assigned", "installed"].includes(d.status) && (
                            <p className="mb-2 text-2xs text-muted-foreground">
                              {d.status === "assigned" ? "Installed" : "Active"} is recorded by the technician in the{" "}
                              <Link href={`/installation-tracker?device=${d.id}`} className="font-medium text-primary hover:underline">
                                Installation Tracker
                              </Link>
                              {d.status === "installed" ? ", with a photo of the installed asset." : ", not here."}
                            </p>
                          )}
                          {(d.allowed_transitions ?? []).length > 0 ? (
                            <>
                              <div className="flex flex-wrap gap-2">
                                {(d.allowed_transitions ?? []).map((s) => (
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
                                          <input
                                            value={assignVendorName}
                                            onChange={(e) => setAssignVendorName(e.target.value)}
                                            placeholder="Vendor installing it"
                                            className={`${inputClass} h-9 text-xs`}
                                          />
                                          <input
                                            value={assignVendorContact}
                                            onChange={(e) => setAssignVendorContact(e.target.value)}
                                            placeholder="Contact / phone"
                                            className={`${inputClass} h-9 text-xs`}
                                          />
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
                                        This opens the asset's job on the Installation Tracker.
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
                                            min={new Date().toISOString().slice(0, 10)}
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
                                          (d.source === "vendor_turnkey" && !assignVendorName.trim())
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
                            <p className="text-xs text-muted-foreground">No further transitions available from “{statusLabel(d.status)}”.</p>
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
                                : "Awaiting its purchase order in Procurement → To Procure."
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
                                <th className="px-3 py-2 font-medium">Unit</th>
                                {canEdit && <th className="px-3 py-2" />}
                              </tr>
                            </thead>
                            <tbody>
                              {(d.components ?? []).map((cmp) => (
                                <tr key={cmp.id} className="border-b border-border/60 last:border-0">
                                  <td className="px-3 py-2 font-medium text-foreground">{cmp.name}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{cmp.component_type || "—"}</td>
                                  <td className="px-3 py-2 font-mono text-muted-foreground">{cmp.serial_number || "—"}</td>
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
                                      <>×{cmp.quantity}</>
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
                                  <td className="px-3 py-2 text-muted-foreground">{cmp.unit || "piece"}</td>
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
                        <form onSubmit={(e) => handleAddComponent(e, d.id)} className="mt-2">
                          <fieldset disabled={!d.requires_production || d.is_locked} className="space-y-2">
                            <p className="text-2xs text-muted-foreground">
                              What this asset is built from. Stock is not reduced here — the project decides
                              later whether to take each line from inventory or procure it.
                            </p>
                            <div className="flex flex-wrap items-end gap-2">
                              <select
                                value={compSource}
                                onChange={(e) => { setCompSource(e.target.value as "generic" | "unique"); setCompItemId(""); setCompUnitType(""); setCompQty(1); }}
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
                                      {s.material_name ?? s.sku} · {s.quantity} in stock
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
                                      {[p.name, p.model_name].filter(Boolean).join(" ")} · {p.in_stock_count} in stock
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
                                  onChange={(e) => setCompQty(Math.max(1, Number(e.target.value) || 1))}
                                  className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
                                />
                              </div>

                              <button
                                type="submit"
                                disabled={!compSelected || compQty < 1}
                                className="h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                              >
                                Add
                              </button>
                            </div>

                            {compSelected && compQty > compAvailable && (
                              <p className="text-2xs text-amber-600">
                                Only {compAvailable} in stock — the shortfall can be procured from the project.
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
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Service History</h4>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tickets</p>
                            <Link href={`/tickets?device=${d.id}`} className="text-2xs font-medium text-primary hover:underline">View all →</Link>
                          </div>
                          <div className="mt-2 flex gap-4 text-sm">
                            <span className="font-bold text-foreground">{deviceTickets.length} total</span>
                            <span className="font-medium text-amber-500">{deviceTickets.filter((t) => !["closed", "approved", "rejected"].includes(t.status)).length} ongoing</span>
                            <span className="font-medium text-emerald-600">{deviceTickets.filter((t) => ["closed", "approved"].includes(t.status)).length} completed</span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {deviceTickets.slice(0, 4).map((t) => (
                              <Link key={t.id} href={`/tickets?open=${t.id}`} className="flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-secondary/50">
                                <span className="font-medium text-primary">{t.ticket_number}{t.occurrence ? ` · #${t.occurrence}` : ""}</span>
                                <span className="truncate px-2 text-muted-foreground">{t.title}</span>
                                <span className="shrink-0 text-muted-foreground">{t.status.replace(/_/g, " ")}</span>
                              </Link>
                            ))}
                            {deviceTickets.length === 0 && <p className="text-xs text-muted-foreground">No tickets raised for this asset.</p>}
                          </div>
                        </div>
                        <div className="rounded-xl border border-border p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Maintenance</p>
                            <Link href="/maintenance" className="text-2xs font-medium text-primary hover:underline">View all →</Link>
                          </div>
                          <div className="mt-2 flex gap-4 text-sm">
                            <span className="font-bold text-foreground">{maintSchedules.length} total</span>
                            <span className="font-medium text-amber-500">{maintSchedules.filter((m) => m.status !== "completed").length} ongoing</span>
                            <span className="font-medium text-emerald-600">{maintSchedules.filter((m) => m.status === "completed").length} completed</span>
                          </div>
                          <div className="mt-2 space-y-1">
                            {maintSchedules.slice(0, 4).map((m) => (
                              <Link key={m.id} href={`/maintenance?schedule=${m.id}`} className="flex items-center justify-between rounded-md px-2 py-1 text-xs hover:bg-secondary/50">
                                <span className="truncate font-medium text-foreground">{m.title || "Schedule"}</span>
                                <span className="shrink-0 text-muted-foreground">{m.status.replace(/_/g, " ")}</span>
                              </Link>
                            ))}
                            {maintSchedules.length === 0 && <p className="text-xs text-muted-foreground">No maintenance scheduled for this asset.</p>}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Device Information</h4>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <InfoCard label="Asset Code" value={d.asset_code} />
                        {/* The serial defaults to the asset code, so it is only
                            worth a card when it is a real, different serial. */}
                        {d.serial_number && d.serial_number !== d.asset_code && (
                          <InfoCard label="Serial Number" value={d.serial_number} />
                        )}
                        <InfoCard label="Project" value={d.project_name} />
                        <InfoCard label="Manufacturing Route" value={d.source_display} />
                        <InfoCard label="Batch Number" value={d.batch_number} />
                        <InfoCard label="Asset Type" value={d.asset_type_name} />
                        {/* Technical detail now lives on the inventory records
                            the asset is built from, not on the asset itself. */}
                        <InfoCard label="Hardware Revision" value={d.hardware_revision} />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Assignment</h4>
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
                              : "No vendor warranty recorded — add its expiry in Edit Asset."}
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
                            No client warranty recorded — add its expiry in Edit Asset.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Costs & Pricing */}
                {detailTab === "costs" && (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Procurement Details</h4>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <InfoCard label="Supplier" value={d.supplier_name} />
                        <InfoCard label="Purchase Date" value={d.purchase_date ? formatDate(d.purchase_date) : null} />
                        <InfoCard label="Purchase Price" value={d.purchase_price ? `PKR ${Number(d.purchase_price).toLocaleString()}` : null} />
                        <InfoCard label="Invoice Reference" value={d.invoice_reference} />
                        <InfoCard label="Batch Number" value={d.batch_number} />
                      </div>
                    </div>
                    {d.purchase_price && (
                      <div className="rounded-xl border border-border p-5">
                        <h4 className="text-sm font-semibold text-foreground mb-4">Cost Summary</h4>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Unit Cost</span>
                            <span className="text-sm font-semibold text-foreground">PKR {Number(d.purchase_price).toLocaleString()}</span>
                          </div>
                          <div className="border-t border-border pt-3 flex items-center justify-between">
                            <span className="text-sm font-medium text-foreground">Total Purchase Cost</span>
                            <span className="text-base font-bold text-primary">PKR {Number(d.purchase_price).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Documents */}
                {detailTab === "documents" && (
                  <div>
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
                {detailTab === "history" && (
                  <div className="space-y-3">
                    {(d.lifecycle_events ?? []).length > 0 ? (
                      <div className="rounded-xl border border-border p-4">
                        <Timeline items={lifecycleItems(d.lifecycle_events)} />
                      </div>
                    ) : (
                      <EmptyState icon={<Clock className="h-10 w-10" />} text="No lifecycle events recorded yet." />
                    )}
                  </div>
                )}
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
            {customerWarranty && (
              <WarrantyCard
                title="Customer Warranty"
                duration={getWarrantyDuration(customerWarranty.start_date, customerWarranty.end_date)}
                detail={customerWarranty.coverage_details || "On-site Warranty"}
                validTill={customerWarranty.end_date}
                color="#06b6d4"
                expired={customerWarranty.is_expired}
              />
            )}
            {!vendorWarranty && !customerWarranty && (
              <div className="rounded-xl border border-border bg-card p-5 text-center">
                <Shield className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">No warranties on file</p>
              </div>
            )}

            {/* Activity — who changed what, and when. The Lifecycle tab holds
                the same journal; this puts the last few in reach. */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Activity</h3>
                {(d.lifecycle_events ?? []).length > 0 && (
                  <button
                    onClick={() => setDetailTab("history")}
                    className="text-2xs font-medium text-primary hover:underline"
                  >
                    View all →
                  </button>
                )}
              </div>
              {(d.lifecycle_events ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nothing recorded yet.</p>
              ) : (
                <Timeline compact items={lifecycleItems(d.lifecycle_events.slice(0, 6))} />
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
        const toggleFlag = (f: string) => setFilterValues((prev) => ({ ...prev, flag: prev.flag === f ? "" : f }));
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
                { key: "operational", label: "Operational", value: devices.filter((d) => ["active", "installed"].includes(d.status)).length, tone: "emerald", active: filterValues.flag === "operational", onClick: () => toggleFlag("operational") },
                { key: "in_stock", label: "In Stock", value: devices.filter((d) => d.status === "in_stock").length, tone: "default", active: filterValues.status === "in_stock", onClick: () => setFilterValues((prev) => ({ ...prev, status: prev.status === "in_stock" ? "" : "in_stock" })) },
                { key: "maint", label: "Under Maintenance", value: devices.filter((d) => d.status === "under_maintenance").length, tone: "amber", active: filterValues.status === "under_maintenance", onClick: () => setFilterValues((prev) => ({ ...prev, status: prev.status === "under_maintenance" ? "" : "under_maintenance" })) },
                { key: "warranty_expired", label: "Warranty Expired", value: devices.filter((d) => d.warranty_status === "expired").length, tone: "red", active: filterValues.flag === "warranty_expired", onClick: () => toggleFlag("warranty_expired") },
              ]}
            />
            <SegmentBar
              segments={STATUSES.map((s) => ({
                key: s.value, label: s.label, color: STATUS_HEX[s.value] ?? "#94a3b8",
                count: devices.filter((d) => d.status === s.value).length,
              }))}
              active={filterValues.status || undefined}
              onSelect={(s) => setFilterValues((prev) => ({ ...prev, status: prev.status === s ? "" : s }))}
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
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
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
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Asset Code</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Name</th>
                                    <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Type</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Warranty</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Project</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Site</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Client</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
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
                        <DeviceImage src={d.image} alt={d.asset_code} size="sm" />
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
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={!!modalMode} onClose={closeModal} title={modalMode === "create" ? "Register New Asset" : "Edit Asset"} size="xl">
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
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
                  Copies its type, size, build source, components and production route. The code and
                  serial stay this asset&apos;s own.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectOrCreate
              id="asset_type"
              label="Asset Type"
              value={formAssetType}
              onChange={setFormAssetType}
              options={assetTypes.map((a) => ({ id: a.id, name: a.label }))}
              onCreated={(created) => setAssetTypes((prev) => [...prev, { id: created.id, label: created.name }])}
              endpoint="/assets/asset-types/"
              createPlaceholder="e.g. Standee, SMD Screen"
              emptyLabel="Select…"
            />
            <div className="space-y-1.5">
              <label htmlFor="display_name" className={labelClass}>Asset Name</label>
              <input id="display_name" name="display_name" defaultValue={selected?.display_name ?? ""} className={inputClass} placeholder="e.g. Main entrance SMD wall" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label htmlFor="length_in" className={labelClass}>Length (in)</label>
              <input id="length_in" name="length_in" type="number" step="0.01" defaultValue={selected?.length_in ?? ""} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="width_in" className={labelClass}>Width (in)</label>
              <input id="width_in" name="width_in" type="number" step="0.01" defaultValue={selected?.width_in ?? ""} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="depth_in" className={labelClass}>Depth (in)</label>
              <input id="depth_in" name="depth_in" type="number" step="0.01" defaultValue={selected?.depth_in ?? ""} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="diagonal_inches" className={labelClass}>Diagonal (in)</label>
              <input id="diagonal_inches" name="diagonal_inches" type="number" step="0.1" defaultValue={selected?.diagonal_inches ?? ""} className={inputClass} />
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
                value={assetSource}
                onChange={(e) => setAssetSource(e.target.value)}
                className={inputClass}
              >
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

          {modalMode === "edit" && (
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assignment</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="current_site" className={labelClass}>Site</label>
                <select id="current_site" name="current_site" defaultValue={selected?.current_site ?? ""} className={inputClass}>
                  <option value="">None</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="assigned_client" className={labelClass}>Client</label>
                <select id="assigned_client" name="assigned_client" defaultValue={selected?.assigned_client ?? ""} className={inputClass}>
                  <option value="">None</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className={labelClass}>Additional Clients (shared asset)</label>
                <MultiSelect
                  options={clients.map((c) => ({ id: c.id, label: c.label }))}
                  values={additionalClients}
                  onChange={setAdditionalClients}
                  name="clients"
                  placeholder="Select additional clients…"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <div className="space-y-1.5">
                <label htmlFor="assigned_technician" className={labelClass}>
                  {assetSource === "vendor_turnkey" ? "Technician Overseeing" : "Assigned Technician"}
                </label>
                <select
                  id="assigned_technician"
                  name="assigned_technician"
                  value={assignTechnician}
                  onChange={(e) => setAssignTechnician(e.target.value)}
                  className={inputClass}
                >
                  <option value="">None</option>
                  {technicians.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <p className="text-2xs text-muted-foreground">
                  {assetSource === "vendor_turnkey"
                    ? "The vendor does the work; our technician oversees it. Details come from the manpower records."
                    : "Details come from the manpower records."}
                </p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="project" className={labelClass}>Project (client order)</label>
                <select id="project" name="project" defaultValue={selected?.project ?? ""} className={inputClass}>
                  <option value="">None</option>
                  {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="installation_date" className={labelClass}>Installation Date</label>
                <input id="installation_date" name="installation_date" type="date" defaultValue={selected?.installation_date ?? ""} className={inputClass} />
              </div>
            </div>
          </div>
          )}

          {/* Two vendors, two questions, two sections: who sold us the asset,
              and who puts it up. On a turnkey job they are usually the same
              firm — but that is a fact to record, not an assumption. */}
          {!buildsInHouse && (
            <div className="border-t border-border pt-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Vendor Supply Details
              </p>
              <p className="mb-3 text-2xs text-muted-foreground">
                Who the finished asset was bought from.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="supply_vendor_name" className={labelClass}>Vendor Name</label>
                  <input
                    id="supply_vendor_name"
                    name="supply_vendor_name"
                    value={supplyVendorName}
                    onChange={(e) => setSupplyVendorName(e.target.value)}
                    placeholder="e.g. Skyline Displays"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="supply_vendor_contact" className={labelClass}>Contact / Phone</label>
                  <input
                    id="supply_vendor_contact"
                    name="supply_vendor_contact"
                    value={supplyVendorContact}
                    onChange={(e) => setSupplyVendorContact(e.target.value)}
                    placeholder="e.g. 0300-1234567"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          )}

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
                  <label htmlFor="assigned_vendor_name" className={labelClass}>Vendor Name</label>
                  <input
                    id="assigned_vendor_name"
                    name="assigned_vendor_name"
                    value={assignVendorName}
                    onChange={(e) => setAssignVendorName(e.target.value)}
                    placeholder="e.g. Skyline Displays"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="assigned_vendor_contact" className={labelClass}>Contact / Phone</label>
                  <input
                    id="assigned_vendor_contact"
                    name="assigned_vendor_contact"
                    value={assignVendorContact}
                    onChange={(e) => setAssignVendorContact(e.target.value)}
                    placeholder="e.g. 0300-1234567"
                    className={inputClass}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setAssignVendorName(supplyVendorName); setAssignVendorContact(supplyVendorContact); }}
                className="mt-2 text-2xs font-medium text-primary hover:underline"
              >
                Same as the supplying vendor
              </button>
            </div>
          )}

          {/* Warranty — the asset's own cover, named for who gives it. Parts
              carry their own warranties from inventory; those are separate. */}
          {modalMode === "edit" && (
          <div className="border-t border-border pt-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Warranty</p>
            <p className="mb-3 text-2xs text-muted-foreground">
              For information — warranties are entered and renewed in Warranties. Our cover to the
              client starts when the asset goes Active; a vendor&apos;s cover on a bought asset starts
              when it is received; part warranties run from the day each part arrived.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
                <p className="text-2xs uppercase tracking-wider text-muted-foreground">Client warranty</p>
                <p className="text-sm text-foreground">
                  {selected?.client_warranty?.end_date ? `Until ${formatDate(selected.client_warranty.end_date)}` : "None on record"}
                </p>
              </div>
              {!buildsInHouse && (
                <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2">
                  <p className="text-2xs uppercase tracking-wider text-muted-foreground">Vendor warranty</p>
                  <p className="text-sm text-foreground">
                    {selected?.vendor_warranty?.end_date ? `Until ${formatDate(selected.vendor_warranty.end_date)}` : "None on record"}
                  </p>
                </div>
              )}
            </div>
            <Link href="/warranties" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
              Open Warranties →
            </Link>
          </div>
          )}

          {modalMode === "edit" && (
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Procurement</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label htmlFor="supplier" className={labelClass}>Supplier</label>
                <select id="supplier" name="supplier" defaultValue={selected?.supplier ?? ""} className={inputClass}>
                  <option value="">None</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="purchase_date" className={labelClass}>Purchase Date</label>
                <input id="purchase_date" name="purchase_date" type="date" defaultValue={selected?.purchase_date ?? ""} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="purchase_price" className={labelClass}>Purchase Price</label>
                <input id="purchase_price" name="purchase_price" type="number" step="0.01" defaultValue={selected?.purchase_price ?? ""} className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="batch_number" className={labelClass}>Batch Number</label>
                <input id="batch_number" name="batch_number" defaultValue={selected?.batch_number ?? ""} className={inputClass} placeholder="e.g. B-2026-014" />
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

          {modalMode === "create" && (
            <div className={`border-t border-border pt-4 ${buildsInHouse ? "" : "opacity-60"}`}>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Components</p>
                <button
                  type="button"
                  disabled={!buildsInHouse}
                  onClick={() => setNewComponents((rows) => [...rows, { ...EMPTY_COMPONENT }])}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Component
                </button>
              </div>
              <p className="mb-3 text-2xs text-muted-foreground">
                {buildsInHouse
                  ? "CMS, stand, SMD modules, receiving cards, frame, accessories… each drawn from the warehouse. Stock is not reduced here — the project decides later whether to take each line from inventory or procure it."
                  : "Only in-house builds are assembled from our inventory — a vendor-supplied asset arrives complete."}
              </p>
              {newComponents.length === 0 && (
                <p className="text-xs text-muted-foreground">No components added — single-unit asset.</p>
              )}
              <fieldset disabled={!buildsInHouse} className="space-y-3">
                {newComponents.map((row, i) => (
                  <div key={i} className="rounded-lg border border-border/70 p-3">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select
                        value={row.source}
                        onChange={(e) => setNewComponents((rows) => rows.map((r, j) => (j === i ? { ...r, source: e.target.value as "generic" | "unique", inventory_item: "", inventory_unit_type: "" } : r)))}
                        className={`${inputClass} h-9`}
                        title="Inventory source"
                      >
                        <option value="generic">Stock item</option>
                        <option value="unique">Unique item</option>
                      </select>
                      {row.source === "generic" ? (
                        <select
                          value={row.inventory_item}
                          onChange={(e) => setNewComponents((rows) => rows.map((r, j) => (j === i ? { ...r, inventory_item: e.target.value } : r)))}
                          className={`${inputClass} h-9 sm:col-span-2`}
                        >
                          <option value="">Select stock item…</option>
                          {stockItems.map((it) => (
                            <option key={it.id} value={it.id}>{(it.material_name ?? it.sku)} · {it.quantity} in stock</option>
                          ))}
                        </select>
                      ) : (
                        <select
                          value={row.inventory_unit_type}
                          onChange={(e) => setNewComponents((rows) => rows.map((r, j) => (j === i ? { ...r, inventory_unit_type: e.target.value } : r)))}
                          className={`${inputClass} h-9 sm:col-span-2`}
                        >
                          <option value="">Select unique item…</option>
                          {stockProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {[p.name, p.model_name].filter(Boolean).join(" ")} · {p.in_stock_count} in stock
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Qty needed</span>
                        <input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={(e) => setNewComponents((rows) => rows.map((r, j) => (j === i ? { ...r, quantity: Math.max(1, Number(e.target.value) || 1) } : r)))}
                          title="Quantity"
                          className="flex h-9 w-20 shrink-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                        />
                      </div>
                      <span className="text-2xs text-muted-foreground">
                        Name, serial, supplier and warranty are imported from inventory.
                      </span>
                      <button
                        type="button"
                        onClick={() => setNewComponents((rows) => rows.filter((_, j) => j !== i))}
                        className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-destructive"
                        title="Remove component"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </fieldset>
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
  if (months >= 12) {
    const years = Math.floor(months / 12);
    const rem = months % 12;
    return rem > 0 ? `${years} Year${years > 1 ? "s" : ""} ${rem} Mo` : `${years} Year${years > 1 ? "s" : ""}`;
  }
  return `${months} Month${months !== 1 ? "s" : ""}`;
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40">
      {icon}
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
