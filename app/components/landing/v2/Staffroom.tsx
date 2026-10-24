import Reveal from "./Reveal";
import BadgeMedallion, { type BadgeTier } from "@/app/components/v2/BadgeMedallion";
import shared from "./landing.module.css";
import styles from "./Staffroom.module.css";

/** Illustrative colleagues. Not real people. */
const COLLEAGUES = [
  { initials: "SM", name: "Sarah M", detail: "Year 3, London", level: "Level 5" },
  { initials: "DO", name: "Danny O", detail: "Secondary Science", level: "Level 4" },
  { initials: "ML", name: "Mark L", detail: "Deputy Head", level: "Level 6" },
];

/**
 * Four of the hundred badges.
 *
 * Every one of these rewards something that helps the teacher: planning a full
 * week, differentiating for every band, sharing with a colleague. Deliberately
 * none rewards raw volume. A badge for generating five hundred resources would
 * encourage waste and cost us the credits to produce it.
 */
const BADGES: { name: string; icon: string; tier: BadgeTier; locked: boolean }[] = [
  { name: "First lesson", icon: "notebook", tier: "bronze", locked: false },
  { name: "Week ahead", icon: "calendar-blank", tier: "silver", locked: false },
  { name: "Differentiator", icon: "sliders-horizontal", tier: "gold", locked: false },
  { name: "Completionist", icon: "squares-four", tier: "amethyst", locked: true },
];

const WEEK = [
  { day: "Thu", lesson: "Year 4 Maths, Fractions", state: "Ready", ready: true },
  { day: "Fri", lesson: "Year 4 Maths, Equivalence", state: "Add", ready: false },
  { day: "Tue", lesson: "Year 4 Science, Habitats", state: "Add", ready: false },
];

export default function Staffroom() {
  return (
    <section className={shared.sec}>
      <div className={shared.shell}>
        <Reveal className={`${shared.secHead} ${shared.secHeadCentre}`}>
          <span className={shared.eyebrow}>Your staffroom</span>
          <h2>Better with the people you teach alongside.</h2>
          <p className={shared.lede}>
            Jooma is not a private tool. Everything you make can be shared, and the more of your
            department uses it, the less anyone builds twice.
          </p>
        </Reveal>

        <Reveal className={styles.grid}>
          <div className={styles.card}>
            <h3>Share with colleagues</h3>
            <p className={styles.body}>
              Add the people you work with, then send any resource straight to their library. They
              get their own copy to edit. Yours stays untouched.
            </p>
            <div className={styles.visual}>
              {/* Said on the page, not just in the code: these read like
                  named users, and an assistant summarising the page would
                  otherwise quote them as real ones. */}
              <span className={styles.example}>Example</span>
              {COLLEAGUES.map((c) => (
                <div key={c.initials} className={styles.colleague}>
                  <span className={styles.avatar} aria-hidden="true">
                    {c.initials}
                  </span>
                  <span className={styles.meta}>
                    <b>{c.name}</b>
                    <span>{c.detail}</span>
                  </span>
                  <span className={styles.level}>{c.level}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <h3>Something to show for it</h3>
            <p className={styles.body}>
              One hundred badges across ten levels. Earned for the things that actually help, such
              as planning a full week or differentiating for every band.
            </p>
            <div className={styles.visual}>
              <div className={styles.badges}>
                {BADGES.map((badge, i) => (
                  <div
                    key={badge.name}
                    className={`${styles.badge} ${badge.locked ? styles.badgeLocked : ""}`}
                  >
                    <BadgeMedallion
                      icon={badge.icon}
                      tier={badge.tier}
                      locked={badge.locked}
                      uid={`L${i}`}
                    />
                    <span>{badge.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <h3>Your timetable, not a to do list</h3>
            <p className={styles.body}>
              Tell Jooma what you teach and when. It flags the lessons you have not made anything
              for yet, so Sunday evening has a shorter list.
            </p>
            <div className={styles.visual}>
              <div className={styles.week}>
                {WEEK.map((row) => (
                  <div key={row.lesson} className={styles.weekRow}>
                    <span className={styles.day}>{row.day}</span>
                    <span className={styles.lesson}>{row.lesson}</span>
                    <span className={`${styles.state} ${row.ready ? styles.ready : styles.missing}`}>
                      {row.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
