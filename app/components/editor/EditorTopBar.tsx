"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Undo2, Redo2, Download, ArrowLeft, Palette, Play, Pencil, ChevronDown, X, Menu, Lock, FileText, Presentation } from "lucide-react";
import DropdownMenu from "@/app/components/ui/DropdownMenu";
import Wordmark from "@/app/components/v2/Wordmark";
import ThemePicker from "@/app/components/slideshow/ThemePicker";
import { SLIDESHOW_THEMES, getThemeArt, type ArtStyleId } from "@/app/lib/slideshowThemes";
import { SIDEBAR_TABS, isGuestLockedTab, type SidebarTabId } from "./Sidebar";

interface Props {
  title: string;
  onTitleChange: (v: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Export the deck. PPTX rebuilds each shape natively; PDF rasterises slides. */
  onExport: (format: "pptx" | "pdf") => void;
  onPresent: () => void;
  isExporting: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  /** When set, shows an "Edit prompt" button (re-open the original prompt and
   *  regenerate). Omitted for decks with no saved generation params. */
  onEditPrompt?: () => void;
  disableHistory?: boolean;
  themeId?: string;
  onThemeChange?: (id: string) => void;
  /** The deck's art style, for the swatch on the theme button. */
  artStyle?: ArtStyleId;
  /** A signed out visitor on /create: the way back is the landing page, not
   *  the teacher's slideshow list, and signing up is one click away. */
  guest?: { onSignUp: () => void };
  /** Opens one of the sidebar's tabs. On a phone the sidebar's rail is hidden
   *  and its tabs are listed in this bar's menu instead. */
  onOpenTool?: (tab: SidebarTabId) => void;
}

// Light on the dark purple bar (--j-editor-chrome).
const iconBtn = "p-2 rounded-lg text-white/85 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40";

// One row of the phone menu.
const menuRow =
  "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors hover:bg-(--j-tint) disabled:opacity-40";

export default function EditorTopBar({
  title,
  onTitleChange,
  onUndo,
  onRedo,
  onExport,
  onPresent,
  isExporting,
  saveStatus,
  onEditPrompt,
  disableHistory,
  themeId,
  onThemeChange,
  artStyle,
  guest,
  onOpenTool,
}: Props) {
  const home = guest ? "/" : "/tools/slideshow";
  const backLabel = guest ? "Back to your creations" : "Back to slideshows";
  const [themeOpen, setThemeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const activeTheme = SLIDESHOW_THEMES.find((t) => t.id === themeId) ?? SLIDESHOW_THEMES[0];
  const themeArt = getThemeArt(activeTheme, artStyle ?? "watercolor");

  useEffect(() => {
    if (!themeOpen) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (themeMenuRef.current?.contains(t)) return;
      if (themeBtnRef.current?.contains(t)) return;
      setThemeOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [themeOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  /** Runs a menu choice and folds the menu away. */
  const pick = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  const saveLabel =
    saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : saveStatus === "error" ? "Save failed" : null;

  const swatch = (
    <span
      className="inline-block w-3 h-3 rounded-sm border bg-cover bg-center shrink-0"
      style={{
        backgroundColor: activeTheme.palette.background,
        backgroundImage: themeArt ? `url(${themeArt.src})` : undefined,
        borderColor: "#EAE6F5",
      }}
    />
  );

  return (
    <div
      data-editor-chrome="top"
      className="h-14 shrink-0 flex items-center justify-between gap-2 px-2 md:px-4 border-b"
      style={{ borderColor: "var(--j-editor-chrome-line)", backgroundColor: "var(--j-editor-chrome)" }}
    >
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        {guest ? (
          // A full load, not a client navigation: the guest editor is a state
          // of /create itself, so this has to land on a fresh page, whose
          // "Your creations" list then includes the deck they just made.
          <a
            href="/create?tool=slides"
            className="p-2 md:-ml-2 shrink-0 rounded-lg text-white/85 hover:bg-white/10 hover:text-white transition-colors"
            title={backLabel}
            aria-label={backLabel}
          >
            <ArrowLeft className="w-4 h-4" />
          </a>
        ) : (
          <Link
            href={home}
            className="p-2 md:-ml-2 shrink-0 rounded-lg text-white/85 hover:bg-white/10 hover:text-white transition-colors"
            title={backLabel}
            aria-label={backLabel}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
        )}
        <Link
          href={home}
          className="hidden md:inline-flex hover:opacity-80 transition-opacity"
          style={{ color: "#fff" }}
        >
          <Wordmark height={22} />
        </Link>
        <span className="hidden md:inline text-white/40">/</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled Slideshow"
          className="min-w-0 flex-1 md:flex-none md:min-w-56 bg-transparent text-sm text-white placeholder:text-white/50 truncate focus:outline-none focus:bg-white/10 focus:px-2 focus:py-1 focus:rounded-lg transition-all"
        />
        <span className="hidden md:inline text-xs text-white/60">{saveLabel}</span>
        {onEditPrompt && (
          <button
            type="button"
            onClick={onEditPrompt}
            disabled={disableHistory}
            className="hidden md:inline-flex ml-1 items-center gap-1.5 text-xs font-semibold rounded-lg border px-2.5 py-1.5 text-white hover:bg-white/10 transition-colors disabled:opacity-40"
            style={{ borderColor: "rgba(255, 255, 255, 0.25)" }}
            title="Edit the original prompt and regenerate"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit prompt
          </button>
        )}
      </div>

      <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
        <button
          onClick={onUndo}
          disabled={disableHistory}
          className={iconBtn}
          title={disableHistory ? "Undo unavailable while generating" : "Undo"}
          aria-label="Undo"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={disableHistory}
          className={iconBtn}
          title={disableHistory ? "Redo unavailable while generating" : "Redo"}
          aria-label="Redo"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        {/* Wide screens: everything in the bar. */}
        <div className="hidden md:flex items-center gap-1">
          <div className="w-px h-6 bg-white/20 mx-2" />
          {onThemeChange && (
            <button
              ref={themeBtnRef}
              type="button"
              onClick={() => setThemeOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-white border border-white/25 rounded-lg hover:bg-white/10 transition-colors"
              title="Switch theme"
            >
              <Palette className="w-3.5 h-3.5" />
              {swatch}
              <span>{activeTheme.name}</span>
            </button>
          )}
          <div className="w-px h-6 bg-white/20 mx-2" />
          <button
            onClick={onPresent}
            data-then="present"
            className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors hover:brightness-95"
            style={{ backgroundColor: "#fff", color: "var(--j-deep)" }}
            title="Present"
          >
            <Play className="w-4 h-4" />
            Present
          </button>
          {/* data-then: a guest who pressed Export on /create and then signed up
              lands here with ?then=export, and ThenAction opens this menu. */}
          <span data-then="export" className="contents">
          <DropdownMenu
            ariaLabel="Export options"
            disabled={isExporting}
            triggerClassName="flex items-center gap-2 bg-[var(--j-lilac)] hover:bg-[var(--j-lilac-2)] text-stone-800 text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            menuClassName="w-56"
            trigger={
              <>
                <Download className="w-4 h-4" />
                {isExporting ? "Exporting..." : "Export"}
                <ChevronDown className="w-4 h-4" />
              </>
            }
            items={[
              { label: "Download PowerPoint (PPTX)", onSelect: () => onExport("pptx") },
              { label: "Download PDF", onSelect: () => onExport("pdf") },
              {
                // Needs Google OAuth and the Slides API.
                label: "Save to Google Slides",
                disabled: true,
                note: "coming soon",
              },
            ]}
          />
          </span>
          {guest && (
            <button
              type="button"
              onClick={guest.onSignUp}
              className="ml-1 text-sm font-bold px-4 py-2 rounded-lg transition-colors hover:brightness-90"
              style={{ backgroundColor: "var(--j-orange)", color: "#fff" }}
            >
              Start free trial
            </button>
          )}
        </div>

        {/* Phones: the rest of the bar, and the sidebar's tabs, behind one
            button rather than run off the edge of the screen. */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className={`md:hidden ${iconBtn}`}
          aria-label="Editor menu"
          aria-expanded={menuOpen}
          aria-controls="editor-menu"
          data-testid="editor-menu-button"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {menuOpen && (
        <div className="md:hidden fixed inset-x-0 top-14 bottom-0 z-70">
          <button
            type="button"
            aria-label="Close menu"
            tabIndex={-1}
            className="absolute inset-0 bg-black/30"
            onClick={() => setMenuOpen(false)}
          />
          <div
            id="editor-menu"
            role="dialog"
            aria-label="Editor menu"
            data-testid="editor-menu"
            className="relative max-h-full overflow-y-auto bg-white rounded-b-2xl shadow-2xl px-3 pt-3 pb-4"
            style={{ color: "var(--j-ink)" }}
          >
            {onOpenTool && (
              <section aria-label="Add to slide">
                <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--j-muted)" }}>
                  Add to slide
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {SIDEBAR_TABS.map((t) => {
                    const locked = !!guest && isGuestLockedTab(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={pick(() => onOpenTool(t.id))}
                        title={locked ? `${t.label}: sign up to use` : undefined}
                        data-locked={locked ? "" : undefined}
                        className="relative flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-colors hover:bg-(--j-tint)"
                        style={{ borderColor: "var(--j-line)", color: locked ? "var(--j-faint)" : "var(--j-deep)" }}
                      >
                        {t.icon}
                        {t.label}
                        {locked && <Lock className="absolute top-1.5 right-1.5 w-3 h-3" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section aria-label="Deck" className="mt-4 pt-3 border-t" style={{ borderColor: "var(--j-line)" }}>
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--j-muted)" }}>
                Deck{saveLabel ? ` · ${saveLabel}` : ""}
              </p>
              {onThemeChange && (
                <button type="button" className={menuRow} onClick={pick(() => setThemeOpen(true))}>
                  <Palette className="w-4 h-4" />
                  <span className="flex-1">Theme</span>
                  {swatch}
                  <span className="text-xs font-medium" style={{ color: "var(--j-muted)" }}>{activeTheme.name}</span>
                </button>
              )}
              <button type="button" className={menuRow} onClick={pick(onPresent)}>
                <Play className="w-4 h-4" />
                Present
              </button>
              <button type="button" className={menuRow} onClick={pick(() => onExport("pptx"))} disabled={isExporting}>
                <Presentation className="w-4 h-4" />
                {isExporting ? "Exporting..." : "Download PowerPoint (PPTX)"}
              </button>
              <button type="button" className={menuRow} onClick={pick(() => onExport("pdf"))} disabled={isExporting}>
                <FileText className="w-4 h-4" />
                Download PDF
              </button>
              {onEditPrompt && (
                <button type="button" className={menuRow} onClick={pick(onEditPrompt)} disabled={disableHistory}>
                  <Pencil className="w-4 h-4" />
                  Edit prompt
                </button>
              )}
            </section>

            {guest && (
              <button
                type="button"
                onClick={pick(guest.onSignUp)}
                className="mt-3 w-full text-sm font-bold px-4 py-3 rounded-xl transition-colors hover:brightness-90"
                style={{ backgroundColor: "var(--j-orange)", color: "#fff" }}
              >
                Start free trial
              </button>
            )}
          </div>
        </div>
      )}

      {themeOpen && (
        // A drawer rather than a dropdown: the picker shows each theme as a
        // rendered slide, which needs room, and stays open while the teacher
        // tries a few on the real deck behind it.
        <div
          ref={themeMenuRef}
          role="dialog"
          aria-label="Choose your theme"
          className="fixed right-3 top-16 bottom-3 w-[440px] max-w-[calc(100vw-1.5rem)] bg-white border rounded-2xl shadow-2xl z-50 flex flex-col"
          style={{ borderColor: "var(--j-line)" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--j-line)" }}>
            <p className="text-sm font-semibold text-gray-900">Choose your theme</p>
            <button
              type="button"
              onClick={() => setThemeOpen(false)}
              aria-label="Close themes"
              className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {onThemeChange && (
              <ThemePicker
                value={activeTheme.id}
                onChange={onThemeChange}
                compact
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
