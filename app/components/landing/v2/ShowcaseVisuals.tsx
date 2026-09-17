import { ChatTeardropDots } from "@phosphor-icons/react/dist/ssr";
import slides from "./DemoSlides.module.css";
import comp from "./DemoComprehension.module.css";
import styles from "./ShowcaseVisuals.module.css";

/**
 * The three showcase visuals.
 *
 * REAL JOOMA OUTPUT, like the hero demo. The slide and the passage below were
 * captured from the live generators on 17 September 2026; see the header of
 * app/lib/landing/demo-content.ts. The Ask Jo exchange is written to match what
 * the assistant really does, checked against its prompt and its clarify
 * component rather than imagined.
 */

/** The closing slide of a real deck, for the Slides showcase. */
export function SlidePreview() {
  return (
    <>
      <div className={slides.slide} style={{ minHeight: 270 }}>
        <span className={slides.rule} />
        <h4>The Journey of Water Unfolded</h4>
        <p className={slides.hook}>Watery wonders explored!</p>
        <p>
          Today we uncovered how water cycles through nature in a ceaseless voyage. The power of the
          Sun drives evaporation, forming clouds through condensation, before water falls back as
          precipitation.
        </p>
        <ul>
          <li>
            <b>Evaporation</b> transforms water to vapour.
          </li>
          <li>
            <b>Condensation</b> creates clouds from vapour.
          </li>
          <li>
            <b>Precipitation</b> returns water to Earth.
          </li>
        </ul>
        {/* Every deck closes on a recap whose callout really is labelled
            "Question for next time", set by the generator itself. */}
        <div className={slides.callout}>
          <span className={slides.calloutEmoji} aria-hidden="true">
            🔑
          </span>
          <span className={slides.calloutText}>
            <b>Question for next time</b>
            <span>What role does the ocean play in climate control?</span>
          </span>
        </div>
      </div>

      <div className={styles.strip}>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className={`${slides.thumb} ${n === 4 ? slides.thumbOn : ""} ${styles.stripCell}`}>
            <i />
            <i />
          </div>
        ))}
      </div>
    </>
  );
}

/** An original text pitched at a year group, for the Comprehension showcase. */
export function ReadingPreview() {
  return (
    <div className={styles.reading}>
      <h4>The Water Cycle: Nature&apos;s Journey</h4>
      <p className={comp.source}>Year 4, standard</p>
      <p className={comp.para}>
        In the heart of every weather system lies the ever-turning wheel of the water cycle. This
        natural process is essential for life on Earth, providing fresh water to plants, animals, and
        humans.
      </p>
      <p className={comp.para}>
        The journey begins with the energy from the sun, which warms rivers, lakes, and seas. This
        heat causes the water to evaporate, turning it into vapour that rises into the air.
      </p>
      <div className={comp.questions}>
        <div className={comp.domain}>
          <b>2b Retrieval</b>
          <ol>
            <li>
              What role does the sun play in the water cycle, according to the passage?{" "}
              <span className={comp.marks}>[1 mark]</span>
            </li>
            <li>
              List two forms of precipitation mentioned in the text.{" "}
              <span className={comp.marks}>[1 mark]</span>
            </li>
          </ol>
        </div>
        <div className={comp.domain}>
          <b>2d Inference</b>
          <ol>
            <li>
              Why might the author describe the water cycle as a &quot;delicate dance&quot;?{" "}
              <span className={comp.marks}>[2 marks]</span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

/**
 * The Ask Jo exchange.
 *
 * Note what Jo does here: it does not generate. It asks about ONE field it
 * genuinely cannot guess, offers concrete answers and an escape, then opens the
 * tool with everything else already filled in. That behaviour is the product
 * claim, so the example has to show it rather than showing a finished answer.
 *
 * Matched to the real thing on the details that were previously wrong: Jo asks
 * about one field rather than "two quick things", it has no memory of lessons
 * from previous terms (its history is the current thread only), and its reply
 * before the question is one short sentence. "Just build it" is always present
 * and always quieter than the options; the caption beneath is the one the real
 * ClarifyChips prints.
 */
export function JoChat() {
  return (
    <div className={styles.chat}>
      <div className={styles.line}>
        <span className={`${styles.who} ${styles.you}`} aria-hidden="true">
          AA
        </span>
        <div className={styles.text}>
          I need a Year 4 maths lesson on equivalent fractions for Friday, mixed ability class of 30.
        </div>
      </div>

      <div className={styles.line}>
        <span className={`${styles.who} ${styles.bot}`} aria-hidden="true">
          <ChatTeardropDots weight="fill" className={styles.whoGlyph} />
        </span>
        <div className={styles.text}>
          I will put together a Year 4 lesson plan on equivalent fractions.
          <p className={styles.ask}>How would you like them to explore it?</p>
          <div className={styles.options}>
            <span>Fraction wall</span>
            <span>Paper folding</span>
            <span className={styles.escape}>Just build it</span>
          </div>
          <p className={styles.opens}>Opens Lesson Planner, filled in for you</p>
        </div>
      </div>
    </div>
  );
}
