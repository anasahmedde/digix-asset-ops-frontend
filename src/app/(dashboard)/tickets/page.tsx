"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  FileText,
  ImageIcon,
  MapPin,
  MessageSquare,
  Monitor,
  Pause,
  Pencil,
  Play,
  Plus,
  Send,
  ShieldCheck,
  ShieldX,
  Ticket,
  Trash2,
  User,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { SegmentBar, StatTiles } from "@/components/ui/analytics-strip";
import { Pagination, pageSlice } from "@/components/ui/pagination";
import { CopyButton } from "@/components/ui/copy-button";
import { Lightbox } from "@/components/ui/lightbox";
import { Modal } from "@/components/ui/modal";
import { FilterBar } from "@/components/ui/filter-bar";
import { ProgressStepper } from "@/components/ui/progress-stepper";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { formatDateTime, formatDate } from "@/lib/utils";
import type { TicketAttachment, TicketComment, TicketStatus } from "@/types";

/* ─── Types ────────────────────────────────────────────────────────── */

interface TicketDeviceInfo {
  id: string;
  asset_code: string;
  display_name: string | null;
}

interface TicketWarrantyInfo {
  id: string;
  warranty_type: string;
  end_date: string;
  status: string;
}

interface TicketItem {
  id: string;
  ticket_number: string;
  occurrence: number;
  complaint_by: string;
  issue_type: string | null;
  issue_type_name: string | null;
  assigned_vendor: string | null;
  assigned_vendor_name: string | null;
  parts_used: string;
  response_due_at: string | null;
  escalated: boolean;
  is_response_overdue: boolean;
  assignment_escalated: boolean;
  due_date_escalated: boolean;
  /** Wave 4 multi-stage escalation: "<trigger>:<stage>" -> ISO timestamp when that stage fired. */
  escalation_state?: Record<string, string>;
  title: string;
  description: string;
  priority: string;
  status: TicketStatus;
  category: string;
  device: string | null;
  device_code: string | null;
  // Multi-asset + cost liability (WF-14/15, MW-03) — the light list
  // serializer omits some of these, so they stay optional.
  devices?: string[];
  devices_info?: TicketDeviceInfo[];
  /** The corrective jobs this ticket raised — one for each asset on it. */
  maintenance_jobs?: {
    id: string;
    status: string;
    asset_code: string | null;
    asset_name: string | null;
    site_name: string | null;
  }[];
  warranty?: string | null;
  warranty_info?: TicketWarrantyInfo | null;
  is_billable?: boolean;
  charge_to?: string;
  repair_cost?: string | null;
  site: string | null;
  site_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  reported_by: string | null;
  reported_by_name: string | null;
  due_date: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  resolution_notes: string;
  completion_notes: string;
  completed_by: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_comments: string;
  blocked_reason: string;
  hold_reason: string;
  attachments: TicketAttachment[];
  comments: TicketComment[];
  attachment_count: number;
  comment_count: number;
  created_at: string;
  updated_at?: string;
}

interface UserOption {
  id: string;
  label: string;
}

/* ─── Styling ──────────────────────────────────────────────────────── */

const inputClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 transition-colors";
const labelClass = "text-xs font-medium text-muted-foreground";
const thClass =
  "px-5 py-3.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground";
const tdClass = "px-5 py-3.5";

const priorityBadge: Record<string, string> = {
  critical: "bg-red-500/10 text-red-600 ring-red-500/20",
  high: "bg-orange-500/10 text-orange-600 ring-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-600 ring-yellow-500/20",
  low: "bg-gray-500/10 text-gray-600 ring-gray-500/20",
};

const statusBadge: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600 ring-blue-500/20",
  assigned: "bg-indigo-500/10 text-indigo-600 ring-indigo-500/20",
  in_progress: "bg-amber-500/10 text-amber-600 ring-amber-500/20",
  on_hold: "bg-gray-500/10 text-gray-600 ring-gray-500/20",
  blocked: "bg-red-500/10 text-red-600 ring-red-500/20",
  alignment_pending: "bg-cyan-500/10 text-cyan-600 ring-cyan-500/20",
  pending_ops_approval: "bg-orange-500/10 text-orange-600 ring-orange-500/20",
  pending_client_approval: "bg-violet-500/10 text-violet-600 ring-violet-500/20",
  pending_review: "bg-purple-500/10 text-purple-600 ring-purple-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20",
  rejected: "bg-rose-500/10 text-rose-600 ring-rose-500/20",
  closed: "bg-slate-500/10 text-slate-600 ring-slate-500/20",
  cancelled: "bg-zinc-500/10 text-zinc-500 ring-zinc-500/20",
};

