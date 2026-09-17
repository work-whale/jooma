"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { usePrefersReducedMotion } from "@/app/lib/usePrefersReducedMotion";
import {
  DEFAULT_TOPIC_KEY,
  DEMO_CHIP_KEYS,
  DEMO_TABS,
  DEMO_TOPICS,
  type DemoTabId,
} from "@/app/lib/landing/demo-content";
import { ToolTile } from "@/app/components/v2/Squircle";
import DemoSlides from "./DemoSlides";
import DemoComprehension from "./DemoComprehension";
import DemoWorksheet from "./DemoWorksheet";
import styles from "./HeroDemo.module.css";

/**
 * The hero demo.
 *
 * A teacher has to understand the product within about four seconds of
 * landing, so this runs itself: the Slides build starts on mount, without
 * anyone pressing anything.
 *
 * WHAT THE WAIT LOOKS LIKE. It matches the product. A real generation puts the
 * results panel on screen straight away with a small spinner and "Generating…"
 * in its header, and streams the text in under a blinking caret. There is no
 * splash screen and no checklist of stages: the previous version invented a
 * five-step "Building your lesson" sequence that appears nowhere in the app,
 * which meant the first thing the page showed a teacher was the one part of it
 * they would never see again.
 *
 * The outputs are hardcoded (see demo-content.ts) rather than generated live:
 * this is the highest traffic page on the site, and a real call here would need
 * hard rate limiting and would risk a slow first impression. They ARE real
 * output, captured from the live generators, and each suggestion chip carries
 * its own, so pressing one genuinely changes what comes back.
 */

/** How long the fake stream runs before the output settles. */
const STREAM_MS = 1500;

export default function HeroDemo() {
  const [tab, setTab] = useState<DemoTabId>("slides");
  const [topicKey, setTopicKey] = useState(DEFAULT_TOPIC_KEY);
  const [topic, setTopic] = useState(DEMO_TOPICS[DEFAULT_TOPIC_KEY].label);
  const [generating, setGenerating] = useState(true);

  const reduceMotion = usePrefersReducedMotion();
  const content = DEMO_TOPICS[topicKey];

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /**
   * Schedules the end of a run that is already in the generating state.
   *
   * Only ever called from an effect, and only ever schedules: it sets no state
   * synchronously, so starting a run never causes a cascading render.
   */
  const schedule = useCallback(() => {
    clearTimer();
    // Reduced motion goes straight to the result. The point of the demo is the
    // output, not the wait, so there is nothing to lose by skipping it.
    timer.current = setTimeout(() => setGenerating(false), reduceMotion ? 0 : STREAM_MS);
  }, [reduceMotion]);

  /**
   * Bumped to start a run. The effect below watches it, so every trigger (the
   * tab buttons, the Make it button, Enter in the field, a suggestion chip)
   * goes through exactly one code path, and a rapid second press restarts the
   * sequence cleanly instead of interleaving two of them.
   */
  const [runId, setRunId] = useState(0);

  // Runs Slides on mount, and again on every tab change or rerun.
  useEffect(() => {
    schedule();
    return clearTimer;
  }, [tab, runId, schedule]);

  function rerun() {
    setGenerating(true);
    setRunId((n) => n + 1);
  }

  function pickChip(key: string) {
    setTopicKey(key);
    setTopic(DEMO_TOPICS[key].label);
    rerun();
  }

  function pickTab(next: DemoTabId) {
    setGenerating(true);
    setTab(next);
  }

  return (
    <div className={styles.demo}>
      <div className={styles.bar}>
        <span className={styles.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.url}>jooma.ai</span>
        <span className={styles.live}>
          <i aria-hidden="true" /> Try it here
        </span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Choose what to make">
        {DEMO_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`demo-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="demo-pane"
            className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`}
            onClick={() => pickTab(t.id)}
          >
            <ToolTile icon={t.icon} solid={t.solid} size="tab" />
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.input}>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") rerun();
          }}
          aria-label="Topic"
        />
        <button type="button" className={styles.go} onClick={rerun}>
          Make it
        </button>
      </div>

      <div className={styles.chips}>
        {DEMO_CHIP_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`${styles.chip} ${key === topicKey ? styles.chipOn : ""}`}
            onClick={() => pickChip(key)}
          >
            {DEMO_TOPICS[key].label}
          </button>
        ))}
      </div>

      {/* The panel the tablist above controls. Without the role and the
          pairing, the tabs announce themselves as tabs that control nothing,
          and a screen reader user has no way to reach what they switched to. */}
      <div
        className={styles.stage}
        id="demo-pane"
        role="tabpanel"
        aria-labelledby={`demo-tab-${tab}`}
      >
        {/* The results header, as the product draws it: the panel is titled and
            on screen from the first moment, and the spinner sits inside it
            rather than replacing the whole thing. */}
        <div className={styles.resultBar}>
          <h3>My results</h3>
          {generating && (
            <span className={styles.generating}>
              <Loader2 className={styles.spinner} aria-hidden="true" />
              Generating…
            </span>
          )}
        </div>

        <div
          className={`${styles.pane} ${generating ? styles.paneStreaming : ""}`}
          // The output is arriving, so a screen reader should not be read a
          // half-written document. It is announced once it settles.
          aria-busy={generating}
        >
          {tab === "slides" && <DemoSlides slide={content.slide} />}
          {tab === "comp" && <DemoComprehension topic={content} />}
          {tab === "ws" && <DemoWorksheet worksheet={content.worksheet} />}
          {generating && <span className={styles.caret} aria-hidden="true" />}
        </div>
      </div>
    </div>
  );
}
