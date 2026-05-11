"use client";

import { FRAME_OPTIONS, getFrameStyle, type FrameShape } from "./frames";

interface Props {
  value?: FrameShape;
  onSelect: (frame: FrameShape) => void;
  columns?: number;
  showLabels?: boolean;
}

// Sample image used to preview each frame shape. Picked from Picsum to dodge needing
// a bundled asset, and small enough to be cached. The same URL is reused across all
// preview tiles so it loads once.
const PREVIEW_SRC = "https://picsum.photos/id/1015/120/120";

export default function FramePicker({ value = "none", onSelect, columns = 4, showLabels = false }: Props) {
  return (
    <div
      className={`grid gap-2`}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {FRAME_OPTIONS.map((opt) => {
        const isActive = value === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            title={opt.label}
            className={`flex flex-col items-center gap-1 rounded-lg p-1.5 transition-colors ${
              isActive ? "bg-violet-100" : "hover:bg-gray-100"
            }`}
          >
            <div className="aspect-square w-full bg-gray-100 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={PREVIEW_SRC}
                alt={opt.label}
                draggable={false}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  ...getFrameStyle(opt.id),
                }}
              />
            </div>
            {showLabels && (
              <span className={`text-[10px] ${isActive ? "text-violet-700 font-semibold" : "text-gray-600"}`}>
                {opt.label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
