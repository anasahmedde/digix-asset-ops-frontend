"use client";

import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
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
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { FilterBar } from "@/components/ui/filter-bar";
import { ProgressStepper } from "@/components/ui/progress-stepper";
import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";
import { formatDateTime, formatDate } from "@/lib/utils";
import type { TicketAttachment, TicketComment, TicketStatus } from "@/types";

/* ─── Types ────────────────────────────────────────────────────────── */

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
  title: string;
  description: string;
  priority: string;
  status: TicketStatus;
  category: string;
  device: string | null;
  device_code: string | null;
  site: string | null;
  site_name: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  reported_by: string | null;
  reported_by_name: string | null;
  due_date: string | null;
  resolved_at: string | null;
  resolution_notes: string;
  completion_notes: string;
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
  critical: "bg-red-500/10 text-red-400 ring-red-500/20",
  high: "bg-orange-500/10 text-orange-400 ring-orange-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 ring-yellow-500/20",
  low: "bg-gray-500/10 text-gray-400 ring-gray-500/20",
};

const statusBadge: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-400 ring-blue-500/20",
  in_progress: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  on_hold: "bg-gray-500/10 text-gray-400 ring-gray-500/20",
  blocked: "bg-red-500/10 text-red-400 ring-red-500/20",
  alignment_pending: "bg-cyan-500/10 text-cyan-400 ring-cyan-500/20",
  pending_ops_approval: "bg-orange-500/10 text-orange-400 ring-orange-500/20",
  pending_client_approval: "bg-violet-500/10 text-violet-400 ring-violet-500/20",
  pending_review: "bg-purple-500/10 text-purple-400 ring-purple-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  rejected: "bg-rose-500/10 text-rose-400 ring-rose-500/20",
  closed: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
};

