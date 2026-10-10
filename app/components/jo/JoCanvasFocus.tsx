"use client";

// Jo's ring and label on the slide canvas: around the text box it is changing,
// or the whole slide. Drawn over the canvas rather than inside the slide, so
// nothing about the slide itself (its layout, its zoom, its saved JSON) is
// touched. Follows the target every frame while shown, so zooming or
// scrolling the canvas never leaves it behind.

import { useEffect, useState, type RefObject } from "react";
import type { SlideJoFocus } from "./useSlidesJo";
import styles from "./jo.module.css";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function JoCanvasFocus({
  focus,
  containerRef,
  slideRef,
  activeSlideId,
}: {
  focus: SlideJoFocus | null;
  /** The canvas area the ring is placed in. */
  containerRef: RefObject<HTMLElement | null>;
  /** The slide on screen. */
  slideRef: RefObject<HTMLElement | null>;
  activeSlideId: string | null;
}) {
  const [box, setBox] = useState<Box | null>(null);
  const shown = !!focus && focus.slideId === activeSlideId;

  useEffect(() => {
    if (!shown) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBox(null);
      return;
    }
    let frame = 0;
    const track = () => {
      const container = containerRef.current;
      const slide = slideRef.current;
      const target = focus?.textId ? slide?.querySelector<HTMLElement>(`[data-text-id="${CSS.escape(focus.textId)}"]`) : slide;
      if (container && target) {
        const c = container.getBoundingClientRect();
        const r = target.getBoundingClientRect();
        const pad = focus?.textId ? 6 : 0;
        const next = { left: r.left - c.left - pad, top: r.top - c.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
        setBox((prev) =>
          prev && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.width - next.width) < 0.5 && Math.abs(prev.height - next.height) < 0.5
            ? prev
            : next,
        );
      }
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [shown, focus, containerRef, slideRef]);

  if (!shown || !box) return null;
  return (
    <div
      className={styles.canvasRing}
      data-whole={!focus?.textId}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      data-testid="jo-canvas-focus"
      aria-hidden={!focus?.label}
    >
      {focus?.label && (
        <span className={styles.canvasLabel} role="status">
          <i aria-hidden="true">J</i>
          {focus.label}
        </span>
      )}
    </div>
  );
}
