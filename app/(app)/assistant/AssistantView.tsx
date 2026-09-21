"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatMessages, { type ChatTurn } from "@/app/components/assistant/ChatMessages";
import AssistantComposer, { type Attachment } from "@/app/components/assistant/AssistantComposer";
import AssistantLocked from "@/app/components/assistant/AssistantLocked";
import { useAssistantChats } from "@/app/components/assistant/AssistantShell";
import { createChat, listMessages, saveMessage } from "@/app/lib/assistantChats";
import {
  validatePrefill,
  validateClarify,
  prefillHref,
  type ToolPrefill,
  type ToolClarify,
} from "@/app/lib/toolPrefill";

/** Header the route uses to hand back a prefill decision alongside the stream. */
const TOOL_HEADER = "x-assistant-tool";

/** Set when the reply is the guardrail's refusal. Shown, but never stored. */
/** Header carrying a clarifying question, when Jo asks one instead of opening a tool. */
const CLARIFY_HEADER = "x-assistant-clarify";

const REFUSAL_HEADER = "x-assistant-refusal";

export default function AssistantView({ chatId }: { chatId?: string }) {
  const router = useRouter();

  // The chat list and the plan gate live in the layout, so they survive
  // navigation between /assistant and /assistant/[id]. See AssistantShell.
  const { addChat, allowed } = useAssistantChats();

  const [activeId, setActiveId] = useState<string | null>(chatId ?? null);
  // null = the conversation has not loaded yet, [] = it is genuinely empty.
  // Without the distinction the "How can I help you?" splash flashes over an
  // existing conversation while its messages are in flight.
  const [turns, setTurns] = useState<ChatTurn[] | null>(chatId ? null : []);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A stored user message still awaiting its reply — see the loader below. */
  const [pendingReply, setPendingReply] = useState<string | null>(null);

  // The live turns, readable from inside the streaming loop without making it a
  // dependency — otherwise every token would rebuild the send callback.
  const turnsRef = useRef<ChatTurn[]>([]);
  turnsRef.current = turns ?? [];

  /**
   * Clarifying questions asked so far in the current build request.
   *
   * A ref, not state: nothing renders from it, and it has to be readable at the
   * moment a chip is pressed. Reset whenever the teacher starts a fresh request
   * from the composer, so a new ask gets its full allowance of questions.
   */
  const askCountRef = useRef(0);

  /**
   * Put the cursor in the composer.
   *
   * "Add more detail" is an invitation to type, so it has to leave the teacher
   * somewhere they can type. Reached through the DOM rather than a ref threaded
   * into AssistantComposer, which owns its own textarea and exposes none.
   */
  const focusComposer = useCallback(() => {
    const el = document.querySelector<HTMLTextAreaElement>("[data-jo-composer] textarea");
    el?.focus();
  }, []);

  // Load the conversation whenever the route changes.
  //
  // A chat arriving from the dashboard card has one stored user message and no
  // reply — the card creates the chat and hands off rather than streaming
  // itself. Detecting that here (rather than passing a flag through the URL)
  // means a refresh mid-answer resumes correctly too.
  useEffect(() => {
    if (!chatId) {
      setActiveId(null);
      setTurns([]);
      return;
    }
    setActiveId(chatId);
    setTurns(null);
    listMessages(chatId)
      .then((rows) => {
        setTurns(
          rows.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            toolCall: m.tool_call,
          })),
        );
        const last = rows[rows.length - 1];
        if (last?.role === "user") setPendingReply(last.content);
      })
      .catch(() => setTurns([]));
  }, [chatId]);

  /**
   * Stream one reply for a conversation that already ends in a user turn.
   *
   * Shared by the composer and by the pending-reply loader, so a chat started
   * from the dashboard is answered by exactly the same code as one typed here.
   */
  // Set when the teacher types in the composer while a reply is streaming. A
  // ref rather than state: it must be readable at the instant the stream ends,
  // and nothing should re-render because they started typing.
  const composerTouched = useRef(false);

  // Watched here rather than through a prop on AssistantComposer, which keeps
  // its draft in local state and exposes no onChange. A capture-phase listener
  // costs the composer nothing and keeps its interface unchanged.
  useEffect(() => {
    if (!streaming) return;
    const onType = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("textarea, input")) composerTouched.current = true;
    };
    document.addEventListener("input", onType, true);
    return () => document.removeEventListener("input", onType, true);
  }, [streaming]);

  /**
   * Open the tool Jo chose, without waiting for a click on the card.
   *
   * Only when every guard holds. A teacher who has looked away, started typing
   * again, or hit an error is not expecting the page to change under them, and
   * the ToolLinkCard is still sitting under the reply as the manual route. So
   * the cost of declining to navigate is one click, and the cost of navigating
   * when they did not want it is losing their place.
   */
  const maybeOpenTool = useCallback(
    (toolCall: ToolPrefill | null, ok: boolean) => {
      if (!toolCall || !ok) return;
      if (composerTouched.current) return;
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;

      // A beat before the page changes, so the reply can be read first: Jo's
      // answer usually explains why it picked this tool.
      window.setTimeout(() => {
        if (composerTouched.current) return;
        if (document.visibilityState !== "visible" || !document.hasFocus()) return;
        // push, not replace: Back must return to the conversation.
        router.push(prefillHref(toolCall));
      }, 600);
    },
    [router],
  );

  const streamReply = useCallback(
    async (
      chatIdForSave: string,
      history: ChatTurn[],
      opts: {
        tool: string | null;
        attachment: Attachment | null;
        /** How many clarifying questions this build request has already asked. */
        askCount?: number;
      },
    ) => {
      const replyId = `local-reply-${Date.now()}`;
      setTurns([...history, { id: replyId, role: "assistant", content: "" }]);
      setStreaming(true);

      let reply = "";
      let toolCall: ToolPrefill | null = null;
      let clarify: ToolClarify | null = null;
      let refused = false;

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((t) => ({ role: t.role, content: t.content })),
            tool: opts.tool,
            attachment: opts.attachment,
            askCount: opts.askCount ?? 0,
          }),
        });

        if (!res.ok) {
          // 402 is handled by UpgradeGate, which patches window.fetch and opens
          // the upgrade modal itself. Drop the placeholder and say nothing more.
          if (res.status === 402) {
            setTurns(history);
            return null;
          }
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "The assistant is unavailable right now.");
        }

        // A refusal is shown but never stored. Keeping it would feed it back as
        // context on the next turn, making the next refusal more likely.
        refused = res.headers.get(REFUSAL_HEADER) === "1";

        const header = res.headers.get(TOOL_HEADER);
        if (header) {
          try {
            // Re-validated client-side: a header is not a trusted channel, and
            // this is what decides which tool page we link to.
            toolCall = validatePrefill(JSON.parse(atob(header)));
          } catch {
            toolCall = null;
          }
        }

        const clarifyHeader = res.headers.get(CLARIFY_HEADER);
        if (clarifyHeader) {
          try {
            // Re-validated client-side for the same reason as the prefill: a
            // header is not a trusted channel, and these chips write into a form.
            clarify = validateClarify(JSON.parse(atob(clarifyHeader)));
          } catch {
            clarify = null;
          }
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          reply += decoder.decode(value, { stream: true });
          setTurns([
            ...history,
            { id: replyId, role: "assistant", content: reply, toolCall, clarify },
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setTurns(history);
        return null;
      } finally {
        setStreaming(false);
      }

      if (reply.trim() && !refused) {
        void saveMessage({ chatId: chatIdForSave, role: "assistant", content: reply, toolCall }).catch(
          () => {},
        );
      }

      // Handed back so the caller can open the tool. A refusal or a clarify is
      // not a clean run: a refusal has no tool, and a clarify is a question the
      // teacher must answer first, which ClarifyChips resolves on its own.
      //
      // `clarify` rides along so the caller can count the questions asked. The
      // server cannot keep that tally: a clarify is never persisted and never
      // sent back up, so only the client knows one was shown.
      return { toolCall, clarify, ok: !refused && !clarify };
    },
    [],
  );

  const send = useCallback(
    async (
      message: string,
      opts: {
        tool: string | null;
        attachment: Attachment | null;
        /** Set only when answering a clarifying question — see onAnswer. */
        askCount?: number;
      },
    ) => {
      setError(null);
      // A fresh send is a fresh intent to be taken somewhere. Cleared here so
      // typing during one reply does not suppress the navigation for the next.
      composerTouched.current = false;

      // A message straight from the composer starts a new build request, so the
      // question allowance resets. Answering a clarify passes its own count and
      // leaves the running tally alone.
      if (opts.askCount === undefined) askCountRef.current = 0;

      // Create the chat on the first message rather than up front, so opening
      // /assistant and leaving never litters the sidebar with empty chats.
      let id = activeId;
      let isNew = false;
      if (!id) {
        try {
          const chat = await createChat(message);
          id = chat.id;
          isNew = true;
          setActiveId(chat.id);
          // Into the layout's list, so it appears in the sidebar at once.
          addChat(chat);
        } catch {
          setError("Couldn't start that chat. Please try again.");
          return;
        }
      }

      // Optimistic: the teacher's own words appear instantly.
      const userTurn: ChatTurn = { id: `local-user-${Date.now()}`, role: "user", content: message };
      const history = [...turnsRef.current, userTurn];

      void saveMessage({ chatId: id, role: "user", content: message }).catch(() => {
        /* The turn is already on screen and in the request; a failed history
           write must not interrupt the reply the teacher is waiting for. */
      });

      const outcome = await streamReply(id, history, {
        ...opts,
        askCount: opts.askCount ?? askCountRef.current,
      });

      // A question was asked, so the next answer counts against the allowance.
      // Tracked here rather than in the clarify component, which is unmounted
      // and rebuilt on every turn and so cannot hold a running total.
      if (outcome?.clarify) askCountRef.current = (opts.askCount ?? askCountRef.current) + 1;

      // Deferred to here so the URL changes once the exchange is complete,
      // rather than remounting mid-stream.
      if (isNew) router.replace(`/assistant/${id}`);

      // Same reason, and it must come after: navigating to the tool while the
      // stream was still running would tear down the panel mid-answer.
      maybeOpenTool(outcome?.toolCall ?? null, outcome?.ok ?? false);
    },
    [activeId, addChat, router, streamReply, maybeOpenTool],
  );

  /**
   * Answering a clarifying question, by chip or by typing.
   *
   * Posted back as an ordinary user turn rather than navigating, so the next
   * tool-selection pass sees the fuller history and can either ask once more or
   * open the tool. That is what makes the gather a conversation instead of a
   * single question: a teacher who was asked for a year group can answer "Year
   * 5" and then be asked how many slides.
   *
   * `askCount` rides along because the server cannot recover it. A clarify is
   * never persisted and never sent back up — history is role and content only —
   * so by the third turn nothing on the server remembers that two questions
   * were already asked. The client knows, because it rendered the chips.
   */
  const answerClarify = useCallback(
    (answer: string) => {
      void send(answer, {
        tool: null,
        attachment: null,
        askCount: askCountRef.current,
      });
    },
    [send],
  );

  // Answer a chat that arrived with its opening message already stored — the
  // dashboard card's hand-off, or a refresh that landed between the user turn
  // being saved and its reply arriving.
  useEffect(() => {
    if (!pendingReply || !activeId || streaming) return;
    setPendingReply(null);
    void streamReply(activeId, turnsRef.current, {
      tool: null,
      attachment: null,
    }).then((outcome) => maybeOpenTool(outcome?.toolCall ?? null, outcome?.ok ?? false));
  }, [pendingReply, activeId, streaming, streamReply, maybeOpenTool]);

  const locked = allowed === false;

  return (
    <section
      className="flex flex-1 flex-col overflow-hidden rounded-2xl"
      style={{ backgroundColor: "var(--j-card)" }}
    >
      {locked ? (
        <AssistantLocked />
      ) : (
        <>
          {/* null is "still loading", and must not render the splash over a
              conversation that is about to appear. An empty panel for a beat is
              honest; "How can I help you?" is not. */}
          {turns === null ? (
            <div className="flex-1" />
          ) : turns.length === 0 ? (
            <EmptyState />
          ) : (
            <ChatMessages
              turns={turns}
              streaming={streaming}
              onAnswer={answerClarify}
              onAddDetail={focusComposer}
            />
          )}

          <div className="px-4 sm:px-6 lg:px-10 pb-8 pt-2">
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <AssistantComposer
              onSend={send}
              busy={streaming}
              disabled={allowed === null}
              autoFocus
              placeholder="Try: 'Create a Year 5 multiplication quiz'"
            />
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The empty state.
 *
 * No clickable starter prompts: they put words in a teacher's mouth and the
 * ones that fit are rarely the ones they need. Instead this says what the
 * assistant can do and how to phrase a request, which is the part that actually
 * helps someone who has not used it before.
 */
function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 lg:px-10 text-center">
      <h2
        className="text-[32px] font-semibold text-dark"
        style={{ letterSpacing: "0.38px" }}
      >
        How can I help you?
      </h2>
      <p className="mt-4 max-w-md text-sm text-muted">
        Ask about planning, assessment, behaviour, SEND, or anything else in your
        teaching week.
      </p>
      <p className="mt-2 max-w-md text-sm text-muted">
        Ask for a resource — a lesson plan, worksheet, quiz or letter — and I&apos;ll
        open the right tool with the details filled in. Mention the year group and
        subject and there will be less to correct.
      </p>
    </div>
  );
}
