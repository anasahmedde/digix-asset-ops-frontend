"use client";

import { Pin, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import api from "@/lib/api";
import { getApiError } from "@/lib/api-error";
import { useUser } from "@/lib/user-context";

/**
 * The dashboard's noticeboard.
 *
 * Two boards, one panel. Only me is private — nobody else ever sees it. Team
 * is shared and every note is signed. Typing @ offers the people you can tag;
 * tagging somebody on a team note lands in their notifications.
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

/** "3m", "2h", "5 Feb" — a note's age, as short as it can honestly be. */
function ago(iso: string) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Colour the @names so a note reads as addressed, not just written. */
function withTags(body: string, names: string[]) {
  if (names.length === 0) return body;
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
  const parts = body.split(new RegExp(`(@(?:${escaped.join("|")}))`, "g"));
  return parts.map((part, i) =>
    part.startsWith("@") && names.some((n) => part === `@${n}`) ? (
      <span key={i} className="rounded bg-primary/10 px-1 font-medium text-primary">{part}</span>
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

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Pin className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Notes</h3>
      </div>

      <div className="flex gap-1 px-4 pt-3">
        {BOARDS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setBoard(b.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              board === b.key ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      <p className="px-4 pt-2 text-2xs text-muted-foreground">
        {board === "self" ? "Private to you." : "Everyone sees these."}
      </p>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto px-4">
        {notes.length === 0 && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {board === "self" ? "No notes yet." : "Nothing on the board."}
          </p>
        )}
        {notes.map((n) => (
          <div key={n.id} className="group rounded-lg border border-border bg-secondary/30 p-3">
            <div className="mb-1 flex items-center gap-2">
              {board === "team" && (
                <span className="text-2xs font-semibold text-foreground">{n.author_name}</span>
              )}
              <span className="text-2xs text-muted-foreground">{ago(n.created_at)}</span>
              {n.mine && (
                <button
                  type="button"
                  onClick={() => remove(n.id)}
                  aria-label="Delete note"
                  className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="whitespace-pre-wrap break-words text-xs text-foreground">
              {withTags(n.body, n.mentioned_names)}
            </p>
          </div>
        ))}
      </div>

      <div className="relative border-t border-border p-3">
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-lg border border-border bg-card shadow-lg">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => tag(p)}
                className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-secondary"
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
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); post(); }
            }}
            placeholder={board === "team" ? "Note for the team — @ to tag" : "Note to self"}
            className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={post}
            disabled={saving || !draft.trim()}
            aria-label="Post note"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-all disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
