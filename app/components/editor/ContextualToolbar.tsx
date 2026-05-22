"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Trash2, ChevronDown, ImagePlus, X, Frame as FrameIcon, Spline, Droplet, Brush, List, ListOrdered, Lock, LockOpen, Maximize2, Square as SquareIcon, Rows3, Pencil } from "lucide-react";
import { SLIDE_W, SLIDE_H } from "./constants";
import FramePicker from "./FramePicker";
import { type FrameShape } from "./frames";
import { isSvgDataUrl, extractSvgColors, swapSvgColor } from "./svg-recolor";
import ColorPicker from "./ColorPicker";
import type { TextObject, ShapeObject, ImageObject, SlideJSON, VideoObject } from "@/app/lib/presentations";

// ────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ────────────────────────────────────────────────────────────────────────────

// Swatch-only button. Clicking opens a popover containing the native color picker,
// a hex input, and any caller-provided extra controls.
function ColorPopover({
  value,
  onChange,
  title,
  appearance = "fill",
  extra,
}: {
  value: string;
  onChange: (hex: string) => void;
  title?: string;
  appearance?: "fill" | "stroke";
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  const isTransparent = value === "transparent" || value === "#00000000";

  const handleClick = () => {
    if (open) { setOpen(false); return; }
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const POPOVER_W = 260;
    const centered = r.left + r.width / 2 - POPOVER_W / 2;
    const clamped = Math.max(8, Math.min(window.innerWidth - POPOVER_W - 8, centered));
    setPopoverPos({ x: clamped, y: r.bottom + 8 });
    setTooltipPos(null);
    setOpen(true);
  };

  return (
    <div className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={() => {
          if (open || !buttonRef.current) return;
          const r = buttonRef.current.getBoundingClientRect();
          setTooltipPos({ x: r.left + r.width / 2, y: r.bottom + 8 });
        }}
        onMouseLeave={() => setTooltipPos(null)}
        className="h-8 w-8 rounded-md border border-gray-200 p-0.5 bg-white hover:border-gray-300"
      >
        {title && tooltipPos && !open && (
          <span
            className="fixed -translate-x-1/2 px-2.5 py-1 rounded-md border text-[11px] font-medium whitespace-nowrap z-100 pointer-events-none shadow-md"
            style={{ left: tooltipPos.x, top: tooltipPos.y, backgroundColor: "#F1EFE3", borderColor: "#DAD8D0", color: "#030303" }}
          >
            {title}
          </span>
        )}
        {appearance === "fill" ? (
          <div
            className="w-full h-full rounded-sm relative overflow-hidden"
            style={{ background: isTransparent ? "#ffffff" : value }}
          >
            {isTransparent && (
              <div className="absolute inset-0" style={{
                background: "linear-gradient(to bottom right, transparent 47%, #ef4444 47%, #ef4444 53%, transparent 53%)",
              }} />
            )}
          </div>
        ) : (
          <div
            className="w-full h-full rounded-sm relative overflow-hidden"
            style={{ border: `3px solid ${isTransparent ? "#d1d5db" : value}` }}
          >
            {isTransparent && (
              <div className="absolute inset-0" style={{
                background: "linear-gradient(to bottom right, transparent 47%, #ef4444 47%, #ef4444 53%, transparent 53%)",
              }} />
            )}
          </div>
        )}
      </button>
      {open && popoverPos && (
        <div
          ref={popoverRef}
          className="fixed bg-white rounded-xl shadow-lg p-3 z-100 border"
          style={{ left: popoverPos.x, top: popoverPos.y, width: 260, borderColor: "#DAD8D0" }}
        >
          <ColorPicker
            value={isTransparent ? "#FFFFFF" : value}
            onChange={onChange}
          />
          <div className="flex items-center justify-end mt-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => onChange("transparent")}
              title="Clear color"
              className="text-[11px] text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
            >
              Clear
            </button>
          </div>
          {extra && <div className="mt-2 pt-2 border-t border-gray-100">{extra}</div>}
        </div>
      )}
    </div>
  );
}

// Generic icon-only button that opens a popover with the given children, and shows a
// tooltip on hover. The popover uses fixed positioning to escape the toolbar's
// overflow-x-auto.
function IconPopover({
  icon,
  label,
  widthPx = 224,
  children,
  isActive,
}: {
  icon: React.ReactNode;
  label: string;
  widthPx?: number;
  children: (close: () => void) => React.ReactNode;
  isActive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  const handleClick = () => {
    if (open) {
      setOpen(false);
      return;
    }
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const centered = r.left + r.width / 2 - widthPx / 2;
    const clamped = Math.max(8, Math.min(window.innerWidth - widthPx - 8, centered));
    setPopoverPos({ x: clamped, y: r.bottom + 8 });
    setTooltipPos(null);
    setOpen(true);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={() => {
          if (open || !buttonRef.current) return;
          const r = buttonRef.current.getBoundingClientRect();
          setTooltipPos({ x: r.left + r.width / 2, y: r.bottom + 8 });
        }}
        onMouseLeave={() => setTooltipPos(null)}
        className={`h-8 w-8 flex items-center justify-center rounded-md border transition-colors ${
          isActive || open
            ? "bg-violet-100 border-violet-300 text-violet-700"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        }`}
      >
        {icon}
      </button>
      {tooltipPos && !open && (
        <span
          className="fixed -translate-x-1/2 px-2.5 py-1 rounded-md border text-[11px] font-medium whitespace-nowrap z-100 pointer-events-none shadow-md"
          style={{ left: tooltipPos.x, top: tooltipPos.y, backgroundColor: "#F1EFE3", borderColor: "#DAD8D0", color: "#030303" }}
        >
          {label}
        </span>
      )}
      {open && popoverPos && (
        <div
          ref={popoverRef}
          className="fixed bg-white rounded-xl shadow-lg p-3 z-100 border"
          style={{ left: popoverPos.x, top: popoverPos.y, width: widthPx, borderColor: "#DAD8D0" }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </>
  );
}

function FramePopover({ value, onSelect, columns = 4, showLabels = true }: {
  value: FrameShape; onSelect: (f: FrameShape) => void; columns?: number; showLabels?: boolean;
}) {
  return (
    <IconPopover
      icon={<FrameIcon className="w-3.5 h-3.5" />}
      label="Frame"
      widthPx={256}
      isActive={value !== "none"}
    >
      {(close) => (
        <FramePicker value={value} onSelect={(f) => { onSelect(f); close(); }} columns={columns} showLabels={showLabels} />
      )}
    </IconPopover>
  );
}

// Roundness/Radius popover. All corner radius values across the editor are now
// in pixels — same semantic for shape rects, images, and videos.
function RadiusTool({ value, onChange, max = 200 }: {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}) {
  return (
    <IconPopover icon={<Spline className="w-3.5 h-3.5" />} label="Roundness" isActive={value > 0}>
      {() => (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={max}
            step={1}
            value={Math.min(value, max)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="accent-violet-600 flex-1 min-w-0"
          />
          <input
            type="number"
            min={0}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.max(0, n));
            }}
            className="h-7 w-12 px-1.5 text-xs text-center font-mono border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
          />
        </div>
      )}
    </IconPopover>
  );
}

function LineHeightTool({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <IconPopover icon={<Rows3 className="w-3.5 h-3.5" />} label="Line height" isActive={value !== 1.2}>
      {() => (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0.8}
            max={3}
            step={0.05}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="accent-violet-600 flex-1 min-w-0"
          />
          <input
            type="number"
            min={0.5}
            max={5}
            step={0.05}
            value={value.toFixed(2)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(Math.max(0.5, Math.min(5, n)));
            }}
            className="h-7 w-14 px-1.5 text-xs text-center font-mono border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
          />
        </div>
      )}
    </IconPopover>
  );
}

function OpacityTool({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <IconPopover icon={<Droplet className="w-3.5 h-3.5" />} label="Opacity" isActive={value < 1}>
      {() => (
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="accent-violet-600 flex-1"
          />
          <span className="text-xs font-mono text-gray-600 w-10 text-right">{Math.round(value * 100)}%</span>
        </div>
      )}
    </IconPopover>
  );
}

// Border popover. Optional align controls (image-only) are gated by `onAlignChange`.
function BorderTool({
  color, width, align, maxWidth,
  onColorChange, onWidthChange, onAlignChange,
}: {
  color: string;
  width: number;
  align?: "inside" | "center" | "outside";
  maxWidth: number;
  onColorChange: (c: string) => void;
  onWidthChange: (w: number) => void;
  onAlignChange?: (a: "inside" | "center" | "outside") => void;
}) {
  return (
    <IconPopover icon={<Brush className="w-3.5 h-3.5" />} label="Border" isActive={width > 0}>
      {() => (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ColorPopover value={color} onChange={onColorChange} appearance="stroke" />
            <input
              type="range"
              min={0}
              max={maxWidth}
              step={1}
              value={width}
              onChange={(e) => onWidthChange(Number(e.target.value))}
              className="accent-violet-600 flex-1 min-w-0"
            />
            <input
              type="number"
              min={0}
              max={maxWidth}
              value={width}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) onWidthChange(Math.max(0, Math.min(maxWidth, n)));
              }}
              className="h-7 w-12 px-1.5 text-xs text-center font-mono border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0"
            />
          </div>
          {onAlignChange && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Position</p>
              <div className="grid grid-cols-3 gap-1">
                {(["inside", "center", "outside"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => onAlignChange(pos)}
                    className={`px-2 py-1 text-[11px] rounded-md border capitalize transition-colors ${
                      align === pos
                        ? "bg-violet-100 border-violet-300 text-violet-700"
                        : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </IconPopover>
  );
}

function ObjectActions({ locked, onToggleLock, onDelete }: { locked: boolean; onToggleLock: () => void; onDelete: () => void }) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <ToolbarButton
        icon={locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
        label={locked ? "Unlock" : "Lock"}
        onClick={onToggleLock}
        active={locked}
      />
      <ToolbarButton
        icon={<Trash2 className="w-3.5 h-3.5" />}
        label="Delete"
        onClick={onDelete}
      />
    </div>
  );
}

const inputClass =
  "h-8 px-2 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-inner-spin-button]:m-0";

// Single source of truth for the idle/hover/active styling of every 8×8
// toolbar button. IconPopover and the standalone action buttons (lock,
// delete, regenerate, fit, …) both use this so the bar looks uniform.
const toggleBtn = (active: boolean) =>
  `h-8 w-8 flex items-center justify-center rounded-md border transition-colors ${
    active
      ? "bg-violet-100 border-violet-300 text-violet-700"
      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
  }`;

// Plain action button with the SAME hover/active styling AND the SAME custom
// tooltip as IconPopover. Used for lock, delete, regenerate, fit-to-slide,
// fit-to-ratio — anything that fires an action immediately instead of opening
// a popover. Without this, the lock/delete/etc. buttons fell back to the
// native browser `title` tooltip, which felt slow and differently styled
// compared to the IconPopover ones.
function ToolbarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        disabled={disabled}
        onMouseEnter={() => {
          if (!buttonRef.current || disabled) return;
          const r = buttonRef.current.getBoundingClientRect();
          setTooltipPos({ x: r.left + r.width / 2, y: r.bottom + 8 });
        }}
        onMouseLeave={() => setTooltipPos(null)}
        className={toggleBtn(!!active) + " disabled:opacity-50"}
      >
        {icon}
      </button>
      {tooltipPos && (
        <span
          className="fixed -translate-x-1/2 px-2.5 py-1 rounded-md border text-[11px] font-medium whitespace-nowrap z-100 pointer-events-none shadow-md"
          style={{ left: tooltipPos.x, top: tooltipPos.y, backgroundColor: "#F1EFE3", borderColor: "#DAD8D0", color: "#030303" }}
        >
          {label}
        </span>
      )}
    </>
  );
}

const pillClass =
  "inline-flex items-center gap-2 px-3 py-2 bg-white rounded-2xl shadow-lg border border-gray-200 max-w-full overflow-x-auto [&::-webkit-scrollbar]:hidden";

// Strip any pre-existing list markers so the toolbar's bullet/number rendering
// doesn't double up. Also splits mid-line bullets onto their own lines.
function stripListPrefixes(text: string): string {
  const normalized = text
    .replace(/([^\n])[ \t]+([•·▪‣◦●○■])[ \t]+/g, "$1\n$2 ")
    .replace(/([^\n])[ \t]+(\d+[.)])[ \t]+/g, "$1\n$2 ");
  return normalized
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[•·▪‣◦●○■\-*]+|\d+[.)])\s+/, "").trim())
    .filter((line, i, arr) => line || i < arr.length - 1)
    .join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// Selection model + main component
// ────────────────────────────────────────────────────────────────────────────

export type EditorSelection =
  | { kind: "text"; text: TextObject }
  | { kind: "shape"; shape: ShapeObject }
  | { kind: "image"; image: ImageObject }
  | { kind: "video"; video: VideoObject }
  | { kind: "slide"; slide: SlideJSON }
  | null;

interface Props {
  selection: EditorSelection;
  onUpdateText: (patch: Partial<TextObject>) => void;
  onUpdateShape: (patch: Partial<ShapeObject>) => void;
  onUpdateImage: (patch: Partial<ImageObject>) => void;
  onUpdateVideo: (patch: Partial<VideoObject>) => void;
  onUpdateSlide: (patch: Partial<SlideJSON>) => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onOpenFontPanel: () => void;
  /** Opens the right-side "Edit video" panel — which contains both the URL
   *  paste flow and the AI-search flow. Toolbar just triggers it. */
  onOpenEditVideo?: () => void;
}

// One toolbar to rule them all. Tools that don't apply to the current selection
// simply don't render. Each tool component (OpacityTool, RadiusTool, BorderTool,
// …) is shared across element types so the UI stays consistent — same icon,
// same popover layout, same active-state indicator.
export default function ContextualToolbar({
  selection,
  onUpdateText,
  onUpdateShape,
  onUpdateImage,
  onUpdateVideo,
  onUpdateSlide,
  onDelete,
  onToggleLock,
  onOpenFontPanel,
  onOpenEditVideo,
}: Props) {
  if (!selection) return null;

  // Slides have a fundamentally different toolset (background, no lock/delete);
  // route them to a dedicated render to keep the main branch clean.
  if (selection.kind === "slide") {
    return <SlideToolbar slide={selection.slide} onUpdateSlide={onUpdateSlide} />;
  }

  const t = selection.kind === "text" ? selection.text : null;
  const sh = selection.kind === "shape" ? selection.shape : null;
  const im = selection.kind === "image" ? selection.image : null;
  const v = selection.kind === "video" ? selection.video : null;

  // Frame state (image + video share the frame system).
  const imFrame = (im?.frame ?? "none") as FrameShape;
  const vFrame = (v?.frame ?? "none") as FrameShape;

  // Effective corner radius in px — fall back to frame-specific defaults so the
  // slider starts at the visible value rather than 0. Pill always reads back as
  // 0 in the slider since its radius is "max"; tweaking it doesn't make sense.
  const imCorner = im ? (im.cornerRadius ?? (imFrame === "rounded" ? 32 : 0)) : 0;
  const vCorner = v ? (v.cornerRadius ?? (vFrame === "rounded" ? 32 : 0)) : 0;
  const vShowRadius = vFrame === "rounded" || vFrame === "none";

  // SVG color channels — only meaningful for vector graphics so we can swap them.
  const isSvg = im ? isSvgDataUrl(im.src) : false;
  const svgColors = isSvg && im ? extractSvgColors(im.src).slice(0, 6) : [];

  const locked = !!(t?.locked || sh?.locked || im?.locked || v?.locked);

  return (
    <div className={pillClass} style={{ scrollbarWidth: "none" }}>
      {/* ── Text-only controls ──────────────────────────────────────────── */}
      {t && (
        <>
          <button
            type="button"
            onClick={onOpenFontPanel}
            className="h-8 px-2.5 flex items-center gap-1.5 border border-gray-200 rounded-md bg-white text-xs text-gray-800 hover:bg-gray-50 min-w-32"
            title="Change font"
          >
            <span className="truncate" style={{ fontFamily: t.fontFamily }}>
              {t.fontFamily.split(",")[0].replace(/['"]/g, "")}
            </span>
            <ChevronDown className="w-3 h-3 text-gray-500 ml-auto shrink-0" />
          </button>
          <input
            type="number"
            value={t.fontSize}
            min={8}
            max={300}
            onChange={(e) => onUpdateText({ fontSize: Number(e.target.value) })}
            className={`${inputClass} w-16`}
          />
          <ToolbarButton
            icon={<Bold className="w-3.5 h-3.5" />}
            label="Bold"
            onClick={() => onUpdateText({ fontWeight: t.fontWeight === "700" || t.fontWeight === "bold" ? "400" : "700" })}
            active={t.fontWeight === "700" || t.fontWeight === "bold"}
          />
          <ToolbarButton
            icon={<Italic className="w-3.5 h-3.5" />}
            label="Italic"
            onClick={() => onUpdateText({ fontStyle: t.fontStyle === "italic" ? "normal" : "italic" })}
            active={t.fontStyle === "italic"}
          />
          <ToolbarButton
            icon={<Underline className="w-3.5 h-3.5" />}
            label="Underline"
            onClick={() => onUpdateText({ underline: !t.underline })}
            active={t.underline}
          />
          <ColorPopover value={t.color} onChange={(c) => onUpdateText({ color: c })} title="Text color" />
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <ToolbarButton
            icon={<AlignLeft className="w-3.5 h-3.5" />}
            label="Align left"
            onClick={() => onUpdateText({ textAlign: "left" })}
            active={t.textAlign === "left"}
          />
          <ToolbarButton
            icon={<AlignCenter className="w-3.5 h-3.5" />}
            label="Align center"
            onClick={() => onUpdateText({ textAlign: "center" })}
            active={t.textAlign === "center"}
          />
          <ToolbarButton
            icon={<AlignRight className="w-3.5 h-3.5" />}
            label="Align right"
            onClick={() => onUpdateText({ textAlign: "right" })}
            active={t.textAlign === "right"}
          />
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <ToolbarButton
            icon={<List className="w-3.5 h-3.5" />}
            label="Bullet list"
            onClick={() => {
              const enabling = t.listType !== "bullet";
              onUpdateText({
                listType: enabling ? "bullet" : undefined,
                ...(enabling ? { text: stripListPrefixes(t.text) } : {}),
              });
            }}
            active={t.listType === "bullet"}
          />
          <ToolbarButton
            icon={<ListOrdered className="w-3.5 h-3.5" />}
            label="Numbered list"
            onClick={() => {
              const enabling = t.listType !== "number";
              onUpdateText({
                listType: enabling ? "number" : undefined,
                ...(enabling ? { text: stripListPrefixes(t.text) } : {}),
              });
            }}
            active={t.listType === "number"}
          />
          <LineHeightTool
            value={t.lineHeight ?? 1.2}
            onChange={(v2) => onUpdateText({ lineHeight: v2 })}
          />
        </>
      )}

      {/* ── Shape fill ──────────────────────────────────────────────────── */}
      {sh && <ColorPopover value={sh.fill} onChange={(c) => onUpdateShape({ fill: c })} title="Fill" />}

      {/* ── SVG channel colors (image only, only for SVG sources) ───────── */}
      {im && svgColors.map((c) => (
        <ColorPopover
          key={c}
          value={c}
          onChange={(newC) => {
            const newSrc = swapSvgColor(im.src, c, newC);
            if (newSrc) onUpdateImage({ src: newSrc });
          }}
          title="Color"
        />
      ))}

      {/* ── Frame (image + video) ───────────────────────────────────────── */}
      {im && <FramePopover value={imFrame} onSelect={(f) => onUpdateImage({ frame: f })} />}
      {v && (
        <FramePopover
          value={vFrame}
          onSelect={(f) => onUpdateVideo({ frame: f, cornerRadius: undefined })}
          columns={3}
          showLabels={false}
        />
      )}

      {/* ── Roundness / Radius (shape rect, image, video) ───────────────── */}
      {sh && sh.type === "rect" && (
        <RadiusTool
          value={sh.cornerRadius ?? 0}
          onChange={(v2) => onUpdateShape({ cornerRadius: v2 })}
        />
      )}
      {im && (imFrame === "rounded" || imFrame === "none") && (
        <RadiusTool
          value={imCorner}
          onChange={(v2) => onUpdateImage({ cornerRadius: v2 })}
        />
      )}
      {v && vShowRadius && (
        <RadiusTool
          value={vCorner}
          onChange={(v2) => onUpdateVideo({ cornerRadius: v2 })}
        />
      )}

      {/* ── Video: open the Edit-video side panel (URL paste + AI search) ── */}
      {v && onOpenEditVideo && (
        <ToolbarButton
          icon={<Pencil className="w-3.5 h-3.5" />}
          label="Edit video"
          onClick={onOpenEditVideo}
        />
      )}

      {/* ── Border (shape + image) ──────────────────────────────────────── */}
      {sh && (
        <BorderTool
          color={sh.stroke}
          width={sh.strokeWidth}
          maxWidth={40}
          onColorChange={(c) => onUpdateShape({ stroke: c })}
          onWidthChange={(w) => onUpdateShape({ strokeWidth: w })}
        />
      )}
      {im && (
        <BorderTool
          color={im.strokeColor ?? "#1a1a2e"}
          width={im.strokeWidth ?? 0}
          align={im.strokeAlign ?? "inside"}
          maxWidth={100}
          onColorChange={(c) => onUpdateImage({ strokeColor: c })}
          onWidthChange={(w) => onUpdateImage({ strokeWidth: w })}
          onAlignChange={(a) => onUpdateImage({ strokeAlign: a })}
        />
      )}

      {/* ── Opacity (shape + image) ─────────────────────────────────────── */}
      {sh && <OpacityTool value={sh.opacity} onChange={(v2) => onUpdateShape({ opacity: v2 })} />}
      {im && <OpacityTool value={im.opacity} onChange={(v2) => onUpdateImage({ opacity: v2 })} />}

      {/* ── Image-only fit controls ─────────────────────────────────────── */}
      {im && (
        <>
          <ToolbarButton
            icon={<Maximize2 className="w-3.5 h-3.5" />}
            label="Fit to slide"
            onClick={() => {
              onUpdateImage({
                x: 0, y: 0, width: SLIDE_W, height: SLIDE_H,
                innerOffsetX: 0, innerOffsetY: 0, innerScale: 1,
                rotation: 0,
              });
            }}
          />
          <ToolbarButton
            icon={<SquareIcon className="w-3.5 h-3.5" />}
            label="Fit to original ratio"
            onClick={() => {
              const nw = im.naturalWidth, nh = im.naturalHeight;
              if (nw && nh) {
                onUpdateImage({
                  height: Math.round(im.width * (nh / nw)),
                  innerOffsetX: 0, innerOffsetY: 0, innerScale: 1,
                });
              } else {
                onUpdateImage({
                  height: im.width,
                  innerOffsetX: 0, innerOffsetY: 0, innerScale: 1,
                });
              }
            }}
          />
        </>
      )}

      <ObjectActions locked={locked} onToggleLock={onToggleLock} onDelete={onDelete} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Slide toolbar — kept separate because its toolset (background only, no
// lock/delete) doesn't overlap with element controls.
// ────────────────────────────────────────────────────────────────────────────

function SlideToolbar({
  slide,
  onUpdateSlide,
}: {
  slide: SlideJSON;
  onUpdateSlide: (patch: Partial<SlideJSON>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      const img = new window.Image();
      img.onload = () => {
        onUpdateSlide({
          backgroundImage: dataUrl,
          backgroundImageWidth: img.naturalWidth,
          backgroundImageHeight: img.naturalHeight,
          backgroundOffsetX: 0,
          backgroundOffsetY: 0,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={pillClass} style={{ scrollbarWidth: "none" }}>
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Slide</span>
      <ColorPopover
        value={slide.background ?? "#ffffff"}
        onChange={(c) => onUpdateSlide({ background: c })}
        title="Background color"
      />
      <div className="w-px h-6 bg-gray-300 mx-1" />
      {slide.backgroundImage ? (
        <>
          <div className="h-8 w-12 rounded-md border border-gray-200 overflow-hidden bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slide.backgroundImage} alt="" className="w-full h-full object-cover" />
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="h-8 px-3 text-xs font-medium border border-gray-200 rounded-md bg-white hover:bg-gray-50 text-gray-700"
          >
            Replace
          </button>
          <ToolbarButton
            icon={<X className="w-3.5 h-3.5" />}
            label="Remove background image"
            onClick={() => onUpdateSlide({
              backgroundImage: undefined,
              backgroundImageWidth: undefined,
              backgroundImageHeight: undefined,
              backgroundOffsetX: undefined,
              backgroundOffsetY: undefined,
              backgroundScale: undefined,
            })}
          />
        </>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium border border-gray-200 rounded-md bg-white hover:bg-gray-50 text-gray-700"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          Add image
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
