"use client";

import { Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import type { FabricSelection } from "./Canvas";

interface Props {
  selection: FabricSelection;
  onUpdate: (props: Record<string, unknown>) => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onDelete: () => void;
}

const FONT_OPTIONS = [
  "Inter, sans-serif",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Bricolage Grotesque, sans-serif",
];

const inputClass =
  "h-8 px-2 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-violet-200";
const toggleBtn = (active: boolean) =>
  `h-8 w-8 flex items-center justify-center rounded-md border text-xs transition-colors ${
    active ? "bg-violet-100 border-violet-300 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
  }`;

export default function ContextualToolbar({ selection, onUpdate, onBringForward, onSendBackward, onDelete }: Props) {
  if (!selection) {
    return (
      <div
        className="h-12 shrink-0 border-b flex items-center px-4 text-xs text-gray-400"
        style={{ borderColor: "#DAD8D0", backgroundColor: "#F1EFE3" }}
      >
        Select an element to edit its properties.
      </div>
    );
  }

  const t = selection.type;
  const isText = t === "Textbox" || t === "IText" || t === "Text";
  const isShape = t === "Rect" || t === "Ellipse" || t === "Triangle" || t === "Line";
  const isRect = t === "Rect";
  const isImage = t === "Image" || t === "FabricImage";

  return (
    <div
      className="h-12 shrink-0 border-b flex items-center gap-2 px-4 overflow-x-auto"
      style={{ borderColor: "#DAD8D0", backgroundColor: "#F1EFE3" }}
    >
      {isText && (
        <>
          <select
            value={(selection.fontFamily as string) ?? "Inter, sans-serif"}
            onChange={(e) => onUpdate({ fontFamily: e.target.value })}
            className={inputClass}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>{f.split(",")[0]}</option>
            ))}
          </select>
          <input
            type="number"
            value={(selection.fontSize as number) ?? 24}
            min={8}
            max={300}
            onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
            className={`${inputClass} w-16`}
          />
          <button
            onClick={() => onUpdate({ fontWeight: selection.fontWeight === "bold" ? "normal" : "bold" })}
            className={toggleBtn(selection.fontWeight === "bold")}
            title="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onUpdate({ fontStyle: selection.fontStyle === "italic" ? "normal" : "italic" })}
            className={toggleBtn(selection.fontStyle === "italic")}
            title="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onUpdate({ underline: !selection.underline })}
            className={toggleBtn(!!selection.underline)}
            title="Underline"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>
          <input
            type="color"
            value={(selection.fill as string) || "#000000"}
            onChange={(e) => onUpdate({ fill: e.target.value })}
            className="h-8 w-8 rounded-md border border-gray-200 cursor-pointer p-0.5"
            title="Text color"
          />
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <button
            onClick={() => onUpdate({ textAlign: "left" })}
            className={toggleBtn(selection.textAlign === "left")}
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onUpdate({ textAlign: "center" })}
            className={toggleBtn(selection.textAlign === "center")}
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onUpdate({ textAlign: "right" })}
            className={toggleBtn(selection.textAlign === "right")}
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </>
      )}

      {isShape && (
        <>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            Fill
            <input
              type="color"
              value={(selection.fill as string) || "#000000"}
              onChange={(e) => onUpdate({ fill: e.target.value })}
              className="h-8 w-8 rounded-md border border-gray-200 cursor-pointer p-0.5"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            Border
            <input
              type="color"
              value={(selection.stroke as string) || "#000000"}
              onChange={(e) => onUpdate({ stroke: e.target.value })}
              className="h-8 w-8 rounded-md border border-gray-200 cursor-pointer p-0.5"
            />
            <input
              type="number"
              value={(selection.strokeWidth as number) ?? 0}
              min={0}
              max={20}
              onChange={(e) => onUpdate({ strokeWidth: Number(e.target.value) })}
              className={`${inputClass} w-14`}
            />
          </label>
          {isRect && (
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              Radius
              <input
                type="number"
                value={(selection.rx as number) ?? 0}
                min={0}
                max={100}
                onChange={(e) => onUpdate({ rx: Number(e.target.value), ry: Number(e.target.value) })}
                className={`${inputClass} w-14`}
              />
            </label>
          )}
        </>
      )}

      {(isShape || isImage) && (
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          Opacity
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={(selection.opacity as number) ?? 1}
            onChange={(e) => onUpdate({ opacity: Number(e.target.value) })}
            className="accent-violet-600 w-24"
          />
        </label>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button onClick={onSendBackward} className={toggleBtn(false)} title="Send backward">
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button onClick={onBringForward} className={toggleBtn(false)} title="Bring forward">
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={onDelete} className={toggleBtn(false)} title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
