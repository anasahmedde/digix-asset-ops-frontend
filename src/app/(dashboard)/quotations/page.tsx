"use client";

import { ChevronDown, ChevronRight, ClipboardList, FileDown, Pencil, Plus, ReceiptText, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { SegmentBar, StatTiles } from "@/components/ui/analytics-strip";
import { CopyButton } from "@/components/ui/copy-button";
import { FilterBar } from "@/components/ui/filter-bar";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { CURRENCIES } from "@/lib/currency";
import { useUser } from "@/lib/user-context";

type QuotationStatus = "draft" | "sent" | "under_negotiation" | "accepted" | "rejected" | "expired";

interface QuotationItem {
  id: string;
  asset_type: string | null;
  asset_type_name: string | null;
  device_model: string | null;
  device_model_name: string | null;
  material_type: string | null;
  material_type_name: string | null;
  description: string;
  quantity: number;
  unit_price: string;
  line_total: string;
}

interface Quotation {
  id: string;
  quote_number: string;
  title: string;
  description: string;
  client: string;
  client_name: string | null;
  site: string | null;
  site_name: string | null;
  currency: string;
  valid_until: string | null;
  status: QuotationStatus;
  total_amount: string;
  notes: string;
  created_by_name: string | null;
  accepted_at: string | null;
  spawned_project: string | null;
  items: QuotationItem[];
}

interface ClientOpt {
  id: string;
  name: string;
}

interface SiteOpt {
  id: string;
  name: string;
  client: string | null;
}

interface Option {
  id: string;
  label: string;
}

type ItemKind = "custom" | "asset" | "material";

interface ItemRow {
  id?: string;
  kind: ItemKind;
  device_model: string;
  material_type: string;
  description: string;
  quantity: string;
  unit_price: string;
}

interface FormState {
  title: string;
  client: string;
  site: string;
  currency: string;
  valid_until: string;
  description: string;
  notes: string;
  items: ItemRow[];
}

const emptyItem: ItemRow = {
  kind: "custom",
  device_model: "",
  material_type: "",
  description: "",
  quantity: "1",
  unit_price: "0",
};

const emptyForm: FormState = {
  title: "",
  client: "",
  site: "",
  currency: "PKR",
  valid_until: "",
  description: "",
  notes: "",
  items: [{ ...emptyItem }],
};

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
// inputClass minus w-full — for row inputs with explicit widths (w-20/w-32/w-36),
// where the baked-in w-full would win Tailwind's cascade and break the layout.
const rowInputClass = inputClass.replace("w-full ", "");
const thClass = "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const STATUS_BADGES: Record<QuotationStatus, string> = {
  draft: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
  sent: "bg-indigo-500/10 text-indigo-400 ring-indigo-500/20",
  under_negotiation: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  accepted: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  rejected: "bg-red-500/10 text-red-400 ring-red-500/20",
  expired: "bg-zinc-500/10 text-zinc-400 ring-zinc-500/20",
};

const STATUS_COLORS: Record<QuotationStatus, string> = {
  draft: "#94a3b8",
  sent: "#6366f1",
  under_negotiation: "#f59e0b",
  accepted: "#10b981",
  rejected: "#ef4444",
  expired: "#71717a",
};

const ALL_STATUSES: QuotationStatus[] = ["draft", "sent", "under_negotiation", "accepted", "rejected", "expired"];

