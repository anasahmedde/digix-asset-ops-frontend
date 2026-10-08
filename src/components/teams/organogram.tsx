"use client";

import { ArrowUpToLine, Minus, Plus } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

/**
 * The organisation, drawn from who reports to whom.
 *
 * A classic chart: one person at the top, their reports side by side
 * beneath them, joined by the line that says so. Each card carries both the
 * organogram title and the badge for what the system lets them do — the two
 * answer different questions and are easy to confuse.
 *
 * The chart is also where the reporting line is changed: drag a person onto
 * their new manager. Editing a hidden field on a form to say who somebody
 * answers to was the long way round for a thing the chart already draws.
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

/** The tiers as solid colour, for the dot on a compact row. */
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

function buildTree(people: OrgPerson[]): { roots: Node[]; orphans: Node[]; byId: Map<string, Node> } {
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
    byId,
  };
}

/** Everyone under a person, however deep — the places they cannot be dropped. */
function descendantsOf(node: Node, into: Set<string>) {
  for (const child of node.children) {
    into.add(child.id);
    descendantsOf(child, into);
  }
}

// What a card needs to know about the drag in progress, without every
// card being handed a dozen props.
interface DragState {
  /** The person being dragged, or null. */
  dragging: string | null;
  /** Ids that cannot receive the drop: the person and everyone under them. */
  blocked: Set<string>;
  /** The target the pointer is over right now. */
  over: string | null;
  /** The person whose move is being saved. */
  saving: string | null;
  canEdit: boolean;
  start: (id: string) => void;
  end: () => void;
  hover: (id: string | null) => void;
  drop: (targetId: string | null) => void;
}

/** Names a role key. Custom roles are not in the built-in map, so the page
 *  that knows them passes a function down. */
const RoleLabel = createContext<(key: string) => string>((key) => ROLE_LABEL[key] ?? key);

const Drag = createContext<DragState>({
  dragging: null, blocked: new Set(), over: null, saving: null, canEdit: false,
  start: () => {}, end: () => {}, hover: () => {}, drop: () => {},
});

/** The drag-and-drop handlers for one card, as attributes to spread. */
function useDragHandles(id: string) {
  const d = useContext(Drag);
  const isSource = d.dragging === id;
  const isTarget = d.dragging !== null && !isSource && !d.blocked.has(id);
  const isOver = isTarget && d.over === id;
  const handles = d.canEdit
    ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => {
          e.dataTransfer.setData("text/plain", id);
          e.dataTransfer.effectAllowed = "move";
          d.start(id);
        },
        onDragEnd: () => d.end(),
        onDragOver: (e: React.DragEvent) => {
          if (!isTarget) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (d.over !== id) d.hover(id);
        },
        onDragLeave: () => { if (d.over === id) d.hover(null); },
        onDrop: (e: React.DragEvent) => {
          if (!isTarget) return;
          e.preventDefault();
          d.drop(id);
        },
      }
    : {};
  // How the card reads while a drag is on: the source fades, a valid
  // target lifts when hovered, the places it cannot go dim.
  const look = d.dragging === null
    ? ""
    : isSource
      ? "opacity-50"
      : isOver
        ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
        : isTarget
          ? ""
          : "opacity-40";
  const busy = d.saving === id ? "animate-pulse" : "";
  const cursor = d.canEdit ? "cursor-grab active:cursor-grabbing" : "";
  return { handles, className: [look, busy, cursor].filter(Boolean).join(" ") };
}

