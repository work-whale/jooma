"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, Trash2, ChevronDown, ImagePlus, X } from "lucide-react";
import type { TextObject, ShapeObject, ImageObject, SlideJSON } from "@/app/lib/presentations";

// Native color picker swatch + hex text input.
// Click the swatch to open the browser picker, or type a hex value directly.
function ColorField({ value, onChange, title }: { value: string; onChange: (hex: string) => void; title?: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  const commit = () => {
    let v = local.trim();
    if (!v.startsWith("#")) v = "#" + v;
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(v)) {
      if (v.length === 4) {
        v = "#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
      }
      onChange(v.toLowerCase());
    } else {
      setLocal(value);
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 rounded-md border border-gray-200 cursor-pointer p-0.5"
        title={title}
      />
      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
          if (e.key === "Escape") { setLocal(value); (e.currentTarget as HTMLInputElement).blur(); }
        }}
        maxLength={7}
        spellCheck={false}
        className="h-8 w-20 px-2 text-xs font-mono border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 uppercase"
      />
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
        <ColorField
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
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onDelete} className={toggleBtn(false)} title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  if (selection.kind === "shape") {
    const sh = selection.shape;
    const isRect = sh.type === "rect";
    return (
      <div className={pillClass} style={{ scrollbarWidth: "none" }}>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          Fill
          <ColorField value={sh.fill} onChange={(c) => onUpdateShape({ fill: c })} />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          Border
          <ColorField value={sh.stroke} onChange={(c) => onUpdateShape({ stroke: c })} />
          <input
            type="number"
            value={sh.strokeWidth}
            min={0}
            max={40}
            onChange={(e) => onUpdateShape({ strokeWidth: Number(e.target.value) })}
            className={`${inputClass} w-14`}
          />
        </label>
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
        <div className="ml-auto flex items-center gap-1">
          <button onClick={onDelete} className={toggleBtn(false)} title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // image
  const im = selection.image;
  return (
    <div className={pillClass} style={{ scrollbarWidth: "none" }}>
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
      <div className="ml-auto flex items-center gap-1">
        <button onClick={onDelete} className={toggleBtn(false)} title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
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
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        Color
        <ColorField
          value={slide.background ?? "#ffffff"}
          onChange={(c) => onUpdateSlide({ background: c })}
        />
      </label>
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
