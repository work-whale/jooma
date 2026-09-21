"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ChatTeardropDots } from "@phosphor-icons/react/dist/ssr";
import Card from "@/app/components/ui/Card";
import AssistantComposer, { type Attachment } from "@/app/components/assistant/AssistantComposer";
import { createChat, saveMessage } from "@/app/lib/assistantChats";
import { getEntitlements } from "@/app/lib/entitlements";
import { can } from "@/app/lib/plans";

/**
 * The assistant entry point on the dashboard (Figma node 51902:113586).
 *
 * Deliberately not a second chat implementation: it creates the chat, stores
 * the opening message, and hands off to /assistant/[id], which owns streaming
 * and history. Everything a teacher types here continues in the real surface.
 */
export default function DashboardAssistantCard() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getEntitlements()
      .then((e) => setAllowed(can(e.plan, "assistant")))
      // Fail open in the UI; proxy.ts is the real gate. See AssistantView.
      .catch(() => setAllowed(true));
  }, []);

  const start = async (
    message: string,
    opts: { tool: string | null; attachment: Attachment | null },
  ) => {
    setSending(true);
    setError(null);
    try {
      const chat = await createChat(message);
      await saveMessage({ chatId: chat.id, role: "user", content: message });
      // The assistant page picks the message up from history and answers it.
      //
      // A tool picked here is not carried across: the hand-off goes through
      // stored history, which holds messages only, so there is nowhere to put
      // it. The teacher can pick it again on the assistant page, where the
      // choice actually reaches the request.
      void opts;
      router.push(`/assistant/${chat.id}`);
    } catch {
      setError("Couldn't start that chat. Please try again.");
      setSending(false);
    }
  };

  const locked = allowed === false;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        {/* A real glyph, not an SVG forced black with a brightness(0) filter.
            The filter was there to make a coloured asset match the old ink; on
            the brand it would just have flattened the purple. */}
        <span
          aria-hidden="true"
          className="w-8 h-8 shrink-0 rounded-xl grid place-items-center"
          style={{ backgroundColor: "var(--j-deep)" }}
        >
          <ChatTeardropDots weight="fill" className="w-4 h-4" style={{ color: "#fff" }} />
        </span>
        <h2 className="text-[22px] font-medium text-dark grow" style={{ letterSpacing: "-0.45px" }}>
          Ask Jo
        </h2>
        <Link
          href="/assistant"
          aria-label="New chat"
          title="New chat"
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-opacity hover:opacity-80"
          style={{ backgroundColor: "var(--j-tint)" }}
        >
          <Plus className="w-4 h-4 text-dark" />
        </Link>
      </div>

      {locked ? (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-center"
          style={{ borderColor: "var(--j-line-2)" }}
        >
          <p className="text-sm text-muted max-w-md">
            Ask anything about your teaching week, and have the assistant set up your
            tools for you. Part of Jooma Pro.
          </p>
          {/* Their subscription page, not the logged-out /pricing marketing
              page — see the note in AssistantLocked. */}
          <Link
            href="/profile?section=subscription"
            className="rounded-xl bg-(--j-purple) px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Upgrade to Pro
          </Link>
        </div>
      ) : (
        <>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <AssistantComposer
            onSend={start}
            busy={sending}
            disabled={allowed === null}
            compact
            placeholder="Try: 'Create a Year 5 multiplication quiz'"
          />
        </>
      )}
    </Card>
  );
}
