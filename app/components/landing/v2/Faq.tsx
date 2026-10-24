import Link from "next/link";
import { faqQuestions } from "@/app/lib/landing/faq";
import Reveal from "./Reveal";
import shared from "./landing.module.css";
import styles from "./Faq.module.css";

/**
 * Native <details>, not a JavaScript accordion.
 *
 * The answers are in the markup either way, so search engines index them, and
 * the disclosure works before hydration and without JavaScript at all.
 *
 * The questions live in app/lib/landing/faq.ts, which the page's structured
 * data reads too.
 */
export default function Faq() {
  return (
    <section className={shared.sec}>
      <div className={shared.shell}>
        <Reveal className={`${shared.secHead} ${shared.secHeadCentre}`}>
          <span className={shared.eyebrow}>Questions</span>
          <h2>Questions teachers ask about Jooma</h2>
        </Reveal>

        <Reveal className={styles.faq}>
          {faqQuestions().map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>{item.q}</summary>
              <p>
                {item.a}
                {/* The data answer names the policy; this is the way to it. */}
                {item.q === "Is pupil data safe?" && (
                  <>
                    {" "}
                    <Link href="/privacy">Read the privacy policy.</Link>
                  </>
                )}
              </p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
