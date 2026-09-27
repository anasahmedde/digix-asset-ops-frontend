"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * The organisation, drawn from who reports to whom.
 *
 * Each person keeps their organogram title; their system role is what the
 * platform lets them do. The chart shows both, because the two answer
 * different questions and are easy to confuse.
 */
export interface OrgPerson {
  id: string;
  full_name: string;
  username: string;
  role: string;
  job_title?: string;
  reports_to?: string | null;
  is_active: boolean;
}

const ROLE_LABEL: Record<string, string> = {
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
  vendor: "Vendor",
};

/** Tier colour: the apex reads differently from the floor. */
const ROLE_TONE: Record<string, string> = {
  super_admin: "bg-violet-500/10 text-violet-600 ring-violet-500/30",
  group_head: "bg-primary/10 text-primary ring-primary/30",
  ops_manager: "bg-blue-500/10 text-blue-600 ring-blue-500/30",
  marketing_head: "bg-blue-500/10 text-blue-600 ring-blue-500/30",
  supervisor: "bg-amber-500/10 text-amber-600 ring-amber-500/30",
  warehouse: "bg-amber-500/10 text-amber-600 ring-amber-500/30",
  marketing: "bg-cyan-500/10 text-cyan-600 ring-cyan-500/30",
  finance: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30",
  technician: "bg-secondary text-muted-foreground ring-border",
  client_viewer: "bg-slate-500/10 text-slate-600 ring-slate-500/30",
  vendor: "bg-slate-500/10 text-slate-600 ring-slate-500/30",
};

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

interface Node extends OrgPerson {
  children: Node[];
}

function buildTree(people: OrgPerson[]): { roots: Node[]; orphans: Node[] } {
  const byId = new Map<string, Node>(people.map((p) => [p.id, { ...p, children: [] }]));
  const roots: Node[] = [];
  const orphans: Node[] = [];
  byId.forEach((node) => {
    if (!node.reports_to) {
      roots.push(node);
      return;
    }
    const boss = byId.get(node.reports_to);
    // Somebody whose manager is not in the list still has to appear.
    if (boss) boss.children.push(node);
    else orphans.push(node);
  });
  const sort = (list: Node[]) => {
    list.sort((a, b) => b.children.length - a.children.length || a.full_name.localeCompare(b.full_name));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  sort(orphans);
  return { roots, orphans };
}

function Card({ person, reports }: { person: Node; reports: number }) {
  return (
    <div
      className={`inline-flex min-w-56 max-w-72 items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left shadow-sm ${
        person.is_active ? "border-border" : "border-dashed border-border opacity-60"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
        {initials(person.full_name || person.username)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">
          {person.full_name || person.username}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {person.job_title || "—"}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${ROLE_TONE[person.role] ?? "bg-secondary text-muted-foreground ring-border"}`}>
            {ROLE_LABEL[person.role] ?? person.role}
          </span>
          {reports > 0 && (
            <span className="text-2xs text-muted-foreground">{reports} report{reports === 1 ? "" : "s"}</span>
          )}
          {!person.is_active && <span className="text-2xs text-muted-foreground">inactive</span>}
        </span>
      </span>
    </div>
  );
}

/** One person and everyone under them, as an indented branch of the chart. */
function Branch({ node, depth }: { node: Node; depth: number }) {
  const [open, setOpen] = useState(true);
  const kids = node.children;

  return (
    <li className="relative">
      {/* The elbow joining this card to its manager's spine. */}
      {depth > 0 && (
        <span aria-hidden className="absolute -left-5 top-6 h-px w-5 bg-border" />
      )}
      <div className="flex items-center gap-2 py-1.5">
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `Hide ${node.full_name}'s reports` : `Show ${node.full_name}'s reports`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <Card person={node} reports={kids.length} />
      </div>
      {kids.length > 0 && open && (
        // The spine every child's elbow hangs off.
        <ul className="relative ml-[2.55rem] border-l border-border pl-5">
          {kids.map((child) => <Branch key={child.id} node={child} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  );
}

export function Organogram({ people }: { people: OrgPerson[] }) {
  const { roots, orphans } = useMemo(() => buildTree(people), [people]);

  if (people.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nobody on the chart yet.</p>;
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-1">
        {roots.map((r) => <Branch key={r.id} node={r} depth={0} />)}
      </ul>

      {orphans.length > 0 && (
        <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Reporting line not set — pick a manager on the person&apos;s record to place them.
          </p>
          <ul className="space-y-1">
            {orphans.map((o) => <Branch key={o.id} node={o} depth={0} />)}
          </ul>
        </div>
      )}
    </div>
  );
}
