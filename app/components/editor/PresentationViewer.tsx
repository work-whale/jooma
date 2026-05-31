"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import type { SlideJSON } from "@/app/lib/presentations";
import MiniSlide from "./MiniSlide";
import { SLIDE_W, SLIDE_H } from "./constants";

interface Props {
  slides: SlideJSON[];
  startIndex?: number;
  themeId?: string;
  onClose: () => void;
}

export default function PresentationViewer({ slides, startIndex = 0, themeId, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });

  const slide = slides[index];
  const total = slides.length;

  // Scale to letterbox the 16:9 slide inside the viewport
  const scale = Math.min(size.w / SLIDE_W, size.h / SLIDE_H);
  const scaledW = SLIDE_W * scale;
  const scaledH = SLIDE_H * scale;

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);
  const next = useCallback(() => setIndex((i) => Math.min(total - 1, i + 1)), [total]);

  // Resize listener
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " ") { e.preventDefault(); next(); }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  // Request native fullscreen, and close the viewer when the user leaves
  // fullscreen. In fullscreen the browser swallows the Escape keydown to exit
  // fullscreen itself (it never reaches our keydown handler), so without this
  // the overlay would linger on top of the page after Escape. `onClose` is
  // held in a ref so re-renders don't re-trigger the fullscreen request.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    // Track entry via the actual fullscreenchange events rather than the
    // requestFullscreen() promise — the promise can resolve after the first
    // change event, which made the close guard miss. Once we've seen
    // fullscreen become active, the next time it goes inactive we close.
    let everEntered = false;
    document.documentElement.requestFullscreen?.().catch(() => {});
    const onFsChange = () => {
      if (document.fullscreenElement) everEntered = true;
      else if (everEntered) onCloseRef.current();
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Click on the left third → prev, right third → next, middle/slide → ignore
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    if (relX < rect.width * 0.3) prev();
    else if (relX > rect.width * 0.7) next();
  };

  if (!slide) return null;

  return (
    <div
      className="fixed inset-0 z-1000 flex items-center justify-center select-none"
      style={{ backgroundColor: "#000" }}
      onClick={handleBackdropClick}
    >
      {/* Slide canvas */}
      <div
        style={{ width: scaledW, height: scaledH, position: "relative", flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <MiniSlide slide={slide} width={scaledW} themeId={themeId} />
      </div>

      {/* Prev arrow */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {/* Next arrow */}
      {index < total - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          aria-label="Next slide"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        aria-label="Exit presentation"
      >
        <X className="w-4 h-4" />
      </button>

      {/* Slide counter */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/60 text-sm font-medium tabular-nums">
        {index + 1} / {total}
      </div>
    </div>
  );
}
