"use client";

import { ArrowRight, Check, Settings2 } from "lucide-react";
import { useState } from "react";

import { ActiveBadge, ColumnSpec, CrudManager, FieldSpec } from "@/components/setup/crud-manager";
import { Tabs } from "@/components/ui/tabs";
import { useUser } from "@/lib/user-context";

type Row = { id: string; [key: string]: unknown };

const yesNo = (v: unknown) =>
  v ? <Check className="h-4 w-4 text-emerald-400" /> : <span className="text-muted-foreground">—</span>;
const activeCell = (r: Row) => <ActiveBadge active={Boolean(r.is_active)} />;

const ENTITY_OPTIONS = [
  { value: "asset", label: "Asset / Device" },
  { value: "supplier", label: "Supplier" },
  { value: "client", label: "Client" },
  { value: "purchase_order", label: "Purchase Order" },
  { value: "invoice", label: "Invoice" },
  { value: "work_order", label: "Work Order" },
  { value: "project", label: "Project" },
  { value: "ticket", label: "Ticket" },
  { value: "goods_receipt", label: "Goods Receipt" },
  { value: "issuance", label: "Inventory Issuance" },
  { value: "inventory_item", label: "Inventory Item (SKU)" },
];

const CURRENCY_OPTIONS = ["PKR", "AED", "SAR", "QAR", "USD", "EUR", "GBP"].map((c) => ({ value: c, label: c }));

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  group_head: "Group Head",
  ops_manager: "Operations Head",
  marketing_head: "Marketing Head",
  supervisor: "Supervisor",
  technician: "Technician",
  marketing: "Marketing",
  finance: "Finance",
  warehouse: "Warehouse Staff",
  client_viewer: "Client Viewer",
};
const ESCALATION_ROLE_OPTIONS = ["group_head", "ops_manager", "marketing_head", "supervisor", "super_admin"].map(
  (r) => ({ value: r, label: ROLE_LABELS[r] }),
);
const ESCALATION_TRIGGER_OPTIONS = [
  { value: "assignment_sla", label: "Unassigned beyond window" },
  { value: "response_sla", label: "No response within SLA" },
  { value: "due_date", label: "Past due date" },
];
const ESCALATION_SCOPE_OPTIONS = [
  { value: "ticket", label: "Ticket" },
  { value: "installation", label: "Installation" },
];
const ESCALATION_SCOPE_LABELS: Record<string, string> = {
  ticket: "Ticket",
  installation: "Installation",
};
const ESCALATION_SCOPE_BADGE: Record<string, string> = {
  ticket: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  installation: "bg-violet-500/10 text-violet-400 ring-violet-500/20",
};
const TERMS_CATEGORY_OPTIONS = [
  { value: "work_order", label: "Work Order" },
  { value: "safety", label: "Safety Instructions" },
  { value: "general", label: "General" },
];

interface SectionConfig {
  key: string;
  label: string;
  endpoint: string;
  singular: string;
  labelKey: string;
  columns: ColumnSpec<Row>[];
  fields: FieldSpec[];
  searchKeys?: string[];
  searchPlaceholder?: string;
  hasActiveFilter?: boolean;
  resource?: string;
}