// Mirrors the backend transition machine exactly.
const TRANSITIONS: Record<QuotationStatus, Array<{ status: QuotationStatus; label: string; danger?: boolean }>> = {
  draft: [{ status: "sent", label: "Send to Client" }],
  sent: [
    { status: "under_negotiation", label: "Start Negotiation" },
    { status: "accepted", label: "Accept" },
    { status: "rejected", label: "Reject", danger: true },
    { status: "expired", label: "Mark Expired", danger: true },
  ],
  under_negotiation: [
    { status: "accepted", label: "Accept" },
    { status: "rejected", label: "Reject", danger: true },
    { status: "expired", label: "Mark Expired", danger: true },
  ],
  accepted: [],
  rejected: [],
  expired: [],
};

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function QuotationsPage() {
  const { canWrite } = useUser();
  const canEdit = canWrite("quotations");

  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [deviceModels, setDeviceModels] = useState<Option[]>([]);
  const [materialTypes, setMaterialTypes] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<Quotation | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [pendingTransition, setPendingTransition] = useState<{
    quotation: Quotation;
    status: QuotationStatus;
    label: string;
  } | null>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [transitioning, setTransitioning] = useState(false);

  const fetchQuotations = useCallback(async () => {
    try {
      const { data } = await api.get("/quotations/quotations/");
      setQuotations(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load quotations"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuotations();
    api.get("/clients/", { params: { page_size: 200 } })
      .then((r) => setClients(r.data.results ?? r.data))
      .catch(() => {});
    api.get("/sites/sites/", { params: { page_size: 1000 } })
      .then((r) =>
        setSites(
          (r.data.results ?? r.data).map((s: { id: string; name: string; client: string | null }) => ({
            id: s.id,
            name: s.name,
            client: s.client ?? null,
          }))
        )
      )
      .catch(() => {});
    api.get("/assets/device-models/", { params: { page_size: 200 } })
      .then((r) =>
        setDeviceModels(
          (r.data.results ?? r.data).map((m: { id: string; name: string; brand_name?: string }) => ({
            id: m.id,
            label: m.brand_name ? `${m.brand_name} ${m.name}` : m.name,
          }))
        )
      )
      .catch(() => {});
    api.get("/assets/material-types/", { params: { page_size: 200 } })
      .then((r) =>
        setMaterialTypes(
          (r.data.results ?? r.data).map((m: { id: string; name: string }) => ({ id: m.id, label: m.name }))
        )
      )
      .catch(() => {});
  }, [fetchQuotations]);

  // Sites shown in the picker are limited to the selected client.
  const clientSites = form.client ? sites.filter((s) => s.client === form.client) : [];
  const itemsLocked = modalMode === "edit" && selected !== null && selected.status !== "draft";

  function openCreate() {
    setSelected(null);
    setForm({ ...emptyForm, items: [{ ...emptyItem }] });
    setModalMode("create");
  }

  async function openEdit(id: string) {
    try {
      const { data } = await api.get<Quotation>(`/quotations/quotations/${id}/`);
      setSelected(data);
      setForm({
        title: data.title,
        client: data.client,
        site: data.site ?? "",
        currency: data.currency || "PKR",
        valid_until: data.valid_until ?? "",
        description: data.description ?? "",
        notes: data.notes ?? "",
        items: data.items.length
          ? data.items.map((i) => ({
              id: i.id,
              kind: (i.device_model ? "asset" : i.material_type ? "material" : "custom") as ItemKind,
              device_model: i.device_model ?? "",
              material_type: i.material_type ?? "",
              description: i.description,
              quantity: String(i.quantity),
              unit_price: String(i.unit_price),
            }))
          : [{ ...emptyItem }],
      });
      setModalMode("edit");
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load quotation"));
    }
  }

  function closeModal() {
    setModalMode(null);
    setSelected(null);
  }

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  }
  function setItemKind(idx: number, kind: ItemKind) {
    updateItem(idx, { kind, device_model: "", material_type: "" });
  }
  function pickDeviceModel(idx: number, id: string) {
    const opt = deviceModels.find((m) => m.id === id);
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) =>
        i === idx
          ? { ...it, device_model: id, description: it.description.trim() ? it.description : opt?.label ?? "" }
          : it
      ),
    }));
  }
  function pickMaterialType(idx: number, id: string) {
    const opt = materialTypes.find((m) => m.id === id);
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) =>
        i === idx
          ? { ...it, material_type: id, description: it.description.trim() ? it.description : opt?.label ?? "" }
          : it
      ),
    }));
  }
  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, { ...emptyItem }] }));
  }
  function removeItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  const rowTotal = (it: ItemRow) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
  const formTotal = form.items.reduce((sum, it) => sum + rowTotal(it), 0);

  const isRowEmpty = (it: ItemRow) =>
    !it.description.trim() &&
    !it.device_model &&
    !it.material_type &&
    (it.quantity === "" || it.quantity === emptyItem.quantity) &&
    (Number(it.unit_price) || 0) === 0;

  function itemTypeLabel(item: QuotationItem): string {
    if (item.device_model) return item.device_model_name ?? deviceModels.find((m) => m.id === item.device_model)?.label ?? "Asset model";
    if (item.material_type) return item.material_type_name ?? materialTypes.find((m) => m.id === item.material_type)?.label ?? "Material";
    if (item.asset_type) return item.asset_type_name ?? "Asset type";
    return "—";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.client) {
      toast.error("Please select a client");
      return;
    }
    let items: Array<Record<string, unknown>> | undefined;
    if (!itemsLocked) {
      const missingDescription = form.items.findIndex((it) => !isRowEmpty(it) && !it.description.trim());
      if (missingDescription !== -1) {
        toast.error(`Line item ${missingDescription + 1} is missing a description`);
        return;
      }
      items = form.items
        .filter((it) => !isRowEmpty(it))
        .map((it) => ({
          ...(it.id ? { id: it.id } : {}),
          description: it.description.trim(),
          quantity: Number(it.quantity) || 1,
          unit_price: Number(it.unit_price) || 0,
          device_model: it.kind === "asset" && it.device_model ? it.device_model : null,
          material_type: it.kind === "material" && it.material_type ? it.material_type : null,
        }));
      if (items.length === 0) {
        toast.error("Add at least one line item");
        return;
      }
    }
    setSaving(true);
    const payload = {
      title: form.title,
      client: form.client,
      site: form.site || null,
      currency: form.currency,
      valid_until: form.valid_until || null,
      description: form.description,
      notes: form.notes,
      // Item writes are rejected by the API once a quotation leaves draft.
      ...(items !== undefined ? { items } : {}),
    };
    try {
      if (modalMode === "create") {
        await api.post("/quotations/quotations/", payload);
        toast.success("Quotation created");
      } else if (selected) {
        await api.patch(`/quotations/quotations/${selected.id}/`, payload);
        toast.success("Quotation updated");
      }
      closeModal();
      fetchQuotations();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to save quotation"));
    } finally {
      setSaving(false);
    }
  }

  function openTransition(quotation: Quotation, status: QuotationStatus, label: string) {
    setTransitionNote("");
    setPendingTransition({ quotation, status, label });
  }

  async function confirmTransition() {
    if (!pendingTransition) return;
    const { quotation, status } = pendingTransition;
    setTransitioning(true);
    try {
      await api.post(`/quotations/quotations/${quotation.id}/transition/`, {
        status,
        ...(transitionNote.trim() ? { notes: transitionNote.trim() } : {}),
      });
      toast.success(
        status === "accepted"
          ? `Quotation accepted — project spawned from ${quotation.quote_number}`
          : `Moved to ${statusLabel(status)}`
      );
      setPendingTransition(null);
      closeModal();
      fetchQuotations();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Status change failed"));
    } finally {
      setTransitioning(false);
    }
  }

  async function handlePrint(q: Quotation) {
    try {
      const res = await api.get(`/quotations/quotations/${q.id}/print/`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, "_blank");
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to generate PDF"));
    }
  }

  async function handleDelete(q: Quotation) {
    if (!confirm(`Delete quotation ${q.quote_number}? This cannot be undone.`)) return;
    try {
      await api.delete(`/quotations/quotations/${q.id}/`);
      toast.success("Quotation deleted");
      fetchQuotations();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Cannot delete quotation"));
    }
  }

  function renderTransitionBar(q: Quotation) {
    const actions = TRANSITIONS[q.status] ?? [];
    const showProject = q.status === "accepted" && q.spawned_project;
    if ((!canEdit || actions.length === 0) && !showProject) return null;
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3">
        {canEdit && actions.length > 0 && (
          <>
            <span className="text-xs font-medium text-muted-foreground">Advance status:</span>
            {actions.map((a) => (
              <button
                key={a.status}
                type="button"
                onClick={() => openTransition(q, a.status, a.label)}
                className={`rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary ${
                  a.danger ? "text-red-400 hover:text-red-400" : "text-foreground"
                }`}
              >
                {a.label}
              </button>
            ))}
          </>
        )}
        {showProject && (
          <Link
            href="/projects"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500 transition-colors hover:bg-emerald-500/20"
          >
            <ClipboardList className="h-3.5 w-3.5" /> View project
          </Link>
        )}
      </div>
    );
  }

  const statusCounts = ALL_STATUSES.reduce<Record<QuotationStatus, number>>(
    (acc, s) => {
      acc[s] = quotations.filter((q) => q.status === s).length;
      return acc;
    },
    { draft: 0, sent: 0, under_negotiation: 0, accepted: 0, rejected: 0, expired: 0 }
  );

  const toggleStatus = (s: string) => setStatusFilter((cur) => (cur === s ? "" : s));

  const filtered = quotations.filter((q) => {
    if (statusFilter && q.status !== statusFilter) return false;
    if (search) {
      const t = search.toLowerCase();
      if (
        !q.quote_number.toLowerCase().includes(t) &&
        !q.title.toLowerCase().includes(t) &&
        !(q.client_name || "").toLowerCase().includes(t)
      )
        return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600">
            <ReceiptText className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Quotations</h1>
            <p className="text-muted-foreground">Client quotes — accepted quotes spawn projects automatically</p>
          </div>
        </div>
        {canEdit && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
            <Plus className="h-4 w-4" /> New Quotation
          </button>
        )}
      </div>

      {!loading && quotations.length > 0 && (
        <div className="space-y-3">
          <StatTiles
            tiles={[
              { key: "total", label: "Total", value: quotations.length, tone: "default", active: statusFilter === "", onClick: () => setStatusFilter("") },
              { key: "draft", label: "Draft", value: statusCounts.draft, tone: "default", active: statusFilter === "draft", onClick: () => toggleStatus("draft") },
              { key: "sent", label: "Sent", value: statusCounts.sent, tone: "primary", active: statusFilter === "sent", onClick: () => toggleStatus("sent") },
              { key: "under_negotiation", label: "Negotiating", value: statusCounts.under_negotiation, tone: "amber", active: statusFilter === "under_negotiation", onClick: () => toggleStatus("under_negotiation") },
              { key: "accepted", label: "Accepted", value: statusCounts.accepted, tone: "emerald", active: statusFilter === "accepted", onClick: () => toggleStatus("accepted") },
              { key: "rejected", label: "Rejected", value: statusCounts.rejected, tone: "red", active: statusFilter === "rejected", onClick: () => toggleStatus("rejected") },
            ]}
          />
          <SegmentBar
            segments={ALL_STATUSES.map((s) => ({
              key: s,
              label: statusLabel(s),
              count: statusCounts[s],
              color: STATUS_COLORS[s],
            }))}
            active={statusFilter || undefined}
            onSelect={toggleStatus}
          />
        </div>
      )}

      <FilterBar
        filters={[
          { key: "status", label: "Status", options: ALL_STATUSES.map((s) => ({ value: s, label: statusLabel(s) })) },
        ]}
        values={{ status: statusFilter }}
        onChange={(_k, v) => setStatusFilter(v)}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by quote #, title, client..."
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ReceiptText className="mx-auto h-12 w-12 text-muted-foreground/30" />
          <h3 className="mt-4 text-lg font-semibold text-foreground">No quotations found</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {quotations.length > 0 ? "Try adjusting your filters." : "Create a quotation to start quoting clients."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className={thClass}>Quote #</th>
                  <th className={thClass}>Title</th>
                  <th className={thClass}>Client</th>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Total</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}>Valid Until</th>
                  <th className={thClass}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((q) => (
                  <Fragment key={q.id}>
                    <tr
                      onClick={() => setExpandedId((cur) => (cur === q.id ? null : q.id))}
                      className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30"
                    >
                      <td className={`${tdClass} font-mono text-foreground`}>
                        <span className="inline-flex items-center gap-1.5">
                          {expandedId === q.id ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                          {q.quote_number}
                          <CopyButton text={q.quote_number} label="Quote #" />
                        </span>
                      </td>
                      <td className={`${tdClass} font-medium text-foreground`}>{q.title}</td>
                      <td className={`${tdClass} text-muted-foreground`}>{q.client_name || "-"}</td>
                      <td className={`${tdClass} text-muted-foreground`}>{q.site_name || "-"}</td>
                      <td className={`${tdClass} font-medium text-foreground`}>
                        {q.currency} {Number(q.total_amount).toLocaleString()}
                      </td>
                      <td className={tdClass}>
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGES[q.status] ?? ""}`}>
                          {statusLabel(q.status)}
                        </span>
                      </td>
                      <td className={`${tdClass} text-muted-foreground`}>{q.valid_until || "-"}</td>
                      <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handlePrint(q)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            title="Print PDF"
                          >
                            <FileDown className="h-3.5 w-3.5" />
                          </button>
                          {canEdit && (
                            <>
                              <button
                                onClick={() => openEdit(q.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(q)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === q.id && (
                      <tr className="border-b border-border bg-secondary/20">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="space-y-3">
                            {q.items && q.items.length > 0 ? (
                              <div className="overflow-x-auto rounded-lg border border-border">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-border bg-secondary/40">
                                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</th>
                                      <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Qty</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Unit Price</th>
                                      <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Line Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {q.items.map((item, i) => (
                                      <tr key={item.id ?? i} className="border-b border-border last:border-0">
                                        <td className="px-4 py-2 text-foreground">{item.description}</td>
                                        <td className="px-4 py-2 text-muted-foreground">{itemTypeLabel(item)}</td>
                                        <td className="px-4 py-2 text-right text-muted-foreground">{item.quantity}</td>
                                        <td className="px-4 py-2 text-right text-muted-foreground">{Number(item.unit_price).toLocaleString()}</td>
                                        <td className="px-4 py-2 text-right font-medium text-foreground">
                                          {Number(item.line_total ?? item.quantity * Number(item.unit_price)).toLocaleString()}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot>
                                    <tr className="bg-secondary/30">
                                      <td colSpan={4} className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Grand Total</td>
                                      <td className="px-4 py-2 text-right font-semibold text-foreground">
                                        {q.currency} {Number(q.total_amount).toLocaleString()}
                                      </td>
                                    </tr>
                                  </tfoot>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">No line items on this quotation.</p>
                            )}
                            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                              {q.created_by_name && (
                                <span><span className="font-medium text-foreground">Created by:</span> {q.created_by_name}</span>
                              )}
                              {q.accepted_at && (
                                <span><span className="font-medium text-foreground">Accepted:</span> {new Date(q.accepted_at).toLocaleString()}</span>
                              )}
                            </div>
                            {q.notes && (
                              <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Notes:</span> {q.notes}</p>
                            )}
                            {renderTransitionBar(q)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 py-8 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                  {modalMode === "create" ? "New Quotation" : `Edit ${selected?.quote_number}`}
                </h2>
                {modalMode === "edit" && selected && (
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_BADGES[selected.status] ?? ""}`}>
                    {statusLabel(selected.status)}
                  </span>
                )}
              </div>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            {modalMode === "edit" && selected && <div className="mb-4">{renderTransitionBar(selected)}</div>}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className={labelClass}>Quote Number</label>
                  <div className={`${inputClass} items-center bg-secondary/30 text-muted-foreground`}>
                    {modalMode === "create" ? "Auto-generated on save" : selected?.quote_number}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="q-title" className={labelClass}>Title</label>
                  <input
                    id="q-title"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. SMD screens for HQ lobby"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="q-client" className={labelClass}>Client</label>
                  <select
                    id="q-client"
                    required
                    value={form.client}
                    onChange={(e) => {
                      const client = e.target.value;
                      setForm((f) => ({
                        ...f,
                        client,
                        site: sites.some((s) => s.id === f.site && s.client === client) ? f.site : "",
                      }));
                    }}
                    className={inputClass}
                  >
                    <option value="">Select client…</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="q-site" className={labelClass}>Site (optional)</label>
                  <select
                    id="q-site"
                    value={form.site}
                    onChange={(e) => setForm({ ...form, site: e.target.value })}
                    disabled={!form.client}
                    className={`${inputClass} disabled:opacity-50`}
                  >
                    <option value="">{form.client ? "No specific site" : "Select a client first"}</option>
                    {clientSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="q-currency" className={labelClass}>Currency</label>
                  <select id="q-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputClass}>
                    {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="q-valid" className={labelClass}>Valid Until</label>
                  <input id="q-valid" type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} className={inputClass} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <label htmlFor="q-description" className={labelClass}>Description</label>
                  <textarea
                    id="q-description"
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={`${inputClass} h-auto py-2`}
                  />
                </div>
              </div>

              {/* Line items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>Line Items</label>
                  {!itemsLocked && (
                    <button type="button" onClick={addItem} className="text-xs font-medium text-primary">+ Add item</button>
                  )}
                </div>
                {itemsLocked && (
                  <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-500">
                    Line items are locked once a quotation leaves draft.
                  </p>
                )}
                {form.items.map((it, idx) => (
                  <div key={it.id ?? `new-${idx}`} className="space-y-2 rounded-lg border border-border p-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={it.kind}
                        onChange={(e) => setItemKind(idx, e.target.value as ItemKind)}
                        disabled={itemsLocked}
                        className={`${rowInputClass} w-36 shrink-0 disabled:opacity-50`}
                        title="Item type"
                      >
                        <option value="custom">Free text</option>
                        <option value="asset">Asset model</option>
                        <option value="material">Material</option>
                      </select>
                      {it.kind === "asset" && (
                        <select value={it.device_model} onChange={(e) => pickDeviceModel(idx, e.target.value)} disabled={itemsLocked} className={`${inputClass} flex-1 disabled:opacity-50`}>
                          <option value="">Select asset model…</option>
                          {deviceModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      )}
                      {it.kind === "material" && (
                        <select value={it.material_type} onChange={(e) => pickMaterialType(idx, e.target.value)} disabled={itemsLocked} className={`${inputClass} flex-1 disabled:opacity-50`}>
                          <option value="">Select material type…</option>
                          {materialTypes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      )}
                      <div className="ml-auto shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
                        Line total{" "}
                        <span className="font-medium text-foreground">{form.currency} {rowTotal(it).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={it.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        disabled={itemsLocked}
                        placeholder="Description"
                        className={`${inputClass} min-w-0 flex-1 disabled:opacity-50`}
                      />
                      <input
                        type="number"
                        min="1"
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: e.target.value })}
                        disabled={itemsLocked}
                        placeholder="Qty"
                        className={`${rowInputClass} w-20 disabled:opacity-50`}
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.unit_price}
                        onChange={(e) => updateItem(idx, { unit_price: e.target.value })}
                        disabled={itemsLocked}
                        placeholder="Unit price"
                        className={`${rowInputClass} w-32 disabled:opacity-50`}
                      />
                      {!itemsLocked && (
                        <button type="button" onClick={() => removeItem(idx)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <div className="text-right text-sm font-medium text-foreground">Grand Total: {form.currency} {formTotal.toLocaleString()}</div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="q-notes" className={labelClass}>Notes</label>
                <textarea id="q-notes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={`${inputClass} h-auto py-2`} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Create Quotation" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingTransition && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">
              {pendingTransition.label} — {pendingTransition.quotation.quote_number}?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {pendingTransition.status === "accepted"
                ? "Accepting is final: it stamps the acceptance time and spawns a project with this quote's line items as its BOM."
                : ["rejected", "expired"].includes(pendingTransition.status)
                  ? "This is a terminal status and cannot be undone."
                  : `Move this quotation to ${statusLabel(pendingTransition.status)}.`}
            </p>
            <div className="mt-4 space-y-1.5">
              <label htmlFor="q-transition-note" className={labelClass}>Note (optional)</label>
              <textarea
                id="q-transition-note"
                rows={2}
                value={transitionNote}
                onChange={(e) => setTransitionNote(e.target.value)}
                placeholder="Add context for this status change…"
                className={`${inputClass} h-auto py-2`}
              />
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPendingTransition(null)}
                className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTransition}
                disabled={transitioning}
                className={`inline-flex h-10 items-center rounded-lg px-5 text-sm font-medium text-white transition-all disabled:opacity-50 ${
                  ["rejected", "expired"].includes(pendingTransition.status) ? "bg-red-600 hover:bg-red-500" : "bg-primary"
                }`}
              >
                {transitioning ? "Working..." : pendingTransition.label}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
