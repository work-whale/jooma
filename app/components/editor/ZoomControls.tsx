"use client";

import { Minus, Plus, Maximize2 } from "lucide-react";

interface Props {
  zoom: number;
  onChange: (zoom: number) => void;
  onFit: () => void;
  /** 0-indexed current slide. When provided alongside `slideCount` the
   *  control bar shows a "Slide N / M" chip so the user always sees their
   *  position in the deck without looking down at the tray. */
  slideIndex?: number;
  slideCount?: number;
}

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;

function nextLevel(z: number) {
  return ZOOM_LEVELS.find((l) => l > z + 0.001) ?? Math.min(z + 0.25, ZOOM_MAX);
}
function prevLevel(z: number) {
  return [...ZOOM_LEVELS].reverse().find((l) => l < z - 0.001) ?? Math.max(z - 0.25, ZOOM_MIN);
}

export default function ZoomControls({ zoom, onChange, onFit, slideIndex, slideCount }: Props) {
  const showCounter = typeof slideIndex === "number" && typeof slideCount === "number" && slideCount > 0;
  return (
    <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-white rounded-xl shadow-lg border border-gray-200 px-1 py-1 z-10">
      {showCounter && (
        <>
          <div
            className="px-2 h-7 flex items-center justify-center text-xs text-gray-700 font-medium tabular-nums"
            title={`Slide ${(slideIndex ?? 0) + 1} of ${slideCount}`}
          >
            {(slideIndex ?? 0) + 1} / {slideCount}
          </div>
          <div className="w-px h-5 bg-gray-200 mx-0.5" />
        </>
      )}
      <button
        onClick={() => onChange(prevLevel(zoom))}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-700"
        title="Zoom out"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => onChange(1)}
        className="px-2 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-xs text-gray-700 font-medium tabular-nums min-w-12"
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={() => onChange(nextLevel(zoom))}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-700"
        title="Zoom in"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <div className="w-px h-5 bg-gray-200 mx-0.5" />
      <button
        onClick={onFit}
        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-700"
        title="Fit to screen"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
