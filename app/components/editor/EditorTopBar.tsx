"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Undo2, Redo2, Download, ArrowLeft, Palette, Play, Pencil, ChevronDown, X } from "lucide-react";
import DropdownMenu from "@/app/components/ui/DropdownMenu";
import Wordmark from "@/app/components/v2/Wordmark";
import ThemePicker from "@/app/components/slideshow/ThemePicker";
import { SLIDESHOW_THEMES, getThemeArt, type ArtStyleId } from "@/app/lib/slideshowThemes";

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
}

// Light on the dark purple bar (--j-editor-chrome).
const iconBtn = "p-2 rounded-lg text-white/85 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-40";

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
}: Props) {
  const home = guest ? "/" : "/tools/slideshow";
  const backLabel = guest ? "Back to your creations" : "Back to slideshows";
  const [themeOpen, setThemeOpen] = useState(false);
  const themeBtnRef = useRef<HTMLButtonElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const activeTheme = SLIDESHOW_THEMES.find((t) => t.id === themeId) ?? SLIDESHOW_THEMES[0];

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

  return (
    <div
      data-editor-chrome="top"
      className="h-14 shrink-0 flex items-center justify-between px-4 border-b"
      style={{ borderColor: "var(--j-editor-chrome-line)", backgroundColor: "var(--j-editor-chrome)" }}
    >
      <div className="flex items-center gap-3">
        {guest ? (
          // A full load, not a client navigation: the guest editor is a state
          // of /create itself, so this has to land on a fresh page, whose
          // "Your creations" list then includes the deck they just made.
          <a
            href="/create?tool=slides"
            className="p-2 -ml-2 rounded-lg text-white/85 hover:bg-white/10 hover:text-white transition-colors"
            title={backLabel}
            aria-label={backLabel}
          >
            <ArrowLeft className="w-4 h-4" />
          </a>
        ) : (
          <Link
            href={home}
            className="p-2 -ml-2 rounded-lg text-white/85 hover:bg-white/10 hover:text-white transition-colors"
            title={backLabel}
            aria-label={backLabel}
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
        )}
        <Link
          href={home}
          className="hover:opacity-80 transition-opacity"
          style={{ color: "#fff" }}
        >
          <Wordmark height={22} />
        </Link>
        <span className="text-white/40">/</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled Slideshow"
          className="bg-transparent text-sm text-white placeholder:text-white/50 focus:outline-none focus:bg-white/10 focus:px-2 focus:py-1 focus:rounded-lg transition-all min-w-56"
        />
        <span className="text-xs text-white/60">
          {saveStatus === "saving" && "Saving..."}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Save failed"}
        </span>
        {onEditPrompt && (
          <button
            type="button"
            onClick={onEditPrompt}
            disabled={disableHistory}
            className="ml-1 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border px-2.5 py-1.5 text-white hover:bg-white/10 transition-colors disabled:opacity-40"
            style={{ borderColor: "rgba(255, 255, 255, 0.25)" }}
            title="Edit the original prompt and regenerate"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit prompt
          </button>
        )}
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={disableHistory}
          className={iconBtn}
          title={disableHistory ? "Undo unavailable while generating" : "Undo"}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={onRedo}
          disabled={disableHistory}
          className={iconBtn}
          title={disableHistory ? "Redo unavailable while generating" : "Redo"}
        >
          <Redo2 className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-white/20 mx-2" />
        {onThemeChange && (
          <div className="relative">
            <button
              ref={themeBtnRef}
              type="button"
              onClick={() => setThemeOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-white border border-white/25 rounded-lg hover:bg-white/10 transition-colors"
              title="Switch theme"
            >
              <Palette className="w-3.5 h-3.5" />
              <span
                className="inline-block w-3 h-3 rounded-sm border bg-cover bg-center"
                style={{
                  backgroundColor: activeTheme.palette.background,
                  backgroundImage: (() => {
                    const a = getThemeArt(activeTheme, artStyle ?? "watercolor");
                    return a ? `url(${a.src})` : undefined;
                  })(),
                  borderColor: "#EAE6F5",
                }}
              />
              <span>{activeTheme.name}</span>
            </button>
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
                  <ThemePicker
                    value={activeTheme.id}
                    onChange={onThemeChange}
                    compact
                  />
                </div>
              </div>
            )}
          </div>
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
    </div>
  );
}
