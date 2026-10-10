"use client";

// One conversation with Jo about one document.
//
// A turn: send the message with a snapshot of the document, read Jo's answer
// as it streams (lib/jo/progress), and hand each FINISHED op to the adapter to
// play, one after another, while the rest is still being written. The adapter
// is what knows the document: how to show an edit happening, and how to commit
// the turn's changes as a single undoable step at the end.

import { useCallback, useEffect, useRef, useState } from "react";
import { readJoProgress } from "@/app/lib/jo/progress";
import { JO_MAX_ASKS } from "@/app/lib/jo/prompts";
import { getOrCreateThread, listJoMessages, saveJoMessage, type JoDocRef, type JoDoneOp } from "@/app/lib/jo/threads";
import type { JoClarify, JoDocKind, JoOp } from "@/app/lib/jo/types";

export interface JoAdapter {
  kind: JoDocKind;
  /** Compact view of the document now, for the model. */
  snapshot(): unknown;
  /** What the teacher last worked on, if known. */
  focus(): string | null;
  isOp(v: unknown): v is JoOp;
  /** A turn's first op is about to play. Returns what to restore on undo. */
  begin(): unknown;
  /** Show one op happening and apply it to the turn's working copy. Returns
   *  where it landed, or null when it did not fit the document. */
  play(op: JoOp, signal: AbortSignal): Promise<{ focus: string | null } | null>;
  /** Commit the turn's changes, once. */
  end(): void;
  /** Put the document back as it was before a turn. */
  restore(before: unknown): void;
  /** Bring a change into view and point at it. */
  reveal(focus: string): void;
}

export type JoStepState = "working" | "done" | "skipped";

export interface JoStep extends JoDoneOp {
  state: JoStepState;
}

export interface JoMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  clarify?: JoClarify | null;
  steps?: JoStep[];
  summary?: string;
  /** Still arriving. */
  pending?: boolean;
  error?: string;
  /** What undo puts back. Only turns from this visit have it. */
  before?: unknown;
  undone?: boolean;
  /** Written during this visit, as opposed to loaded from the saved thread. */
  fresh?: boolean;
}

export interface JoGuest {
  trialId: string | null;
  honeypot: () => string;
}

export interface JoSessionOptions {
  endpoint: string;
  /** Signed in: where the conversation is kept. */
  docRef?: JoDocRef | null;
  guest?: JoGuest;
}

let seq = 0;
const nextId = () => `jo${Date.now().toString(36)}${(seq++).toString(36)}`;

/** What a past turn says, as plain text for the model's history. */
function asHistory(m: JoMessage): string {
  if (m.role === "user") return m.text;
  const parts = [m.text];
  if (m.clarify) parts.push(`${m.clarify.question} (${m.clarify.options.join(" / ")})`);
  if (m.steps?.length) parts.push(`Edits made: ${m.steps.filter((s) => s.state === "done").map((s) => s.label).join("; ")}.`);
  if (m.summary) parts.push(m.summary);
  return parts.filter(Boolean).join(" ");
}

