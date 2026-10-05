"use client";

import {
  Camera, Check, CircleSlash, ClipboardCheck, Clock, MapPin, Play, Plus,
  RotateCcw, UserPlus, X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { Lightbox } from "@/components/ui/lightbox";
import { useUser } from "@/lib/user-context";
import { Modal } from "@/components/ui/modal";
import { formatDate, formatDateTime } from "@/lib/utils";

/** A photograph taken on a visit, and what it is a photograph of. */
export interface VisitPhoto {
  id: string;
  kind: "before" | "after" | "other";
  kind_display: string;
  image: string;
  caption: string;
  taken_by_name: string | null;
  taken_at: string;
  /** Where the phone was standing when it was taken, if it would say. */
  latitude: string | null;
  longitude: string | null;
}

/** A line the store issued against this job, waiting to be squared up. */
export interface IssuedPart {
  id: string;
  what: string;
  unit: string;
  /** Null for counted stock; set for individually tracked units. */
  unit_type: string | null;
  quantity_issued: number | null;
  issued_serials: string[];
  quantity_used: number | null;
}

/** One attendance on a corrective job. A second one means the first failed. */
export interface CorrectiveVisitRow {
  id: string;
  sequence: number;
  due_date: string;
  assigned_to: string | null;
  assigned_to_name: string | null;
  status: string;
  status_display: string;
  started_at: string | null;
  /** Where the phone was standing when work began, if it would say. */
  start_latitude: string | null;
  start_longitude: string | null;
  completed_at: string | null;
  resolved: boolean | null;
  remarks: string;
  review_decision: string;
  review_decision_display: string;
  /** Why it went back, in the reviewer's own words. */
  review_reason: string;
  review_note: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  visit_photos: VisitPhoto[];
  has_before_photo: boolean;
  has_after_photo: boolean;
  /** What the parts used are worth, at the store's prices. */
  component_costs: {
    part_request: string; description: string; quantity: string;
    /** Null when the store has no price on file for it. */
    unit_cost: string | null; amount: string;
  }[];
  /** What it came to once the office accepted it. */
  cost_lines: {
    id: string; source: string; description: string;
    quantity: string | null; unit_cost: string | null; amount: string;
  }[];
}

const label = "text-2xs font-semibold uppercase tracking-wider text-muted-foreground";
const field =
  "h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none";
/** One height for every button in the row, so the row has one baseline. */
const btn =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors disabled:pointer-events-none disabled:bg-secondary disabled:text-muted-foreground disabled:ring-0";

const STATUS_BADGE: Record<string, string> = {
  planned: "bg-secondary text-muted-foreground ring-border",
  in_progress: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  awaiting_review: "bg-sky-500/10 text-sky-600 ring-sky-500/20",
  completed: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  skipped: "bg-secondary text-muted-foreground ring-border",
};

/** Where the phone was standing, when it will say. Never blocks the upload. */
export function whereAmI(): Promise<{ latitude?: string; longitude?: string }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve({});
  return new Promise((resolve) => {
    const giveUp = setTimeout(() => resolve({}), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(giveUp);
        resolve({
          latitude: pos.coords.latitude.toFixed(7),
          longitude: pos.coords.longitude.toFixed(7),
        });
      },
      () => { clearTimeout(giveUp); resolve({}); },
      { timeout: 4000 },
    );
  });
}

