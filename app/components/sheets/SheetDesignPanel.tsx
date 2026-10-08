"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { THEME_FAMILIES, THEME_TAG_LABEL, type ThemeFamily } from "@/app/lib/slideshowThemes";
import { getSheetTheme, SHEET_THEMES, type SheetTheme } from "@/app/lib/sheets/themes";
import type { SheetDesign, SheetDoc } from "@/app/lib/sheets/types";

/*
 * The Design panel: a sheet's theme, text size and page setup. Every change is
 * an ordinary edit, so it autosaves and undoes like the rest.
 *
 * Themes come in the slide themes' three families, on the same three tabs, so
 * a teacher who picked "Playful" for a deck finds the same idea here.
 */

const SIZES: { id: SheetDesign["fontScale"]; label: string }[] = [
  { id: "s", label: "S" },
  { id: "m", label: "M" },
  { id: "l", label: "L" },
  { id: "xl", label: "XL" },
];

export default function SheetDesignPanel({
  doc,
  onDesign,
  onClose,
}: {
  doc: SheetDoc;
  onDesign: (patch: Partial<SheetDesign>) => void;
  onClose: () => void;
}) {
  const design = doc.design;
  const current = getSheetTheme(design.themeId);
  const [family, setFamily] = useState<ThemeFamily>(current.family);
  const hasPassage = doc.sections.some((s) => s.blocks.some((b) => b.type === "passage"));

  return (
    <aside className="flex flex-col gap-5 p-4 bg-white border border-gray-200 rounded-2xl shadow-sm" aria-label="Design" data-testid="sheet-design-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Design</h3>
        <button type="button" onClick={onClose} aria-label="Close design" className="p-1 rounded-md text-gray-500 hover:bg-gray-100 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>

      <section className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Theme</p>
        <div role="tablist" aria-label="Theme style" className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl">
          {THEME_FAMILIES.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={family === f.id}
              onClick={() => setFamily(f.id)}
              className={`text-xs font-semibold py-1.5 rounded-lg cursor-pointer transition-colors ${family === f.id ? "bg-white text-stone-800 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {SHEET_THEMES.filter((t) => t.family === family).map((t) => (
            <ThemeCard key={t.id} theme={t} selected={t.id === design.themeId} onPick={() => onDesign({ themeId: t.id })} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Text size</p>
        <div className="grid grid-cols-4 gap-1 p-1 bg-gray-100 rounded-xl" role="radiogroup" aria-label="Text size">
          {SIZES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={design.fontScale === s.id}
              onClick={() => onDesign({ fontScale: s.id })}
              className={`text-xs font-semibold py-1.5 rounded-lg cursor-pointer ${design.fontScale === s.id ? "bg-white text-stone-800 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Page</p>
        <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl" role="radiogroup" aria-label="Paper size">
          {(["a4", "letter"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={design.paper === p}
              onClick={() => onDesign({ paper: p })}
              className={`text-xs font-semibold py-1.5 rounded-lg cursor-pointer ${design.paper === p ? "bg-white text-stone-800 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
            >
              {p === "a4" ? "A4" : "US Letter"}
            </button>
          ))}
        </div>
        <Toggle label="Name and date lines" checked={design.nameDate} onChange={(nameDate) => onDesign({ nameDate })} />
        <Toggle label="Answers page" checked={design.answers} onChange={(answers) => onDesign({ answers })} />
        {hasPassage && <Toggle label="Paragraph numbers" checked={design.lineNumbers} onChange={(lineNumbers) => onDesign({ lineNumbers })} />}
      </section>
    </aside>
  );
}

function ThemeCard({ theme, selected, onPick }: { theme: SheetTheme; selected: boolean; onPick: () => void }) {
  const c = theme.colors;
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      data-sheet-theme={theme.id}
      className={`flex items-stretch gap-3 p-2 rounded-xl border text-left cursor-pointer transition-colors ${selected ? "border-(--j-purple) ring-2 ring-(--j-purple)/25" : "border-gray-200 hover:border-gray-300"}`}
    >
      <span
        aria-hidden="true"
        className="relative shrink-0 w-16 h-20 rounded-md overflow-hidden border"
        style={{ background: c.paper, borderColor: c.line }}
      >
        <span className="absolute left-1.5 right-1.5 top-1.5 h-4 rounded-sm flex items-center px-1" style={{ background: c.soft }}>
          <span style={{ fontFamily: theme.fonts.heading, color: c.heading, fontWeight: 700, fontSize: 10, lineHeight: 1 }}>Aa</span>
        </span>
        <span className="absolute left-1.5 top-7.5 w-3 h-3 rounded-full" style={{ background: c.heading }} />
        <span className="absolute left-6 right-1.5 top-8 h-1 rounded-full" style={{ background: c.line }} />
        <span className="absolute left-1.5 right-1.5 top-12 h-6 rounded-sm" style={{ background: c.panel, border: `1px solid ${c.accent}` }} />
      </span>
      <span className="flex flex-col gap-0.5 min-w-0 py-0.5">
        <span className="text-sm font-semibold text-gray-900" style={{ fontFamily: theme.fonts.heading }}>{theme.name}</span>
        <span className="text-xs text-gray-500 leading-snug">{theme.description}</span>
        {theme.tags && theme.tags.length > 0 && (
          <span className="flex flex-wrap gap-1 mt-1">
            {theme.tags.map((t) => (
              <span key={t} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{THEME_TAG_LABEL[t]}</span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 py-1 text-sm text-gray-800 cursor-pointer">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-(--j-purple) cursor-pointer" />
    </label>
  );
}
