"use client";

import { useState } from "react";
import { COMPLEXITIES, type Complexity, type DemoTopic } from "@/app/lib/landing/demo-content";
import styles from "./DemoComprehension.module.css";

/**
 * The Comprehension output, with the complexity switcher.
 *
 * Complexity, NOT a reading age. The tool has never had a reading age: a
 * teacher picks a year group and one of three complexity levels, and each is
 * its own generation rather than a live rewrite of a finished text. Showing the
 * three side by side is still the most persuasive thing on the page, because
 * pitching one topic three ways is the job a mixed ability teacher is doing at
 * ten to nine. It is now also true.
 *
 * Only the default topic was captured at all three levels, so the switcher
 * offers the levels that exist for whichever topic is on screen. Every real
 * capture includes Standard, which is the fallback.
 */
export default function DemoComprehension({ topic }: { topic: DemoTopic }) {
  const available = COMPLEXITIES.filter((c) => topic.comprehension[c.id]);
  const [wanted, setWanted] = useState<Complexity>("Simple");

  // The chips can swap the topic under us, and the level that was selected may
  // not have been captured for the new one. Falling back keeps the pane filled
  // rather than blanking it.
  const complexity = topic.comprehension[wanted] ? wanted : available[0].id;
  const content = topic.comprehension[complexity]!;

  return (
    <div className={styles.comp}>
      <div className={styles.reading}>
        <h4>{content.title}</h4>
        <p className={styles.source}>
          {topic.year}, {complexity.toLowerCase()}
        </p>

        {/* Announced politely so a screen reader hears the passage change
            rather than silently reading a stale text. */}
        <div aria-live="polite">
          {content.paragraphs.map((paragraph) => (
            <p key={paragraph} className={styles.para}>
              {paragraph}
            </p>
          ))}

          {/* One group per DfE reading content domain, with the marks the
              generator allocates to each question. Both are on every real
              comprehension it writes. */}
          <div className={styles.questions}>
            {content.domains.map((domain) => (
              <div key={domain.code} className={styles.domain}>
                <b>
                  {domain.code} {domain.label}
                </b>
                <ol>
                  {domain.questions.map((question) => (
                    <li key={question.text}>
                      {question.text}{" "}
                      <span className={styles.marks}>
                        [{question.marks} {question.marks === 1 ? "mark" : "marks"}]
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.control}>
        <h4>One topic, pitched to the class</h4>
        <label className={styles.label} id="complexity-label">
          Complexity
        </label>
        <div className={styles.ages} role="group" aria-labelledby="complexity-label">
          {COMPLEXITIES.map((option) => {
            const captured = Boolean(topic.comprehension[option.id]);
            return (
              <button
                key={option.id}
                type="button"
                disabled={!captured}
                aria-pressed={complexity === option.id}
                className={`${styles.age} ${complexity === option.id ? styles.ageOn : ""}`}
                onClick={() => setWanted(option.id)}
              >
                {option.label}
                <span>{option.note}</span>
              </button>
            );
          })}
        </div>
        <p className={styles.hint}>
          Set the year group and the complexity, and the passage and the questions are both written
          to match. An answer key comes with every one.
        </p>
      </div>
    </div>
  );
}
