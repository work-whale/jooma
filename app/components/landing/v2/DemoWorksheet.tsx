import { type DemoWorksheet as Worksheet } from "@/app/lib/landing/demo-content";
import styles from "./DemoWorksheet.module.css";

/**
 * The Worksheets output: one printable document, as the tool really writes it.
 *
 * Not three attainment-band columns. The generator is told to write
 * differentiation as a single blended section rather than one block per band
 * (see app/lib/differentiation.ts), and what it actually produces is a headed
 * worksheet that climbs from recall to evaluation, with marks on every section
 * and a misconceptions list for the teacher at the end.
 *
 * The argument is still the same one, and still holds: this is the thing a
 * teacher would otherwise have spent an evening building.
 */
export default function DemoWorksheet({ worksheet }: { worksheet: Worksheet }) {
  return (
    <div className={styles.ws}>
      <div className={styles.sheet}>
        <h4>{worksheet.title}</h4>
        <p className={styles.meta}>{worksheet.meta}</p>
        <p className={styles.objective}>{worksheet.objective}</p>

        <div className={styles.namebar} aria-hidden="true">
          <span>Name</span>
          <span>Date</span>
          <span>Class</span>
        </div>

        {worksheet.sections.map((section) => (
          <div key={section.name} className={styles.section}>
            <div className={styles.sectionHead}>
              <b>
                {section.name} {section.heading}
              </b>
              <span className={styles.marks}>{section.marks}</span>
            </div>
            {section.questions.map((question) => (
              <div key={question} className={styles.question}>
                {question}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.aside}>
        <h4>Common misconceptions</h4>
        <p className={styles.asideNote}>
          Printed for you, not the class, so you know what to watch for.
        </p>
        <ul>
          {worksheet.misconceptions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className={styles.hint}>A full answer key comes with it.</p>
      </div>
    </div>
  );
}