const statusIcon: Record<string, React.ReactNode> = {
  open: <Clock className="h-3.5 w-3.5" />,
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
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ─── Status Stepper ───────────────────────────────────────────────── */

function getStepperSteps(status: TicketStatus) {
  const MAIN_FLOW: TicketStatus[] = [
    "open",
    "in_progress",
    "pending_review",
    "approved",
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
  return MAIN_FLOW.map((s, i) => ({
    key: s,
    label: formatLabel(s),
    status:
      i < idx ? ("completed" as const) : i === idx ? ("in_progress" as const) : ("pending" as const),
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
            <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
              {formatLabel(comment.old_status)} → {formatLabel(comment.new_status)}
            </span>
          )}
          {comment.comment_type === "completion" && (
            <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-500">Submitted for Review</span>
          )}
          {comment.comment_type === "approval" && (
            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">Approved</span>
          )}
          {comment.comment_type === "rejection" && (
            <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-500">Rejected</span>
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
        <p className="mt-1.5 text-[11px] text-muted-foreground/60">{formatDateTime(comment.created_at)}</p>
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
  const [ticket, setTicket] = useState(initialTicket);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [transitionNotes, setTransitionNotes] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");
  const [partsUsed, setPartsUsed] = useState("");
  const [assignUsers, setAssignUsers] = useState<{ id: string; label: string }[]>([]);
  const [assignVendors, setAssignVendors] = useState<{ id: string; name: string }[]>([]);
  const [assignUser, setAssignUser] = useState("");
  const [assignVendor, setAssignVendor] = useState("");
  const [visitFiles, setVisitFiles] = useState<File[]>([]);
  const [visitCaption, setVisitCaption] = useState("");
  const [visitUploading, setVisitUploading] = useState(false);
  const [completionImages, setCompletionImages] = useState<File[]>([]);
  const [completionPreviews, setCompletionPreviews] = useState<string[]>([]);
  const [reviewComments, setReviewComments] = useState("");
  const [newComment, setNewComment] = useState("");
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const [commentLoading, setCommentLoading] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAssignee = ticket.assigned_to === currentUserId;
  const isReporter = ticket.reported_by === currentUserId;
  const isAdmin = currentUserRole === "super_admin" || currentUserRole === "ops_manager";
  const isMarketing = currentUserRole === "marketing";
  const canReview = isReporter || isAdmin;
  // Managers can drive the work stages too (matches backend rules).
  const canAct = isAssignee || isAdmin;
  const isClosed = ["approved", "closed"].includes(ticket.status);
  const isOverdue = ticket.due_date && new Date(ticket.due_date) < new Date() && !isClosed;

  const completionAttachments = ticket.attachments?.filter((a) => a.attachment_type === "completion") || [];
  const generalAttachments = ticket.attachments?.filter((a) => a.attachment_type === "general" || a.attachment_type === "fault") || [];

  async function refreshTicket() {
    try {
      const { data } = await api.get(`/tickets/${ticket.id}/`);
      setTicket(data);
    } catch { /* keep current */ }
  }

  async function openAssignPanel() {
    setActiveAction("assign");
    try {
      const [u, v] = await Promise.all([
        api.get("/accounts/users/", { params: { is_active: true, page_size: 200 } }),
        api.get("/suppliers/", { params: { page_size: 200 } }),
      ]);
      setAssignUsers((u.data.results ?? u.data).map((x: { id: string; first_name: string; last_name: string; username: string }) => ({
        id: x.id, label: `${x.first_name} ${x.last_name}`.trim() || x.username,
      })));
      setAssignVendors(v.data.results ?? v.data);
      setAssignUser(ticket.assigned_to ?? "");
      setAssignVendor(ticket.assigned_vendor ?? "");
    } catch { toast.error("Could not load assignees"); }
  }

  async function handleAssign() {
    setActionLoading(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/assign/`, {
        assigned_to: assignUser || null,
        assigned_vendor: assignVendor || null,
      });
      setTicket(data);
      setActiveAction(null);
      onRefresh();
      toast.success("Ticket assigned");
    } catch (err: unknown) { toast.error(getApiError(err, "Assignment failed")); }
    finally { setActionLoading(false); }
  }

  async function handleVisitUpload() {
    if (visitFiles.length === 0) return;
    setVisitUploading(true);
    try {
      for (const file of visitFiles) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("attachment_type", "general");
        fd.append("caption", visitCaption || "Site visit photo");
        await api.post(`/tickets/${ticket.id}/attachments/`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      setVisitFiles([]);
      setVisitCaption("");
      await refreshTicket();
      toast.success("Photos attached");
    } catch (err: unknown) { toast.error(getApiError(err, "Upload failed")); }
    finally { setVisitUploading(false); }
  }

  async function handleTransition(targetStatus: string, notes: string = "") {
    setActionLoading(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/transition/`, { status: targetStatus, notes });
      setTicket(data);
      setActiveAction(null);
      setTransitionNotes("");
      onRefresh();
      toast.success(`Status changed to ${formatLabel(targetStatus)}`);
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to update status"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitCompletion() {
    if (!completionNotes.trim()) { toast.error("Please describe what was done"); return; }
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append("completion_notes", completionNotes);
      formData.append("parts_used", partsUsed);
      completionImages.forEach((img) => formData.append("images", img));
      const { data } = await api.post(`/tickets/${ticket.id}/submit-completion/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setTicket(data);
      setActiveAction(null);
      setCompletionNotes("");
      setCompletionImages([]);
      setCompletionPreviews([]);
      onRefresh();
      toast.success("Submitted for review!");
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to submit"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReview(action: "approve" | "reject") {
    if (action === "reject" && !reviewComments.trim()) { toast.error("Please provide feedback for rejection"); return; }
    setActionLoading(true);
    try {
      const { data } = await api.post(`/tickets/${ticket.id}/review/`, { action, comments: reviewComments });
      setTicket(data);
      setActiveAction(null);
      setReviewComments("");
      onRefresh();
      toast.success(action === "approve" ? "Ticket approved!" : "Ticket rejected");
    } catch (err: unknown) {
      toast.error(getApiError(err, "Failed to review"));
    } finally {
      setActionLoading(false);
    }
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

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setCompletionImages((prev) => [...prev, ...files]);
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (ev) => setCompletionPreviews((prev) => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(f);
    });
  }

  function removeImage(idx: number) {
    setCompletionImages((prev) => prev.filter((_, i) => i !== idx));
    setCompletionPreviews((prev) => prev.filter((_, i) => i !== idx));
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
          <div className="hidden items-center gap-2 sm:flex">
            <div className="h-4 w-px bg-border" />
            <span className="text-xs font-semibold text-foreground">{ticket.ticket_number || `#${ticket.id.slice(0, 8)}`}</span>
            {ticket.device_code && ticket.occurrence > 0 && (
              <Link href={`/assets?device=${ticket.device}`} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/10" title={`Ticket #${ticket.occurrence} raised against ${ticket.device_code} — view asset`}>
                #{ticket.occurrence} for {ticket.device_code}
              </Link>
            )}
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusBadge[ticket.status] ?? statusBadge.open}`}>
              {statusIcon[ticket.status]} {formatLabel(ticket.status)}
            </span>
            {ticket.issue_type_name && (
              <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-500 ring-1 ring-rose-500/20">{ticket.issue_type_name}</span>
            )}
            {(ticket.escalated || ticket.is_response_overdue) && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-500 ring-1 ring-red-500/20">
                <AlertTriangle className="h-3 w-3" /> {ticket.escalated ? "Escalated" : "Response Overdue"}
              </span>
            )}
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${priorityBadge[ticket.priority]}`}>
              {formatLabel(ticket.priority)}
            </span>
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
                            {att.caption && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5"><p className="text-[10px] text-white truncate">{att.caption}</p></div>}
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
                      <p className="text-[11px] text-muted-foreground/60">{formatDateTime(ticket.created_at)}</p>
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
                </div>
              </div>

              {/* ── ACTION CARD ──────────────────────────────────── */}
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Actions</h3>

                {/* Inline transition forms */}
                {activeAction === "blocked" && (
                  <div className="mb-4 space-y-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                    <p className="text-xs font-semibold text-red-500">Mark as Blocked</p>
                    <textarea value={transitionNotes} onChange={(e) => setTransitionNotes(e.target.value)} placeholder="What is blocking this? (required)" rows={2} className={`${inputClass} h-auto py-2 text-xs`} />
                    <div className="flex gap-2">
                      <button onClick={() => setActiveAction(null)} className="flex-1 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-secondary">Cancel</button>
                      <button onClick={() => handleTransition("blocked", transitionNotes)} disabled={actionLoading || !transitionNotes.trim()} className="flex-1 h-8 rounded-lg bg-red-500 text-xs font-medium text-white disabled:opacity-50">{actionLoading ? "..." : "Confirm"}</button>
                    </div>
                  </div>
                )}
                {activeAction === "on_hold" && (
                  <div className="mb-4 space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-xs font-semibold text-amber-500">Put On Hold</p>
                    <textarea value={transitionNotes} onChange={(e) => setTransitionNotes(e.target.value)} placeholder="Reason for hold (required)" rows={2} className={`${inputClass} h-auto py-2 text-xs`} />
                    <div className="flex gap-2">
                      <button onClick={() => setActiveAction(null)} className="flex-1 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-secondary">Cancel</button>
                      <button onClick={() => handleTransition("on_hold", transitionNotes)} disabled={actionLoading || !transitionNotes.trim()} className="flex-1 h-8 rounded-lg bg-amber-500 text-xs font-medium text-white disabled:opacity-50">{actionLoading ? "..." : "Confirm"}</button>
                    </div>
                  </div>
                )}
                {activeAction === "completion" && (
                  <div className="mb-4 space-y-3 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                    <p className="text-xs font-semibold text-purple-500">Submit for Review</p>
                    <p className="text-[11px] text-muted-foreground">Describe work done &amp; upload evidence. This goes to your supervisor.</p>
                    <textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} placeholder="What was completed? (required)" rows={3} className={`${inputClass} h-auto py-2 text-xs`} />
                    <textarea value={partsUsed} onChange={(e) => setPartsUsed(e.target.value)} placeholder="Parts used (e.g. 1x P6 module, 2x ribbon cables)" rows={2} className={`${inputClass} h-auto py-2 text-xs`} />
                    <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-secondary/20 px-3 py-2.5 text-xs text-muted-foreground hover:border-primary/40 hover:bg-primary/5 transition-colors">
                      <Camera className="h-3.5 w-3.5" /> Upload Photos
                    </button>
                    {completionPreviews.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {completionPreviews.map((src, i) => (
                          <div key={i} className="group relative aspect-square">
                            <img src={src} alt={`Preview ${i + 1}`} className="h-full w-full rounded-lg object-cover" />
                            <button onClick={() => removeImage(i)} className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 transition-opacity group-hover:opacity-100"><X className="h-3 w-3" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => { setActiveAction(null); setCompletionNotes(""); setCompletionImages([]); setCompletionPreviews([]); }} className="flex-1 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-secondary">Cancel</button>
                      <button onClick={handleSubmitCompletion} disabled={actionLoading || !completionNotes.trim()} className="flex-1 h-8 rounded-lg bg-purple-500 text-xs font-medium text-white disabled:opacity-50">{actionLoading ? "Submitting..." : "Submit"}</button>
                    </div>
                  </div>
                )}
                {activeAction === "review" && (
                  <div className="mb-4 space-y-3 rounded-lg border border-border bg-secondary/10 p-3">
                    <p className="text-xs font-semibold text-foreground">Review Submission</p>
                    <textarea value={reviewComments} onChange={(e) => setReviewComments(e.target.value)} placeholder="Comments (required for rejection)..." rows={2} className={`${inputClass} h-auto py-2 text-xs`} />
                    <div className="flex gap-2">
                      <button onClick={() => setActiveAction(null)} className="h-8 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-secondary">Cancel</button>
                      <button onClick={() => handleReview("reject")} disabled={actionLoading || !reviewComments.trim()} className="flex-1 h-8 rounded-lg bg-red-500 text-xs font-medium text-white disabled:opacity-50 flex items-center justify-center gap-1"><XCircle className="h-3 w-3" /> Reject</button>
                      <button onClick={() => handleReview("approve")} disabled={actionLoading} className="flex-1 h-8 rounded-lg bg-emerald-500 text-xs font-medium text-white disabled:opacity-50 flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3" /> Approve</button>
                    </div>
                  </div>
                )}

                {activeAction === "ops_approval" && (
                  <div className="mb-4 space-y-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                    <p className="text-xs font-semibold text-orange-500">Request Operations Approval</p>
                    <textarea value={transitionNotes} onChange={(e) => setTransitionNotes(e.target.value)} placeholder="Issue found, parts/cost needed (required)" rows={2} className={`${inputClass} h-auto py-2 text-xs`} />
                    <div className="flex gap-2">
                      <button onClick={() => setActiveAction(null)} className="flex-1 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-secondary">Cancel</button>
                      <button onClick={() => handleTransition("pending_ops_approval", transitionNotes)} disabled={actionLoading || !transitionNotes.trim()} className="flex-1 h-8 rounded-lg bg-orange-500 text-xs font-medium text-white disabled:opacity-50">{actionLoading ? "..." : "Request"}</button>
                    </div>
                  </div>
                )}
                {activeAction === "decline" && (
                  <div className="mb-4 space-y-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <p className="text-xs font-semibold text-amber-500">Decline — Put On Hold</p>
                    <textarea value={transitionNotes} onChange={(e) => setTransitionNotes(e.target.value)} placeholder="Reason (required)" rows={2} className={`${inputClass} h-auto py-2 text-xs`} />
                    <div className="flex gap-2">
                      <button onClick={() => setActiveAction(null)} className="flex-1 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-secondary">Cancel</button>
                      <button onClick={() => handleTransition("on_hold", transitionNotes)} disabled={actionLoading || !transitionNotes.trim()} className="flex-1 h-8 rounded-lg bg-amber-500 text-xs font-medium text-white disabled:opacity-50">{actionLoading ? "..." : "Confirm"}</button>
                    </div>
                  </div>
                )}
                {activeAction === "assign" && (
                  <div className="mb-4 space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <p className="text-xs font-semibold text-primary">Assign Ticket</p>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Employee</label>
                      <select value={assignUser} onChange={(e) => setAssignUser(e.target.value)} className={`${inputClass} text-xs`}>
                        <option value="">Unassigned</option>
                        {assignUsers.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[11px] text-muted-foreground">Vendor (for in-warranty assets)</label>
                      <select value={assignVendor} onChange={(e) => setAssignVendor(e.target.value)} className={`${inputClass} text-xs`}>
                        <option value="">No vendor</option>
                        {assignVendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setActiveAction(null)} className="flex-1 h-8 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-secondary">Cancel</button>
                      <button onClick={handleAssign} disabled={actionLoading} className="flex-1 h-8 rounded-lg bg-primary text-xs font-medium text-white disabled:opacity-50">{actionLoading ? "..." : "Assign"}</button>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                {!activeAction && (
                  <div className="space-y-2">
                    {isAdmin && !isClosed && (
                      <button onClick={openAssignPanel} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/5 text-sm font-medium text-primary hover:bg-primary/10">
                        <User className="h-4 w-4" /> {ticket.assigned_to_name || ticket.assigned_vendor_name ? "Reassign" : "Assign"} Ticket
                      </button>
                    )}
                    {canAct && ticket.status === "open" && (
                      <button onClick={() => handleTransition("in_progress")} disabled={actionLoading} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-white disabled:opacity-50">
                        <Play className="h-4 w-4" /> {actionLoading ? "..." : "Start Working"}
                      </button>
                    )}
                    {canAct && ticket.status === "in_progress" && (
                      <>
                        <button onClick={() => setActiveAction("completion")} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-purple-500 text-sm font-medium text-white">
                          <CheckCircle2 className="h-4 w-4" /> Submit for Review
                        </button>
                        <button onClick={() => setActiveAction("ops_approval")} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-orange-500/30 bg-orange-500/10 text-xs font-medium text-orange-600">
                          <ShieldCheck className="h-3.5 w-3.5" /> Request Ops Approval
                        </button>
                        <div className="grid grid-cols-3 gap-2">
                          <button onClick={() => handleTransition("alignment_pending")} disabled={actionLoading} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-xs font-medium text-cyan-600 disabled:opacity-50">
                            Alignment
                          </button>
                          <button onClick={() => setActiveAction("on_hold")} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-600">
                            <Pause className="h-3.5 w-3.5" /> Hold
                          </button>
                          <button onClick={() => setActiveAction("blocked")} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> Blocked
                          </button>
                        </div>
                      </>
                    )}
                    {canAct && (ticket.status === "on_hold" || ticket.status === "blocked" || ticket.status === "alignment_pending") && (
                      <button onClick={() => handleTransition("in_progress")} disabled={actionLoading} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-white disabled:opacity-50">
                        <Play className="h-4 w-4" /> {actionLoading ? "..." : "Resume Work"}
                      </button>
                    )}
                    {(isAdmin || isMarketing) && ticket.status === "on_hold" && (
                      <button onClick={() => handleTransition("closed", "Closed from hold (client declined / no action).")} disabled={actionLoading} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-500/30 bg-slate-500/10 text-xs font-medium text-slate-500 disabled:opacity-50">
                        <Check className="h-3.5 w-3.5" /> Close Ticket
                      </button>
                    )}
                    {isAdmin && ticket.status === "pending_ops_approval" && (
                      <>
                        <button onClick={() => handleTransition("in_progress", "Rectification approved by Operations.")} disabled={actionLoading} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-medium text-white disabled:opacity-50">
                          <CheckCircle2 className="h-4 w-4" /> Approve Rectification
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => handleTransition("pending_client_approval", "Client expense approval required — over to Marketing.")} disabled={actionLoading} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-xs font-medium text-violet-600 disabled:opacity-50">
                            Needs Client Approval
                          </button>
                          <button onClick={() => setActiveAction("decline")} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-600">
                            Decline
                          </button>
                        </div>
                      </>
                    )}
                    {(isMarketing || isAdmin) && ticket.status === "pending_client_approval" && (
                      <>
                        <button onClick={() => handleTransition("in_progress", "Client approved the expense — proceed with rectification.")} disabled={actionLoading} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 text-sm font-medium text-white disabled:opacity-50">
                          <CheckCircle2 className="h-4 w-4" /> Client Approved
                        </button>
                        <button onClick={() => setActiveAction("decline")} className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs font-medium text-amber-600">
                          Client Declined
                        </button>
                      </>
                    )}
                    {canAct && ticket.status === "rejected" && (
                      <>
                        <button onClick={() => setActiveAction("completion")} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-purple-500 text-sm font-medium text-white">
                          <CheckCircle2 className="h-4 w-4" /> Resubmit for Review
                        </button>
                        <button onClick={() => handleTransition("in_progress")} disabled={actionLoading} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-secondary disabled:opacity-50">
                          <Play className="h-3.5 w-3.5" /> {actionLoading ? "..." : "Resume & Rework First"}
                        </button>
                      </>
                    )}
                    {canReview && ticket.status === "pending_review" && (
                      <button onClick={() => setActiveAction("review")} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-white">
                        <ShieldCheck className="h-4 w-4" /> Review Submission
                      </button>
                    )}
                    {(isAdmin || isMarketing) && ticket.status === "approved" && (
                      <button onClick={() => handleTransition("closed", "Reviewed and shared with client — closing.")} disabled={actionLoading} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-600 text-sm font-medium text-white disabled:opacity-50">
                        <Check className="h-4 w-4" /> {actionLoading ? "..." : "Close Ticket (Client Sign-off)"}
                      </button>
                    )}

                    {/* Site-visit photos (any stage before closure) */}
                    {!isClosed && (
                      <div className="mt-3 space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Attach Visit Photos</p>
                        <input
                          type="file" accept="image/*" multiple
                          onChange={(e) => setVisitFiles(Array.from(e.target.files ?? []))}
                          className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-primary/10 file:px-2 file:py-1 file:text-[11px] file:text-primary"
                        />
                        <input value={visitCaption} onChange={(e) => setVisitCaption(e.target.value)} placeholder="Describe the issue seen…" className={`${inputClass} h-8 text-xs`} />
                        <button onClick={handleVisitUpload} disabled={visitUploading || visitFiles.length === 0} className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary/90 text-xs font-medium text-white disabled:opacity-50">
                          <Camera className="h-3.5 w-3.5" /> {visitUploading ? "Uploading…" : `Attach${visitFiles.length ? ` (${visitFiles.length})` : ""}`}
                        </button>
                      </div>
                    )}

                    {/* Status messages */}
                    {isAssignee && !isAdmin && ticket.status === "pending_review" && (
                      <div className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 text-sm font-medium text-purple-500">
                        <Clock className="h-4 w-4" /> Awaiting Review
                      </div>
                    )}
                    {!isAssignee && !canReview && ticket.status === "open" && (
                      <div className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-secondary/30 text-sm font-medium text-muted-foreground">
                        <User className="h-4 w-4" /> Assigned to {ticket.assigned_to_name || "someone else"}
                      </div>
                    )}
                    {isClosed && (
                      <div className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-sm font-medium text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" /> Ticket {formatLabel(ticket.status)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setLightboxImg(null)}>
          <button className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={() => setLightboxImg(null)}>
            <X className="h-5 w-5" />
          </button>
          <img src={lightboxImg} alt="Full size" className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════ */

export default function TicketsPage() {
  const { user, canWrite } = useUser();
  const canEdit = canWrite("tickets");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selected, setSelected] = useState<TicketItem | null>(null);
  const [detailTicket, setDetailTicket] = useState<TicketItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({ status: "", priority: "", category: "" });
  const [search, setSearch] = useState("");
  const [deviceOptions, setDeviceOptions] = useState<{ id: string; label: string }[]>([]);
  const [issueTypes, setIssueTypes] = useState<{ id: string; name: string }[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<{
    asset_code: string; display_name?: string; model_name?: string; device_model_name?: string;
    installation_date?: string | null; purchase_date?: string | null; supplier_name?: string | null;
    site_name?: string | null; current_site?: string | null; warranty_status?: string | null;
  } | null>(null);
  const [faultFiles, setFaultFiles] = useState<File[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceListOpen, setDeviceListOpen] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState("");

  const fetchTickets = useCallback(async () => {
    try {
      const { data } = await api.get("/tickets/");
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
      openCreate(deviceParam ?? undefined);
      router.replace("/tickets", { scroll: false });
      return;
    }
    if (deviceParam) setDeviceFilter(deviceParam);
    const openId = searchParams.get("open");
    if (openId && tickets.length > 0) {
      const found = tickets.find((t) => t.id === openId);
      if (found) openDetail(found);
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
    if (!deviceId) { setDeviceInfo(null); return; }
    try {
      const { data } = await api.get(`/assets/devices/${deviceId}/`);
      setDeviceInfo(data);
    } catch { setDeviceInfo(null); }
  }

  function openCreate(presetDeviceId?: string) {
    setSelected(null); setDeviceInfo(null); setFaultFiles([]); setDeviceQuery(""); setDeviceListOpen(false);
    setSelectedDeviceId(presetDeviceId ?? "");
    if (presetDeviceId) onDeviceSelect(presetDeviceId);
    setModalMode("create"); loadFormOptions();
  }
  function openEdit(t: TicketItem) { setSelected(t); setDeviceInfo(null); setFaultFiles([]); setModalMode("edit"); loadFormOptions(); }
  function openDetail(t: TicketItem) {
    api.get(`/tickets/${t.id}/`).then(({ data }) => setDetailTicket(data)).catch(() => setDetailTicket(t));
    router.replace(`/tickets?open=${t.id}`, { scroll: false });
  }
  function closeDetail() { setDetailTicket(null); router.replace("/tickets", { scroll: false }); }
  function closeModal() { setModalMode(null); setSelected(null); }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      title: fd.get("title"), description: fd.get("description"), priority: fd.get("priority"),
      category: fd.get("category"), issue_type: fd.get("issue_type") || null,
      complaint_by: fd.get("complaint_by") || "",
      due_date: fd.get("due_date") || null,
    };
    if (modalMode === "create") {
      payload.device = fd.get("device") || null;
      payload.site = deviceInfo?.current_site || null;
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
        {canEdit && (
          <button onClick={() => openCreate()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white transition-all">
            <Plus className="h-4 w-4" /> Add Ticket
          </button>
        )}
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
      <FilterBar
        filters={[
          { key: "status", label: "Status", options: Object.keys(statusBadge).map((s) => ({ value: s, label: formatLabel(s) })) },
          { key: "priority", label: "Priority", options: Object.keys(priorityBadge).map((p) => ({ value: p, label: formatLabel(p) })) },
          { key: "category", label: "Category", options: ["installation", "repair", "replacement", "inspection", "relocation", "other"].map((c) => ({ value: c, label: formatLabel(c) })) },
        ]}
        values={filterValues}
        onChange={(k, v) => setFilterValues((prev) => ({ ...prev, [k]: v }))}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by title, site..."
      />

      {(() => {
        const filtered = tickets.filter((t) => {
          if (deviceFilter && t.device !== deviceFilter) return false;
          if (filterValues.status && t.status !== filterValues.status) return false;
          if (filterValues.priority && t.priority !== filterValues.priority) return false;
          if (filterValues.category && t.category !== filterValues.category) return false;
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
                  {filtered.map((t) => (
                    <tr key={t.id} onClick={() => openDetail(t)} className="border-b border-border cursor-pointer transition-colors hover:bg-secondary/30">
                      <td className={`${tdClass} whitespace-nowrap font-medium text-primary`}>{t.ticket_number || `#${t.id.slice(0, 8)}`}</td>
                      <td className={`${tdClass} font-medium text-foreground`}>
                        <div className="flex items-center gap-2">
                          {t.title}
                          {(t.attachment_count > 0 || t.comment_count > 0) && (
                            <span className="flex items-center gap-1.5 text-muted-foreground">
                              {t.attachment_count > 0 && <span className="flex items-center gap-0.5 text-[10px]"><ImageIcon className="h-3 w-3" />{t.attachment_count}</span>}
                              {t.comment_count > 0 && <span className="flex items-center gap-0.5 text-[10px]"><MessageSquare className="h-3 w-3" />{t.comment_count}</span>}
                            </span>
                          )}
                        </div>
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
                            <button onClick={() => handleDelete(t)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">-</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Create/Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-foreground">{modalMode === "create" ? "Create Ticket" : "Edit Ticket"}</h2>
              <button onClick={closeModal} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
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
                  <label htmlFor="device" className={labelClass}>Asset</label>
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
                          <p className="px-3 py-2 text-xs text-muted-foreground">No assets match "{deviceQuery}"</p>
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
                    </div>
                  )}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label htmlFor="issue_type" className={labelClass}>Issue Type</label>
                  <select id="issue_type" name="issue_type" defaultValue={selected?.issue_type ?? ""} className={inputClass}>
                    <option value="">Select issue…</option>
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
                  <label htmlFor="priority" className={labelClass}>Priority</label>
                  <select id="priority" name="priority" defaultValue={selected?.priority ?? "medium"} className={inputClass}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="category" className={labelClass}>Category</label>
                  <select id="category" name="category" defaultValue={selected?.category ?? "other"} className={inputClass}>
                    <option value="installation">Installation</option><option value="repair">Repair</option><option value="replacement">Replacement</option>
                    <option value="inspection">Inspection</option><option value="relocation">Relocation</option><option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="due_date" className={labelClass}>Due Date</label>
                  <input id="due_date" name="due_date" type="date" defaultValue={selected?.due_date ?? ""} className={inputClass} />
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
                  {faultFiles.length > 0 && <p className="text-[11px] text-muted-foreground">{faultFiles.length} photo(s) will be attached as fault evidence.</p>}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
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
          </div>
        </div>
      )}
    </div>
  );
}
