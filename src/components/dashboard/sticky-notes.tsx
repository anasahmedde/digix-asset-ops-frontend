"use client";

import { Check, MessageSquare, Pin, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { useUser } from "@/lib/user-context";

/**
 * The dashboard's notes, as a checklist on an ink card.
 *
 * Two boards, one panel. Only me is private - nobody else ever sees it. Team
 * is shared and every note is signed. Typing @ offers the people you can tag;
 * tagging somebody on a team note lands in their notifications. A note is
 * ticked off when it is dealt with; the counter at the top says how many are.
 */
interface Note {
  id: string;
  scope: "self" | "team";
  body: string;
  author: string;
  author_name: string;
  mine: boolean;
  mentions: string[];
  mentioned_names: string[];
  done: boolean;
  done_at: string | null;
  /** Answers on a team note, oldest first. */
  replies: { id: string; body: string; created_at: string; author_name: string; mine: boolean }[];
  created_at: string;
}

interface Person {
  id: string;
  name: string;
}

const BOARDS = [
  { key: "self" as const, label: "Only me" },
  { key: "team" as const, label: "Team" },
];

/** "Sep 13, 08:30" - when the note was written. */
function stamp(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
}

/** Colour the @names so a note reads as addressed, not just written. */
function withTags(body: string, names: string[]) {
  if (names.length === 0) return body;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const parts = body.split(new RegExp(`(@(?:${escaped.join("|")}))`, "g"));
  return parts.map((part, i) =>
    part.startsWith("@") && names.some((n) => part === `@${n}`) ? (
      <span key={i} className="rounded bg-white/15 px-1 font-semibold text-[#dff3eb]">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function StickyNotes() {
  const { user } = useUser();
  const [board, setBoard] = useState<"self" | "team">("self");
  const [notes, setNotes] = useState<Note[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState("");
  const [tagged, setTagged] = useState<Person[]>([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  // The note opened to read in full; the list shows two lines of each.
  const [opened, setOpened] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replying, setReplying] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(() => {
    api.get("/notifications/sticky-notes/", { params: { scope: board, page_size: 100 } })
      .then((r) => setNotes(r.data.results ?? r.data))
      .catch(() => {});
  }, [board]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get("/accounts/users/", { params: { is_active: true, page_size: 200 } })
      .then((r) =>
        setPeople(
          (r.data.results ?? r.data).map((u: { id: string; first_name: string; last_name: string; username: string }) => ({
            id: u.id,
            name: `${u.first_name} ${u.last_name}`.trim() || u.username,
          })),
        ),
      )
      .catch(() => {});
  }, []);

  // The word being typed after an @, if that is what is being typed.
  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return people
      .filter((p) => p.id !== user?.id && p.name.toLowerCase().includes(q))
      .filter((p) => !tagged.some((t) => t.id === p.id))
      .slice(0, 6);
  }, [query, people, tagged, user]);

  function onDraft(value: string) {
    setDraft(value);
    const upto = value.slice(0, boxRef.current?.selectionStart ?? value.length);
    const at = upto.lastIndexOf("@");
    setQuery(at !== -1 && !/\s/.test(upto.slice(at + 1)) ? upto.slice(at + 1) : null);
  }

  function tag(person: Person) {
    const at = draft.lastIndexOf("@");
    setDraft(`${at === -1 ? draft : draft.slice(0, at)}@${person.name} `);
    setTagged((prev) => [...prev, person]);
    setQuery(null);
    boxRef.current?.focus();
  }

  async function post() {
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    try {
      // Only a name still in the text is actually tagged.
      const mentions = tagged.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
      await api.post("/notifications/sticky-notes/", { scope: board, body, mentions });
      setDraft("");
      setTagged([]);
      load();
    } catch (err) {
      toast.error(getApiError(err, "Could not post the note"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.delete(`/notifications/sticky-notes/${id}/`);
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      toast.error(getApiError(err, "Could not remove the note"));
    }
  }

  /** Answer a team note; the author and whoever it tags are told. */
  async function reply(n: Note, body: string) {
    const text = body.trim();
    if (!text) return;
    setReplying(true);
    try {
      const { data } = await api.post(`/notifications/sticky-notes/${n.id}/reply/`, { body: text });
      setNotes((prev) => prev.map((x) => (x.id === n.id ? data : x)));
      setReplyDraft("");
    } catch (err) {
      toast.error(getApiError(err, "Could not send the reply"));
    } finally {
      setReplying(false);
    }
  }

  // Ticked off, or back on the list. Shown at once; the server is told.
  async function toggle(n: Note) {
    const done = !n.done;
    setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x)));
    try {
      await api.patch(`/notifications/sticky-notes/${n.id}/`, { done });
    } catch (err) {
      setNotes((prev) => prev.map((x) => (x.id === n.id ? { ...x, done: n.done, done_at: n.done_at } : x)));
      toast.error(getApiError(err, "Could not update the note"));
    }
  }

  // Open ones first, newest first; the ticked ones sink below them.
  const ordered = [...notes].sort((a, b) => Number(a.done) - Number(b.done) || b.created_at.localeCompare(a.created_at));
  const doneCount = notes.filter((n) => n.done).length;

  return (
    <div className="flex min-h-[16rem] flex-1 flex-col rounded-2xl bg-[#163144] text-white shadow-float">
      <div className="flex items-start justify-between px-5 pt-5">
        <div>
          <h3 className="text-base font-semibold text-white">Notes</h3>
          <div className="mt-2 flex gap-1">
            {BOARDS.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setBoard(b.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  board === b.key ? "bg-[#dff3eb] text-[#163144]" : "text-white/60 hover:bg-white/10 hover:text-white",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>
        {/* How much of the list is dealt with. */}
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-white" aria-label={`${doneCount} of ${notes.length} done`}>
          {doneCount}<span className="text-white/40">/</span>{notes.length}
        </p>
      </div>

      <ul className="mt-3 max-h-[24rem] min-h-[4rem] flex-1 space-y-1 overflow-y-auto px-3 pb-2 [scrollbar-width:thin] desk:max-h-none">
        {notes.length === 0 && (
          <li className="py-6 text-center text-xs text-white/50">
            {board === "self" ? "Nothing on your list." : "Nothing on the board."}
          </li>
        )}
        {ordered.map((n) => (
          <li key={n.id} className="group rounded-xl px-2 py-2 transition-colors hover:bg-white/5">
            <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#163144]">
              {n.scope === "team" ? <MessageSquare className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
            </span>
            <button
              type="button"
              onClick={() => { setOpened(opened === n.id ? null : n.id); setReplyDraft(""); }}
              aria-expanded={opened === n.id}
              title={opened === n.id ? "Show less" : "Show the whole note"}
              className="min-w-0 flex-1 text-left"
            >
              <span className={cn(
                "block text-sm font-medium [overflow-wrap:anywhere]",
                opened === n.id ? "whitespace-pre-line" : "line-clamp-2",
                n.done ? "text-white/40 line-through" : "text-white",
              )}>
                {withTags(n.body, n.mentioned_names)}
              </span>
              <span className="block text-2xs text-white/45">
                {board === "team" && n.author_name ? `${n.author_name} · ` : ""}{stamp(n.created_at)}
                {(n.replies ?? []).length > 0 && ` · ${n.replies.length} ${n.replies.length === 1 ? "reply" : "replies"}`}
              </span>
            </button>
            {n.mine && (
              <button
                type="button"
                onClick={() => remove(n.id)}
                aria-label="Delete note"
                className="hidden shrink-0 text-white/40 hover:text-red-300 group-hover:block"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => toggle(n)}
              aria-label={n.done ? "Put it back on the list" : "Tick it off"}
              aria-pressed={n.done}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
                n.done ? "bg-[#f5c518] text-[#163144]" : "bg-white/10 text-transparent hover:bg-white/20 hover:text-white/60",
              )}
            >
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            </button>
            </div>
            {/* The thread: answers, and a way to answer - a tagged person says
                it is done instead of only ticking the note off. */}
            {opened === n.id && n.scope === "team" && (
              <div className="ml-12 mt-2 space-y-1.5">
                {(n.replies ?? []).map((r) => (
                  <div key={r.id} className="rounded-lg bg-white/5 px-2.5 py-1.5">
                    <p className="whitespace-pre-line text-xs text-white [overflow-wrap:anywhere]">{r.body}</p>
                    <p className="text-2xs text-white/45">{r.author_name} · {stamp(r.created_at)}</p>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <input
                    id={`reply_${n.id}`}
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); reply(n, replyDraft); } }}
                    placeholder="Reply…"
                    className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs text-white placeholder:text-white/40 focus:border-[#dff3eb]/50 focus:outline-none"
                  />
                  <button type="button" onClick={() => reply(n, replyDraft)} disabled={replying || !replyDraft.trim()}
                    aria-label="Send reply"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#dff3eb] text-[#163144] disabled:opacity-40">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
                {!n.done && !n.mine && (
                  <button type="button" disabled={replying}
                    onClick={async () => { await reply(n, replyDraft.trim() || "Done"); toggle({ ...n, done: false }); }}
                    className="inline-flex items-center gap-1 rounded-full bg-[#f5c518] px-2.5 py-1 text-2xs font-semibold text-[#163144] disabled:opacity-50">
                    <Check className="h-3 w-3" strokeWidth={3} /> Done - tell {n.author_name}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Pinned to the bottom, the way every message box is. */}
      <div className="relative mt-auto border-t border-white/10 p-3">
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 z-10 mb-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            {suggestions.map((p, i) => (
              <button
                key={p.id}
                type="button"
                // Keep the typing box focused, so the click lands on the name.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => tag(p)}
                className={cn("block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-secondary", i === 0 && "bg-secondary/60")}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={boxRef}
            id="sticky_note_draft"
            rows={2}
            value={draft}
            onChange={(e) => onDraft(e.target.value)}
            onKeyDown={(e) => {
              // With names offered, Enter or Tab tags the first one: Enter
              // posted the note there and then, with nobody tagged.
              if ((e.key === "Enter" || e.key === "Tab") && suggestions.length > 0) {
                e.preventDefault();
                tag(suggestions[0]);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); post(); }
            }}
            placeholder={board === "team" ? "Note for the team — @ to tag" : "Note to self"}
            className="flex-1 resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white placeholder:text-white/40 focus:border-[#dff3eb]/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={post}
            disabled={saving || !draft.trim()}
            aria-label="Post note"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#dff3eb] text-[#163144] transition-all disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
