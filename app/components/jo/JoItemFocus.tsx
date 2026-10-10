"use client";

// Jo's ring and label around the card it is changing in a list document (a
// quiz question, a Staff Slides slide). Drawn over the list, never inside a
// card, and follows the card every frame while shown.

import { useEffect, useState, type RefObject } from "react";
import type { ListJoFocus } from "./useListJo";
import styles from "./jo.module.css";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function JoItemFocus({ focus, containerRef }: { focus: ListJoFocus | null; containerRef: RefObject<HTMLElement | null> }) {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!focus) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBox(null);
      return;
    }
    let frame = 0;
    const track = () => {
      const root = containerRef.current;
      const el = root?.querySelector<HTMLElement>(`[data-jo-item="${focus.index}"]`);
      if (root && el) {
        const c = root.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const next = { left: r.left - c.left - 6, top: r.top - c.top - 6, width: r.width + 12, height: r.height + 12 };
        setBox((prev) =>
          prev && Math.abs(prev.top - next.top) < 0.5 && Math.abs(prev.height - next.height) < 0.5 && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.width - next.width) < 0.5
            ? prev
            : next,
        );
      }
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [focus, containerRef]);

  if (!focus || !box) return null;
  return (
    <div className={styles.canvasRing} style={{ left: box.left, top: box.top, width: box.width, height: box.height }} data-testid="jo-item-focus">
      {focus.label && (
        <span className={styles.canvasLabel} role="status">
          <i aria-hidden="true">J</i>
          {focus.label}
        </span>
      )}
    </div>
  );
}
