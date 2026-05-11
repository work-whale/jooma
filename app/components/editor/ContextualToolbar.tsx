"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Trash2, ChevronDown, ImagePlus, X, Move, Frame as FrameIcon } from "lucide-react";
import FramePicker from "./FramePicker";
import type { FrameShape } from "./frames";
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
  const [hex, setHex] = useState(value);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setHex(value), [value]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);

  const commit = () => {
    let v = hex.trim();
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v)) {
      if (v.length === 4) v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      onChange(v.toLowerCase());
    } else {
      setHex(value);
    }
  };

  // Transparent / no-color indicator: render a tiny diagonal slash on the swatch.
  const isTransparent = value === "transparent" || value === "#00000000";

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
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
      {open && (
        <div
          className="absolute top-full mt-2 left-0 bg-white rounded-xl shadow-lg p-3 z-50 w-56 border"
          style={{ borderColor: "#DAD8D0" }}
        >
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={isTransparent ? "#ffffff" : value}
              onChange={(e) => onChange(e.target.value)}
              className="h-10 w-10 rounded-md border border-gray-200 cursor-pointer p-0.5 shrink-0"
            />
            <input
              type="text"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setHex(value);
                  (e.currentTarget as HTMLInputElement).blur();
                }
              }}
              maxLength={7}
              spellCheck={false}
              className="flex-1 h-10 px-2 text-xs font-mono border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 uppercase"
            />
            <button
              type="button"
              onClick={() => onChange("transparent")}
              title="Clear color"
              className="h-10 w-10 rounded-md border border-gray-200 hover:border-gray-300 flex items-center justify-center text-gray-500 hover:text-gray-700 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {extra && <div className="mt-3 pt-3 border-t border-gray-100">{extra}</div>}
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
  onOpenFontPanel: () => void;
}

function PositionPopover({
  x,
  y,
  width,
  height,
  onChange,
}: {
  x: number;
  y: number;
  width: number;
  height?: number;
  onChange: (patch: { x?: number; y?: number; width?: number; height?: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className={toggleBtn(open)} title="Position & size">
        <Move className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div
          className="absolute top-full mt-2 right-0 bg-white rounded-xl shadow-lg p-3 z-50 w-56 border"
          style={{ borderColor: "#DAD8D0" }}
        >
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-600">
              X
              <input
                type="number"
                value={Math.round(x)}
                onChange={(e) => onChange({ x: Number(e.target.value) })}
                className={`${inputClass} w-full mt-1`}
              />
            </label>
            <label className="text-xs text-gray-600">
              Y
              <input
                type="number"
                value={Math.round(y)}
                onChange={(e) => onChange({ y: Number(e.target.value) })}
                className={`${inputClass} w-full mt-1`}
              />
            </label>
            <label className="text-xs text-gray-600">
              W
              <input
                type="number"
                value={Math.round(width)}
                min={1}
                onChange={(e) => onChange({ width: Math.max(1, Number(e.target.value)) })}
                className={`${inputClass} w-full mt-1`}
              />
            </label>
            {height !== undefined && (
              <label className="text-xs text-gray-600">
                H
                <input
                  type="number"
                  value={Math.round(height)}
                  min={1}
                  onChange={(e) => onChange({ height: Math.max(1, Number(e.target.value)) })}
                  className={`${inputClass} w-full mt-1`}
                />
              </label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ObjectActions({
  onDelete,
  position,
}: {
  onDelete: () => void;
  position?: {
    x: number;
    y: number;
    width: number;
    height?: number;
    onChange: (patch: { x?: number; y?: number; width?: number; height?: number }) => void;
  };
}) {
  return (
    <div className="ml-auto flex items-center gap-1">
      {position && (
        <PositionPopover
          x={position.x}
          y={position.y}
          width={position.width}
          height={position.height}
          onChange={position.onChange}
        />
      )}
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
        <ObjectActions
          onDelete={onDelete}
          position={{ x: t.x, y: t.y, width: t.width, onChange: onUpdateText }}
        />
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
        <ObjectActions
          onDelete={onDelete}
          position={{ x: sh.x, y: sh.y, width: sh.width, height: sh.height, onChange: onUpdateShape }}
        />
      </div>
    );
  }

  // image
  const im = selection.image;
  return (
    <div className={pillClass} style={{ scrollbarWidth: "none" }}>
      <FramePopover
        value={(im.frame ?? "none") as FrameShape}
        onSelect={(f) => onUpdateImage({ frame: f })}
      />
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        Opacity
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={im.opacity}
          onChange={(e) => onUpdateImage({ opacity: Number(e.target.value) })}
          className="accent-violet-600 w-24"
        />
      </label>
      <ObjectActions
        onDelete={onDelete}
        position={{ x: im.x, y: im.y, width: im.width, height: im.height, onChange: onUpdateImage }}
      />
    </div>
  );
}

function FramePopover({ value, onSelect }: { value: FrameShape; onSelect: (f: FrameShape) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", h);
    return () => window.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`h-8 px-2.5 flex items-center gap-1.5 text-xs font-medium rounded-md border bg-white transition-colors ${
          open ? "border-violet-400 text-violet-700" : "border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
        title="Frame"
      >
        <FrameIcon className="w-3.5 h-3.5" />
        Frame
      </button>
      {open && (
        <div
          className="absolute top-full mt-2 left-0 bg-white rounded-xl shadow-lg p-3 z-50 w-64 border"
          style={{ borderColor: "#DAD8D0" }}
        >
          <FramePicker value={value} onSelect={(f) => { onSelect(f); setOpen(false); }} columns={4} showLabels />
        </div>
      )}
    </div>
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
