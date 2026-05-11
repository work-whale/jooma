"use client";

import { Plus, Trash2 } from "lucide-react";
import MiniSlide from "./MiniSlide";
import type { SlideJSON } from "@/app/lib/presentations";

export interface SlideEntry {
  id: string;
  slide: SlideJSON;
}

interface Props {
  slides: SlideEntry[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDelete: (i: number) => void;
}

const THUMB_W = 128;

export default function SlideTray({ slides, activeIndex, onSelect, onAdd, onDelete }: Props) {
  return (
    <div
      className="inline-flex items-center gap-3 px-3 py-3 bg-white rounded-2xl shadow-lg border border-gray-200 max-w-full overflow-x-auto [&::-webkit-scrollbar]:hidden"
      style={{ scrollbarWidth: "none" }}
    >
      {slides.map((entry, i) => (
        <div key={entry.id} className="relative group shrink-0">
          <button
            onClick={() => onSelect(i)}
            className={`relative rounded-lg overflow-hidden border-2 bg-white transition-colors ${
              i === activeIndex ? "border-violet-600" : "border-gray-200 hover:border-gray-400"
            }`}
          >
            <MiniSlide slide={entry.slide} width={THUMB_W} />
          </button>
          {slides.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(i); }}
              className="absolute top-1 right-1 w-6 h-6 rounded-md bg-white border border-gray-200 text-gray-600 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-opacity"
              title="Delete slide"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={onAdd}
        className="shrink-0 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-violet-400 hover:text-violet-600 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors"
        style={{ width: THUMB_W, height: THUMB_W * (720 / 1280) }}
      >
        <Plus className="w-4 h-4" />
        Add slide
      </button>
    </div>
  );
}
