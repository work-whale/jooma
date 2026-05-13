"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Trash2, ChevronDown, ImagePlus, X, Frame as FrameIcon, Spline, Droplet, Brush, List, ListOrdered, Lock, LockOpen } from "lucide-react";
import FramePicker from "./FramePicker";
import { type FrameShape } from "./frames";
import { isSvgDataUrl, extractSvgColors, swapSvgColor } from "./svg-recolor";
import ColorPicker from "./ColorPicker";
import type { TextObject, ShapeObject, ImageObject, SlideJSON } from "@/app/lib/presentations";

// Swatch-only button. Clicking opens a popover containing the native color picker,
// a hex input, and any caller-provided extra controls (e.g. stroke thickness).
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

  // Transparent / no-color indicator: render a tiny diagonal slash on the swatch.
  const isTransparent = value === "transparent" || value === "#00000000";

  const handleClick = () => {
    if (open) { setOpen(false); return; }
    if (!buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const POPOVER_W = 260;
    // Center popover under the button, clamped so it never spills off either viewport edge.
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

export type EditorSelection =
  | { kind: "text"; text: TextObject }
  | { kind: "shape"; shape: ShapeObject }
  | { kind: "image"; image: ImageObject }
  | { kind: "slide"; slide: SlideJSON }
  | null;

interface Props {
  selection: EditorSelection;
  onUpdateText: (patch: Partial<TextObject>) => void;
  onUpdateShape: (patch: Partial<ShapeObject>) => void;
  onUpdateImage: (patch: Partial<ImageObject>) => void;
  onUpdateSlide: (patch: Partial<SlideJSON>) => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onOpenFontPanel: () => void;
}

function ObjectActions({ locked, onToggleLock, onDelete }: { locked: boolean; onToggleLock: () => void; onDelete: () => void }) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <button onClick={onToggleLock} className={toggleBtn(locked)} title={locked ? "Unlock" : "Lock"}>
        {locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
      </button>
      <button onClick={onDelete} className={toggleBtn(false)} title="Delete">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

const inputClass =
  "h-8 px-2 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-violet-200";

const toggleBtn = (active: boolean) =>
  `h-8 w-8 flex items-center justify-center rounded-md border text-xs transition-colors ${
    active ? "bg-violet-100 border-violet-300 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
  }`;

const pillClass =
  "inline-flex items-center gap-2 px-3 py-2 bg-white rounded-2xl shadow-lg border border-gray-200 max-w-full overflow-x-auto [&::-webkit-scrollbar]:hidden";

export default function ContextualToolbar({
  selection,
  onUpdateText,
  onUpdateShape,
  onUpdateImage,
  onUpdateSlide,
  onDelete,
  onToggleLock,
  onOpenFontPanel,
}: Props) {
  if (!selection) return null;

  if (selection.kind === "slide") {
    return <SlideToolbar slide={selection.slide} onUpdateSlide={onUpdateSlide} />;
  }

  if (selection.kind === "text") {
    const t = selection.text;
    return (
      <div className={pillClass} style={{ scrollbarWidth: "none" }}>
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
        <button
          onClick={() => onUpdateText({ fontWeight: t.fontWeight === "700" || t.fontWeight === "bold" ? "400" : "700" })}
          className={toggleBtn(t.fontWeight === "700" || t.fontWeight === "bold")}
          title="Bold"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onUpdateText({ fontStyle: t.fontStyle === "italic" ? "normal" : "italic" })}
          className={toggleBtn(t.fontStyle === "italic")}
          title="Italic"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onUpdateText({ underline: !t.underline })}
          className={toggleBtn(t.underline)}
          title="Underline"
        >
          <Underline className="w-3.5 h-3.5" />
        </button>
        <ColorPopover
          value={t.color}
          onChange={(c) => onUpdateText({ color: c })}
          title="Text color"
        />
        <div className="w-px h-6 bg-gray-300 mx-1" />
        <button onClick={() => onUpdateText({ textAlign: "left" })} className={toggleBtn(t.textAlign === "left")}>
          <AlignLeft className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onUpdateText({ textAlign: "center" })} className={toggleBtn(t.textAlign === "center")}>
          <AlignCenter className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onUpdateText({ textAlign: "right" })} className={toggleBtn(t.textAlign === "right")}>
          <AlignRight className="w-3.5 h-3.5" />
        </button>
        <div className="w-px h-6 bg-gray-300 mx-1" />
        <button
          onClick={() => onUpdateText({ listType: t.listType === "bullet" ? undefined : "bullet" })}
          className={toggleBtn(t.listType === "bullet")}
          title="Bullet list"
        >
          <List className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onUpdateText({ listType: t.listType === "number" ? undefined : "number" })}
          className={toggleBtn(t.listType === "number")}
          title="Numbered list"
        >
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <ObjectActions locked={!!t.locked} onToggleLock={onToggleLock} onDelete={onDelete} />
      </div>
    );
  }

  if (selection.kind === "shape") {
    const sh = selection.shape;
    const isRect = sh.type === "rect";
    return (
      <div className={pillClass} style={{ scrollbarWidth: "none" }}>
        <ColorPopover
          value={sh.fill}
          onChange={(c) => onUpdateShape({ fill: c })}
          title="Fill"
        />
        <ColorPopover
          value={sh.stroke}
          onChange={(c) => onUpdateShape({ stroke: c })}
          title="Border"
          appearance="stroke"
          extra={
            <label className="flex items-center justify-between gap-2 text-xs text-gray-600">
              <span>Thickness</span>
              <input
                type="range"
                min={0}
                max={40}
                value={sh.strokeWidth}
                onChange={(e) => onUpdateShape({ strokeWidth: Number(e.target.value) })}
                className="accent-violet-600 flex-1"
              />
              <input
                type="number"
                value={sh.strokeWidth}
                min={0}
                max={40}
                onChange={(e) => onUpdateShape({ strokeWidth: Number(e.target.value) })}
                className={`${inputClass} w-12`}
              />
            </label>
          }
        />
        {isRect && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            Radius
            <input
              type="number"
              value={sh.cornerRadius ?? 0}
              min={0}
              max={200}
              onChange={(e) => onUpdateShape({ cornerRadius: Number(e.target.value) })}
              className={`${inputClass} w-14`}
            />
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          Opacity
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={sh.opacity}
            onChange={(e) => onUpdateShape({ opacity: Number(e.target.value) })}
            className="accent-violet-600 w-24"
          />
        </label>
        <ObjectActions locked={!!sh.locked} onToggleLock={onToggleLock} onDelete={onDelete} />
      </div>
    );
  }

  // image
  const im = selection.image;
  const imFrame = (im.frame ?? "none") as FrameShape;
  const cornerRadius = im.cornerRadius ?? (imFrame === "rounded" ? 16 : imFrame === "pill" ? 50 : 0);
  const strokeWidth = im.strokeWidth ?? 0;
  const strokeColor = im.strokeColor ?? "#1a1a2e";
  const isSvg = isSvgDataUrl(im.src);
  // Distinct colors used inside the SVG. Each gets its own swatch in the toolbar
  // so multi-color graphics (unDraw scenes, fluent-emoji) can be recolored channel
  // by channel instead of being flattened to a single tint.
  const svgColors = isSvg ? extractSvgColors(im.src).slice(0, 6) : [];
  return (
    <div className={pillClass} style={{ scrollbarWidth: "none" }}>
      {svgColors.map((c) => (
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
      <FramePopover
        value={imFrame}
        onSelect={(f) => onUpdateImage({ frame: f })}
      />
      <IconPopover
        icon={<Spline className="w-3.5 h-3.5" />}
        label="Roundness"
        isActive={cornerRadius > 0}
      >
        {() => (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={50}
              step={1}
              value={cornerRadius}
              onChange={(e) => onUpdateImage({ cornerRadius: Number(e.target.value) })}
              className="accent-violet-600 flex-1"
            />
            <span className="text-xs font-mono text-gray-600 w-8 text-right">{cornerRadius}</span>
          </div>
        )}
      </IconPopover>
      <IconPopover
        icon={<Brush className="w-3.5 h-3.5" />}
        label="Border"
        isActive={strokeWidth > 0}
      >
        {() => {
          const strokeAlign = im.strokeAlign ?? "inside";
          return (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ColorPopover
                  value={strokeColor}
                  onChange={(c) => onUpdateImage({ strokeColor: c })}
                  appearance="stroke"
                />
                <div className="flex-1 flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={strokeWidth}
                    onChange={(e) => onUpdateImage({ strokeWidth: Number(e.target.value) })}
                    className="accent-violet-600 flex-1"
                  />
                  <span className="text-xs font-mono text-gray-600 w-8 text-right">{strokeWidth}</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Position</p>
                <div className="grid grid-cols-3 gap-1">
                  {(["inside", "center", "outside"] as const).map((pos) => (
                    <button
                      key={pos}
                      onClick={() => onUpdateImage({ strokeAlign: pos })}
                      className={`px-2 py-1 text-[11px] rounded-md border capitalize transition-colors ${
                        strokeAlign === pos
                          ? "bg-violet-100 border-violet-300 text-violet-700"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {pos}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        }}
      </IconPopover>
      <IconPopover
        icon={<Droplet className="w-3.5 h-3.5" />}
        label="Opacity"
        isActive={im.opacity < 1}
      >
        {() => (
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={im.opacity}
              onChange={(e) => onUpdateImage({ opacity: Number(e.target.value) })}
              className="accent-violet-600 flex-1"
            />
            <span className="text-xs font-mono text-gray-600 w-10 text-right">{Math.round(im.opacity * 100)}%</span>
          </div>
        )}
      </IconPopover>
      <ObjectActions locked={!!im.locked} onToggleLock={onToggleLock} onDelete={onDelete} />
    </div>
  );
}

// Generic icon-only button that opens a popover with the given children, and shows a
// dark tooltip beneath on hover. The popover uses fixed positioning to escape the
// toolbar's overflow-x-auto (which would otherwise clip it).
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
    // Center popover under the button, clamped to viewport so it never spills off either edge.
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

function FramePopover({ value, onSelect }: { value: FrameShape; onSelect: (f: FrameShape) => void }) {
  return (
    <IconPopover
      icon={<FrameIcon className="w-3.5 h-3.5" />}
      label="Frame"
      widthPx={256}
      isActive={value !== "none"}
    >
      {(close) => (
        <FramePicker value={value} onSelect={(f) => { onSelect(f); close(); }} columns={4} showLabels />
      )}
    </IconPopover>
  );
}

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
          <button
            type="button"
            onClick={() => onUpdateSlide({
              backgroundImage: undefined,
              backgroundImageWidth: undefined,
              backgroundImageHeight: undefined,
              backgroundOffsetX: undefined,
              backgroundOffsetY: undefined,
              backgroundScale: undefined,
            })}
            className={toggleBtn(false)}
            title="Remove background image"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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
