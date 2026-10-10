"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import MiniSlide from "@/app/components/editor/MiniSlide";
import { injectGoogleFonts } from "@/app/components/editor/googleFonts";
import { renderSlide, type SlideSpec } from "@/app/lib/slideshow-layouts";
import {
  THEME_FAMILIES,
  THEME_TAG_LABEL,
  getTheme,
  getThemesByFamily,
  themeGroupLabel,
  type SlideshowTheme,
  type ThemeFamily,
  type ThemeTag,
} from "@/app/lib/slideshowThemes";

/**
 * The slide theme picker, shared by the wizard's last step and the editor's
 * Theme drawer, so the two can never show different lists.
 *
 * Organised the way teachers asked for it: three families (Playful,
 * Professional, Basic), each with its own designs. Every card is a real slide
 * rendered with that theme, not a swatch, so what a teacher picks is what the
 * deck will look like: the fonts, the title treatment, the photo frame, the
 * callout and the motif.
 */

interface Props {
  value: string;
  onChange: (themeId: string) => void;
  /** The tab to open on. Defaults to the selected theme's family. */
  initialFamily?: ThemeFamily;
  /** Two columns rather than three, for the editor's narrow drawer. */
  compact?: boolean;
  disabled?: boolean;
}

// A small illustration for the sample slide, inline so the previews need no
// network and look the same everywhere: sky, sun, hills and water.
const SAMPLE_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="560" viewBox="0 0 540 560">
    <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8ED2F5"/><stop offset="1" stop-color="#DDF3FF"/></linearGradient></defs>
    <rect width="540" height="560" fill="url(#s)"/>
    <circle cx="410" cy="120" r="56" fill="#FFD25E"/>
    <ellipse cx="150" cy="140" rx="80" ry="34" fill="#FFFFFF"/><ellipse cx="200" cy="124" rx="56" ry="30" fill="#FFFFFF"/>
    <path d="M0 360 C120 250 220 300 300 340 C380 380 460 290 540 330 L540 560 L0 560 Z" fill="#6CC28B"/>
    <path d="M0 430 C140 380 300 470 540 410 L540 560 L0 560 Z" fill="#3E9FCB"/>
    <path d="M60 470 C120 455 180 485 240 470" stroke="#FFFFFF" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.6"/>
  </svg>`,
)}`;

const SAMPLE: SlideSpec = {
  layout: "paper-image-right",
  colorScheme: "light",
  accentColor: "#5B2ED6",
  title: "The Water Cycle",
  subHook: "Where does rain come from?",
  body: "Heat from the Sun **evaporates** water. It cools into **clouds** and falls back as rain.",
  bullets: [],
  calloutVariant: "key",
  calloutLabel: "Key point",
  calloutBody: "The same water goes round and round.",
  imageDataUrl: SAMPLE_IMAGE,
  imageWidth: 540,
  imageHeight: 560,
};

type Filter = { kind: "all" } | { kind: "group"; label: string } | { kind: "tag"; tag: ThemeTag };

