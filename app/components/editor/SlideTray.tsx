"use client";

import { Plus, Trash2 } from "lucide-react";

export interface SlideEntry {
  id: string;
  thumbnail: string | null;
}

interface Props {
  slides: SlideEntry[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onDelete: (i: number) => void;
}

export default function SlideTray({ slides, activeIndex, onSelect, onAdd, onDelete }: Props) {
  return (
    <div
      className="h-28 shrink-0 border-t flex items-center gap-3 px-4 overflow-x-auto"
      style={{ borderColor: "#DAD8D0", backgroundColor: "#F1EFE3" }}
    >
      {slides.map((s, i) => (
        <div key={s.id} className="relative group shrink-0">
          <button
            onClick={() => onSelect(i)}
            className={`relative w-32 aspect-video rounded-lg overflow-hidden border-2 bg-white transition-colors ${
              i === activeIndex ? "border-violet-600" : "border-gray-200 hover:border-gray-400"
            }`}
          >
            {s.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.thumbnail} alt={`Slide ${i + 1}`} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full" />
            )}
          </button>
          <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-gray-500">
            {i + 1}
          </span>
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
        className="shrink-0 w-32 aspect-video rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-violet-400 hover:text-violet-600 flex items-center justify-center gap-1.5 text-sm font-medium transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add slide
      </button>
    </div>
  );
}
