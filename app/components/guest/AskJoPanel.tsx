"use client";

import { useRef, useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import MarkdownResult from "@/app/components/MarkdownResult";
import {
  decodeBase64Utf8,
  validateClarify,
  validatePrefill,
  type ToolClarify,
  type ToolPrefill,
} from "@/app/lib/toolPrefill";
import type { GuestToolSlug } from "@/app/lib/guest-tools";
import styles from "./guest.module.css";

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  clarify?: ToolClarify | null;
  /** Shown, never sent back: a refusal fed back as context makes the next
   *  one more likely. Same rule as the signed in assistant. */
  refusal?: boolean;
}

const MAX_ASKS = 2;

/**
 * Jo, beside the form, for a guest on /create.
 *
 * The same turn as the signed in assistant (the same headers come back), kept
 * to the one tool on the page. When Jo fills fields they go to `onPrefill`,
 * which types them into the form; a clarifying question shows its answers as
 * chips. Nothing is saved: a guest has no chat history to keep it in.
 */
export default function AskJoPanel({
  tool,
  intro,
  onPrefill,
}: {
  tool: GuestToolSlug;
  intro: string;
  onPrefill: (prefill: ToolPrefill) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const asks = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollDown = () =>
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setDraft("");
    const mine: Turn = { id: crypto.randomUUID(), role: "user", content };
    const history = [...turns.filter((t) => !t.refusal), mine];
    setTurns([...turns, mine]);
    setBusy(true);
    scrollDown();

    const replyId = crypto.randomUUID();
    try {
      const res = await fetch("/api/try/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestTool: tool,
          messages: history.map((t) => ({ role: t.role, content: t.content })),
          askCount: asks.current,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Jo is unavailable right now.");
      }

      const refusal = res.headers.get("x-assistant-refusal") === "1";
      let prefill: ToolPrefill | null = null;
      let clarify: ToolClarify | null = null;
      const toolHeader = res.headers.get("x-assistant-tool");
      if (toolHeader) {
        try {
          // Re-validated here: a header is not a trusted channel, and this
          // writes into the form.
          prefill = validatePrefill(JSON.parse(decodeBase64Utf8(toolHeader)));
        } catch {
          prefill = null;
        }
      }
      const clarifyHeader = res.headers.get("x-assistant-clarify");
      if (clarifyHeader) {
        try {
          clarify = validateClarify(JSON.parse(decodeBase64Utf8(clarifyHeader)));
        } catch {
          clarify = null;
        }
      }
      if (clarify) asks.current = Math.min(MAX_ASKS, asks.current + 1);
      if (prefill && prefill.slug === tool) {
        asks.current = 0;
        onPrefill(prefill);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let reply = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += decoder.decode(value, { stream: true });
        setTurns((prev) => [
          ...prev.filter((t) => t.id !== replyId),
          { id: replyId, role: "assistant", content: reply, clarify, refusal },
        ]);
        scrollDown();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className={styles.jo} aria-label="Ask Jo" data-testid="ask-jo">
      <header className={styles.joHead}>
        <span className={styles.joAvatar} aria-hidden="true">
          Jo
        </span>
        <div>
          <p className={styles.joName}>Ask Jo</p>
          <p className={styles.joSub}>Not sure what to pick? Ask, or tell Jo what you want.</p>
        </div>
      </header>

      <div className={styles.joList} ref={listRef}>
        <div className={`${styles.joMsg} ${styles.joBot}`}>{intro}</div>
        {turns.map((t) => (
          <div key={t.id} className={`${styles.joMsg} ${t.role === "user" ? styles.joMe : styles.joBot}`}>
            {t.role === "assistant" ? <MarkdownResult text={t.content} /> : t.content}
            {t.clarify && (
              <div className={styles.joChips}>
                <p>{t.clarify.question}</p>
                <div>
                  {t.clarify.options.map((o) => (
                    <button key={o.value} type="button" onClick={() => send(o.label)} disabled={busy}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {busy && turns[turns.length - 1]?.role === "user" && (
          <div className={`${styles.joMsg} ${styles.joBot}`} aria-live="polite">
            <Loader2 className={styles.spin} aria-hidden="true" /> Jo is thinking
          </div>
        )}
      </div>

      {error && (
        <p className={styles.joError} role="alert">
          {error}
        </p>
      )}

      <form
        className={styles.joForm}
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor="ask-jo-input" className={styles.srOnly}>
          Message Jo
        </label>
        <input
          id="ask-jo-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="For example: make it 10 slides for Year 4"
          maxLength={600}
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !draft.trim()} aria-label="Send">
          <ArrowUp aria-hidden="true" />
        </button>
      </form>
    </aside>
  );
}