const statusIcon: Record<string, React.ReactNode> = {
  open: <Clock className="h-3.5 w-3.5" />,
  assigned: <User className="h-3.5 w-3.5" />,
  in_progress: <Play className="h-3.5 w-3.5" />,
  on_hold: <Pause className="h-3.5 w-3.5" />,
  blocked: <AlertTriangle className="h-3.5 w-3.5" />,
  alignment_pending: <Clock className="h-3.5 w-3.5" />,
  pending_ops_approval: <ShieldCheck className="h-3.5 w-3.5" />,
  pending_client_approval: <User className="h-3.5 w-3.5" />,
  pending_review: <Clock className="h-3.5 w-3.5" />,
  approved: <CheckCircle2 className="h-3.5 w-3.5" />,
  rejected: <XCircle className="h-3.5 w-3.5" />,
  closed: <Check className="h-3.5 w-3.5" />,
  cancelled: <XCircle className="h-3.5 w-3.5" />,
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Multi-stage escalation (Wave 4) ──────────────────────────────── */

// Reason wording per trigger, matching the legacy single-stage badges.
// response_sla has no suffix (the plain "Escalated" wording).
const ESCALATION_REASONS: Record<string, string> = {
  assignment_sla: "Unassigned",
  due_date: "Past Due",
};

/** Derive the highest fired stage (+ reason where derivable) from
 *  escalation_state keys shaped "<trigger>:<stage>". */
function deriveEscalation(
  state?: Record<string, string> | null,
): { stage: number; reason: string | null } | null {
  if (!state) return null;
  let stage = 0;
  let reason: string | null = null;
  for (const key of Object.keys(state).sort()) {
    const [trigger, rawStage] = key.split(":");
    const s = Number(rawStage);
    if (!Number.isFinite(s) || s <= 0) continue;
    if (s > stage) {
      stage = s;
      reason = ESCALATION_REASONS[trigger] ?? null;
    } else if (s === stage && !reason) {
      reason = ESCALATION_REASONS[trigger] ?? null;
    }
  }
  return stage > 0 ? { stage, reason } : null;
}

const CATEGORY_OPTIONS = [
  "installation",
  "repair",
  "replacement",
  "inspection",
  "relocation",
  "predictive_maintenance",
  "other",
];

// Categories where the backend derives cost liability from the asset's
// warranty (mirrors Ticket.WARRANTY_AWARE_CATEGORIES).
const BILLING_CATEGORIES = ["repair", "replacement"];

// Supplier-side warranty types (mirrors backend derive_billability).
const SUPPLIER_SIDE_TYPES = ["supplier", "manufacturer", "extended"];

/* ─── Status Stepper ───────────────────────────────────────────────── */

function getStepperSteps(status: TicketStatus) {
  // The corrective flow, in the order the work happens: raised, given to
  // somebody, under way on site, back for the office to look at, done.
  // "Approved" is gone — accepting the work is what closes the ticket, so
  // it was a step that nothing ever rested on.
  const MAIN_FLOW: TicketStatus[] = [
    "open",
    "assigned",
    "in_progress",
    "pending_review",
    "closed",
  ];
  const idx = MAIN_FLOW.indexOf(status);

  if (status === "blocked" || status === "on_hold") {
    return MAIN_FLOW.map((s, i) => {
      if (i === 0) return { key: s, label: formatLabel(s), status: "completed" as const };
      if (i === 1)
        return { key: status, label: formatLabel(status), status: "in_progress" as const };
      return { key: s, label: formatLabel(s), status: "pending" as const };
    });
  }
  if (status === "rejected") {
    return MAIN_FLOW.map((s, i) => {
      if (i < 2) return { key: s, label: formatLabel(s), status: "completed" as const };
      if (i === 2)
        return { key: "rejected", label: "Rejected", status: "in_progress" as const };
      return { key: s, label: formatLabel(s), status: "pending" as const };
    });
  }
  // The last stage (closed) is terminal — reaching it means done, not "in progress".
  const terminal = idx === MAIN_FLOW.length - 1;
  return MAIN_FLOW.map((s, i) => ({
    key: s,
    label: formatLabel(s),
    status:
      i < idx
        ? ("completed" as const)
        : i === idx
          ? terminal
            ? ("completed" as const)
            : ("in_progress" as const)
          : ("pending" as const),
  }));
}

/* ─── Activity Item ────────────────────────────────────────────────── */

const commentTypeConfig: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  comment: { icon: <MessageSquare className="h-3.5 w-3.5" />, color: "text-blue-500", bg: "bg-blue-500/10" },
  status_change: { icon: <ChevronRight className="h-3.5 w-3.5" />, color: "text-amber-500", bg: "bg-amber-500/10" },
  completion: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: "text-purple-500", bg: "bg-purple-500/10" },
  approval: { icon: <ShieldCheck className="h-3.5 w-3.5" />, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  rejection: { icon: <ShieldX className="h-3.5 w-3.5" />, color: "text-red-500", bg: "bg-red-500/10" },
};