export function useJoSession(adapter: JoAdapter, opts: JoSessionOptions) {
  const [messages, setMessages] = useState<JoMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [promptsLeft, setPromptsLeft] = useState<number | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const adapterRef = useRef(adapter);
  const optsRef = useRef(opts);
  useEffect(() => {
    adapterRef.current = adapter;
    optsRef.current = opts;
  });
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<string | null>(null);

  // ── A new document starts a new conversation ──
  // Then, for a signed in teacher's saved document, its earlier turns.
  const docKey = opts.docRef ? `${opts.docRef.kind}:${opts.docRef.id}` : null;
  const resetKey = `${docKey ?? ""}|${opts.guest?.trialId ?? ""}`;
  useEffect(() => {
    threadRef.current = null;
    setMessages([]);
    setBlocked(null);
    const ref = optsRef.current.docRef;
    if (!ref) return;
    let live = true;
    listJoMessages(ref).then((rows) => {
      if (!live || rows.length === 0) return;
      setMessages((now) => [
        ...rows.map<JoMessage>((r) => ({
          id: r.id,
          role: r.role,
          text: r.content,
          clarify: r.clarify,
          steps: r.ops?.map((o) => ({ ...o, state: "done" as const })),
          summary: r.summary ?? undefined,
        })),
        ...now,
      ]);
    });
    return () => {
      live = false;
    };
  }, [resetKey]);

  // ── A guest's prompts left on this free try ──
  const trialId = opts.guest?.trialId ?? null;
  useEffect(() => {
    if (!trialId) return;
    let live = true;
    fetch(`/api/try/jo?trialId=${encodeURIComponent(trialId)}`)
      .then((r) => r.json())
      .then((d: { left?: number }) => {
        if (live && typeof d.left === "number") setPromptsLeft(d.left);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [trialId]);

  const patch = useCallback((id: string, fn: (m: JoMessage) => JoMessage) => {
    setMessages((all) => all.map((m) => (m.id === id ? fn(m) : m)));
  }, []);

  const persist = useCallback(async (user: JoMessage, reply: JoMessage) => {
    const ref = optsRef.current.docRef;
    if (!ref) return;
    try {
      threadRef.current ??= await getOrCreateThread(ref);
      await saveJoMessage(threadRef.current, { role: "user", content: user.text });
      await saveJoMessage(threadRef.current, {
        role: "assistant",
        content: reply.text,
        clarify: reply.clarify ?? null,
        ops: reply.steps?.filter((s) => s.state === "done").map(({ label, focus }) => ({ label, focus })) ?? null,
        summary: reply.summary ?? null,
      });
    } catch (err) {
      console.warn("[jo] could not save the turn:", err);
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || abortRef.current) return;
      const o = optsRef.current;
      const a = adapterRef.current;

      const user: JoMessage = { id: nextId(), role: "user", text: message };
      const history = [...messagesRef.current, user]
        .filter((m) => !m.error && (m.role === "user" || m.text || m.summary))
        .map((m) => ({ role: m.role, content: asHistory(m) }));

      // Follow up questions asked since Jo last edited.
      let askCount = 0;
      for (const m of [...messagesRef.current].reverse()) {
        if (m.role !== "assistant") continue;
        if (m.clarify) askCount++;
        else break;
      }

      // The reply is built here and pushed to state as it changes, so the end
      // of the turn never has to read state back.
      const draft: JoMessage = { id: nextId(), role: "assistant", text: "", steps: [], pending: true, fresh: true };
      const show = () => {
        const copy = { ...draft, steps: draft.steps?.map((s) => ({ ...s })) };
        setMessages((all) => all.map((m) => (m.id === draft.id ? copy : m)));
      };
      setMessages((all) => [...all, user, { ...draft, steps: [] }]);
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;

      let before: unknown = undefined;
      let chain: Promise<void> = Promise.resolve();
      let played = 0;
      const enqueue = (ops: JoOp[]) => {
        for (const op of ops.slice(played)) {
          played++;
          chain = chain.then(async () => {
            if (controller.signal.aborted) return;
            if (before === undefined) before = a.begin();
            const step: JoStep = { label: op.label, focus: null, state: "working" };
            draft.steps!.push(step);
            show();
            let landed: { focus: string | null } | null = null;
            try {
              landed = await a.play(op, controller.signal);
            } catch {
              landed = null;
            }
            step.focus = landed?.focus ?? null;
            step.state = landed ? "done" : "skipped";
            show();
          });
        }
      };

      let failure: string | null = null;
      try {
        const res = await fetch(o.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            kind: a.kind,
            snapshot: a.snapshot(),
            focus: a.focus(),
            messages: history,
            askCount: Math.min(askCount, JO_MAX_ASKS),
            ...(o.guest ? { trialId: o.guest.trialId, website: o.guest.honeypot() } : {}),
          }),
        });
        const left = res.headers.get("x-jo-prompts-left");
        if (left !== null && Number.isFinite(Number(left))) setPromptsLeft(Number(left));

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
          if (data.code === "jo_trial_limit") {
            setPromptsLeft(0);
            setBlocked(data.error ?? "limit");
          } else if (res.status === 402) {
            setBlocked(data.error ?? "Your plan has run out of credit for Jo this month.");
          }
          failure = data.error ?? "Jo couldn't do that just now. Please try again.";
        } else {
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let raw = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            raw += decoder.decode(value, { stream: true });
            const now = readJoProgress(raw, a.isOp);
            if (now.reply !== draft.text) {
              draft.text = now.reply;
              show();
            }
            enqueue(now.ops);
          }
          raw += decoder.decode();
          const last = readJoProgress(raw, a.isOp, true);
          enqueue(last.ops);
          await chain;
          draft.text = last.reply;
          draft.clarify = last.clarify;
          draft.summary = last.summary || undefined;
          if (!last.reply && last.ops.length === 0 && !last.clarify) failure = "Jo didn't come back with anything. Please try again.";
        }
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") failure = "Jo lost the connection. Please try again.";
        await chain;
      } finally {
        if (before !== undefined) a.end();
        abortRef.current = null;
        setBusy(false);
      }

      draft.pending = false;
      draft.before = before;
      if (controller.signal.aborted && !draft.text) draft.text = "Stopped.";
      if (failure && !draft.text && !draft.steps!.length) draft.error = failure;
      show();

      if (!draft.error) void persist(user, draft);
    },
    [persist],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const undo = useCallback(
    (id: string) => {
      const m = messagesRef.current.find((x) => x.id === id);
      if (!m || m.before === undefined || m.undone || abortRef.current) return;
      adapterRef.current.restore(m.before);
      patch(id, (x) => ({ ...x, undone: true }));
    },
    [patch],
  );

  return { messages, busy, send, stop, undo, promptsLeft, blocked };
}