function Card({
  person, reports, open, onToggle,
}: {
  person: Node;
  reports: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { handles, className } = useDragHandles(person.id);
  const roleLabel = useContext(RoleLabel);
  return (
    <div className="relative inline-flex flex-col items-center">
      <div
        {...handles}
        data-person={person.username}
        className={`flex w-40 flex-col items-center gap-1.5 rounded-xl border bg-card px-2.5 py-3 text-center shadow-sm transition-[opacity,box-shadow] ${
          person.is_active ? "border-border" : "border-dashed border-border opacity-60"
        } ${className}`}
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
          {roleLabel(person.role)}
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
  const { handles, className } = useDragHandles(person.id);
  const roleLabel = useContext(RoleLabel);
  return (
    <li
      {...handles}
      data-person={person.username}
      className={`flex w-44 items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-left shadow-sm transition-[opacity,box-shadow] ${
        person.is_active ? "border-border" : "border-dashed border-border opacity-60"
      } ${className}`}
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
        aria-label={roleLabel(person.role)}
        title={roleLabel(person.role)}
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

/** Where a person goes to answer to nobody — the top of the chart. */
function TopDropZone() {
  const d = useContext(Drag);
  const active = d.dragging !== null;
  const over = d.over === "__top__";
  return (
    <div
      onDragOver={(e) => { if (!active) return; e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!over) d.hover("__top__"); }}
      onDragLeave={() => { if (over) d.hover(null); }}
      onDrop={(e) => { if (!active) return; e.preventDefault(); d.drop(null); }}
      className={`flex items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-2.5 text-xs transition-colors ${
        over
          ? "border-primary bg-primary/10 text-primary"
          : active
            ? "border-border text-muted-foreground"
            : "pointer-events-none border-transparent text-transparent"
      }`}
      aria-hidden={!active}
    >
      <ArrowUpToLine className="h-3.5 w-3.5" /> Drop here to report to nobody
    </div>
  );
}

export function Organogram({
  people,
  canEdit = false,
  onMove,
  roleLabel = (key) => ROLE_LABEL[key] ?? key,
}: {
  people: OrgPerson[];
  /** Names a role key; custom roles are not in the built-in map. */
  roleLabel?: (key: string) => string;
  /** Whether this reader may re-hang people. The server decides for real. */
  canEdit?: boolean;
  /** Called with the person and their new manager (null for the top). Should throw on failure. */
  onMove?: (personId: string, bossId: string | null) => Promise<void>;
}) {
  const { roots, orphans, byId } = useMemo(() => buildTree(people), [people]);
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

  // ── the drag in progress ──────────────────────────────────────────────
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const blocked = useMemo(() => {
    const set = new Set<string>();
    if (!dragging) return set;
    set.add(dragging);
    const node = byId.get(dragging);
    if (node) descendantsOf(node, set);
    // Dropping somebody onto the manager they already have changes nothing.
    if (node?.reports_to) set.add(node.reports_to);
    return set;
  }, [dragging, byId]);

  const drag = useMemo<DragState>(() => ({
    dragging, blocked, over, saving,
    canEdit: canEdit && !!onMove,
    start: (id) => setDragging(id),
    end: () => { setDragging(null); setOver(null); },
    hover: (id) => setOver(id),
    drop: async (targetId) => {
      const who = dragging;
      setDragging(null);
      setOver(null);
      if (!who || !onMove) return;
      const node = byId.get(who);
      if (targetId === null && !node?.reports_to) return; // already at the top
      if (targetId !== null && blocked.has(targetId)) return;
      setSaving(who);
      try {
        await onMove(who, targetId);
      } catch {
        // The caller has told the user; the chart simply stays as it was.
      } finally {
        setSaving(null);
      }
    },
  }), [dragging, blocked, over, saving, canEdit, onMove, byId]);

  if (people.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Nobody on the chart yet.</p>;
  }

  return (
    <RoleLabel.Provider value={roleLabel}>
    <Drag.Provider value={drag}>
      <div className="space-y-4">
        {drag.canEdit && <TopDropZone />}
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
        <p className="text-2xs text-muted-foreground">
          {fit < 1 && <>Scaled to {Math.round(fit * 100)}% so the whole chart fits. Fold a branch with its pill to see it larger. </>}
          {drag.canEdit && <>Drag a person onto their new manager to change who they report to.</>}
        </p>

        {orphans.length > 0 && (
          <div className="space-y-3 rounded-xl border border-dashed border-border p-4">
            <p className="text-xs font-medium text-muted-foreground">
              Not on the chart{drag.canEdit ? " — drag them onto their manager to place them." : " — pick a manager on the person's record to place them."}
            </p>
            <ul className="flex flex-wrap gap-2">
              {orphans.map((o) => <LeafCard key={o.id} person={o} />)}
            </ul>
          </div>
        )}
      </div>
    </Drag.Provider>
    </RoleLabel.Provider>
  );
}
