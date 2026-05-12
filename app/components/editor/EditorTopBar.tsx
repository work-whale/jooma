"use client";

import Link from "next/link";
import { Undo2, Redo2, Download, ArrowLeft } from "lucide-react";

interface Props {
  title: string;
  onTitleChange: (v: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  isExporting: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
}

const iconBtn = "p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40";

export default function EditorTopBar({
  title,
  onTitleChange,
  onUndo,
  onRedo,
  onExport,
  isExporting,
  saveStatus,
}: Props) {
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
        <Link href="/tools/slideshow" className="text-xl font-bold text-gray-900 hover:opacity-70">
          Jooma
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
        <button onClick={onUndo} className={iconBtn} title="Undo">
          <Undo2 className="w-4 h-4" />
        </button>
        <button onClick={onRedo} className={iconBtn} title="Redo">
          <Redo2 className="w-4 h-4" />
        </button>
        <div className="w-px h-6 bg-gray-300 mx-2" />
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
