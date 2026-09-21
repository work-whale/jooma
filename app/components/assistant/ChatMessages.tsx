"use client";

import { useEffect, useRef } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { ChatTeardropDots } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import MarkdownResult from "@/app/components/MarkdownResult";
import ToolLinkCard from "@/app/components/assistant/ToolLinkCard";
import ClarifyChips from "@/app/components/assistant/ClarifyChips";
import type { ToolPrefill, ToolClarify } from "@/app/lib/toolPrefill";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCall?: ToolPrefill | null;
  /** A question asked instead of opening a tool. Never persisted: a stale
   *  question on reload would offer a choice that has already been made. */
  clarify?: ToolClarify | null;
}

interface Props {
  turns: ChatTurn[];
  /** True while the assistant's reply is still streaming in. */
  streaming?: boolean;
  /** Answer a clarifying question, by chip or by the escape. */
  onAnswer?: (answer: string) => void;
  /** Leave the question unanswered and let the teacher type instead. */
  onAddDetail?: () => void;
}

export default function ChatMessages({
  turns,
  streaming = false,
  onAnswer,
  onAddDetail,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  // Follow the stream, but stop the moment the teacher scrolls up to re-read
  // something — yanking them back to the bottom mid-sentence is the single most
  // irritating thing a chat UI can do. Re-arms when they return to the bottom.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      pinnedRef.current = distance < 80;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (pinnedRef.current) {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [turns, streaming]);

  return (
    <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        {turns.map((turn, i) =>
          turn.role === "user" ? (
            <UserTurn key={turn.id} content={turn.content} />
          ) : (
            <AssistantTurn
              key={turn.id}
              content={turn.content}
              toolCall={turn.toolCall}
              clarify={turn.clarify}
              // Only the final turn's question is still open. An earlier one has
              // already been answered by the turns below it, so its chips must
              // not stay live and offer a choice that has been made.
              answerable={i === turns.length - 1}
              onAnswer={onAnswer}
              onAddDetail={onAddDetail}
              // Only the final turn can still be arriving.
              streaming={streaming && i === turns.length - 1}
            />
          ),
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function UserTurn({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl bg-(--j-purple) px-5 py-3 text-sm text-white whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  );
}

function AssistantTurn({
  content,
  toolCall,
  clarify,
  answerable,
  onAnswer,
  onAddDetail,
  streaming,
}: {
  content: string;
  toolCall?: ToolPrefill | null;
  clarify?: ToolClarify | null;
  answerable?: boolean;
  onAnswer?: (answer: string) => void;
  onAddDetail?: () => void;
  streaming: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // An empty assistant turn means the request is in flight but no token has
  // landed yet — show that it is thinking rather than an empty bubble.
  if (streaming && !content) {
    return (
      <div className="flex gap-3">
        <MoOrb />
        <div
          className="flex-1 min-w-0 rounded-2xl bg-(--j-card) px-5 py-4"
          style={{ border: "1px solid var(--j-line)" }}
        >
          <div className="flex items-center gap-1.5 text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-xs">Thinking…</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <MoOrb />
      <div
        className="flex-1 min-w-0 rounded-2xl bg-(--j-card) px-5 py-4"
        style={{ border: "1px solid var(--j-line)" }}
      >
        <MarkdownResult text={content} />
        {streaming && (
          <span className="inline-block w-px h-[1em] bg-(--j-muted) animate-pulse ml-px align-text-bottom" />
        )}

        {toolCall && <ToolLinkCard prefill={toolCall} />}

        {clarify && answerable && (
          <ClarifyChips clarify={clarify} onAnswer={onAnswer} onAddDetail={onAddDetail} />
        )}

        {/* Actions appear once the reply is complete — offering "copy"
            mid-stream would copy a fragment. */}
        {!streaming && content.trim() !== "" && (
          <div
            className="mt-3 flex items-center gap-2 border-t pt-3"
            style={{ borderColor: "var(--j-line)" }}
          >
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-(--j-tint) cursor-pointer"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Jo's mark beside each of its replies.
 *
 * Gives the assistant a consistent presence in the thread, so a teacher
 * scanning back can tell at a glance which turns are theirs. `aria-hidden`
 * because the turn is already distinguishable to a screen reader by its
 * content and order; announcing "Jo" on every reply would be noise.
 */
function MoOrb() {
  return (
    <span
      aria-hidden="true"
      className="w-8 h-8 shrink-0 rounded-xl grid place-items-center"
      style={{ backgroundColor: "var(--j-deep)" }}
    >
      <ChatTeardropDots weight="fill" className="w-4 h-4" style={{ color: "#fff" }} />
    </span>
  );
}
