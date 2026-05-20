"use client";

import { useEffect, useRef, useState } from "react";
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
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** Index of the slide currently being AI-generated. Slides at this index and
   *  beyond render as loading placeholders. */
  generatingIndex?: number;
}

const THUMB_W = 128;

export default function SlideTray({ slides, activeIndex, onSelect, onAdd, onDelete, onReorder, generatingIndex }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // The insertion point (gap) where a drop would land. 0 = before the first
  // slide, slides.length = after the last slide.
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  // Track which slide IDs are "newly added" so the entrance animation fires
  // only on new slides, not on every re-render during generation.
  const seenIdsRef = useRef<Set<string>>(new Set(slides.map((s) => s.id)));
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newIds = slides.map((s) => s.id).filter((id) => !seenIdsRef.current.has(id));
    if (newIds.length > 0) {
      newIds.forEach((id) => seenIdsRef.current.add(id));
      setAnimatingIds(new Set(newIds));
      const t = setTimeout(() => setAnimatingIds(new Set()), 400);
      return () => clearTimeout(t);
    }
  }, [slides]);

  // Reordering is disabled while the AI is streaming new slides — placeholders
  // would shift under their incoming events otherwise.
  const reorderingDisabled = generatingIndex !== undefined;
  return (
    <div
      className="inline-flex items-center gap-3 px-3 py-3 rounded-2xl shadow-lg border max-w-full overflow-x-auto [&::-webkit-scrollbar]:hidden backdrop-blur-md"
      style={{
        scrollbarWidth: "none",
        backgroundColor: "rgba(241, 239, 227, 0.3)",
        borderColor: "rgba(218, 216, 208, 0.3)",
      }}
    >
      {slides.map((entry, i) => {
        const isGenerating = generatingIndex !== undefined && i >= generatingIndex;
        const isActiveGenerate = generatingIndex !== undefined && i === generatingIndex;
        const canDrag = !reorderingDisabled && !!onReorder;
        const isBeingDragged = dragIndex === i;
        const isAnimating = animatingIds.has(entry.id);
        return (
          <div
            key={entry.id}
            className={`relative group shrink-0 flex items-center ${isAnimating ? "jooma-thumb-pop" : ""}`}
            // Drop position indicator (left side) — a vertical violet bar at the gap.
            onDragOver={(e) => {
              if (!canDrag || dragIndex === null) return;
              e.preventDefault();
              // Decide whether the cursor is on the left or right half of this thumb,
              // so we know whether to drop BEFORE index i or AFTER (i+1).
              const rect = e.currentTarget.getBoundingClientRect();
              const isLeft = e.clientX < rect.left + rect.width / 2;
              const target = isLeft ? i : i + 1;
              if (target !== dropIndex) setDropIndex(target);
            }}
            onDrop={(e) => {
              if (!canDrag || dragIndex === null || dropIndex === null) return;
              e.preventDefault();
              // Adjust target if dragging forward (the dragged item is removed first,
              // shifting subsequent indices left by 1).
              let to = dropIndex;
              if (dragIndex < to) to -= 1;
              if (to !== dragIndex && onReorder) onReorder(dragIndex, to);
              setDragIndex(null);
              setDropIndex(null);
            }}
          >
            {/* Left-side drop indicator */}
            {canDrag && dropIndex === i && dragIndex !== null && (
              <div
                className="absolute -left-2 top-0 bottom-0 w-1 rounded-full"
                style={{ backgroundColor: "#FFCC33" }}
              />
            )}
            <button
              onClick={() => onSelect(i)}
              draggable={canDrag}
              onDragStart={(e) => {
                if (!canDrag) { e.preventDefault(); return; }
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
                // Required for Firefox to start a drag.
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragEnd={() => { setDragIndex(null); setDropIndex(null); }}
              className={`relative rounded-lg overflow-hidden border-2 bg-white transition-all ${
                i === activeIndex ? "border-violet-600" : "border-gray-200 hover:border-gray-400"
              } ${isBeingDragged ? "opacity-40 scale-95" : ""} ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <MiniSlide slide={entry.slide} width={THUMB_W} />
              {isGenerating && (
                <div
                  className="absolute inset-0 pointer-events-none flex items-center justify-center transition-opacity duration-500"
                  style={{ backgroundColor: "rgba(255, 255, 255, 0.92)" }}
                >
                  {isActiveGenerate && <div className="absolute inset-0 jooma-shimmer" />}
                  <div
                    className="relative w-5 h-5 rounded-full border-2 animate-spin"
                    style={{ borderColor: "#FFCC33", borderTopColor: "transparent" }}
                  />
                </div>
              )}
            </button>
            {slides.length > 1 && !isGenerating && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(i); }}
                className="absolute top-1 right-1 w-6 h-6 rounded-md bg-white border border-gray-200 text-gray-600 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-opacity"
                title="Delete slide"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Right-side drop indicator — only shown after the last slide */}
            {canDrag && dropIndex === slides.length && i === slides.length - 1 && dragIndex !== null && (
              <div
                className="absolute -right-2 top-0 bottom-0 w-1 rounded-full"
                style={{ backgroundColor: "#FFCC33" }}
              />
            )}
          </div>
        );
      })}
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