const SECTIONS: SectionConfig[] = [
  {
    key: "company",
    label: "Company",
    endpoint: "/setup/company/",
    singular: "Company",
    labelKey: "name",
    hasActiveFilter: false,
    searchKeys: ["name", "city"],
    columns: [
      { key: "name", label: "Name", className: "font-medium text-foreground" },
      { key: "city", label: "City" },
      { key: "country", label: "Country" },
      { key: "default_currency", label: "Currency" },
      { key: "is_primary", label: "Primary", render: (r) => yesNo(r.is_primary) },
    ],
    fields: [
      { name: "name", label: "Company Name", required: true },
      { name: "legal_name", label: "Legal Name" },
      { name: "tax_id", label: "Tax ID / NTN" },
      { name: "registration_number", label: "Registration No." },
      { name: "default_currency", label: "Default Currency", type: "select", options: CURRENCY_OPTIONS, default: "PKR" },
      { name: "phone", label: "Phone" },
      { name: "email", label: "Email", type: "email" },
      { name: "website", label: "Website", type: "url", placeholder: "https://" },
      { name: "city", label: "City" },
      { name: "state_province", label: "State / Province" },
      { name: "country", label: "Country", default: "Pakistan" },
      { name: "address", label: "Address", type: "textarea" },
      { name: "is_primary", label: "Primary company (shown on documents)", type: "checkbox" },
    ],
  },
  {
    key: "numbering",
    label: "Numbering",
    endpoint: "/setup/numbering-schemes/",
    singular: "Numbering Scheme",
    labelKey: "entity_display",
    searchKeys: ["entity", "prefix"],
    columns: [
      { key: "entity_display", label: "Entity", className: "font-medium text-foreground" },
      { key: "prefix", label: "Prefix" },
      { key: "preview", label: "Next Code", className: "font-mono text-foreground" },
      { key: "next_number", label: "Counter" },
      { key: "is_active", label: "Status", render: activeCell },
    ],
    fields: [
      { name: "entity", label: "Entity", type: "select", options: ENTITY_OPTIONS, required: true, immutable: true },
      { name: "prefix", label: "Prefix", required: true, placeholder: "e.g. WO" },
      { name: "separator", label: "Separator", default: "-" },
      { name: "padding", label: "Number Padding", type: "number", default: 5, help: "Zero-pad width, e.g. 5 → 00042" },
      { name: "next_number", label: "Next Number", type: "number", default: 1 },
      { name: "include_year", label: "Include year in code", type: "checkbox", default: true },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "asset-types",
    label: "Asset Types",
    endpoint: "/assets/asset-types/",
    singular: "Asset Type",
    labelKey: "name",
    resource: "setup",
    searchKeys: ["name"],
    columns: [
      { key: "name", label: "Name", className: "font-medium text-foreground" },
      { key: "has_dimensions", label: "L × W", render: (r) => yesNo(r.has_dimensions) },
      { key: "has_diagonal", label: "Diagonal (in)", render: (r) => yesNo(r.has_diagonal) },
      { key: "is_active", label: "Status", render: activeCell },
    ],
    fields: [
      { name: "name", label: "Type Name", required: true, placeholder: "e.g. SMD Screen" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "has_dimensions", label: "Uses length × width (e.g. SMD screens)", type: "checkbox" },
      { name: "has_diagonal", label: "Uses diagonal size in inches (e.g. displays)", type: "checkbox" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "supplier-categories",
    label: "Supplier Categories",
    endpoint: "/suppliers/service-categories/",
    singular: "Service Category",
    labelKey: "name",
    searchKeys: ["name"],
    columns: [
      { key: "name", label: "Name", className: "font-medium text-foreground" },
      { key: "description", label: "Description" },
      { key: "is_active", label: "Status", render: activeCell },
    ],
    fields: [
      { name: "name", label: "Category Name", required: true, placeholder: "e.g. Installation" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "issue-types",
    label: "Ticket Issue Types",
    endpoint: "/tickets/issue-types/",
    singular: "Issue Type",
    labelKey: "name",
    searchKeys: ["name"],
    columns: [
      { key: "name", label: "Issue", className: "font-medium text-foreground" },
      { key: "sort_order", label: "Order" },
      { key: "is_active", label: "Status", render: activeCell },
    ],
    fields: [
      { name: "name", label: "Issue Name", required: true, placeholder: "e.g. Module Burnt" },
      { name: "description", label: "Description", type: "textarea" },
      { name: "sort_order", label: "Sort Order", type: "number", default: 0 },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "payment-terms",
    label: "Payment Terms",
    endpoint: "/setup/payment-terms/",
    singular: "Payment Term",
    labelKey: "name",
    searchKeys: ["name", "code"],
    columns: [
      { key: "name", label: "Name", className: "font-medium text-foreground" },
      { key: "code", label: "Code" },
      { key: "days", label: "Net Days" },
      { key: "is_active", label: "Status", render: activeCell },
    ],
    fields: [
      { name: "name", label: "Name", required: true, placeholder: "e.g. Net 30" },
      { name: "code", label: "Short Code", placeholder: "e.g. NET30" },
      { name: "days", label: "Net Days", type: "number", default: 0 },
      { name: "description", label: "Description", type: "textarea" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "warranty-periods",
    label: "Warranty Periods",
    endpoint: "/setup/warranty-periods/",
    singular: "Warranty Period",
    labelKey: "label",
    searchKeys: ["label"],
    columns: [
      { key: "label", label: "Label", className: "font-medium text-foreground" },
      { key: "months", label: "Months" },
      { key: "is_active", label: "Status", render: activeCell },
    ],
    fields: [
      { name: "label", label: "Label", required: true, placeholder: "e.g. 1 Year" },
      { name: "months", label: "Duration (months)", type: "number", required: true, default: 12 },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "escalation",
    label: "Escalation",
    endpoint: "/setup/escalation-policies/",
    singular: "Escalation Policy",
    labelKey: "trigger_display",
    // Rows arrive grouped/ordered by scope → trigger → stage (backend ordering).
    searchKeys: ["trigger", "scope"],
    columns: [
      {
        key: "scope",
        label: "Applies To",
        render: (r) => (
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${ESCALATION_SCOPE_BADGE[String(r.scope)] ?? ESCALATION_SCOPE_BADGE.ticket}`}>
            {ESCALATION_SCOPE_LABELS[String(r.scope)] ?? String(r.scope ?? "Ticket")}
          </span>
        ),
      },
      { key: "trigger_display", label: "Trigger", className: "font-medium text-foreground" },
      {
        key: "stage",
        label: "Stage",
        render: (r) => (
          <span className="inline-flex rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground">
            L{Number(r.stage ?? 1)}
          </span>
        ),
      },
      { key: "hours", label: "Window", render: (r) => (r.hours != null && r.hours !== "" ? `${r.hours}h` : "Per-priority SLA") },
      { key: "escalate_to_role", label: "Escalates To", render: (r) => ROLE_LABELS[String(r.escalate_to_role)] ?? String(r.escalate_to_role ?? "—") },
      { key: "also_notify_role", label: "Also Notifies", render: (r) => (r.also_notify_role ? ROLE_LABELS[String(r.also_notify_role)] ?? String(r.also_notify_role) : "—") },
      { key: "is_active", label: "Status", render: activeCell },
    ],
    fields: [
      { name: "scope", label: "Applies To", type: "select", options: ESCALATION_SCOPE_OPTIONS, default: "ticket", required: true, help: "Ticket policies watch ticket SLAs; installation policies watch installation due dates." },
      { name: "trigger", label: "Trigger", type: "select", options: ESCALATION_TRIGGER_OPTIONS, required: true, immutable: true },
      { name: "stage", label: "Stage", type: "number", default: 1, required: true, min: 1, max: 3, help: "Escalation level 1–3. L1 fires first, then L2. Each stage's window is measured from the same trigger anchor (L2 hours are absolute from the anchor, not added on top of L1)." },
      { name: "hours", label: "Window (hours)", type: "number", help: "Hours after the trigger anchor before this stage fires (e.g. L1 = 0h, L2 = 24h). Assignment trigger anchor = time created while unassigned. Leave blank for the response-SLA L1 (per-priority windows)." },
      { name: "escalate_to_role", label: "Escalate To", type: "select", options: ESCALATION_ROLE_OPTIONS, default: "group_head", required: true },
      { name: "also_notify_role", label: "Also Notify", type: "select", options: [{ value: "", label: "None" }, ...ESCALATION_ROLE_OPTIONS], default: "ops_manager" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "terms",
    label: "Terms & Conditions",
    endpoint: "/setup/terms-templates/",
    singular: "Template",
    labelKey: "name",
    searchKeys: ["name"],
    columns: [
      { key: "name", label: "Name", className: "font-medium text-foreground" },
      { key: "category_display", label: "Category" },
      { key: "is_default", label: "Default", render: (r) => yesNo(r.is_default) },
      { key: "is_active", label: "Status", render: activeCell },
    ],
    fields: [
      { name: "name", label: "Template Name", required: true },
      { name: "category", label: "Category", type: "select", options: TERMS_CATEGORY_OPTIONS, default: "general" },
      { name: "body", label: "Body", type: "textarea", required: true },
      { name: "is_default", label: "Use as default for this category", type: "checkbox" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
];

/* ── SLA & Escalation Matrix (display-only reference, shown with the Escalation tab) ── */

const SLA_ROWS = [
  { priority: "Critical", response: "4 hours", resolution: "24 hours", badge: "bg-red-500/10 text-red-400 ring-red-500/20" },
  { priority: "High", response: "8 hours", resolution: "48 hours", badge: "bg-orange-500/10 text-orange-400 ring-orange-500/20" },
  { priority: "Medium", response: "24 hours", resolution: "5 business days", badge: "bg-yellow-500/10 text-yellow-500 ring-yellow-500/20" },
  { priority: "Low", response: "48 hours", resolution: "10 business days", badge: "bg-gray-500/10 text-gray-400 ring-gray-500/20" },
];

function SlaMatrixCard() {
  const thClass = "px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
  const tdClass = "px-4 py-2.5";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">SLA &amp; Escalation Matrix</h3>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Reference</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Ticket response and resolution targets by priority. The resolution target auto-sets a ticket&apos;s due date when it is created without one.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/50">
              <th className={thClass}>Priority</th>
              <th className={thClass}>Response SLA</th>
              <th className={thClass}>Resolution SLA</th>
            </tr>
          </thead>
          <tbody>
            {SLA_ROWS.map((row, i) => (
              <tr key={row.priority} className={i < SLA_ROWS.length - 1 ? "border-b border-border" : ""}>
                <td className={tdClass}>
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${row.badge}`}>{row.priority}</span>
                </td>
                <td className={`${tdClass} text-foreground`}>{row.response}</td>
                <td className={`${tdClass} text-foreground`}>{row.resolution}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 rounded-lg border border-border bg-secondary/20 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Escalation Ladder</p>
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-[11px] font-medium text-muted-foreground">Tickets</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 font-medium text-orange-600">
              L1 · Operations Head
              <span className="font-normal text-muted-foreground">at SLA breach</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-medium text-red-600">
              L2 · Group Head
              <span className="font-normal text-muted-foreground">+24h unresolved</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-[11px] font-medium text-muted-foreground">Installations</span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 font-medium text-orange-600">
              L1 · Operations Head
              <span className="font-normal text-muted-foreground">at due date</span>
            </span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1 font-medium text-red-600">
              L2 · Group Head
              <span className="font-normal text-muted-foreground">+24h overdue</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SetupPage() {
  const { canWrite, loading } = useUser();
  const [active, setActive] = useState(SECTIONS[0].key);

  const section = SECTIONS.find((s) => s.key === active)!;
  const allowed = canWrite("setup");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-500 to-slate-700">
          <Settings2 className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Setup</h1>
          <p className="text-muted-foreground">Master data & document numbering for the platform</p>
        </div>
      </div>

      {!loading && !allowed ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <h3 className="text-base font-semibold text-foreground">Restricted</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Setup is available to administrators and operations managers only.
          </p>
        </div>
      ) : (
        <>
          <Tabs
            tabs={SECTIONS.map((s) => ({ key: s.key, label: s.label }))}
            active={active}
            onChange={setActive}
          />
          <CrudManager<Row>
            key={section.key}
            endpoint={section.endpoint}
            singular={section.singular}
            labelKey={section.labelKey}
            columns={section.columns}
            fields={section.fields}
            searchKeys={section.searchKeys as (keyof Row)[] | undefined}
            searchPlaceholder={section.searchPlaceholder}
            hasActiveFilter={section.hasActiveFilter}
            resource={section.resource}
          />
          {active === "escalation" && <SlaMatrixCard />}
        </>
      )}
    </div>
  );
}
