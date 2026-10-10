"use client";

// Jo's ring and label over the section of a text document it is changing:
// from the section's heading down to the next one. Drawn over the editor, not
// inside it, so the document itself is never touched. Follows the section
// every frame while shown, as it grows with the typing.

import { useEffect, useState, type RefObject } from "react";
import type { MdDoc } from "@/app/lib/jo/md-ops";
import { sectionRect, type MdJoFocus } from "./useMarkdownJo";
import styles from "./jo.module.css";

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function JoSectionFocus({
  focus,
  doc,
  containerRef,
}: {
  focus: MdJoFocus | null;
  doc: MdDoc | null;
  /** Positioned, and wraps the editor. */
  containerRef: RefObject<HTMLElement | null>;
}) {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!focus || !doc) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBox(null);
      return;
    }
    let frame = 0;
    const track = () => {
      const root = containerRef.current;
      const r = root && sectionRect(root, doc, focus.sectionId);
      if (root && r) {
        const c = root.getBoundingClientRect();
        const next = { left: r.left - c.left - 10, top: r.top - c.top, width: r.width + 20, height: r.height };
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
  }, [focus, doc, containerRef]);

  if (!focus || !box) return null;
  return (
    <div className={styles.canvasRing} style={{ left: box.left, top: box.top, width: box.width, height: box.height }} data-testid="jo-section-focus">
      {focus.label && (
        <span className={styles.canvasLabel} role="status">
          <i aria-hidden="true">J</i>
          {focus.label}
        </span>
      )}
    </div>
  );
}
