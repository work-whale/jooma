"use client";

// The message list + composer for one support thread.
//
// Shared deliberately: /help renders it in the right-hand pane and
// SupportLauncher renders it inside the popover. Support conversations are the
// one surface where two implementations would drift into two different sets of
// bugs, and the teacher would see both.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createClient } from "@/app/lib/auth/client";

export interface MyMessage {
  id: string;
  direction: string;
  body: string;
  author: string | null;
  created_at: string;
}

/** Time of day for today's messages, date + time for older ones. */
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return d.toLocaleString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    ...(sameDay ? {} : { day: "numeric", month: "short" }),
  });
}

export default function Conversation({
  threadId,
  status,
  onSent,
  compact = false,
}: {
  threadId: string;
  status: string;
  /** Refresh the parent's thread list after a send. */
  onSent?: () => void;
  /** Tighter spacing for the launcher popover. */
  compact?: boolean;
}) {
  const [messages, setMessages] = useState<MyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const replyId = useId();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  /** Returns the newest message time actually rendered, so the read stamp can
   *  never run ahead of what the teacher saw. */
  const load = useCallback(async (): Promise<string | null> => {
    const supabase = createClient();
    const { data, error: e } = await supabase.rpc("my_thread_messages", {
      tid: threadId,
    });
    if (e) {
      setError(e.message);
      setMessages([]);
      setLoading(false);
      return null;
    }
    const rows = (data ?? []) as MyMessage[];
    setMessages(rows);
    setError(null);
    setLoading(false);
    return rows.length > 0 ? rows[rows.length - 1].created_at : null;
  }, [threadId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const seenThrough = await load();
      if (cancelled) return;
      // Opening a thread is what marks it read — the bell and the sidebar dot
      // both key off this. seen_through is the newest message displayed, so a
      // reply arriving mid-read stays unread rather than being swallowed.
      const supabase = createClient();
      await supabase.rpc("my_mark_read", {
        tid: threadId,
        seen_through: seenThrough,
      });
      onSent?.();
    })();
    return () => {
      cancelled = true;
    };
    // onSent is intentionally excluded: it changes identity on every parent
    // render and would re-run the whole effect (and re-mark read) each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("my_reply", {
      tid: threadId,
      p_body: body,
    });
    setSending(false);
    if (e) {
      setError(e.message);
      return;
    }
    setDraft("");
    await load();
    onSent?.();
  };

  return (
    <div className="flex flex-col min-h-0 grow">
      <div
        className={`grow overflow-y-auto flex flex-col gap-3 ${compact ? "px-4 py-3" : "px-6 py-5"}`}
      >
        {loading ? (
          <p className="text-sm text-muted text-center py-6">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const mine = m.direction === "inbound";
            return (
              <div
                key={m.id}
                // Half width on the full page so a long message can't run the
                // width of the pane. The launcher popover is only ~380px wide,
                // where half would leave ~170px and break every other word, so
                // it keeps a looser cap.
                className={`flex flex-col gap-1 min-w-0 ${compact ? "max-w-[85%]" : "max-w-[50%]"}`}
                style={{ alignSelf: mine ? "flex-end" : "flex-start" }}
              >
                <div
                  // wrap-break-word handles what whitespace-pre-wrap cannot: a
                  // pasted URL or any long unbroken string has no whitespace to
                  // wrap at, so without it the bubble blows past its max-width.
                  className="px-3.5 py-2.5 rounded-2xl text-sm whitespace-pre-wrap wrap-break-word border"
                  style={
                    mine
                      ? { backgroundColor: "var(--j-purple)", borderColor: "var(--j-purple)", color: "#fff" }
                      : { backgroundColor: "#fff", borderColor: "var(--j-line)", color: "var(--j-ink)" }
                  }
                >
                  {m.body}
                </div>
                <div
                  className="text-[11px] text-muted"
                  style={{ textAlign: mine ? "right" : "left" }}
                >
                  {m.author ?? "Jooma"} · {fmtWhen(m.created_at)}
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div
        className={`border-t shrink-0 ${compact ? "px-4 py-3" : "px-6 py-4"}`}
        style={{ borderColor: "var(--j-line)" }}
      >
        {status === "closed" && (
          <p className="text-xs text-muted mb-2">
            This conversation was resolved. Replying will reopen it.
          </p>
        )}
        {error && (
          <p id={`${replyId}-error`} role="alert" className="text-xs mb-2" style={{ color: "#B3261E" }}>
            {error}
          </p>
        )}
        <label htmlFor={replyId} className="block mb-1.5 text-sm font-semibold" style={{ color: "var(--j-ink)" }}>
          Your reply
        </label>
        <textarea
          id={replyId}
          enterKeyHint="send"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${replyId}-error` : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter for a newline — the convention in every
            // chat the teacher already uses.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={compact ? 2 : 3}
          maxLength={5000}
          placeholder="Type your message…"
          className="w-full px-3.5 py-2.5 border rounded-2xl bg-white text-sm resize-none focus:outline-none focus:border-gray-400 transition-colors"
          style={{ borderColor: "var(--j-line)" }}
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-muted">
            We usually reply within a working day.
          </span>
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !draft.trim()}
            className="px-4 py-2 pointer-coarse:min-h-12 rounded-2xl text-sm font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            style={{ backgroundColor: "var(--j-purple)" }}
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
