"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * The organisation, drawn from who reports to whom.
 *
 * A classic chart: one person at the top, their reports side by side
 * beneath them, joined by the line that says so. Each card carries both the
 * organogram title and the badge for what the system lets them do — the two
 * answer different questions and are easy to confuse.
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

function Card({
  person, reports, open, onToggle,
}: {
  person: Node;
  reports: number;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative inline-flex flex-col items-center">
      <div
        className={`flex w-40 flex-col items-center gap-1.5 rounded-xl border bg-card px-2.5 py-3 text-center shadow-sm ${
          person.is_active ? "border-border" : "border-dashed border-border opacity-60"
        }`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
          {initials(person.full_name || person.username)}
        </span>
        <span className="w-full truncate text-sm font-semibold text-foreground" title={person.full_name || person.username}>
          {person.full_name || person.username}
        </span>
        <span className="w-full text-xs leading-tight text-muted-foreground" title={person.job_title || undefined}>
          {person.job_title || "—"}
        </span>
        <span className={`inline-flex rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ${ROLE_TONE[person.role] ?? "bg-secondary text-muted-foreground ring-border"}`}>
          {ROLE_LABEL[person.role] ?? person.role}
        </span>
        {!person.is_active && <span className="text-2xs text-muted-foreground">inactive</span>}
      </div>

      {/* Fold a branch away at its parent, so a wide chart can be read a
          section at a time. */}
      {reports > 0 && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} ${person.full_name || person.username}'s ${reports} report${reports === 1 ? "" : "s"}`}
          className="absolute -bottom-3 z-10 flex h-6 items-center gap-1 rounded-full border border-border bg-card px-2 text-2xs font-medium text-muted-foreground shadow-sm hover:text-foreground"
        >
          {open ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          {reports}
        </button>
      )}
    </div>
  );
}

/** One person, with everyone under them spread out beneath. */
function Branch({ node }: { node: Node }) {
  const [open, setOpen] = useState(true);
  const kids = node.children;
  const show = open && kids.length > 0;

  return (
    <li className="org-node">
      <Card person={node} reports={kids.length} open={open} onToggle={() => setOpen((v) => !v)} />
      {show && (
        <ul className="org-level org-children">
          {kids.map((child) => <Branch key={child.id} node={child} />)}
        </ul>
      )}
    </li>
  );
}

export function Organogram({ people }: { people: OrgPerson[] }) {
  const { roots, orphans } = useMemo(() => buildTree(people), [people]);
  const scroller = useRef<HTMLDivElement>(null);

  // A chart is centred on its apex, and wider than the screen by nature, so
  // it opens on the person at the top rather than on whatever happens to
  // fall at scroll zero.
  const centreOnApex = useCallback(() => {
    const box = scroller.current;
    const apex = box?.querySelector<HTMLElement>(".org-root > .org-node");
    if (!box || !apex) return;
    // Measured against the scroller itself: offsetLeft answers to whichever
    // ancestor happens to be positioned, which is not this one.
    const here = box.getBoundingClientRect();
    const top = apex.getBoundingClientRect();
    box.scrollLeft += (top.left + top.width / 2) - (here.left + here.width / 2);
  }, []);

  useEffect(() => {
    // After layout, so the row has its real width.
    const id = requestAnimationFrame(centreOnApex);
    return () => cancelAnimationFrame(id);
  }, [centreOnApex, people]);

  if (people.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nobody on the chart yet.</p>;
  }

  return (
    <div className="space-y-6">
      {/* The chart is wider than most screens by nature, so it scrolls
          sideways rather than being squeezed. */}
      <div ref={scroller} className="overflow-x-auto overflow-y-hidden pb-4">
        <ul className="org-level org-root">
          {roots.map((r) => <Branch key={r.id} node={r} />)}
        </ul>
      </div>

      {orphans.length > 0 && (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Reporting line not set — pick a manager on the person&apos;s record to place them on the chart.
          </p>
          <div className="overflow-x-auto overflow-y-hidden pb-2">
            <ul className="org-level org-root">
              {orphans.map((o) => <Branch key={o.id} node={o} />)}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
