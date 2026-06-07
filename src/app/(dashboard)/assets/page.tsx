"use client";

import { ArrowLeft, Eye, HardDrive, ImagePlus, Pencil, Plus, Trash2, X, Download, MapPin, Clock, Shield, Wrench, FileText, ChevronRight, Calendar, DollarSign, Package, Zap, Monitor, Sun } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import { DeviceImage } from "@/components/ui/device-image";
import { StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { formatDate } from "@/lib/utils";
import { useUser } from "@/lib/user-context";

interface Device {
  id: string;
  asset_code: string;
  serial_number: string;
  device_model: string;
  device_model_name: string;
  status: string;
  image: string | null;
  current_site: string | null;
  site_name: string | null;
  assigned_client: string | null;
  client_name: string | null;
  installation_date: string | null;
  created_at: string;
}

interface DeviceDetail extends Device {
  mobile_id: string;
  mac_address: string;
  imei: string;
  brand_name: string | null;
  screen_type: string | null;
  screen_size: string | null;
  specifications: Record<string, unknown>;
  firmware_version: string;
  hardware_revision: string;
  purchase_date: string | null;
  purchase_price: string | null;
  supplier: string | null;
  supplier_name: string | null;
  invoice_reference: string;
  batch_number: string;
  assigned_technician: string | null;
  technician_name: string | null;
  notes: string;
  images: { id: string; image: string; caption: string; is_primary: boolean }[];
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

interface WarrantyItem {
  id: string;
  warranty_type: string;
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

const STATUSES = [
  { value: "procured", label: "Procured" },
  { value: "in_stock", label: "In Stock" },
  { value: "assigned", label: "Assigned" },
  { value: "installed", label: "Installed" },
  { value: "active", label: "Active" },
  { value: "under_maintenance", label: "Under Maintenance" },
  { value: "decommissioned", label: "Decommissioned" },
  { value: "lost_stolen", label: "Lost/Stolen" },
  { value: "rma", label: "RMA" },
  { value: "in_transit", label: "In Transit" },
];

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";

const WARRANTY_TYPE_LABELS: Record<string, string> = {
  manufacturer: "Vendor Warranty",
  extended: "Extended Warranty",
  supplier: "Supplier Warranty",
};

const WARRANTY_COLORS: Record<string, string> = {
  manufacturer: "#3b82f6",
  extended: "#8b5cf6",
  supplier: "#06b6d4",
};

const MAINT_TYPE_BADGE: Record<string, string> = {
  preventive: "bg-blue-500/10 text-blue-400",
  corrective: "bg-red-500/10 text-red-400",
  predictive: "bg-purple-500/10 text-purple-400",
};

export default function AssetsPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("devices");

  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<DeviceDetail | null>(null);
  const [detailView, setDetailView] = useState<DeviceDetail | null>(null);
  const [detailTab, setDetailTab] = useState("overview");
  const [saving, setSaving] = useState(false);

  const [warranties, setWarranties] = useState<WarrantyItem[]>([]);
  const [maintSchedules, setMaintSchedules] = useState<MaintenanceItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);

  const [deviceModels, setDeviceModels] = useState<Option[]>([]);
  const [sites, setSites] = useState<Option[]>([]);
  const [clients, setClients] = useState<Option[]>([]);
  const [suppliers, setSuppliers] = useState<Option[]>([]);
  const [technicians, setTechnicians] = useState<Option[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "" });
  const [search, setSearch] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const searchParams = useSearchParams();
  const autoOpenedRef = useRef(false);

  const fetchDevices = useCallback(async () => {
    try {
      const { data } = await api.get("/assets/devices/");
      setDevices(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load devices"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  useEffect(() => {
    if (autoOpenedRef.current || loading) return;
    const deviceId = searchParams.get("device");
    if (!deviceId) return;
    autoOpenedRef.current = true;
    api.get(`/assets/devices/${deviceId}/`).then(({ data }) => {
      setDetailView(data);
      setDetailTab("overview");
      fetchRelatedData(data.id);
    }).catch(() => {});
  }, [searchParams, loading]);

  async function fetchRelatedData(deviceId: string) {
    const [warRes, maintRes, docRes] = await Promise.allSettled([
      api.get("/warranties/", { params: { device: deviceId } }),
      api.get("/maintenance/schedules/", { params: { device: deviceId } }),
      api.get("/infrastructure/documents/", { params: { device: deviceId } }),
    ]);
    if (warRes.status === "fulfilled") setWarranties(warRes.value.data.results ?? warRes.value.data);
    if (maintRes.status === "fulfilled") setMaintSchedules(maintRes.value.data.results ?? maintRes.value.data);
    if (docRes.status === "fulfilled") setDocuments(docRes.value.data.results ?? docRes.value.data);
  }

  async function loadOptions() {
    const [dm, st, cl, su, tech] = await Promise.allSettled([
      api.get("/assets/device-models/", { params: { page_size: 200 } }),
      api.get("/sites/sites/", { params: { page_size: 200 } }),
      api.get("/clients/", { params: { page_size: 200 } }),
      api.get("/suppliers/", { params: { page_size: 200 } }),
      api.get("/accounts/users/", { params: { is_field_staff: true, is_active: true, page_size: 200 } }),
    ]);
    if (dm.status === "fulfilled") setDeviceModels((dm.value.data.results ?? dm.value.data).map((m: { id: string; name: string; brand_name?: string }) => ({ id: m.id, label: m.brand_name ? `${m.brand_name} ${m.name}` : m.name })));
    if (st.status === "fulfilled") setSites((st.value.data.results ?? st.value.data).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })));
    if (cl.status === "fulfilled") setClients((cl.value.data.results ?? cl.value.data).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })));
    if (su.status === "fulfilled") setSuppliers((su.value.data.results ?? su.value.data).map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })));
    if (tech.status === "fulfilled") setTechnicians((tech.value.data.results ?? tech.value.data).map((u: { id: string; first_name: string; last_name: string; username: string }) => ({
      id: u.id,
      label: u.first_name || u.last_name ? `${u.first_name} ${u.last_name}`.trim() : u.username,
    })));
  }

  function openCreate() {
    setSelected(null);
    setImageFiles([]);
    setImagePreviews([]);
    setModalMode("create");
    loadOptions();
  }

  async function openEdit(device: Device) {
    try {
      const { data } = await api.get(`/assets/devices/${device.id}/`);
      setSelected(data);
      setImageFiles([]);
      setImagePreviews([]);
      setModalMode("edit");
      loadOptions();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load device details"));
    }
  }

  async function openDetail(device: Device) {
    try {
      const { data } = await api.get(`/assets/devices/${device.id}/`);
      setDetailView(data);
      setDetailTab("overview");
      fetchRelatedData(data.id);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load device details"));
    }
  }

  function closeModal() { setModalMode(null); setSelected(null); setImageFiles([]); setImagePreviews([]); }

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
      serial_number: fd.get("serial_number"),
      status: fd.get("status"),
      device_model: fd.get("device_model") || undefined,
      mobile_id: fd.get("mobile_id"),
      mac_address: fd.get("mac_address"),
      imei: fd.get("imei"),
      firmware_version: fd.get("firmware_version"),
      notes: fd.get("notes"),
      current_site: fd.get("current_site") || null,
      assigned_client: fd.get("assigned_client") || null,
      assigned_technician: fd.get("assigned_technician") || null,
      supplier: fd.get("supplier") || null,
      purchase_date: fd.get("purchase_date") || null,
      purchase_price: fd.get("purchase_price") || null,
      installation_date: fd.get("installation_date") || null,
    };
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
    if (!confirm(`Delete device "${device.asset_code}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/assets/devices/${device.id}/`);
      toast.success("Device deleted");
      fetchDevices();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete — device has linked records"));
    }
  }

  const filtered = devices.filter((d) => {
    if (filterValues.status && d.status !== filterValues.status) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.asset_code.toLowerCase().includes(q) && !d.serial_number.toLowerCase().includes(q) && !(d.device_model_name || "").toLowerCase().includes(q) && !(d.site_name || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  /* ─── DETAIL VIEW ─── */
  if (detailView) {
    const d = detailView;
    const specs = d.specifications ?? {};
    const allImages = [
      ...(d.image ? [{ id: "primary", image: d.image, caption: "Primary", is_primary: true }] : []),
      ...(d.images ?? []),
    ];
    const primaryImg = allImages[0]?.image ?? null;

    const vendorWarranty = warranties.find((w) => w.warranty_type === "manufacturer");
    const customerWarranty = warranties.find((w) => w.warranty_type === "extended" || w.warranty_type === "supplier");

    return (
      <div className="space-y-6">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setDetailView(null); setWarranties([]); setMaintSchedules([]); setDocuments([]); }} className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Assets
          </button>
          <div className="ml-auto flex gap-2">
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
                        <div className="flex h-10 w-12 items-center justify-center rounded-md bg-secondary/50 text-[10px] font-medium text-muted-foreground">+{allImages.length - 4}</div>
                      )}
                    </div>
                  )}
                </div>

                {/* Name + metadata grid */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-3 mb-4">
                    <StatusBadge status={d.status} />
                    <div>
                      <h1 className="text-xl font-bold text-foreground leading-tight">{d.device_model_name || "LED Screen"}</h1>
                      {d.brand_name && <p className="text-sm text-muted-foreground">{d.brand_name}</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                    <MetaField label="Asset ID" value={d.asset_code} mono />
                    <MetaField label="Serial Number" value={d.serial_number} />
                    <MetaField label="Asset Type" value={d.screen_type || (specs.asset_type as string)} />
                    <MetaField label="Model / Series" value={d.device_model_name} />
                    <MetaField label="Manufacturer" value={d.brand_name} />
                    <MetaField label="Installation Date" value={d.installation_date ? formatDate(d.installation_date) : null} />
                    <MetaField label="Location" value={d.site_name} highlight />
                    <MetaField label="Status" value={d.status?.replace(/_/g, " ")} capitalize />
                    <MetaField label="Screen Size" value={d.screen_size || (specs.screen_size as string)} />
                    <MetaField label="Resolution" value={specs.resolution as string} />
                    <MetaField label="Pixel Pitch" value={specs.pixel_pitch as string} />
                    <MetaField label="Brightness" value={specs.brightness as string} />
                    <MetaField label="IP Rating" value={specs.ip_rating as string} />
                    <MetaField label="Dimensions" value={specs.dimensions as string} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Overview sidebar */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Quick Overview</h3>
            <div className="space-y-3">
              <OverviewRow icon={<Package className="h-4 w-4 text-blue-400" />} label="Total Modules" value={specs.total_modules as string} />
              <OverviewRow icon={<HardDrive className="h-4 w-4 text-cyan-400" />} label="Total Cabinets" value={specs.total_cabinets as string} />
              <OverviewRow icon={<Zap className="h-4 w-4 text-amber-400" />} label="Power Consumption" value={specs.power_consumption as string} />
              <OverviewRow icon={<Clock className="h-4 w-4 text-green-400" />} label="Daily Runtime" value={specs.daily_runtime as string} />
              <OverviewRow icon={<Sun className="h-4 w-4 text-orange-400" />} label="Brightness" value={specs.brightness as string} />
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
                      <h4 className="text-sm font-semibold text-foreground mb-3">Device Information</h4>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <InfoCard label="Asset Code" value={d.asset_code} />
                        <InfoCard label="Serial Number" value={d.serial_number} />
                        <InfoCard label="Model" value={d.device_model_name} />
                        <InfoCard label="Brand" value={d.brand_name} />
                        <InfoCard label="Screen Type" value={d.screen_type} />
                        <InfoCard label="Screen Size" value={d.screen_size} />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Technical Details</h4>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <InfoCard label="MAC Address" value={d.mac_address} />
                        <InfoCard label="IMEI" value={d.imei} />
                        <InfoCard label="CMS Device ID" value={d.mobile_id} />
                        <InfoCard label="Firmware Version" value={d.firmware_version} />
                        <InfoCard label="Hardware Revision" value={d.hardware_revision} />
                        {Object.entries(specs).map(([key, val]) => (
                          <InfoCard key={key} label={key.replace(/_/g, " ")} value={String(val ?? "")} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-foreground mb-3">Assignment</h4>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <InfoCard label="Site" value={d.site_name} />
                        <InfoCard label="Client" value={d.client_name} />
                        <InfoCard label="Technician" value={d.technician_name} />
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
                {detailTab === "warranties" && (
                  <div>
                    {warranties.length > 0 ? (
                      <div className="space-y-4">
                        {warranties.map((w) => (
                          <div key={w.id} className="rounded-xl border border-border p-5 flex flex-col sm:flex-row sm:items-start gap-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${WARRANTY_COLORS[w.warranty_type] ?? "#6366f1"}15` }}>
                              <Shield className="h-5 w-5" style={{ color: WARRANTY_COLORS[w.warranty_type] ?? "#6366f1" }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="text-sm font-semibold text-foreground">{WARRANTY_TYPE_LABELS[w.warranty_type] ?? w.warranty_type}</h4>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${w.is_expired ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                                  {w.is_expired ? "Expired" : "Active"}
                                </span>
                              </div>
                              {w.supplier_name && <p className="text-xs text-muted-foreground mb-1">Provider: {w.supplier_name}</p>}
                              <p className="text-xs text-muted-foreground">{w.coverage_details || "Comprehensive coverage"}</p>
                              <div className="flex items-center gap-4 mt-2">
                                <span className="text-[11px] text-muted-foreground">
                                  <Calendar className="inline h-3 w-3 mr-1" />{formatDate(w.start_date)} → {formatDate(w.end_date)}
                                </span>
                                {w.reference_number && <span className="text-[11px] text-muted-foreground">Ref: {w.reference_number}</span>}
                              </div>
                              {/* Timeline bar */}
                              <div className="mt-3">
                                <WarrantyTimeline start={w.start_date} end={w.end_date} color={WARRANTY_COLORS[w.warranty_type] ?? "#6366f1"} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState icon={<Shield className="h-10 w-10" />} text="No warranties recorded for this device." />
                    )}
                  </div>
                )}

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
                              <p className="text-[11px] text-muted-foreground">{doc.doc_type} · {doc.uploaded_by_name} · {formatDate(doc.created_at)}</p>
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
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ring-current/20 ${MAINT_TYPE_BADGE[m.maintenance_type] ?? "bg-gray-500/10 text-gray-400"}`}>
                                  {m.maintenance_type}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Frequency: {m.frequency} · Next Due: {formatDate(m.next_due)}
                                {m.assigned_to_name && ` · Assigned: ${m.assigned_to_name}`}
                              </p>
                            </div>
                            <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${m.is_active ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-400"}`}>
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
                    {(d.lifecycle_events ?? []).length > 0 ? d.lifecycle_events.map((evt) => (
                      <div key={evt.id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                        <div className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground capitalize">{evt.event_type.replace("_", " ")}</p>
                          {evt.description && <p className="text-[10px] text-muted-foreground">{evt.description}</p>}
                          {evt.from_value && evt.to_value && (
                            <p className="text-[10px] text-muted-foreground">{evt.from_value} → {evt.to_value}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-muted-foreground">{formatDate(evt.created_at)}</p>
                          {evt.performed_by_name && <p className="text-[10px] text-muted-foreground">{evt.performed_by_name}</p>}
                        </div>
                      </div>
                    )) : (
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

            {/* Warranty timeline summary */}
            {warranties.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Warranty Timeline</h3>
                <div className="space-y-3">
                  {warranties.map((w) => (
                    <div key={w.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{WARRANTY_TYPE_LABELS[w.warranty_type] ?? w.warranty_type}</span>
                        <span className="text-[10px] text-muted-foreground">{formatDate(w.end_date)}</span>
                      </div>
                      <WarrantyTimeline start={w.start_date} end={w.end_date} color={WARRANTY_COLORS[w.warranty_type] ?? "#6366f1"} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
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
            <h1 className="text-2xl font-bold text-foreground">Device Registry</h1>
            <p className="text-sm text-muted-foreground">Manage all devices from procurement to retirement</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Add Device
          </button>
        )}
      </div>

      <FilterBar
        filters={[
          { key: "status", label: "Status", options: STATUSES.map((s) => ({ value: s.value, label: s.label })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by asset code, serial #..."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <HardDrive className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No devices registered</h3>
          <p className="mt-2 text-sm text-muted-foreground">Register your first device to start tracking your asset fleet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Device</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Serial #</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Model</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Site</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Client</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} onClick={() => openDetail(d)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <DeviceImage src={d.image} alt={d.asset_code} size="sm" />
                        <span className="font-mono text-sm font-medium text-primary">{d.asset_code}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{d.serial_number}</td>
                    <td className="px-5 py-3 text-foreground">{d.device_model_name || "—"}</td>
                    <td className="px-5 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-5 py-3 text-muted-foreground">{d.site_name || "—"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{d.client_name || "—"}</td>
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
      <Modal open={!!modalMode} onClose={closeModal} title={modalMode === "create" ? "Register New Device" : "Edit Device"} size="xl">
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {modalMode === "edit" && selected && (
            <div className="space-y-1.5">
              <label className={labelClass}>Asset Code</label>
              <input type="text" value={selected.asset_code} disabled className="flex h-10 w-full rounded-lg border border-border bg-secondary px-3 text-sm font-mono text-primary" />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="serial_number" className={labelClass}>Serial Number *</label>
              <input id="serial_number" name="serial_number" required defaultValue={selected?.serial_number ?? ""} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="device_model" className={labelClass}>Device Model *</label>
              <select id="device_model" name="device_model" required defaultValue={selected?.device_model ?? ""} className={inputClass}>
                <option value="">Select model</option>
                {deviceModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label htmlFor="status" className={labelClass}>Status</label>
              <select id="status" name="status" defaultValue={selected?.status ?? "procured"} className={inputClass}>
                {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="mac_address" className={labelClass}>MAC Address</label>
              <input id="mac_address" name="mac_address" defaultValue={selected?.mac_address ?? ""} className={inputClass} placeholder="AA:BB:CC:DD:EE:FF" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="imei" className={labelClass}>IMEI</label>
              <input id="imei" name="imei" defaultValue={selected?.imei ?? ""} className={inputClass} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="mobile_id" className={labelClass}>CMS Device ID</label>
              <input id="mobile_id" name="mobile_id" defaultValue={selected?.mobile_id ?? ""} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="firmware_version" className={labelClass}>Firmware Version</label>
              <input id="firmware_version" name="firmware_version" defaultValue={selected?.firmware_version ?? ""} className={inputClass} />
            </div>
          </div>

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
            </div>
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <div className="space-y-1.5">
                <label htmlFor="assigned_technician" className={labelClass}>Assigned Technician</label>
                <select id="assigned_technician" name="assigned_technician" defaultValue={selected?.assigned_technician ?? ""} className={inputClass}>
                  <option value="">None</option>
                  {technicians.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="installation_date" className={labelClass}>Installation Date</label>
                <input id="installation_date" name="installation_date" type="date" defaultValue={selected?.installation_date ?? ""} className={inputClass} />
              </div>
            </div>
          </div>

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
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Device Images</p>
            <div className="flex flex-wrap gap-3">
              {modalMode === "edit" && selected?.images?.map((img) => (
                <div key={img.id} className="relative group">
                  <img src={img.image} alt={img.caption || "Device"} className="h-20 w-20 rounded-lg object-cover border border-border" />
                  {img.is_primary && (
                    <span className="absolute -top-1.5 -left-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">Primary</span>
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
                <span className="mt-1 text-[9px]">Add Image</span>
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
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-sm ${mono ? "font-mono" : ""} ${highlight ? "text-primary font-medium" : "text-foreground"} ${cap ? "capitalize" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg bg-secondary/30 px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
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
          {expired && <span className="text-[10px] text-red-400">Expired</span>}
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground mb-0.5">{duration}</p>
      <p className="text-xs text-muted-foreground mb-1">{detail}</p>
      <p className="text-[11px] text-muted-foreground">Valid Till: {formatDate(validTill)}</p>
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
  const months = (endD.getFullYear() - startD.getFullYear()) * 12 + (endD.getMonth() - startD.getMonth());
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
