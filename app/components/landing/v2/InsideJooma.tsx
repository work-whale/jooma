import Image from "next/image";
import styles from "./InsideJooma.module.css";

/*
 * "Inside Jooma": the real app, on a dark band, with the three colour rules it
 * is built on. docs/Jooma version 4.5/Jooma screenshot1.jpeg.
 *
 * The picture is a screenshot of the actual signed-in Today page (a seeded
 * test teacher, no real names), so it must be retaken when Today changes.
 */

const RULES = [
  { dot: "res", text: "Purple is what a resource costs, and nothing else" },
  { dot: "pic", text: "Orange is picture slides, and nothing else" },
  { dot: "make", text: "Tools are coloured by what they are for" },
] as const;

export default function InsideJooma() {
  return (
    <section className={styles.band} aria-labelledby="inside-jooma-title">
      <div className={styles.inner}>
        <p className={styles.eyebrow}>Inside Jooma</p>
        <h2 id="inside-jooma-title" className={styles.title}>
          Not a chat window. A place to work.
        </h2>
        <p className={styles.lede}>
          Thirty five tools, your library, your colleagues and your week, in one screen that opens on what you need
          next. This is the actual product, not an illustration of it.
        </p>
        <ul className={styles.rules}>
          {RULES.map((r) => (
            <li key={r.dot}>
              <span className={`${styles.dot} ${styles[r.dot]}`} aria-hidden />
              {r.text}
            </li>
          ))}
        </ul>
        <div className={styles.frame}>
          <Image
            src="/landing/inside-jooma.png"
            alt="The Jooma Today page: the sidebar with the resources meter, Ask Jo, and the most used tools with what each costs."
            width={1440}
            height={900}
            sizes="(max-width: 1200px) 100vw, 1200px"
            className={styles.shot}
          />
        </div>
      </div>
    </section>
  );
}