function PhotoTile({
  photo, onOpen,
}: { photo: VisitPhoto; onOpen: (src: string) => void }) {
  return (
    <figure className="w-20 shrink-0 space-y-1">
      <button
        type="button"
        onClick={() => onOpen(photo.image)}
        title={`${photo.kind_display}${photo.taken_by_name ? ` · ${photo.taken_by_name}` : ""} · ${formatDateTime(photo.taken_at)}`}
        className="group relative block h-20 w-20 overflow-hidden rounded-lg border border-border bg-secondary"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photo.image} alt={photo.caption || photo.kind_display}
          className="h-full w-full object-cover transition-transform group-hover:scale-105" />
      </button>
      {photo.caption && (
        <figcaption className="text-2xs leading-tight text-muted-foreground" title={photo.caption}>
          {photo.caption}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * When something happened and where the phone was standing for it.
 *
 * The same line under both halves of the evidence: a time on its own says
 * somebody pressed a button, a time and a place says somebody was there.
 */
export function Stamp({
  what, when, lat, lng,
}: {
  what: string;
  when: string | null;
  lat?: string | null;
  lng?: string | null;
}) {
  if (!when) return null;
  const at = lat && lng
    ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
    : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <Clock className="h-3 w-3 shrink-0" />
        {what} {formatDateTime(when)}
      </span>
      {at ? (
        <a
          href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
        >
          <MapPin className="h-3 w-3 shrink-0" />
          {at}
        </a>
      ) : (
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3 w-3 shrink-0" /> No location
        </span>
      )}
    </div>
  );
}

/** Where and when work began. Kept for the preventive panel's one use. */
export function StartedAt({ visit }: { visit: CorrectiveVisitRow }) {
  return (
    <Stamp
      what="Work started"
      when={visit.started_at}
      lat={visit.start_latitude}
      lng={visit.start_longitude}
    />
  );
}

/**
 * What was found and what was left, photographed and stamped.
 *
 * The same on a breakdown and on a scheduled round: two panels of one
 * shape, each with its photographs, the remark the technician wrote with
 * them, and when and where the work began and ended. The office reads the
 * visit off these and nothing else, so they are not two implementations.
 */
export function Evidence({
  visit, waitingOnStore = [], askedForParts = true, onChanged,
}: {
  visit: Pick<
    CorrectiveVisitRow,
    "id" | "status" | "started_at" | "completed_at"
    | "start_latitude" | "start_longitude" | "visit_photos"
  >;
  /** Components asked for that the store has not handed over yet. */
  waitingOnStore?: string[];
  /** Whether anything has been asked for yet, priced or not. */
  askedForParts?: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  /** What the technician wants said about the next photo they attach. */
  const [caption, setCaption] = useState<Record<string, string>>({ before: "", after: "" });
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);
  // Photographing what you found is the first thing done on site, so it is
  // the last useful moment to notice you need a part. Asked here rather
  // than at "Start work", by which point somebody has already travelled.
  const [askingFirst, setAskingFirst] = useState(false);

  const photos = visit.visit_photos ?? [];
  const before = photos.filter((p) => p.kind === "before");
  const after = photos.filter((p) => p.kind === "after");
  /* The technician photographs what they found and what they left, so each
     half is open only while that half is still the thing being done. */
  /* Nobody is on site yet if the store still has the parts, so there is
     nothing to photograph — and a before photo taken early is a photo of
     a visit that had not started. */
  const held = waitingOnStore.length > 0;
  const canPhotoBefore = visit.status === "planned";
  const canPhotoAfter = visit.status === "in_progress";

  /** Open the file picker, pausing once to ask about parts if nothing
      has been asked for yet. */
  function choose(kind: "before" | "after") {
    if (kind === "before" && !askedForParts) { setAskingFirst(true); return; }
    (kind === "before" ? beforeInput : afterInput).current?.click();
  }

  async function upload(kind: "before" | "after", files: FileList | null) {
    if (!files?.length) return;
    setBusy(kind);
    try {
      const where = await whereAmI();
      const form = new FormData();
      form.append("kind", kind);
      if ((caption[kind] ?? "").trim()) form.append("caption", caption[kind].trim());
      for (const f of Array.from(files)) form.append("images", f);
      if (where.latitude) form.append("latitude", where.latitude);
      if (where.longitude) form.append("longitude", where.longitude);
      await api.post(`/maintenance/visits/${visit.id}/photos/`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setCaption((c) => ({ ...c, [kind]: "" }));
      onChanged();
      toast.success(kind === "before" ? "Before photo added" : "After photo added");
    } catch (err) {
      toast.error(getApiError(err, "Could not upload that photo"));
    } finally {
      setBusy(null);
      if (beforeInput.current) beforeInput.current.value = "";
      if (afterInput.current) afterInput.current.value = "";
    }
  }

  return (
    <>
      {showing && <Lightbox src={showing} onClose={() => setShowing(null)} />}

      <Modal open={askingFirst} onClose={() => setAskingFirst(false)} size="sm">
        <h2 className="text-base font-semibold text-foreground">
          Do you need any components for this visit?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Asking now is one tap. Coming back for a part is a second trip.
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            onClick={() => { setAskingFirst(false); beforeInput.current?.click(); }}
            className="inline-flex h-9 items-center justify-center rounded-lg px-3.5 text-xs font-semibold text-muted-foreground ring-1 ring-border transition-colors hover:bg-secondary"
          >
            No, take the photo
          </button>
          <button
            onClick={() => setAskingFirst(false)}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-3.5 text-xs font-semibold text-white transition-colors hover:bg-primary/90"
          >
            Yes, let me ask first
          </button>
        </div>
      </Modal>

      <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        {([
          ["before", "Before", before, canPhotoBefore, beforeInput,
           "Work started", visit.started_at,
           visit.start_latitude, visit.start_longitude] as const,
          ["after", "After", after, canPhotoAfter, afterInput,
           "Work finished", visit.completed_at,
           after[0]?.latitude ?? null, after[0]?.longitude ?? null] as const,
        ]).map(([kind, name, list, open, ref, what, when, lat, lng]) => (
          <div key={kind} className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className={label}>{name}</p>
              {open && (
                <>
                  <input ref={ref} id={`visit-${kind}`} type="file" accept="image/*" multiple
                    className="hidden" onChange={(e) => upload(kind, e.target.files)} />
                  <button
                    type="button"
                    onClick={() => choose(kind)}
                    disabled={kind === "before" && held}
                    title={kind === "before" && held
                      ? `Waiting on the store for ${waitingOnStore.join(", ")}`
                      : undefined}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-2xs font-semibold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    {busy === kind ? "Uploading…" : "Add photo"}
                  </button>
                </>
              )}
            </div>

            {list.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {list.map((p) => <PhotoTile key={p.id} photo={p} onOpen={setShowing} />)}
              </div>
            ) : (
              /* Each half says what it is waiting for: they are waiting for
                 different things, at different moments. */
              <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-xs text-muted-foreground">
                {!open
                  ? "None"
                  : kind === "before"
                    ? held
                      ? "Collect the components first — nobody is on site yet."
                      : "Upload a photo before starting work."
                    : "Upload a photo of the finished work."}
              </div>
            )}

            {/* Pushed to the bottom so both panels line up however many
                photographs each of them holds. */}
            <div className="mt-auto space-y-2">
              <Stamp what={what} when={when} lat={lat} lng={lng} />
              {open && (
                /* Written before the photo is attached, so the two travel
                   together — a caption added later is a different claim. */
                <input
                  value={caption[kind] ?? ""}
                  onChange={(e) => setCaption((c) => ({ ...c, [kind]: e.target.value }))}
                  placeholder={kind === "before" ? "What you found (optional)" : "What you left (optional)"}
                  className="h-8 w-full rounded-lg border border-border bg-card px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * The visit: assign it, photograph it, do it, and have it accepted.
 *
 * One panel for both kinds of job. A breakdown and a scheduled round are
 * worked identically — given to somebody, photographed at both ends,
 * handed in, and then either accepted or sent back for another visit.
 * The one difference is decided by the server, not here: a round is
 * stopped by pausing its schedule, not by cancelling a job.
 *
 * Every button comes from the server's `allowed_actions` for this person
 * on this job. The screen does not work out for itself what may be done —
 * that is how "Start work" came to be pressable on a visit nobody had been
 * given, and how a job got closed with no one assigned to it.
 */
export function CorrectiveVisit({
  scheduleId,
  actions,
  isCorrective = true,
  visits,
  technicians,
  dueDate,
  issuedParts,
  askedForParts = true,
  partsPending = [],
  onChanged,
  children,
}: {
  scheduleId: string;
  actions: string[];
  /** A breakdown gives a verdict and can be sent back; a round cannot. */
  isCorrective?: boolean;
  visits: CorrectiveVisitRow[];
  technicians: { id: string; label: string }[];
  dueDate: string;
  /** Components issued for this visit and not yet accounted for. */
  issuedParts: IssuedPart[];
  /** Whether anything has been asked for yet, priced or not. */
  askedForParts?: boolean;
  /** Components asked for that the store has not handed over yet. */
  partsPending?: string[];
  onChanged: () => void;
  /** What this visit has asked the store for. */
  children?: React.ReactNode;
}) {
  const { user } = useUser();
  const [busy, setBusy] = useState<string | null>(null);
  const [showing, setShowing] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [tech, setTech] = useState("");
  const [completing, setCompleting] = useState(false);
  const [resolved, setResolved] = useState(true);
  /** A round has no fault to declare fixed; it just reports what was done. */
  const [remarks, setRemarks] = useState("");
  const [reviewing, setReviewing] = useState<"accepted" | "unresolved" | null>(null);
  const [reason, setReason] = useState("");
  const [againWith, setAgainWith] = useState("");
  const [againOn, setAgainOn] = useState("");
  const [note, setNote] = useState("");
  /** Anything the parts do not cover: a lift, a call-out, an hour of overtime. */
  const [extra, setExtra] = useState<{ description: string; amount: string }[]>([]);
  /** A price for a part the store has none on file for. */
  const [priced, setPriced] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState(false);
  const [why, setWhy] = useState("");
  /** How much of each issued line the visit used, while the form is open. */
  const [used, setUsed] = useState<Record<string, number>>({});
  /** Which individually tracked units are going back. */
  const [back, setBack] = useState<Record<string, string[]>>({});
  const ordered = [...visits].sort((a, b) => a.sequence - b.sequence);
  const current = ordered[ordered.length - 1] ?? null;
  const may = (a: string) => actions.includes(a);
  /* A part left the shelf on somebody's say-so and comes back on somebody's
     say-so. Until the visit says how much it used, the difference is just
     missing, so the dialog asks before it will let the visit close. */
  const toSettle = issuedParts.filter(
    (p) => p.quantity_used === null && (p.quantity_issued ?? 0) > 0,
  );
  const usedOn = (p: IssuedPart) =>
    p.unit_type
      ? (p.quantity_issued ?? 0) - (back[p.id]?.length ?? 0)
      : used[p.id] ?? p.quantity_issued ?? 0;
  const goingBack = (p: IssuedPart) => (p.quantity_issued ?? 0) - usedOn(p);
  /** The parts, at the store's prices, plus whatever the office adds. */
  const visitTotal =
    (current?.component_costs ?? []).reduce(
      (n, c) => n + (c.unit_cost !== null
        ? Number(c.amount || 0)
        : Number(priced[c.part_request] || 0) * Number(c.quantity || 0)),
      0,
    )
    + extra.reduce((n, l) => n + Number(l.amount || 0), 0);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!tech) { toast.error("Select a technician"); return; }
    setBusy("assign");
    try {
      await api.post(`/maintenance/schedules/${scheduleId}/assign/`, {
        technician: tech, due_date: dueDate,
      });
      setAssigning(false);
      setTech("");
      onChanged();
      toast.success("Assigned");
    } catch (err) {
      toast.error(getApiError(err, "Could not assign this job"));
      setAssigning(false);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function start() {
    if (!current) return;
    setBusy("start");
    try {
      await api.post(`/maintenance/visits/${current.id}/start/`, await whereAmI());
      onChanged();
      toast.success("Work started");
    } catch (err) {
      toast.error(getApiError(err, "Could not start this visit"));
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function complete(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    setBusy("complete");
    try {
      const { data } = await api.post(`/maintenance/visits/${current.id}/complete/`, {
        ...(isCorrective ? { resolved } : {}),
        remarks,
        ...(toSettle.length > 0
          ? {
              parts_settlement: toSettle.map((p) => ({
                part_request: p.id,
                used: usedOn(p),
                serials: p.unit_type ? back[p.id] ?? [] : [],
              })),
            }
          : {}),
      });
      setCompleting(false);
      setRemarks("");
      setUsed({}); setBack({});
      onChanged();
      toast.success(
        !isCorrective || resolved
          ? "Sent for review"
          : "Reported unresolved — the office will decide",
      );
      if (data?.return_grn) {
        toast.success(`Returned components are with receiving on ${data.return_grn}`, {
          description: "They are back in stock once inspection passes them.",
        });
      }
    } catch (err) {
      toast.error(getApiError(err, "Could not complete this visit"));
      setCompleting(false);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function review(e: React.FormEvent) {
    e.preventDefault();
    if (!current || !reviewing) return;
    setBusy("review");
    try {
      await api.post(`/maintenance/visits/${current.id}/review/`, {
        decision: reviewing,
        ...(reviewing === "unresolved"
          ? { reason, technician: againWith || null, next_due: againOn || null }
          : {
              note,
              cost_lines: extra
                .filter((l) => l.description.trim() && l.amount !== "")
                .map((l) => ({ description: l.description.trim(), amount: l.amount })),
              component_prices: Object.fromEntries(
                Object.entries(priced).filter(([, v]) => v !== ""),
              ),
            }),
      });
      setReviewing(null);
      setNote(""); setReason(""); setAgainWith(""); setAgainOn("");
      setExtra([]); setPriced({});
      onChanged();
      toast.success(reviewing === "accepted"
        ? isCorrective ? "Accepted — the ticket is closed" : "Accepted — the next round is open"
        : "Next visit planned");
    } catch (err) {
      toast.error(getApiError(err, "Could not record that decision"));
      setReviewing(null);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function cancelJob(e: React.FormEvent) {
    e.preventDefault();
    // A cancellation with no reason is a gap in the record, and the server
    // refuses one, so the dialog asks before it sends.
    if (!why.trim()) { toast.error("Say why it is being cancelled"); return; }
    setBusy("cancel");
    try {
      await api.post(`/maintenance/schedules/${scheduleId}/cancel/`, { reason: why });
      setCancelling(false);
      setWhy("");
      onChanged();
      toast.success("Job cancelled");
    } catch (err) {
      toast.error(getApiError(err, "Could not cancel this job"));
      setCancelling(false);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  if (!current) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        {isCorrective ? "Nobody has been sent out yet." : "No round is open."}{children}
        {may("assign") && (
          <button onClick={() => setAssigning(true)}
            className="ml-2 font-semibold text-primary hover:underline">
            Assign a technician
          </button>
        )}
      </div>
    );
  }

  const who = current.assigned_to_name ?? "the technician";
  /* Whether this visit is this reader's to work on. A super admin holds
     every role's rights, so it is never told to wait for somebody else. */
  const mine = current.assigned_to === user?.id || user?.role === "super_admin";
  const waitingOn =
    current.status === "planned" && !current.assigned_to
      ? "Waiting for a technician to be assigned."
      : current.status === "planned" && !may("start")
        ? partsPending.length > 0
          ? `Waiting on the store for ${partsPending.join(", ")}.`
          : mine
          ? "Photograph the fault, then start the work."
          : current.has_before_photo
            ? `Waiting for ${who} to start the work.`
            : `Waiting for ${who} to photograph the fault and start the work.`
        : current.status === "in_progress" && !may("complete")
          ? mine
            ? "Photograph the finished work, then complete the visit."
            : current.has_after_photo
              ? `Waiting for ${who} to complete the visit.`
              : `Waiting for ${who} to photograph the finished work and complete the visit.`
          : current.status === "awaiting_review" && !may("accept")
            ? "Waiting for the office to review the work."
            : null;

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-5 ring-1 ring-primary/10">
      {showing && <Lightbox src={showing} onClose={() => setShowing(null)} />}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {!isCorrective
            ? `Next visit${current.sequence > 1 ? ` · round ${current.sequence}` : ""}`
            : current.sequence > 1 ? `Visit ${current.sequence}` : "The visit"}
        </h2>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
          STATUS_BADGE[current.status] ?? STATUS_BADGE.planned
        }`}>
          {current.status_display}
        </span>
      </div>

      <div className={`grid gap-4 ${isCorrective ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        {/* A breakdown's due date is on the ticket and already shown above;
            a round's is the schedule's next due, and belongs here with the
            rest of what the round is. */}
        {!isCorrective && (
          <div>
            <p className={label}>Due on</p>
            <p className="mt-0.5 text-sm text-foreground">{formatDate(current.due_date)}</p>
          </div>
        )}
        <div>
          <p className={label}>Assigned to</p>
          <p className="mt-0.5 text-sm text-foreground">
            {current.assigned_to_name ?? "To be assigned"}
          </p>
        </div>
        <div>
          <p className={label}>Started</p>
          <p className="mt-0.5 text-sm text-foreground">
            {/* Only a visit that has actually started has a start time: the
                old workflow stamped one when the job was created, and a
                planned visit then read as already under way. */}
            {current.status !== "planned" && current.started_at
              ? formatDateTime(current.started_at)
              : "—"}
          </p>
        </div>
        <div>
          <p className={label}>Finished</p>
          <p className="mt-0.5 text-sm text-foreground">
            {current.completed_at ? formatDateTime(current.completed_at) : "—"}
          </p>
        </div>
      </div>

      {(may("assign") || may("cancel")) && (
        <div className="mt-4 flex flex-wrap items-stretch gap-2 border-t border-border pt-4">
          {may("assign") && (
            <button onClick={() => setAssigning(true)} disabled={busy !== null}
              className={`${btn} bg-primary text-white hover:bg-primary/90`}>
              <UserPlus className="h-3.5 w-3.5" />
              {current.assigned_to ? "Reassign" : "Assign"}
            </button>
          )}
          {may("cancel") && (
            <button onClick={() => setCancelling(true)} disabled={busy !== null}
              className={`${btn} ml-auto text-muted-foreground ring-1 ring-border hover:bg-secondary hover:text-foreground`}>
              <CircleSlash className="h-3.5 w-3.5" /> Cancel job
            </button>
          )}
        </div>
      )}

      {/* What the store handed over for this visit. Below the decision,
          because who is going is settled before anyone draws parts. */}
      {children}

      <Evidence
        visit={current}
        waitingOnStore={partsPending}
        askedForParts={askedForParts}
        onChanged={onChanged}
      />

      {(may("start") || may("complete") || may("accept") || may("unresolved") || waitingOn) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {may("start") && (
            <button onClick={start} disabled={busy !== null}
              className={`${btn} bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 hover:bg-amber-500/20`}>
              <Play className="h-3.5 w-3.5" /> Start work
            </button>
          )}
          {may("complete") && (
            <button onClick={() => setCompleting(true)} disabled={busy !== null}
              className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
              <Check className="h-3.5 w-3.5" /> Complete visit
            </button>
          )}
          {may("accept") && (
            <button onClick={() => setReviewing("accepted")} disabled={busy !== null}
              className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
              <ClipboardCheck className="h-3.5 w-3.5" /> Accept
            </button>
          )}
          {may("unresolved") && (
            <button
              onClick={() => {
                setAgainWith(current.assigned_to ?? "");
                setReviewing("unresolved");
              }}
              disabled={busy !== null}
              className={`${btn} bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 hover:bg-amber-500/20`}>
              <RotateCcw className="h-3.5 w-3.5" /> Not resolved
            </button>
          )}
          {/* Say who the job is waiting on, rather than leaving a quiet
              row that looks as though a button went missing. */}
          {waitingOn && <p className="text-xs text-muted-foreground">{waitingOn}</p>}
        </div>
      )}

      {/* What the technician handed in. A breakdown comes with a verdict
          on the fault; a round has no fault to pass judgement on, so it
          reports what was done and nothing more. */}
      {(isCorrective ? current.resolved !== null : Boolean(current.remarks)) && (
        <div className="mt-4 border-t border-border pt-4">
          <p className={label}>
            {isCorrective ? "Technician's verdict" : "Work done"}
          </p>
          {isCorrective && (
            <p className={`mt-0.5 text-sm font-medium ${
              current.resolved ? "text-emerald-600" : "text-amber-600"
            }`}>
              {current.resolved ? "Fault fixed" : "Not fixed"}
            </p>
          )}
          {current.remarks && (
            <p className="mt-1 whitespace-pre-line text-sm text-foreground">{current.remarks}</p>
          )}
        </div>
      )}

      {current.review_decision && (
        <div className="mt-4 border-t border-border pt-4">
          <p className={label}>Office</p>
          <p className="mt-0.5 text-sm text-foreground">
            {current.review_decision_display}
            {current.reviewed_by_name && (
              <span className="text-muted-foreground">
                {" "}— {current.reviewed_by_name}
                {current.reviewed_at && `, ${formatDate(current.reviewed_at)}`}
              </span>
            )}
          </p>
          {(current.review_reason || current.review_note) && (
            <p className="mt-1 whitespace-pre-line text-sm text-foreground">
              {current.review_reason || current.review_note}
            </p>
          )}
        </div>
      )}

      <Modal open={assigning} onClose={() => setAssigning(false)} size="sm"
        title={isCorrective ? "Assign this job" : "Assign this round"}>
        <form onSubmit={assign} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="assign-tech" className={label}>Technician</label>
            <select id="assign-tech" value={tech} onChange={(e) => setTech(e.target.value)}
              className={field} required>
              <option value="">Select a technician</option>
              {technicians.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <p className="text-2xs text-muted-foreground">
            Due {formatDate(dueDate)}, as set on the ticket.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAssigning(false)}
              className={`${btn} text-muted-foreground ring-1 ring-border hover:bg-secondary`}>
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button type="submit" disabled={busy === "assign"}
              className={`${btn} bg-primary text-white hover:bg-primary/90`}>
              <UserPlus className="h-3.5 w-3.5" /> Assign
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={cancelling} onClose={() => setCancelling(false)} size="sm" title="Cancel this job">
        <form onSubmit={cancelJob} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The ticket is cancelled with it and the asset goes back into service.
          </p>
          <div className="space-y-1">
            <label htmlFor="cancel-why" className={label}>
              Why it is being cancelled <span className="text-red-500">*</span>
            </label>
            <textarea id="cancel-why" value={why} onChange={(e) => setWhy(e.target.value)} rows={3}
              required placeholder="Raised in error, duplicate of an earlier call, and so on"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCancelling(false)}
              className={`${btn} text-muted-foreground ring-1 ring-border hover:bg-secondary`}>
              <X className="h-3.5 w-3.5" /> Keep the job
            </button>
            <button type="submit" disabled={busy === "cancel"}
              className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
              <CircleSlash className="h-3.5 w-3.5" /> Cancel job
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={completing} onClose={() => setCompleting(false)} size="sm"
        title={isCorrective ? "Complete this visit" : "Complete this round"}>
        <form onSubmit={complete} className="space-y-4">
          {isCorrective && (
          <div className="space-y-1">
            <p className={label}>Is the fault fixed?</p>
            <div className="flex gap-2">
              {[[true, "Yes, it is fixed"], [false, "No, it is not"]].map(([value, text]) => (
                <button key={String(value)} type="button" onClick={() => setResolved(value as boolean)}
                  className={`${btn} flex-1 ring-1 ${
                    resolved === value
                      ? "bg-primary text-white ring-primary"
                      : "text-muted-foreground ring-border hover:bg-secondary"
                  }`}>
                  {text as string}
                </button>
              ))}
            </div>
          </div>
          )}
          {toSettle.length > 0 && (
            <div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs font-semibold text-foreground">
                Components issued for this visit
              </p>
              <p className="text-2xs text-muted-foreground">
                Say what was used. Anything else goes back to the store and waits
                in receiving to be checked in.
              </p>
              {toSettle.map((p) => {
                const issued = p.quantity_issued ?? 0;
                const returning = goingBack(p);
                return (
                  <div key={p.id} className="space-y-1.5 border-t border-border pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm text-foreground">{p.what}</span>
                      <span className="text-2xs text-muted-foreground">
                        {issued} {p.unit} issued
                      </span>
                    </div>
                    {p.unit_type ? (
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {/* Tracked units come back by name, not by count. */}
                        {(p.issued_serials ?? []).map((sn) => {
                          const chosen = back[p.id] ?? [];
                          const on = chosen.includes(sn);
                          return (
                            <label key={sn} className="inline-flex items-center gap-1.5 text-xs text-foreground">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() =>
                                  setBack((cur) => ({
                                    ...cur,
                                    [p.id]: on ? chosen.filter((v) => v !== sn) : [...chosen, sn],
                                  }))
                                }
                                className="h-3.5 w-3.5 accent-primary"
                              />
                              {sn}
                            </label>
                          );
                        })}
                        {(p.issued_serials ?? []).length === 0 && (
                          <span className="text-2xs text-muted-foreground">No serials recorded.</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <label htmlFor={`used-${p.id}`} className="text-2xs text-muted-foreground">
                          Used
                        </label>
                        <input
                          id={`used-${p.id}`}
                          type="number"
                          min={0}
                          max={issued}
                          value={used[p.id] ?? issued}
                          onChange={(e) =>
                            setUsed((cur) => ({
                              ...cur,
                              [p.id]: Math.max(0, Math.min(issued, Number(e.target.value) || 0)),
                            }))
                          }
                          className="h-8 w-20 rounded-lg border border-border bg-card px-2 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                        />
                        <span className="text-2xs text-muted-foreground">of {issued} {p.unit}</span>
                      </div>
                    )}
                    <p className={`text-2xs ${returning > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {returning > 0
                        ? `${returning} ${p.unit} going back${p.unit_type ? "" : " to the store"}`
                        : "Nothing going back"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="visit-remarks" className={label}>
              {isCorrective ? "Remarks" : "Work done"}
              {isCorrective && !resolved && <span className="text-red-500"> *</span>}
            </label>
            <textarea id="visit-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)}
              rows={3} required={isCorrective && !resolved}
              placeholder={
                !isCorrective
                  ? "What was checked, cleaned or replaced, and anything observed"
                  : resolved ? "What was done" : "Why it could not be fixed"
              }
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCompleting(false)}
              className={`${btn} text-muted-foreground ring-1 ring-border hover:bg-secondary`}>
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button type="submit" disabled={busy === "complete"}
              className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
              <Check className="h-3.5 w-3.5" /> Send for review
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={reviewing !== null} onClose={() => setReviewing(null)} size="sm"
        title={reviewing === "accepted" ? "Accept this work" : "Plan next visit"}>
        <form onSubmit={review} className="space-y-4">
          {reviewing === "accepted" ? (
            <>
              <p className="text-sm text-muted-foreground">
                {isCorrective
                  ? "The job closes and the ticket closes with it. The asset goes back into service."
                  : "The round is written to the register and the schedule rolls to its next cycle."}
              </p>

              {/* What this visit cost. The parts price themselves from the
                  store; everything else is written in here, as lines, so
                  the total is always something you can read the reasons
                  for rather than one figure to be taken on trust. */}
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-foreground">What this visit cost</p>
                {(current.component_costs ?? []).length > 0 ? (
                  <div className="space-y-1">
                    {current.component_costs.map((c) => (
                      <div key={c.part_request} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 text-foreground">
                          {c.description}
                          <span className="text-muted-foreground"> · {c.quantity} used</span>
                        </span>
                        {c.unit_cost !== null ? (
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            × PKR {c.unit_cost}
                            <span className="ml-2 font-medium text-foreground">PKR {c.amount}</span>
                          </span>
                        ) : (
                          /* The store has no price on file for this one, so
                             it is asked for here rather than left out of
                             the total with nobody any the wiser. */
                          <span className="flex shrink-0 items-center gap-1.5">
                            <span className="text-2xs text-amber-600">No price on file · PKR</span>
                            <input
                              value={priced[c.part_request] ?? ""}
                              onChange={(e) => setPriced((cur) =>
                                ({ ...cur, [c.part_request]: e.target.value }))}
                              type="number" min={0} step="0.01" placeholder="each"
                              className="h-7 w-24 rounded-lg border border-border bg-card px-2 text-xs tabular-nums text-foreground focus:border-primary/50 focus:outline-none"
                            />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-2xs text-muted-foreground">
                    No components were used, so there is nothing priced from the store.
                  </p>
                )}

                {extra.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={l.description}
                      onChange={(e) => setExtra((cur) =>
                        cur.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                      placeholder="What it was for"
                      className="h-8 flex-1 rounded-lg border border-border bg-card px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
                    />
                    <input
                      value={l.amount}
                      onChange={(e) => setExtra((cur) =>
                        cur.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                      type="number" min={0} step="0.01" placeholder="0.00"
                      className="h-8 w-28 rounded-lg border border-border bg-card px-2.5 text-xs tabular-nums text-foreground focus:border-primary/50 focus:outline-none"
                    />
                    <button type="button" aria-label="Remove this line"
                      onClick={() => setExtra((cur) => cur.filter((_, j) => j !== i))}
                      className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}

                <button type="button"
                  onClick={() => setExtra((cur) => [...cur, { description: "", amount: "" }])}
                  className="inline-flex items-center gap-1 text-2xs font-semibold text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add a cost
                </button>

                <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2 text-sm">
                  <span className="font-semibold text-foreground">Total</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    PKR {visitTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <label htmlFor="review-reason" className={label}>
                  Remarks <span className="text-red-500">*</span>
                </label>
                <textarea id="review-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                  rows={3} required
                  placeholder="What is still outstanding, and what the next visit needs to do about it"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label htmlFor="review-tech" className={label}>
                    Next technician <span className="text-red-500">*</span>
                  </label>
                  {/* The whole list, with whoever went last already chosen —
                      the commonest answer is "them again", but it is picked
                      rather than hidden behind a word. */}
                  <select id="review-tech" value={againWith} onChange={(e) => setAgainWith(e.target.value)}
                    className={field} required>
                    <option value="">Select a technician</option>
                    {technicians.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="review-due" className={label}>Next visit due</label>
                  <input id="review-due" type="date" value={againOn}
                    onChange={(e) => setAgainOn(e.target.value)} className={field} />
                </div>
              </div>
            </>
          )}
          {reviewing === "accepted" && (
            <div className="space-y-1">
              <label htmlFor="review-note" className={label}>Note</label>
              <textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none" />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setReviewing(null)}
              className={`${btn} text-muted-foreground ring-1 ring-border hover:bg-secondary`}>
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button type="submit" disabled={busy === "review"}
              className={`${btn} ${reviewing === "accepted"
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-amber-600 text-white hover:bg-amber-700"}`}>
              {reviewing === "accepted"
                ? <><ClipboardCheck className="h-3.5 w-3.5" /> Accept and close</>
                : <><RotateCcw className="h-3.5 w-3.5" /> Plan next visit</>}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
