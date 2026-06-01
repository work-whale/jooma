"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Undo2, Redo2, Download, ArrowLeft, Palette, Check, Play } from "lucide-react";
import { SLIDESHOW_THEMES } from "@/app/lib/slideshowThemes";

interface Props {
  title: string;
  onTitleChange: (v: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onPresent: () => void;
  isExporting: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  disableHistory?: boolean;
  themeId?: string;
  onThemeChange?: (id: string) => void;
}

const iconBtn = "p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40";

export default function EditorTopBar({
  title,
  onTitleChange,
  onUndo,
  onRedo,
  onExport,
  onPresent,
  isExporting,
  saveStatus,
  disableHistory,
  themeId,
  onThemeChange,
}: Props) {
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
      className="h-14 shrink-0 flex items-center justify-between px-4 border-b"
      style={{ borderColor: "#DAD8D0", backgroundColor: "#F1EFE3" }}
    >
      <div className="flex items-center gap-3">
        <Link
          href="/tools/slideshow"
          className="p-2 -ml-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
          title="Back to slideshows"
          aria-label="Back to slideshows"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <Link href="/tools/slideshow" className="hover:opacity-70 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo.svg" alt="Jooma" style={{ height: 22, width: "auto" }} />
        </Link>
        <span className="text-gray-400">/</span>
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled Slideshow"
          className="bg-transparent text-sm text-gray-800 focus:outline-none focus:bg-white focus:px-2 focus:py-1 focus:rounded-lg transition-all min-w-56"
        />
        <span className="text-xs text-gray-400">
          {saveStatus === "saving" && "Saving..."}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Save failed"}
        </span>
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
        <div className="w-px h-6 bg-gray-300 mx-2" />
        {onThemeChange && (
          <div className="relative">
            <button
              ref={themeBtnRef}
              type="button"
              onClick={() => setThemeOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              title="Switch theme"
            >
              <Palette className="w-3.5 h-3.5" />
              <span
                className="inline-block w-3 h-3 rounded-sm border"
                style={{ backgroundColor: activeTheme.palette.background, borderColor: "#DAD8D0" }}
              />
              <span>{activeTheme.name}</span>
            </button>
            {themeOpen && (
              <div
                ref={themeMenuRef}
                className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg p-1 z-50"
              >
                {SLIDESHOW_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onThemeChange(t.id); setThemeOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left rounded-md hover:bg-gray-50"
                  >
                    <span
                      className="inline-block w-5 h-5 rounded-md border shrink-0"
                      style={{ backgroundColor: t.palette.background, borderColor: "#DAD8D0" }}
                    />
                    <span
                      className="inline-block w-1.5 h-5 rounded-sm shrink-0"
                      style={{ backgroundColor: t.palette.accent }}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-gray-800 truncate">{t.name}</span>
                      <span className="block text-[10px] text-gray-500 truncate">{t.description}</span>
                    </span>
                    {t.id === activeTheme.id && <Check className="w-3.5 h-3.5 text-violet-600 shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="w-px h-6 bg-gray-300 mx-2" />
        <button
          onClick={onPresent}
          className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
          title="Present"
        >
          <Play className="w-4 h-4" />
          Present
        </button>
        <button
          onClick={onExport}
          disabled={isExporting}
          className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {isExporting ? "Exporting..." : "Export PPTX"}
        </button>
      </div>
    </div>
  );
}
