"use client";

// The assistant's persistent frame: the chat list and the actions that operate
// on it.
//
// The sidebar and top bar are NOT here. They live in app/(app)/layout.tsx and
// are shared with every other signed-in screen, so moving between Ask Jo and
// the rest of the app no longer tears them down. This declares Ask Jo's own
// chrome through useAppShell instead.
//
// This lives in app/(app)/assistant/layout.tsx rather than in the page, which is
// the whole point. /assistant and /assistant/[id] are separate route segments, so
// anything held in the page is torn down and rebuilt on every chat click —
// the sidebar would refetch from Supabase and, while that was in flight, render
// "Chats (0) / No chats yet." over a list the teacher had just clicked. In a
// layout the sidebar is never unmounted, so navigating swaps only the message
// panel. See docs/instant-navigation-guide.md section 3.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppShell } from "@/app/components/v2/AppShellContext";
import ConfirmModal from "@/app/components/ConfirmModal";
import ChatSidebar from "@/app/components/assistant/ChatSidebar";
import type { ChatTurn } from "@/app/components/assistant/ChatMessages";
import {
  deleteChat,
  listChats,
  renameChat,
  type AssistantChat,
} from "@/app/lib/assistantChats";
import { getEntitlements } from "@/app/lib/entitlements";
import { can } from "@/app/lib/plans";

interface AssistantChatsValue {
  /** Add a chat created by the page, so the sidebar shows it immediately. */
  addChat: (chat: AssistantChat) => void;
  /** Re-read the list from the server. */
  refreshChats: () => void;
  /** null while the plan is still being resolved — see below. */
  allowed: boolean | null;
  /**
   * Turns handed up by the page just before its own route is replaced.
   *
   * /assistant and /assistant/[id] are separate segments, so the first message
   * of a chat UNMOUNTS the view and mounts a new one. Component state and refs
   * do not survive that, and the fresh instance would reload the conversation
   * from the database — where a stored row carries `tool_call` but never
   * `clarify`, so Jo's question and its chips silently disappeared a beat after
   * they appeared.
   *
   * Parked here, in the layout, which is the only thing that outlives the
   * navigation. The remounted view claims them and skips the fetch.
   */
  handover: { chatId: string; turns: ChatTurn[] } | null;
  /** Park the current turns before replacing the url. */
  setHandover: (value: { chatId: string; turns: ChatTurn[] } | null) => void;
}

const AssistantChatsContext = createContext<AssistantChatsValue | null>(null);

/**
 * The seam between the layout's chat list and the page's conversation.
 *
 * Only what the page genuinely has to push upward: a chat is created on its
 * first message, and the sidebar has to learn about it. Everything else the
 * page needs (which chat is open) is already in the URL.
 */
export function useAssistantChats(): AssistantChatsValue {
  const ctx = useContext(AssistantChatsContext);
  if (!ctx) throw new Error("useAssistantChats must be used inside AssistantShell");
  return ctx;
}

export default function AssistantShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  // The shell itself is shared with every other signed-in screen, so this only
  // declares what Ask Jo needs from it. "fixed" pins <main> to the viewport so
  // the chat list and the conversation own their own scrolling; the content
  // class stacks them below `lg`, where two fixed sidebars (the 250px rail plus
  // this 292px list) left the conversation at negative width on a phone.
  useAppShell({
    title: "Ask Jo",
    variant: "fixed",
    contentClassName:
      "flex flex-1 flex-col lg:flex-row gap-3 overflow-hidden px-4 sm:px-6 lg:px-10 pb-5 min-h-0",
  });

  // null = not loaded yet, [] = genuinely empty. Without the distinction the
  // sidebar renders "No chats yet." during every load, which is the bug this
  // component exists to fix. Mirrors the `allowed` sentinel below.
  const [chats, setChats] = useState<AssistantChat[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // null = still loading. Rendering the composer before we know the plan would
  // flash an enabled input at a Free user and then disable it.
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // The open chat, derived from the URL rather than stored. /assistant/<id> is
  // already the source of truth; duplicating it in state would mean a write on
  // every navigation and two things to keep in step.
  const activeId = useMemo(() => {
    const match = /^\/assistant\/([^/]+)/.exec(pathname ?? "");
    return match ? decodeURIComponent(match[1]) : null;
  }, [pathname]);

  const refreshChats = useCallback(() => {
    listChats()
      .then((rows) => {
        setChats(rows);
        setLoadFailed(false);
      })
      .catch(() => {
        // Distinguished from an empty list. Collapsing a failed load into []
        // told the teacher their chats did not exist.
        setChats([]);
        setLoadFailed(true);
      });
  }, []);

  useEffect(() => {
    getEntitlements()
      .then((e) => setAllowed(can(e.plan, "assistant")))
      // Fail open in the UI only. proxy.ts is the real gate, so the worst case
      // is a Free user seeing an enabled composer and getting the upgrade modal
      // on send — far better than locking out a paying teacher over a blip.
      .catch(() => setAllowed(true));
  }, []);

  useEffect(() => {
    refreshChats();
  }, [refreshChats]);

  const addChat = useCallback((chat: AssistantChat) => {
    setChats((prev) => [chat, ...(prev ?? [])]);
  }, []);

  const handleDelete = async (id: string) => {
    setChats((prev) => (prev ?? []).filter((c) => c.id !== id));
    setDeleting(null);
    try {
      await deleteChat(id);
    } catch {
      // Put it back rather than leave the sidebar lying about what exists.
      refreshChats();
      return;
    }
    if (id === activeId) router.replace("/assistant");
  };

  const handleRename = async (id: string, title: string) => {
    setChats((prev) => (prev ?? []).map((c) => (c.id === id ? { ...c, title } : c)));
    try {
      await renameChat(id, title);
    } catch {
      refreshChats();
    }
  };

  const locked = allowed === false;

  // Held in a ref, not state: parking turns must not re-render the shell (and
  // with it the whole conversation) at the exact moment the route is changing.
  // The consumer reads it once on mount and clears it.
  const handoverRef = useRef<{ chatId: string; turns: ChatTurn[] } | null>(null);
  const setHandover = useCallback(
    (v: { chatId: string; turns: ChatTurn[] } | null) => {
      handoverRef.current = v;
    },
    [],
  );

  const value = useMemo(
    () => ({
      addChat,
      refreshChats,
      allowed,
      // A getter would be cleaner, but the consumer only reads this during its
      // first render, and a plain property keeps the context shape obvious.
      get handover() {
        return handoverRef.current;
      },
      setHandover,
    }),
    [addChat, refreshChats, allowed, setHandover],
  );

  return (
    <>
      <ChatSidebar
        chats={chats ?? []}
        loading={chats === null}
        loadFailed={loadFailed}
        onRetry={refreshChats}
        activeId={activeId}
        onSelect={(id) => router.push(`/assistant/${id}`)}
        onNew={() => router.push("/assistant")}
        onRename={handleRename}
        onDelete={(id) => setDeleting(id)}
        disabled={locked}
      />

      <AssistantChatsContext.Provider value={value}>
        {children}
      </AssistantChatsContext.Provider>

      <ConfirmModal
        open={deleting !== null}
        title="Delete this chat?"
        message="This removes the conversation and its messages. It can't be undone."
        confirmLabel="Delete"
        onConfirm={() => deleting && handleDelete(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