export default function ThemePicker({
  value,
  onChange,
  initialFamily,
  compact = false,
  disabled,
}: Props) {
  const [family, setFamily] = useState<ThemeFamily>(initialFamily ?? getTheme(value).family);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });

  // The previews are set in each theme's own fonts.
  useEffect(() => { injectGoogleFonts(); }, []);

  const themes = useMemo(() => getThemesByFamily(family), [family]);

  const chips = useMemo(() => {
    const groups = [...new Set(themes.map(themeGroupLabel).filter((g): g is string => !!g))];
    const tags = [...new Set(themes.flatMap((t) => t.tags ?? []))];
    return { groups, tags };
  }, [themes]);

  const shown = themes.filter((t) =>
    filter.kind === "all"
      ? true
      : filter.kind === "group"
      ? themeGroupLabel(t) === filter.label
      : (t.tags ?? []).includes(filter.tag),
  );

  return (
    <div data-testid="theme-picker" className="space-y-3">
      {/* Families */}
      <div role="tablist" aria-label="Theme style" className="grid grid-cols-3 gap-1 p-1 rounded-xl" style={{ backgroundColor: "var(--j-tint)" }}>
        {THEME_FAMILIES.map((f) => {
          const on = f.id === family;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => { setFamily(f.id); setFilter({ kind: "all" }); }}
              disabled={disabled}
              className="px-2 py-2 rounded-lg text-left transition-colors disabled:opacity-60"
              style={on ? { backgroundColor: "#fff", boxShadow: "0 1px 3px rgba(29,23,48,0.12)" } : undefined}
            >
              <span className="block text-sm font-semibold" style={{ color: on ? "var(--j-purple)" : "var(--j-body)" }}>{f.label}</span>
              {!compact && <span className="block text-[10px] text-gray-500 leading-tight">{f.description}</span>}
            </button>
          );
        })}
      </div>

      {/* Filters */}
      {(chips.groups.length > 0 || chips.tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip on={filter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>All</Chip>
          {chips.groups.map((g) => (
            <Chip key={g} on={filter.kind === "group" && filter.label === g} onClick={() => setFilter({ kind: "group", label: g })}>{g}</Chip>
          ))}
          {chips.tags.map((tag) => (
            <Chip key={tag} on={filter.kind === "tag" && filter.tag === tag} onClick={() => setFilter({ kind: "tag", tag })}>{THEME_TAG_LABEL[tag]}</Chip>
          ))}
        </div>
      )}

      {/* Designs */}
      <div className={`grid gap-3 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {shown.map((t) => (
          <ThemeCard
            key={t.id}
            theme={t}
            selected={t.id === value}
            onSelect={() => onChange(t.id)}
            disabled={disabled}
            width={compact ? 168 : 200}
          />
        ))}
      </div>
    </div>
  );
}

function ThemeCard({
  theme,
  selected,
  onSelect,
  disabled,
  width,
}: {
  theme: SlideshowTheme;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  width: number;
}) {
  // One rendered slide per theme, with its watercolor art where it has any.
  // Cheap: a layout pass over a single spec, and memoised so a re-render of
  // the grid does not redo it.
  const slide = useMemo(() => renderSlide(SAMPLE, theme), [theme]);
  // MiniSlide scales to the exact width it is given, so the card measures
  // itself rather than guessing: the wizard is a dialog on one page and the
  // whole page on /create.
  const frame = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(width);
  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setW(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      data-theme-id={theme.id}
      className="rounded-xl border-2 overflow-hidden text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-60 bg-white"
      style={{ borderColor: selected ? "var(--j-purple)" : "var(--j-line)" }}
    >
      <div ref={frame} className="w-full overflow-hidden pointer-events-none">
        <MiniSlide slide={slide} width={w} themeId={theme.id} />
      </div>
      <div className="px-2.5 py-2 border-t flex items-start justify-between gap-2" style={{ borderColor: selected ? "var(--j-purple)" : "var(--j-line)" }}>
        <div className="min-w-0">
          <p className="text-xs font-semibold truncate" style={{ color: "var(--j-purple)" }}>{theme.name}</p>
          <p className="text-[10px] text-gray-500 truncate">{theme.description}</p>
          {(theme.tags?.length ?? 0) > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {theme.tags!.map((tag) => (
                <span key={tag} className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "var(--j-tint-green)", color: "#0F6E4E" }}>
                  {THEME_TAG_LABEL[tag]}
                </span>
              ))}
            </p>
          )}
        </div>
        {selected && (
          <span className="w-4 h-4 mt-0.5 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--j-purple)" }}>
            <svg viewBox="0 0 20 20" className="w-2.5 h-2.5 text-white fill-current"><path d="M7.6 13.6 4 10l1.4-1.4 2.2 2.2 7-7L16 5.2z" /></svg>
          </span>
        )}
      </div>
    </button>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors"
      style={
        on
          ? { backgroundColor: "var(--j-purple)", borderColor: "var(--j-purple)", color: "#fff" }
          : { backgroundColor: "#fff", borderColor: "var(--j-line)", color: "var(--j-body)" }
      }
    >
      {children}
    </button>
  );
}
