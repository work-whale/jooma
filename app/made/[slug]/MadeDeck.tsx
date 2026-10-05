"use client";

import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import MiniSlide from "@/app/components/editor/MiniSlide";
import PresentationViewer from "@/app/components/editor/PresentationViewer";
import type { SlideJSON } from "@/app/lib/presentations";
import styles from "./made.module.css";

/** A shared deck: a large slide, the strip of slides, and a Present button. */
export default function MadeDeck({ slides }: { slides: SlideJSON[] }) {
  const [active, setActive] = useState(0);
  const [presenting, setPresenting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const themeId = slides[0]?.themeId;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(260, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={styles.deck}>
      <div className={styles.deckBar}>
        <span>{slides.length} slides</span>
        <button type="button" className={styles.present} onClick={() => setPresenting(true)}>
          <Play aria-hidden="true" /> Present
        </button>
      </div>
      <div className={styles.stage} ref={stageRef}>
        {slides[active] && <MiniSlide slide={slides[active]} width={w} themeId={themeId} />}
      </div>
      <ol className={styles.thumbs} aria-label="Slides">
        {slides.map((s, i) => (
          <li key={(s as { id?: string }).id ?? i}>
            <button
              type="button"
              className={`${styles.thumb} ${i === active ? styles.thumbOn : ""}`}
              onClick={() => setActive(i)}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === active}
            >
              <MiniSlide slide={s} width={128} themeId={themeId} thumbnailMode />
            </button>
          </li>
        ))}
      </ol>
      {presenting && (
        <PresentationViewer
          slides={slides}
          startIndex={active}
          themeId={themeId}
          onClose={() => setPresenting(false)}
        />
      )}
    </div>
  );
}