function ActivityItem({ comment, onImageClick }: { comment: TicketComment; onImageClick?: (src: string) => void }) {
  const cfg = commentTypeConfig[comment.comment_type] || commentTypeConfig.comment;
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cfg.bg} ${cfg.color}`}>
          {cfg.icon}
        </div>
        <div className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="flex-1 pb-5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{comment.author_name || "System"}</span>
          {comment.comment_type === "status_change" && comment.old_status && (
            <span className="rounded-md bg-secondary px-2 py-0.5 text-2xs text-muted-foreground">
              {formatLabel(comment.old_status)} → {formatLabel(comment.new_status)}
            </span>
          )}
          {comment.comment_type === "completion" && (
            <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-2xs font-medium text-purple-500">Submitted for Review</span>
          )}
          {comment.comment_type === "approval" && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-2xs font-medium text-emerald-500">Approved</span>
          )}
          {comment.comment_type === "rejection" && (
            <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-2xs font-medium text-red-500">Rejected</span>
          )}
        </div>
        {comment.content ? <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{comment.content}</p> : null}
        {comment.image && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={comment.image}
            alt="Comment attachment"
            className="mt-2 max-h-48 cursor-zoom-in rounded-lg border border-border object-cover"
            onClick={() => onImageClick?.(comment.image!)}
          />
        )}
        <p className="mt-1.5 text-2xs text-muted-foreground/60">{formatDateTime(comment.created_at)}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   FULL-SCREEN TICKET DETAIL VIEW
   ═══════════════════════════════════════════════════════════════════════ */

function TicketDetailView({
  ticket: initialTicket,
  currentUserId,
  currentUserRole,
  onClose,
  onEdit,
  onRefresh,
}: {
  ticket: TicketItem;
  currentUserId: string;
  currentUserRole: string;
  onClose: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  // What is left once the work moved to the maintenance job: reading the
  // ticket, and talking on it.
  const [ticket, setTicket] = useState(initialTicket);
  const [newComment, setNewComment] = useState("");
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const isAssignee = ticket.assigned_to === currentUserId;
  // Highest fired escalation stage from escalation_state ("trigger:stage" keys).
  const escalation = deriveEscalation(ticket.escalation_state);
  // Who may do what is the maintenance job's question now. All this page
  // decides is whether the complaint itself may still be edited, and
  // whether it is late.
  const isAdmin = ["super_admin", "group_head", "ops_manager"].includes(currentUserRole);
  const isClosed = ["approved", "closed", "cancelled"].includes(ticket.status);
  const isOverdue = ticket.due_date && new Date(ticket.due_date) < new Date() && !isClosed;

  const completionAttachments = ticket.attachments?.filter((a) => a.attachment_type === "completion") || [];
  const generalAttachments = ticket.attachments?.filter((a) => a.attachment_type === "general" || a.attachment_type === "fault") || [];

  async function refreshTicket() {
    try {
      const { data } = await api.get(`/tickets/${ticket.id}/`);
      setTicket(data);
    } catch { /* keep current */ }
  }

  async function handleAddComment() {
    if (!newComment.trim() && !commentImage) return;
    setCommentLoading(true);
    try {
      if (commentImage) {
        const fd = new FormData();
        fd.append("content", newComment);
        fd.append("image", commentImage);
        await api.post(`/tickets/${ticket.id}/comments/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      } else {
        await api.post(`/tickets/${ticket.id}/comments/`, { content: newComment });
      }
      setNewComment("");
      setCommentImage(null);
      await refreshTicket();
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to add comment"));
    } finally {
      setCommentLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* ── Top bar ──────────────────────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Tickets
          </button>
          {/* The bar names the ticket and says how it stands. Everything
              else it used to carry — the occurrence count, the fault type,
              the priority, the escalation wording — is on the record below,
              and five badges in a row is not a summary. Only an escalation
              stays, because that is the one thing worth interrupting for. */}
          <div className="hidden items-center gap-2 sm:flex">
            <div className="h-4 w-px bg-border" />
            <span className="text-xs font-semibold text-foreground">
              {ticket.ticket_number || `#${ticket.id.slice(0, 8)}`}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusBadge[ticket.status] ?? statusBadge.open}`}>
              {statusIcon[ticket.status]} {formatLabel(ticket.status)}
            </span>
            {(escalation || ticket.escalated || ticket.assignment_escalated || ticket.due_date_escalated) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-2xs font-semibold text-red-500 ring-1 ring-red-500/20">
                <AlertTriangle className="h-3 w-3" /> Escalated
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && !isClosed && (
            <button onClick={onEdit} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-6 py-6">
          {/* Title + stepper */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">{ticket.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Created {formatDateTime(ticket.created_at)} by {ticket.reported_by_name || "Unknown"}
            </p>
            <div className="mt-5">
              <ProgressStepper steps={getStepperSteps(ticket.status)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            {/* ── LEFT COLUMN (2/3) ─────────────────────────────── */}
            <div className="space-y-6 lg:col-span-2">
              {/* Alert banners */}
              {ticket.status === "blocked" && ticket.blocked_reason && (
                <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-red-500 shrink-0" />
                  <div><p className="text-sm font-semibold text-red-500">Blocked</p><p className="mt-0.5 text-sm text-foreground">{ticket.blocked_reason}</p></div>
                </div>
              )}
              {ticket.status === "on_hold" && ticket.hold_reason && (
                <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                  <Pause className="mt-0.5 h-5 w-5 text-amber-500 shrink-0" />
                  <div><p className="text-sm font-semibold text-amber-500">On Hold</p><p className="mt-0.5 text-sm text-foreground">{ticket.hold_reason}</p></div>
                </div>
              )}
              {ticket.status === "rejected" && ticket.review_comments && (
                <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <ShieldX className="mt-0.5 h-5 w-5 text-red-500 shrink-0" />
                  <div><p className="text-sm font-semibold text-red-500">Rejected by {ticket.reviewed_by_name}</p><p className="mt-0.5 text-sm text-foreground">{ticket.review_comments}</p></div>
                </div>
              )}

              {/* Description */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                  <FileText className="h-4 w-4 text-muted-foreground" /> Description
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {ticket.description || "No description provided."}
                </p>
              </div>

              {/* Linked assets (multi-asset tickets, e.g. preventive maintenance) */}
              {ticket.devices_info && ticket.devices_info.length > 1 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                    <Monitor className="h-4 w-4 text-muted-foreground" /> Assets Covered ({ticket.devices_info.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {ticket.devices_info.map((d) => (
                      <Link
                        key={d.id}
                        href={`/assets?device=${d.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-3 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        <Monitor className="h-3 w-3" />
                        {d.asset_code}
                        {d.display_name && <span className="text-muted-foreground">— {d.display_name}</span>}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Completion Submission — always visible when data exists */}
              {ticket.completion_notes && (
                <div className="rounded-xl border border-purple-500/20 bg-card p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-purple-600 mb-3">
                    <CheckCircle2 className="h-4 w-4" /> Completion Report
                  </h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{ticket.completion_notes}</p>
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    {ticket.completed_by_name && <span>By <strong className="text-foreground">{ticket.completed_by_name}</strong></span>}
                    {ticket.completed_at && <span>{formatDateTime(ticket.completed_at)}</span>}
                  </div>
                  {completionAttachments.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Evidence Photos</p>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {completionAttachments.map((att) => (
                          <button key={att.id} onClick={() => setLightboxImg(att.file)} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary/30">
                            <img src={att.file} alt={att.caption || "Evidence"} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                              <ImageIcon className="h-5 w-5 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                            </div>
                            {att.caption && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5"><p className="text-2xs text-white truncate">{att.caption}</p></div>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Approval result */}
              {ticket.status === "approved" && (
                <div className="rounded-xl border border-emerald-500/20 bg-card p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-600 mb-2">
                    <ShieldCheck className="h-4 w-4" /> Approved
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>By <strong className="text-foreground">{ticket.reviewed_by_name}</strong></span>
                    {ticket.reviewed_at && <span>{formatDateTime(ticket.reviewed_at)}</span>}
                  </div>
                  {ticket.review_comments && <p className="mt-2 text-sm text-foreground">{ticket.review_comments}</p>}
                </div>
              )}
              {ticket.status === "closed" && ticket.reviewed_by_name && (
                <div className="rounded-xl border border-emerald-500/20 bg-card p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-emerald-600 mb-2">
                    <ShieldCheck className="h-4 w-4" /> Approved &amp; Closed
                  </h3>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Reviewed by <strong className="text-foreground">{ticket.reviewed_by_name}</strong></span>
                    {ticket.reviewed_at && <span>{formatDateTime(ticket.reviewed_at)}</span>}
                  </div>
                  {ticket.review_comments && <p className="mt-2 text-sm text-foreground">{ticket.review_comments}</p>}
                </div>
              )}

              {/* General attachments */}
              {generalAttachments.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" /> Attachments ({generalAttachments.length})
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {generalAttachments.map((att) => (
                      <button key={att.id} onClick={() => setLightboxImg(att.file)} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary/30">
                        <img src={att.file} alt={att.caption || "Attachment"} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity / Comments Timeline */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground mb-4">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" /> Activity &amp; Comments
                </h3>

                <div className="space-y-0">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10">
                        <Clock className="h-3.5 w-3.5 text-blue-500" />
                      </div>
                      <div className="mt-1 w-px flex-1 bg-border" />
                    </div>
                    <div className="flex-1 pb-5">
                      <p className="text-sm font-semibold text-foreground">Ticket created</p>
                      <p className="text-2xs text-muted-foreground/60">{formatDateTime(ticket.created_at)}</p>
                    </div>
                  </div>
                  {(ticket.comments || []).map((c) => (
                    <ActivityItem key={c.id} comment={c} onImageClick={setLightboxImg} />
                  ))}
                </div>

                {/* Add comment */}
                {!["closed"].includes(ticket.status) && (
                  <div className="mt-4 space-y-2 border-t border-border pt-4">
                    {commentImage && (
                      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs">
                        <ImageIcon className="h-3.5 w-3.5 text-primary" />
                        <span className="truncate text-primary">{commentImage.name}</span>
                        <button onClick={() => setCommentImage(null)} className="ml-auto rounded p-0.5 text-primary hover:bg-primary/10"><X className="h-3 w-3" /></button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
                        placeholder="Write a comment..."
                        className={inputClass}
                      />
                      <input ref={commentFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setCommentImage(e.target.files?.[0] ?? null)} />
                      <button
                        onClick={() => commentFileRef.current?.click()}
                        title="Attach photo"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleAddComment}
                        disabled={commentLoading || (!newComment.trim() && !commentImage)}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-all disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT COLUMN (1/3) ────────────────────────────── */}
            <div className="space-y-5">
              {/* Quick Info Card */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">Details</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusBadge[ticket.status]}`}>
                      {statusIcon[ticket.status]} {formatLabel(ticket.status)}
                    </span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Priority</span>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${priorityBadge[ticket.priority]}`}>
                      {formatLabel(ticket.priority)}
                    </span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Category</span>
                    <span className="text-sm font-medium text-foreground">{formatLabel(ticket.category)}</span>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-start justify-between">
                    <span className="text-xs text-muted-foreground mt-0.5">Assigned To</span>
                    <div className="flex items-center gap-2 text-right">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-sm font-medium text-foreground">{ticket.assigned_to_name || "Unassigned"}</span>
                    </div>
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-start justify-between">
                    <span className="text-xs text-muted-foreground mt-0.5">Reported By</span>
                    <span className="text-sm font-medium text-foreground text-right">{ticket.reported_by_name || "-"}</span>
                  </div>
                  {ticket.site_name && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-start justify-between">
                        <span className="text-xs text-muted-foreground mt-0.5">Site</span>
                        <Link href={`/sites?site=${ticket.site}`} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                          <MapPin className="h-3 w-3" /> {ticket.site_name}
                        </Link>
                      </div>
                    </>
                  )}
                  {ticket.device_code && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-start justify-between">
                        <span className="text-xs text-muted-foreground mt-0.5">Device</span>
                        <Link href={`/assets?device=${ticket.device}`} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                          <Monitor className="h-3 w-3" /> {ticket.device_code}
                        </Link>
                      </div>
                    </>
                  )}
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Due Date</span>
                    <span className={`text-sm font-medium ${isOverdue ? "text-destructive" : "text-foreground"}`}>
                      {ticket.due_date ? formatDate(ticket.due_date) : "Not set"}
                      {isOverdue && <AlertCircle className="ml-1 inline h-3 w-3" />}
                    </span>
                  </div>
                  {ticket.response_due_at && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Respond By</span>
                        <span className={`text-xs font-medium ${ticket.is_response_overdue || ticket.escalated ? "text-red-500" : "text-foreground"}`}>
                          {new Date(ticket.response_due_at).toLocaleString()}
                        </span>
                      </div>
                    </>
                  )}
                  {ticket.complaint_by && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Complaint By</span>
                        <span className="text-xs font-medium text-foreground">{ticket.complaint_by}</span>
                      </div>
                    </>
                  )}
                  {ticket.assigned_vendor_name && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Vendor</span>
                        <Link href="/suppliers" className="text-xs font-medium text-primary hover:underline">{ticket.assigned_vendor_name}</Link>
                      </div>
                    </>
                  )}
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Created</span>
                    <span className="text-xs text-foreground">{formatDate(ticket.created_at)}</span>
                  </div>
                  {ticket.resolved_at && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Resolved</span>
                        <span className="text-xs text-foreground">{formatDate(ticket.resolved_at)}</span>
                      </div>
                    </>
                  )}
                  {ticket.closed_at && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Closed</span>
                        <span className="text-xs text-foreground">{formatDate(ticket.closed_at)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Billing is not asked twice. What a repair costs, whether it
                  is chargeable and to whom are settled on the maintenance
                  record when the work is completed — both sides derived the
                  same answer from derive_billability(device), and two copies
                  of one answer is one too many. */}
              {/* The work is run from the maintenance job, not from here.
                  A ticket is the complaint: it is raised, it is tracked, and
                  it closes when the repair is accepted. Assigning a
                  technician, starting and finishing a visit and reviewing
                  the result all happen in one place now — two sets of the
                  same buttons is what let one repair hold two statuses. */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  The work
                </h3>
                <p className="text-xs text-muted-foreground">
                  This fault is worked as a maintenance job: the technician,
                  the visits and the review all live there. This ticket
                  follows it and closes when the repair is accepted.
                </p>
                {/* One asset, one job: go straight there. A complaint
                    covering two standees raised two jobs, and only the
                    reader knows which one they came for. */}
                {(ticket.maintenance_jobs ?? []).length > 1 ? (
                  <div className="mt-3 space-y-1.5">
                    {(ticket.maintenance_jobs ?? []).map((j) => (
                      <Link
                        key={j.id}
                        href={`/maintenance#job-${j.id}`}
                        className="flex h-auto w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                      >
                        <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate">{j.asset_code ?? "Asset"}</span>
                          {j.asset_name && (
                            <span className="block truncate text-2xs font-normal text-muted-foreground">
                              {j.asset_name}
                            </span>
                          )}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Link
                    href={
                      ticket.maintenance_jobs?.[0]
                        ? `/maintenance#job-${ticket.maintenance_jobs[0].id}`
                        : "/maintenance"
                    }
                    className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-secondary"
                  >
                    <Wrench className="h-4 w-4" /> Open in Maintenance
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImg && (
        <Lightbox src={lightboxImg} onClose={() => setLightboxImg(null)} />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════ */

export default function TicketsPage() {
  const { user, canWrite, canDelete } = useUser();
  const canEdit = canWrite("tickets");
  const canRemove = canDelete("tickets");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [ticketPage, setTicketPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<TicketItem | null>(null);
  const [detailTicket, setDetailTicket] = useState<TicketItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "", priority: "", category: "", flag: "" });
  const [search, setSearch] = useState("");
  const [deviceOptions, setDeviceOptions] = useState<{ id: string; label: string }[]>([]);
  const [issueTypes, setIssueTypes] = useState<{ id: string; name: string }[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<{
    id?: string;
    asset_code: string; display_name?: string; model_name?: string; device_model_name?: string;
    installation_date?: string | null; purchase_date?: string | null; supplier_name?: string | null;
    site_name?: string | null; current_site?: string | null; warranty_status?: string | null;
    tickets_total?: number; tickets_open?: number;
  } | null>(null);
  const [faultFiles, setFaultFiles] = useState<File[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceListOpen, setDeviceListOpen] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState("");
  // Category drives the billing context + multi-asset UI, so it is controlled.
  const [categoryValue, setCategoryValue] = useState("other");
  // Cost liability (WF-14/15) — sent only when the user overrides the
  // warranty-derived defaults, so the backend derivation stays authoritative.
  // Defaults derived from the asset's active warranties (mirrors backend
  // derive_billability); null = unknown → server derives on save.
  const [warrantyBilling, setWarrantyBilling] = useState<{ is_billable: boolean; charge_to: string } | null>(null);
  // Whether this repair is chargeable. Defaulted from the warranty and
  // overridable, because a warranty can be void for a reason the record
  // does not know about. Who it is charged *to* stays the warranty's
  // answer — there was nothing for a person to add to that.
  const [billingBillable, setBillingBillable] = useState(true);
  const [billingEdited, setBillingEdited] = useState(false);
  // Extra assets linked to the same ticket (MW-03).
  const [extraAssets, setExtraAssets] = useState<{ id: string; label: string }[]>([]);
  const [extraQuery, setExtraQuery] = useState("");
  const [extraListOpen, setExtraListOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function exportExcel() {
    setExporting(true);
    try {
      const params: Record<string, string> = {};
      if (search) params.search = search;
      if (filterValues.status) params.status = filterValues.status;
      if (filterValues.priority) params.priority = filterValues.priority;
      if (filterValues.category) params.category = filterValues.category;
      if (deviceFilter) params.device = deviceFilter;
      // Stat-tile flags → backend ?flag=…; the Closed tile is a plain status.
      const FLAG_PARAM: Record<string, string> = {
        unassigned: "unassigned",
        sla: "sla_breached",
        overdue: "past_due",
        in_review: "in_review",
      };
      if (filterValues.flag === "closed_only") params.status = "closed";
      else if (FLAG_PARAM[filterValues.flag]) params.flag = FLAG_PARAM[filterValues.flag];
      const res = await api.get("/tickets/export/", { params, responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tickets-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Export failed"));
    } finally {
      setExporting(false);
    }
  }

  const fetchTickets = useCallback(async () => {
    try {
      const { data } = await api.get("/tickets/", { params: { page_size: 1000 } });
      setTickets(data.results ?? data);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to load tickets"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  useEffect(() => {
    const createParam = searchParams.get("create");
    const deviceParam = searchParams.get("device");
    if (createParam) {
      openCreate(deviceParam ?? undefined, searchParams.get("category") ?? undefined);
      router.replace("/tickets", { scroll: false });
      return;
    }
    if (deviceParam) setDeviceFilter(deviceParam);
    // The address bar decides which ticket is open — a click, Back, Forward
    // and a reload all arrive here the same way.
    const openId = searchParams.get("open");
    if (!openId) {
      setDetailTicket(null);
    } else if (detailTicket?.id !== openId && tickets.length > 0) {
      const found = tickets.find((t) => t.id === openId);
      if (found) showTicket(found);
      else api.get(`/tickets/${openId}/`).then(({ data }) => setDetailTicket(data)).catch(() => toast.error("Ticket not found"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tickets]);

  async function loadFormOptions() {
    try {
      const [dev, it] = await Promise.all([
        api.get("/assets/devices/", { params: { page_size: 500, ordering: "asset_code" } }),
        api.get("/tickets/issue-types/", { params: { is_active: true, page_size: 100 } }),
      ]);
      const devices = dev.data.results ?? dev.data;
      setDeviceOptions(devices.map((d: { id: string; asset_code: string; device_model_name?: string; serial_number?: string }) => ({
        id: d.id,
        label: `${d.asset_code}${d.device_model_name ? ` — ${d.device_model_name}` : ""}`,
      })));
      setIssueTypes(it.data.results ?? it.data);
    } catch { /* silently fail */ }
  }

  async function onDeviceSelect(deviceId: string) {
    if (!deviceId) { setDeviceInfo(null); setWarrantyBilling(null); return; }
    try {
      const { data } = await api.get(`/assets/devices/${deviceId}/`);
      setDeviceInfo(data);
    } catch { setDeviceInfo(null); }
    // Re-read who bears the cost for this asset (mirrors the backend's
    // derive_billability: only an active *client* warranty covers it, and
    // the vendor is charged when a supplier-side warranty is active too).
    // Shown, not asked — the server decides this on save.
    setWarrantyBilling(null);
    setBillingEdited(false);
    try {
      const { data } = await api.get("/warranties/", {
        params: { device: deviceId, status: "active", page_size: 100 },
      });
      const list: { warranty_type: string }[] = data.results ?? data;
      const hasClient = list.some((w) => w.warranty_type === "client");
      const hasSupplierSide = list.some((w) => SUPPLIER_SIDE_TYPES.includes(w.warranty_type));
      const derived = hasClient
        ? { is_billable: false, charge_to: hasSupplierSide ? "vendor" : "company" }
        : { is_billable: true, charge_to: "client" };
      setWarrantyBilling(derived);
      if (!billingEdited) setBillingBillable(derived.is_billable);
    } catch { /* unknown — billing derived server-side on save */ }
  }

  function resetBillingAndExtras() {
    setWarrantyBilling(null);
    setBillingBillable(true); setBillingEdited(false);
    setExtraAssets([]); setExtraQuery(""); setExtraListOpen(false);
  }

  function openCreate(presetDeviceId?: string, presetCategory?: string) {
    setSelected(null); setDeviceInfo(null); setFaultFiles([]); setDeviceQuery(""); setDeviceListOpen(false);
    setCategoryValue(presetCategory && CATEGORY_OPTIONS.includes(presetCategory) ? presetCategory : "");
    resetBillingAndExtras();
    setSelectedDeviceId(presetDeviceId ?? "");
    if (presetDeviceId) onDeviceSelect(presetDeviceId);
    setModalMode("create"); loadFormOptions();
  }
  function openEdit(t: TicketItem) {
    setSelected(t); setDeviceInfo(null); setFaultFiles([]);
    setCategoryValue(t.category); resetBillingAndExtras();
    setModalMode("edit"); loadFormOptions();
  }
  function showTicket(t: TicketItem) {
    api.get(`/tickets/${t.id}/`).then(({ data }) => setDetailTicket(data)).catch(() => setDetailTicket(t));
  }
  function openDetail(t: TicketItem) {
    // push, not replace: Back should come out of the ticket to the list,
    // not out of Tickets altogether.
    router.push(`/tickets?open=${t.id}`, { scroll: false });
  }
  function closeDetail() { router.push("/tickets", { scroll: false }); }
  function closeModal() { setModalMode(null); setSelected(null); }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (modalMode === "create") {
      // A ticket is about an asset, of a kind, at an urgency. The API
      // refuses one without all three; saying so here saves the round trip.
      if (!fd.get("device")) { toast.error("Pick the asset this ticket is about"); return; }
      if (!fd.get("issue_type")) { toast.error("Pick what the fault is"); return; }
      if (!fd.get("category")) { toast.error("Pick a category"); return; }
      if (!fd.get("priority")) { toast.error("Pick a priority"); return; }
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      title: fd.get("title"), description: fd.get("description"), priority: fd.get("priority"),
      category: fd.get("category"), issue_type: fd.get("issue_type") || null,
      complaint_by: fd.get("complaint_by") || "",
      due_date: fd.get("due_date") || null,
    };
    if (modalMode === "create") {
      payload.device = fd.get("device") || null;
      payload.site = deviceInfo?.current_site || null;
      // Only sent when somebody actually changed it. Left alone, the
      // server reads the asset's warranty — the same answer this form is
      // already showing, so there is nothing to send.
      if (billingEdited && selectedDeviceId && BILLING_CATEGORIES.includes(categoryValue)) {
        payload.is_billable = billingBillable;
      }
      if (extraAssets.length > 0 && selectedDeviceId) {
        payload.devices = [selectedDeviceId, ...extraAssets.map((a) => a.id)];
      }
    }
    try {
      if (modalMode === "create") {
        const { data } = await api.post("/tickets/", payload);
        for (const file of faultFiles) {
          const ffd = new FormData();
          ffd.append("file", file);
          ffd.append("attachment_type", "fault");
          ffd.append("caption", "Fault evidence (at creation)");
          await api.post(`/tickets/${data.id}/attachments/`, ffd, { headers: { "Content-Type": "multipart/form-data" } });
        }
        toast.success(`Ticket ${data.ticket_number || "created"} raised`);
      } else if (selected) {
        await api.patch(`/tickets/${selected.id}/`, payload);
        toast.success("Ticket updated");
      }
      closeModal(); closeDetail(); fetchTickets();
    } catch (err: unknown) { toast.error(getApiError(err, "Failed to save ticket")); }
    finally { setSaving(false); }
  }

  async function handleDelete(t: TicketItem) {
    if (!confirm(`Delete ticket "${t.title}"? This cannot be undone.`)) return;
    try { await api.delete(`/tickets/${t.id}/`); toast.success("Ticket deleted"); fetchTickets(); }
    catch (err: unknown) { toast.error(getApiError(err, "Cannot delete — ticket may have linked records")); }
  }

  /* ── Render detail view (full-screen) if a ticket is open ──── */

  if (detailTicket && user) {
    return (
      <TicketDetailView
        ticket={detailTicket}
        currentUserId={user.id}
        currentUserRole={user.role}
        onClose={closeDetail}
        onEdit={() => { closeDetail(); openEdit(detailTicket); }}
        onRefresh={fetchTickets}
      />
    );
  }

  /* ── Ticket list ───────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-yellow-500 to-amber-600">
            <Ticket className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tickets</h1>
            <p className="text-muted-foreground">Track, complete, and approve field tasks</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportExcel} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60">
            <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export Excel"}
          </button>
          {canEdit && (
            <button onClick={() => openCreate()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
              <Plus className="h-4 w-4" /> Add Ticket
            </button>
          )}
        </div>
      </div>

      {deviceFilter && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="font-medium text-primary">
            Showing tickets for asset {tickets.find((t) => t.device === deviceFilter)?.device_code || "selected asset"}
          </span>
          <button onClick={() => setDeviceFilter("")} className="ml-auto rounded p-0.5 text-primary hover:bg-primary/10" title="Clear filter">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {(() => {
        const isActive = (t: TicketItem) => !["closed", "approved", "rejected", "cancelled"].includes(t.status);
        const todayIso = new Date().toISOString().split("T")[0];
        const toggleFlag = (f: string) => setFilterValues((prev) => ({ ...prev, flag: prev.flag === f ? "" : f }));
        const STATUS_HEX: Record<string, string> = {
          open: "#3b82f6", in_progress: "#f59e0b", on_hold: "#6b7280", blocked: "#ef4444",
          alignment_pending: "#06b6d4", pending_ops_approval: "#f97316", pending_client_approval: "#8b5cf6",
          assigned: "#6366f1", pending_review: "#a855f7", approved: "#10b981", rejected: "#f43f5e", closed: "#64748b",
          cancelled: "#a1a1aa",
        };
        return (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <StatTiles
              tiles={[
                { key: "total", label: "Total Tickets", value: tickets.length, tone: "primary", active: !filterValues.flag && !filterValues.status, onClick: () => setFilterValues((prev) => ({ ...prev, status: "", flag: "" })) },
                { key: "unassigned", label: "Unassigned", value: tickets.filter((t) => isActive(t) && !t.assigned_to).length, tone: "amber", active: filterValues.flag === "unassigned", onClick: () => toggleFlag("unassigned") },
                { key: "sla", label: "SLA Breached", value: tickets.filter((t) => isActive(t) && (t.escalated || t.is_response_overdue || t.assignment_escalated || t.due_date_escalated)).length, tone: "red", active: filterValues.flag === "sla", onClick: () => toggleFlag("sla") },
                { key: "overdue", label: "Past Due Date", value: tickets.filter((t) => isActive(t) && t.due_date && t.due_date < todayIso).length, tone: "red", active: filterValues.flag === "overdue", onClick: () => toggleFlag("overdue") },
                { key: "in_review", label: "In Review", value: tickets.filter((t) => ["pending_review", "pending_ops_approval", "pending_client_approval"].includes(t.status)).length, tone: "violet", active: filterValues.flag === "in_review", onClick: () => toggleFlag("in_review") },
                { key: "closed", label: "Closed", value: tickets.filter((t) => t.status === "closed").length, tone: "emerald", active: filterValues.flag === "closed_only", onClick: () => toggleFlag("closed_only") },
              ]}
            />
            <SegmentBar
              segments={Object.keys(statusBadge).map((s) => ({
                key: s, label: formatLabel(s), color: STATUS_HEX[s] ?? "#94a3b8",
                count: tickets.filter((t) => t.status === s).length,
              }))}
              active={filterValues.status || undefined}
              onSelect={(s) => setFilterValues((prev) => ({ ...prev, status: prev.status === s ? "" : s }))}
            />
          </div>
        );
      })()}

      <FilterBar
        filters={[
          { key: "status", label: "Status", options: Object.keys(statusBadge).map((s) => ({ value: s, label: formatLabel(s) })) },
          { key: "priority", label: "Priority", options: Object.keys(priorityBadge).map((p) => ({ value: p, label: formatLabel(p) })) },
          { key: "category", label: "Category", options: CATEGORY_OPTIONS.map((c) => ({ value: c, label: formatLabel(c) })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by title, site..."
      />

      {(() => {
        const isActive = (t: TicketItem) => !["closed", "approved", "rejected", "cancelled"].includes(t.status);
        const todayIso = new Date().toISOString().split("T")[0];
        const filtered = tickets.filter((t) => {
          if (deviceFilter && t.device !== deviceFilter) return false;
          if (filterValues.status && t.status !== filterValues.status) return false;
          if (filterValues.priority && t.priority !== filterValues.priority) return false;
          if (filterValues.category && t.category !== filterValues.category) return false;
          if (filterValues.flag === "unassigned" && !(isActive(t) && !t.assigned_to)) return false;
          if (filterValues.flag === "sla" && !(isActive(t) && (t.escalated || t.is_response_overdue || t.assignment_escalated || t.due_date_escalated))) return false;
          if (filterValues.flag === "overdue" && !(isActive(t) && t.due_date && t.due_date < todayIso)) return false;
          if (filterValues.flag === "in_review" && !["pending_review", "pending_ops_approval", "pending_client_approval"].includes(t.status)) return false;
          if (filterValues.flag === "closed_only" && t.status !== "closed") return false;
          if (search) {
            const q = search.toLowerCase();
            if (!t.title.toLowerCase().includes(q) && !(t.ticket_number || "").toLowerCase().includes(q) && !(t.site_name || "").toLowerCase().includes(q) && !(t.assigned_to_name || "").toLowerCase().includes(q)) return false;
          }
          return true;
        });
        return loading ? (
          <div className="flex items-center justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <Ticket className="mx-auto h-12 w-12 text-muted-foreground/30" />
            <h3 className="mt-4 text-lg font-semibold text-foreground">No tickets found</h3>
            <p className="mt-2 text-sm text-muted-foreground">{tickets.length > 0 ? "Try adjusting your filters." : "Create a ticket to start tracking field issues."}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className={thClass}>Ticket #</th>
                    <th className={thClass}>Title</th>
                    <th className={thClass}>Assets</th>
                    <th className={thClass}>Priority</th>
                    <th className={thClass}>Status</th>
                    <th className={thClass}>Category</th>
                    <th className={thClass}>Site</th>
                    <th className={thClass}>Assigned To</th>
                    <th className={thClass}>Due Date</th>
                    <th className={thClass}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice(filtered, ticketPage).map((t) => (
                    <tr key={t.id} onClick={() => openDetail(t)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                      <td className={`${tdClass} whitespace-nowrap font-medium text-primary`}>
                        <span className="inline-flex items-center gap-1">
                          {t.ticket_number || `#${t.id.slice(0, 8)}`}
                          <CopyButton text={t.ticket_number || t.id} label="ticket #" />
                        </span>
                      </td>
                      <td className={`${tdClass} font-medium text-foreground`}>
                        <div className="flex items-center gap-2">
                          {t.title}
                          {(t.attachment_count > 0 || t.comment_count > 0) && (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              {t.attachment_count > 0 && <span className="flex items-center gap-0.5 text-2xs"><ImageIcon className="h-3 w-3" />{t.attachment_count}</span>}
                              {t.comment_count > 0 && <span className="flex items-center gap-0.5 text-2xs"><MessageSquare className="h-3 w-3" />{t.comment_count}</span>}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className={`${tdClass} whitespace-nowrap font-mono text-xs text-muted-foreground`}>
                        {/* One ticket can cover several assets; every one it
                            is raised for is named, the primary first. */}
                        {(() => {
                          const codes = [
                            t.device_code,
                            ...(t.devices_info ?? []).map((d) => d.asset_code),
                          ].filter((c, i, all): c is string => !!c && all.indexOf(c) === i);
                          return codes.length === 0
                            ? "-"
                            : codes.map((c) => <span key={c} className="block">{c}</span>);
                        })()}
                      </td>
                      <td className={tdClass}><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${priorityBadge[t.priority] ?? priorityBadge.low}`}>{formatLabel(t.priority)}</span></td>
                      <td className={tdClass}><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusBadge[t.status] ?? statusBadge.open}`}>{statusIcon[t.status]}{formatLabel(t.status)}</span></td>
                      <td className={`${tdClass} text-muted-foreground`}>{formatLabel(t.category)}</td>
                      <td className={`${tdClass} text-muted-foreground`}>{t.site_name || "-"}</td>
                      <td className={`${tdClass} text-muted-foreground`}>{t.assigned_to_name || "-"}</td>
                      <td className={`${tdClass} text-muted-foreground`}>{t.due_date || "-"}</td>
                      <td className={tdClass} onClick={(e) => e.stopPropagation()}>
                        {canEdit ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(t)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                            {canRemove && (
                              <button onClick={() => handleDelete(t)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                            )}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={ticketPage} total={filtered.length} onPage={setTicketPage} noun="tickets" />
            </div>
          </div>
        );
      })()}

      {/* Create/Edit Modal */}
      {modalMode && (
        <Modal open onClose={closeModal} title={modalMode === "create" ? "Create Ticket" : "Edit Ticket"} size="wide">
            <form onSubmit={handleSubmit} className="flex flex-col">
              <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="title" className={labelClass}>Title</label>
                <input id="title" name="title" required defaultValue={selected?.title ?? ""} className={inputClass} placeholder="Brief summary of the issue" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="description" className={labelClass}>Description</label>
                <textarea id="description" name="description" rows={3} defaultValue={selected?.description ?? ""} className={`${inputClass} h-auto py-2`} placeholder="Detailed description of the issue" />
              </div>
              {modalMode === "create" && (
                <div className="space-y-1.5">
                  <label htmlFor="device" className={labelClass}>Asset *</label>
                  <div className="relative">
                    <input
                      id="device"
                      value={deviceQuery}
                      onChange={(e) => { setDeviceQuery(e.target.value); setDeviceListOpen(true); if (!e.target.value) { setSelectedDeviceId(""); onDeviceSelect(""); } }}
                      onFocus={() => setDeviceListOpen(true)}
                      onBlur={() => setTimeout(() => setDeviceListOpen(false), 150)}
                      placeholder="Search asset by code or model…"
                      className={inputClass}
                      autoComplete="off"
                    />
                    <input type="hidden" name="device" value={selectedDeviceId} />
                    {deviceListOpen && (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
                        {deviceOptions.filter((d) => d.label.toLowerCase().includes(deviceQuery.toLowerCase())).slice(0, 50).map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onMouseDown={() => { setSelectedDeviceId(d.id); setDeviceQuery(d.label); setDeviceListOpen(false); onDeviceSelect(d.id); }}
                            className={`block w-full px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10 ${selectedDeviceId === d.id ? "bg-primary/5 font-medium text-primary" : "text-foreground"}`}
                          >
                            {d.label}
                          </button>
                        ))}
                        {deviceOptions.filter((d) => d.label.toLowerCase().includes(deviceQuery.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">No assets match &quot;{deviceQuery}&quot;</p>
                        )}
                      </div>
                    )}
                  </div>
                  {deviceInfo && (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs sm:grid-cols-4">
                      <span className="text-muted-foreground">Asset Name</span>
                      <span className="font-medium text-foreground">{deviceInfo.display_name || deviceInfo.device_model_name || deviceInfo.asset_code}</span>
                      <span className="text-muted-foreground">Installed On</span>
                      <span className="font-medium text-foreground">{deviceInfo.installation_date || "—"}</span>
                      <span className="text-muted-foreground">Procured From</span>
                      <span className="font-medium text-foreground">{deviceInfo.supplier_name || "—"}</span>
                      <span className="text-muted-foreground">Client</span>
                      <span className="font-medium text-foreground">{(deviceInfo as { client_name?: string | null }).client_name || "—"}</span>
                      <span className="text-muted-foreground">Location</span>
                      <span className="font-medium text-foreground">{deviceInfo.site_name || "In warehouse"}</span>
                      {deviceInfo.warranty_status && (
                        <>
                          <span className="text-muted-foreground">Warranty</span>
                          <span className={`font-medium ${deviceInfo.warranty_status === "active" ? "text-emerald-500" : "text-muted-foreground"}`}>
                            {deviceInfo.warranty_status === "active" ? "Under warranty" : formatLabel(deviceInfo.warranty_status)}
                          </span>
                        </>
                      )}
                      <span className="text-muted-foreground">Previous Tickets</span>
                      <span className="font-medium text-foreground">
                        {(deviceInfo.tickets_total ?? 0) > 0 ? (
                          <Link href={`/tickets?device=${deviceInfo.id}`} className="text-primary hover:underline" onClick={() => setModalMode(null)}>
                            {deviceInfo.tickets_total} total{(deviceInfo.tickets_open ?? 0) > 0 ? ` · ${deviceInfo.tickets_open} open` : ""} →
                          </Link>
                        ) : (
                          "None — first ticket for this asset"
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {/* Warranty context + cost liability (WF-14/15) — shown only for
                  the categories where the backend derives billability. */}
              {modalMode === "create" && deviceInfo && BILLING_CATEGORIES.includes(categoryValue) && (
                <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-3">
                  {warrantyBilling === null ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
                      <ShieldCheck className="h-3.5 w-3.5" /> Billing derives from the asset&apos;s warranty on save
                    </span>
                  ) : warrantyBilling.is_billable ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-500 ring-1 ring-amber-500/20">
                      <ShieldX className="h-3.5 w-3.5" /> No active client warranty — billable to client
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-500 ring-1 ring-emerald-500/20">
                      <ShieldCheck className="h-3.5 w-3.5" /> Client warranty active — {warrantyBilling.charge_to === "vendor" ? "vendor" : "company"} bears cost
                    </span>
                  )}
                  <label className="flex h-10 w-fit cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={billingBillable}
                      onChange={(e) => { setBillingBillable(e.target.checked); setBillingEdited(true); }}
                      className="h-4 w-4"
                    />
                    Billable
                  </label>
                  <p className="text-2xs text-muted-foreground">
                    Read from the asset&apos;s warranty — untick only if this repair
                    is not chargeable. What it actually costs is settled on the
                    maintenance job when the work is done.
                  </p>
                </div>
              )}
              {/* Extra assets on the same ticket (MW-03, e.g. preventive maintenance rounds) */}
              {modalMode === "create" && selectedDeviceId && (
                <div className="space-y-1.5">
                  <label className={labelClass}>
                    Additional Assets<span className="font-normal text-muted-foreground/70"> (optional — covers several assets with one ticket)</span>
                  </label>
                  {extraAssets.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {extraAssets.map((a) => (
                        <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          {a.label}
                          <button
                            type="button"
                            onClick={() => setExtraAssets((prev) => prev.filter((x) => x.id !== a.id))}
                            className="rounded-full p-0.5 hover:bg-primary/20"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="relative">
                    <input
                      value={extraQuery}
                      onChange={(e) => { setExtraQuery(e.target.value); setExtraListOpen(true); }}
                      onFocus={() => setExtraListOpen(true)}
                      onBlur={() => setTimeout(() => setExtraListOpen(false), 150)}
                      placeholder="Search to add more assets…"
                      className={inputClass}
                      autoComplete="off"
                    />
                    {extraListOpen && (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
                        {deviceOptions
                          .filter((d) => d.id !== selectedDeviceId && !extraAssets.some((a) => a.id === d.id) && d.label.toLowerCase().includes(extraQuery.toLowerCase()))
                          .slice(0, 50)
                          .map((d) => (
                            <button
                              key={d.id}
                              type="button"
                              onMouseDown={() => { setExtraAssets((prev) => [...prev, { id: d.id, label: d.label }]); setExtraQuery(""); setExtraListOpen(false); }}
                              className="block w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-primary/10"
                            >
                              {d.label}
                            </button>
                          ))}
                        {deviceOptions.filter((d) => d.id !== selectedDeviceId && !extraAssets.some((a) => a.id === d.id) && d.label.toLowerCase().includes(extraQuery.toLowerCase())).length === 0 && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">No more assets match</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="issue_type" className={labelClass}>Issue Type *</label>
                  <select id="issue_type" name="issue_type" required defaultValue={selected?.issue_type ?? ""} className={inputClass}>
                    <option value="" disabled>Select issue…</option>
                    {issueTypes.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="complaint_by" className={labelClass}>Complaint By</label>
                  <input id="complaint_by" name="complaint_by" defaultValue={selected?.complaint_by ?? ""} className={inputClass} placeholder="e.g. client company or staff" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <label htmlFor="priority" className={labelClass}>Priority *</label>
                  <select id="priority" name="priority" required defaultValue={selected?.priority ?? ""} className={inputClass}>
                    <option value="" disabled>Select priority</option>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="category" className={labelClass}>Category *</label>
                  <select id="category" name="category" required value={categoryValue} onChange={(e) => setCategoryValue(e.target.value)} className={inputClass}>
                    <option value="" disabled>Select category</option>
                    {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{formatLabel(c)}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="due_date" className={labelClass}>
                    Due Date
                  </label>
                  <input id="due_date" name="due_date" type="date" defaultValue={selected?.due_date ?? ""} className={inputClass} />
                  {modalMode === "create" && (
                    <p className="text-2xs text-muted-foreground">Auto-set from priority if left empty (critical 24h · high 48h · medium 5bd · low 10bd)</p>
                  )}
                </div>
              </div>
              {modalMode === "create" && (
                <div className="space-y-1.5">
                  <label className={labelClass}>Fault Photos</label>
                  <input
                    type="file" accept="image/*" multiple
                    onChange={(e) => setFaultFiles(Array.from(e.target.files ?? []))}
                    className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
                  />
                  {faultFiles.length > 0 && <p className="text-2xs text-muted-foreground">{faultFiles.length} photo(s) will be attached as fault evidence.</p>}
                </div>
              )}
              <p className="text-2xs text-muted-foreground">
                Assignment is done by Operations after the ticket is raised.
              </p>
              </div>
              <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
                <button type="button" onClick={closeModal} className="inline-flex h-10 items-center rounded-lg border border-border bg-transparent px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">Cancel</button>
                <button type="submit" disabled={saving} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-white transition-all disabled:opacity-50">
                  {saving ? "Saving..." : modalMode === "create" ? "Create Ticket" : "Save Changes"}
                </button>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
}
