import { SLIDE_ACTIONS, type DemoSlide } from "@/app/lib/landing/demo-content";
import { boldRuns } from "./bold-runs";
import styles from "./DemoSlides.module.css";

/**
 * The Slides output: one slide at full size with the rest of the deck as a
 * thumbnail strip beside it.
 *
 * The strip is what sells the tool. A single slide could be anything; ten of
 * them says the whole deck arrived, which is the actual claim.
 */
export default function DemoSlides({ slide }: { slide: DemoSlide }) {
  return (
    <div className={styles.deck}>
      <div className={styles.main}>
        <div className={styles.slide}>
          <span className={styles.rule} />
          <h4>{slide.title}</h4>
          {/* Every real content slide carries a sub-hook: a question or punchy
              declarative under the title, in body weight rather than heading. */}
          <p className={styles.hook}>{slide.subHook}</p>
          <p>{boldRuns(slide.body)}</p>
          <ul>
            {slide.bullets.map((b) => (
              <li key={b}>{boldRuns(b)}</li>
            ))}
          </ul>
          <div className={styles.callout}>
            <span className={styles.calloutEmoji} aria-hidden="true">
              {slide.callout.emoji}
            </span>
            <span className={styles.calloutText}>
              <b>{slide.callout.label}</b>
              <span>{slide.callout.body}</span>
            </span>
          </div>

          {/* Where the slide's photograph sits. Every real content layout
              requires an image (the generator treats an empty imageQuery as a
              bug), so the space is held rather than filled with a drawing: the
              topic changes with the suggestion chips, and a water cycle
              illustration behind a fractions slide was worse than nothing. */}
          <span className={styles.art} aria-hidden="true" />
        </div>

        <div className={styles.actions}>
          {SLIDE_ACTIONS.map((action, i) => (
            <span key={action} className={`${styles.action} ${i === 0 ? styles.actionPrimary : ""}`}>
              {action}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.thumbs}>
        {Array.from({ length: slide.thumbCount }, (_, i) => i + 1).map((n) => (
          <div key={n} className={`${styles.thumb} ${n === slide.activeThumb ? styles.thumbOn : ""}`}>
            <i />
            <i />
            <span>{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
