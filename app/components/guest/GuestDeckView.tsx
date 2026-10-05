"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pencil, Play, Palette, Share2, Loader2 } from "lucide-react";
import MiniSlide from "@/app/components/editor/MiniSlide";
import type { SlideJSON } from "@/app/lib/presentations";
import type { GuestAction } from "@/app/lib/guest-actions";
import styles from "./guest.module.css";

/**
 * A guest's deck, to look at and nothing more.
 *
 * Built slide by slide as the stream arrives, by the same lib/deck-events code
 * the editor uses. Every button is the editor's, and every one opens the sign
 * up prompt instead: the deck is theirs to keep, present and export the moment
 * they have an account.
 */
export default function GuestDeckView({
  title,
  slides,
  generating,
  progress,
  failed,
  onAction,
}: {
  title: string;
  slides: SlideJSON[];
  generating: boolean;
  progress: { current: number; total: number; status?: string } | null;
  failed: boolean;
  onAction: (action: GuestAction) => void;
}) {
  // The slide the visitor picked, if any. Until they pick one, the view follows
  // the newest slide while the deck builds, the way the editor does, and rests
  // on the first once it is done.
  const [picked, setPicked] = useState<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(720);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(Math.max(260, Math.floor(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const themeId = slides[0]?.themeId;
  const active = Math.min(picked ?? (generating ? slides.length - 1 : 0), Math.max(0, slides.length - 1));
  const current = slides[active];
  const ready = !generating && slides.length > 0;

  return (
    <section className={styles.deck} aria-label="Your deck" data-testid="guest-deck">
      <header className={styles.deckBar}>
        <div className={styles.deckTitle}>
          <h1>{title || "Your deck"}</h1>
          {generating ? (
            <span className={styles.deckStatus} role="status">
              <Loader2 className={styles.spin} aria-hidden="true" />
              {progress?.status ??
                (progress && progress.total > 0
                  ? `Building slide ${Math.min(progress.current + 1, progress.total)} of ${progress.total}`
                  : "Designing your deck")}
            </span>
          ) : failed ? (
            <span className={styles.deckStatus} role="status">
              Something went wrong building this deck.
            </span>
          ) : (
            <span className={styles.deckStatus}>{slides.length} slides, ready</span>
          )}
        </div>
        <div className={styles.deckActions}>
          <button type="button" className={styles.ghostBtn} onClick={() => onAction("edit")} disabled={!ready}>
            <Pencil aria-hidden="true" /> <span>Edit</span>
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => onAction("theme")} disabled={!ready}>
            <Palette aria-hidden="true" /> <span>Theme</span>
          </button>
          <button type="button" className={styles.ghostBtn} onClick={() => onAction("share")} disabled={!ready}>
            <Share2 aria-hidden="true" /> <span>Share</span>
          </button>
          <button type="button" className={styles.darkBtn} onClick={() => onAction("present")} disabled={!ready}>
            <Play aria-hidden="true" /> <span>Present</span>
          </button>
          <button type="button" className={styles.purpleBtn} onClick={() => onAction("export")} disabled={!ready}>
            <Download aria-hidden="true" /> <span>Export</span>
          </button>
        </div>
      </header>

      <div className={styles.stage} ref={stageRef}>
        {current ? (
          <div className={styles.stageSlide}>
            <MiniSlide slide={current} width={stageW} themeId={themeId} />
          </div>
        ) : (
          <div className={styles.stageEmpty} style={{ height: Math.round((stageW * 9) / 16) }}>
            <Loader2 className={styles.spin} aria-hidden="true" />
            <span>Planning your slides</span>
          </div>
        )}
      </div>

      {slides.length > 0 && (
        <ol className={styles.thumbs} aria-label="Slides">
          {slides.map((s, i) => (
            <li key={(s as { id?: string }).id ?? i}>
              <button
                type="button"
                className={`${styles.thumb} ${i === active ? styles.thumbOn : ""}`}
                onClick={() => setPicked(i)}
                aria-label={`Slide ${i + 1}`}
                aria-current={i === active}
              >
                <MiniSlide slide={s} width={128} themeId={themeId} thumbnailMode />
              </button>
            </li>
          ))}
          {generating && progress && progress.total > slides.length &&
            Array.from({ length: progress.total - slides.length }, (_, i) => (
              <li key={`pending-${i}`}>
                <span className={`${styles.thumb} ${styles.thumbPending}`} aria-hidden="true" />
              </li>
            ))}
        </ol>
      )}
    </section>
  );
}
