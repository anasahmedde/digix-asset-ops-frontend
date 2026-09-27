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
/** The same tiers as solid colour, for the dot on a compact row. */
const ROLE_DOT: Record<string, string> = {
  super_admin: "bg-violet-500",
  group_head: "bg-primary",
  ops_manager: "bg-blue-500",
  marketing_head: "bg-blue-500",
  supervisor: "bg-amber-500",
  warehouse: "bg-amber-500",
  marketing: "bg-cyan-500",
  finance: "bg-emerald-500",
  technician: "bg-slate-400",
  client_viewer: "bg-slate-500",
  vendor: "bg-slate-500",
};

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
  // A chart has an apex. Somebody with no manager *and* nobody under them
  // is not the top of the organisation — it is a person nobody has placed
  // yet, usually a system account, so they are listed rather than drawn as
  // a second trunk beside the real one.
  const unplaced = roots.filter((r) => r.children.length === 0);
  const apexes = roots.filter((r) => r.children.length > 0);
  sort(orphans);
  return {
    roots: apexes.length > 0 ? apexes : roots,
    orphans: apexes.length > 0 ? [...unplaced, ...orphans] : orphans,
  };
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

/** Somebody with nobody under them, listed under their manager. */
function LeafCard({ person }: { person: Node }) {
  return (
    <li
      className={`flex w-44 items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-left shadow-sm ${
        person.is_active ? "border-border" : "border-dashed border-border opacity-60"
      }`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-2xs font-semibold text-foreground">
        {initials(person.full_name || person.username)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground">
          {person.full_name || person.username}
        </span>
        <span className="block truncate text-2xs text-muted-foreground" title={person.job_title || undefined}>
          {person.job_title || "—"}
        </span>
      </span>
      <span
        aria-label={ROLE_LABEL[person.role] ?? person.role}
        title={ROLE_LABEL[person.role] ?? person.role}
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${ROLE_DOT[person.role] ?? "bg-slate-400"}`}
      />
    </li>
  );
}

/** One person, with everyone under them spread out beneath. */
function Branch({ node, onFold }: { node: Node; onFold: () => void }) {
  const [open, setOpen] = useState(true);
  const kids = node.children;
  const show = open && kids.length > 0;

  return (
    <li className="org-node">
      <Card
        person={node}
        reports={kids.length}
        open={open}
        onToggle={() => { setOpen((v) => !v); requestAnimationFrame(onFold); }}
      />
      {show && (
        // A manager whose reports have nobody under them gets a list, not a
        // row: it says the same thing in a fraction of the width.
        kids.every((k) => k.children.length === 0) ? (
          <ul className="org-stack org-children">
            {kids.map((child) => <LeafCard key={child.id} person={child} />)}
          </ul>
        ) : (
          <ul className="org-level org-children">
            {kids.map((child) => <Branch key={child.id} node={child} onFold={onFold} />)}
          </ul>
        )
      )}
    </li>
  );
}

export function Organogram({ people }: { people: OrgPerson[] }) {
  const { roots, orphans } = useMemo(() => buildTree(people), [people]);
  const frame = useRef<HTMLDivElement>(null);
  const chart = useRef<HTMLUListElement>(null);
  // The whole organisation should be readable at a glance, so the chart is
  // scaled down to whatever room the card has rather than run off the side.
  // Below this it stops shrinking and scrolls instead — past about half size
  // the names stop being legible, which defeats the point.
  const [fit, setFit] = useState(1);
  // The scaled chart is shorter than its layout box, so the frame is told
  // the height it actually occupies; otherwise it leaves a gap below.
  const [frameH, setFrameH] = useState<number | null>(null);
  const MIN_FIT = 0.5;

  const measure = useCallback(() => {
    const box = frame.current;
    const row = chart.current;
    if (!box || !row) return;
    const natural = row.scrollWidth + 24;
    const room = box.clientWidth;
    const next = natural > room ? Math.max(MIN_FIT, room / natural) : 1;
    setFit(next);
    setFrameH(next < 1 ? Math.ceil(row.scrollHeight * next) : null);
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(measure);
    const box = frame.current;
    // Re-fit when the card resizes — the sidebar collapsing changes the room.
    const ro = box ? new ResizeObserver(() => measure()) : null;
    if (box && ro) ro.observe(box);
    return () => {
      cancelAnimationFrame(id);
      ro?.disconnect();
    };
  }, [measure, people]);

  if (people.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nobody on the chart yet.</p>;
  }

  return (
    <div className="space-y-6">
      <div
        ref={frame}
        style={frameH ? { height: frameH } : undefined}
        className={fit < 1 ? "overflow-hidden" : "overflow-x-auto overflow-y-hidden"}
      >
        <div
          style={{ transform: `scale(${fit})`, transformOrigin: "top center" }}
          className="w-full transition-transform duration-200"
        >
          <ul ref={chart} className="org-level org-root" onTransitionEnd={measure}>
            {roots.map((r) => <Branch key={r.id} node={r} onFold={measure} />)}
          </ul>
        </div>
      </div>
      {fit < 1 && (
        <p className="text-2xs text-muted-foreground">
          Scaled to {Math.round(fit * 100)}% so the whole chart fits. Fold a
          branch with its pill to see it larger.
        </p>
      )}

      {orphans.length > 0 && (
        <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Not on the chart — pick a manager on the person&apos;s record to place them.
          </p>
          <ul className="flex flex-wrap gap-2">
            {orphans.map((o) => <LeafCard key={o.id} person={o} />)}
          </ul>
        </div>
      )}
    </div>
  );
}
