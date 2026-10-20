"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { MoreHorizontal, PanelLeft, Pencil, Plus, Search, SquarePen, Trash2, X } from "lucide-react";
import type { AssistantChat } from "@/app/lib/assistantChats";
import { useMediaQuery } from "@/app/lib/useMediaQuery";
import { useFocusTrap } from "@/app/lib/useFocusTrap";

interface Props {
  chats: AssistantChat[];
  /** The list has not arrived yet. Distinct from an empty list — see below. */
  loading?: boolean;
  /** The list could not be loaded. Also distinct from an empty list. */
  loadFailed?: boolean;
  onRetry?: () => void;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  disabled?: boolean;
}

/*
 * The chat list.
 *
 * From lg up it is a column beside the conversation. Below that it is a side
 * panel: a slim bar above the conversation names the open chat, its button
 * slides the past conversations in from the left over the page, and choosing
 * one (or starting a new one) slides them away again. The conversation keeps
 * the whole screen until the teacher asks for the list.
 */
export default function ChatSidebar({
  chats,
  loading = false,
  loadFailed = false,
  onRetry,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  disabled = false,
}: Props) {
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const editRef = useRef<HTMLInputElement>(null);

  // ── The side panel (below lg) ──
  const narrow = useMediaQuery("(max-width: 1023px)");
  const [panelOpen, setPanelOpen] = useState(false);
  // Widening to lg with it open leaves a column, not a dialog.
  const open = panelOpen && narrow;
  const panelRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useFocusTrap(panelRef, open);

  // In on open, back to the bar's button on close, but never on first load.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      closeRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      toggleRef.current?.focus();
    }
  }, [open]);

  // Escape closes the panel, unless something on top of it has the key: the
  // options menu and the rename box close themselves, and the delete confirm
  // is a dialog of its own.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || menuFor || editingId) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]:not(#assistant-chats)')) return;
      setPanelOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, menuFor, editingId]);

  const activeTitle = chats.find((c) => c.id === activeId)?.title ?? (activeId ? "" : "New chat");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) => c.title.toLowerCase().includes(q));
  }, [chats, query]);

  useEffect(() => {
    if (editingId) editRef.current?.select();
  }, [editingId]);

  // Escape closes the options menu and hands focus back to its button. The
  // button is found by the id the menu was opened for, since the list renders
  // one per chat.
  useEffect(() => {
    if (!menuFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const id = menuFor;
      setMenuFor(null);
      document.querySelector<HTMLElement>(`[aria-controls="chat-menu-${id}"]`)?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuFor]);

  const startRename = (chat: AssistantChat) => {
    setMenuFor(null);
    setEditingId(chat.id);
    setDraft(chat.title);
  };

  const commitRename = () => {
    if (!editingId) return;
    const title = draft.trim();
    const original = chats.find((c) => c.id === editingId)?.title;
    // Only write when it actually changed — an accidental blur should not
    // generate a pointless update.
    if (title && title !== original) onRename(editingId, title);
    setEditingId(null);
  };

  const startNew = () => {
    setPanelOpen(false);
    onNew();
  };

  return (
    <>
      {/* The bar above the conversation, below lg only. */}
      <div
        className="lg:hidden flex items-center gap-1 shrink-0 rounded-2xl px-1.5 min-h-14"
        style={{ backgroundColor: "var(--j-card)" }}
      >
        <button
          type="button"
          ref={toggleRef}
          onClick={() => setPanelOpen(true)}
          aria-label="Open chats"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="assistant-chats"
          className="grid place-items-center w-12 h-12 shrink-0 rounded-xl text-dark active:bg-(--j-tint) cursor-pointer"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
        <p className="flex-1 min-w-0 truncate text-[15px] font-semibold text-dark" data-testid="assistant-chat-title">
          {activeTitle}
        </p>
        <button
          type="button"
          onClick={startNew}
          disabled={disabled}
          aria-label="New chat"
          className="grid place-items-center w-12 h-12 shrink-0 rounded-xl text-dark active:bg-(--j-tint) disabled:opacity-40 cursor-pointer"
        >
          <SquarePen className="w-5 h-5" />
        </button>
      </div>

      {/* The backdrop: a tap anywhere on the page puts the panel away. */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-60 bg-black/30"
          onClick={() => setPanelOpen(false)}
          aria-hidden="true"
          data-testid="assistant-chats-backdrop"
        />
      )}

      <aside
        id="assistant-chats"
        ref={panelRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? "Chats" : undefined}
        // Below lg: fixed to the left edge and slid out of view when closed,
        // hidden as well so its rows leave the tab order. From lg: the column.
        className={`fixed inset-y-0 left-0 z-61 w-[min(20rem,calc(100vw-3rem))] rounded-r-2xl shadow-2xl pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-4 duration-250 ease-out ${
          // Visible at once on open, so focus can move in on the first frame;
          // hidden only once the slide out has finished on close.
          open ? "translate-x-0 visible transition-[translate]" : "-translate-x-full invisible transition-[translate,visibility]"
        } lg:static lg:z-auto lg:translate-x-0 lg:visible lg:transition-none lg:w-[292px] lg:rounded-2xl lg:shadow-none lg:p-6 shrink-0 flex flex-col gap-4 lg:gap-5 overflow-hidden`}
        style={{ backgroundColor: "var(--j-card)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg lg:text-[22px] font-medium text-dark min-w-0" style={{ letterSpacing: "-0.45px" }}>
            {/* No count until there is one to show. "(0)" during a load is a
                statement that the teacher has no chats, and it is usually wrong. */}
            Chats {!loading && <span className="text-muted">({chats.length})</span>}
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={startNew}
              disabled={disabled}
              className="flex items-center gap-1.5 min-h-11 text-sm font-semibold text-dark transition-opacity hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New chat
            </button>
            <button
              type="button"
              ref={closeRef}
              onClick={() => setPanelOpen(false)}
              aria-label="Close chats"
              className="lg:hidden grid place-items-center w-11 h-11 -mr-2 rounded-xl text-muted active:bg-(--j-tint) cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div
          className="flex items-center gap-2 rounded-xl border bg-white px-4 h-11 shrink-0"
          style={{ borderColor: "var(--j-tint)" }}
        >
          <Search className="w-4 h-4 shrink-0 text-muted" />
          <input
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a chat"
            aria-label="Search chats"
            className="w-full bg-transparent text-base sm:text-sm text-dark placeholder:text-muted focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted shrink-0">All Chats</span>
          <div className="h-px flex-1" style={{ backgroundColor: "var(--j-line)" }} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1">
        {loading ? (
          // Same shapes as app/assistant/loading.tsx, so the route skeleton and
          // this one are indistinguishable and nothing shifts between them.
          <div className="space-y-2 animate-pulse" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl" style={{ backgroundColor: "var(--j-tint)" }} />
            ))}
          </div>
        ) : loadFailed ? (
          <p className="text-sm text-muted py-2">
            Couldn&apos;t load your chats.{" "}
            <button
              type="button"
              onClick={onRetry}
              className="underline hover:opacity-70 cursor-pointer"
            >
              Try again
            </button>
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted py-2">
            {chats.length === 0 ? "No chats yet." : "No chats match that search."}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((chat) => {
              const active = chat.id === activeId;
              return (
                <div key={chat.id} className="relative group">
                  {editingId === chat.id ? (
                    <input
                      ref={editRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full rounded-xl border bg-white px-4 py-3 text-[13px] text-dark focus:outline-none"
                      style={{ borderColor: "var(--j-purple)" }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setPanelOpen(false);
                        onSelect(chat.id);
                      }}
                      className="w-full rounded-xl px-4 py-3 pr-12 text-left text-[13px] transition-colors cursor-pointer"
                      style={{
                        backgroundColor: active ? "var(--j-purple)" : "var(--j-tint)",
                        color: active ? "#fff" : "var(--j-ink)",
                      }}
                    >
                      <span className="block truncate">{chat.title}</span>
                    </button>
                  )}

                  {editingId !== chat.id && (
                    <button
                      type="button"
                      aria-label={`Options for ${chat.title}`}
                      aria-haspopup="menu"
                      aria-expanded={menuFor === chat.id}
                      aria-controls={`chat-menu-${chat.id}`}
                      onClick={() => setMenuFor(menuFor === chat.id ? null : chat.id)}
                      // Hidden until hover on a mouse, but always shown on a
                      // touch screen, which has no hover to reveal it with.
                      // The after: layer makes the tap target 48px.
                      className={`absolute right-1 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded transition-opacity cursor-pointer after:absolute after:-inset-1 after:content-[''] ${
                        menuFor === chat.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100"
                      }`}
                    >
                      <MoreHorizontal className={`w-4 h-4 ${active ? "text-white" : "text-muted"}`} />
                    </button>
                  )}

                  {menuFor === chat.id && (
                    <>
                      {/* Backdrop closes the menu on any outside click — the
                          pattern QuizGeneratorForm uses, and the one the two
                          slideshow menus are missing. */}
                      <div className="fixed inset-0 z-10" onClick={() => setMenuFor(null)} />
                      <div
                        id={`chat-menu-${chat.id}`}
                        role="menu"
                        className="absolute right-2 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border bg-white py-1 shadow-lg"
                        style={{ borderColor: "var(--j-line)" }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => startRename(chat)}
                          className="flex w-full pointer-coarse:min-h-12 items-center gap-2 px-3 py-2 text-left text-sm text-dark hover:bg-gray-50 active:bg-gray-100 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuFor(null);
                            onDelete(chat.id);
                          }}
                          role="menuitem"
                          className="flex w-full pointer-coarse:min-h-12 items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 active:bg-red-100 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      </aside>
    </>
  );
}
