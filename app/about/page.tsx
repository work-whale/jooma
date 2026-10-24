import Link from "next/link";
import type { Metadata } from "next";
import { SquircleDefs } from "@/app/components/v2/Squircle";
import LandingNav from "@/app/components/landing/v2/LandingNav";
import SiteFooter from "@/app/components/landing/v2/SiteFooter";
import shared from "@/app/components/landing/v2/landing.module.css";
import { BRAND_DEFINITION, CONTACT_EMAIL, LEGAL_NAME } from "@/app/lib/seo/brand";
import { breadcrumbs, graph, organization, toScript } from "@/app/lib/seo/jsonld";
import styles from "../teacher-tools/teacher-tools.module.css";

/**
 * What Jooma is and why it exists, for a reader and for the search engines and
 * assistants that describe a company from its own About page.
 *
 * No people on it, by decision: the page tells the story of the product rather
 * than introducing a team, and it claims nothing about who built it that the
 * site cannot show. The company line appears only once LEGAL_NAME is
 * confirmed (app/lib/seo/brand.ts).
 *
 * Every figure is one the homepage already publishes with its source
 * (ProblemStats). Under the landing language rule, like the homepage.
 */

export const metadata: Metadata = {
  title: "About Jooma",
  description:
    "Why Jooma exists, what it makes and how it works: teaching resources for UK teachers and school leaders, built around the UK curriculum.",
  alternates: { canonical: "/about" },
};

const WORKLOAD = [
  {
    figure: "50.1 hours",
    text: "The average teacher's working week.",
    source: "DfE Working Lives of Teachers, 2025",
  },
  {
    figure: "20.1 hours",
    text: "A week on planning, marking and admin.",
    source: "UCL Institute of Education, 2019",
  },
  {
    figure: "92%",
    text: "Cite workload, the leading reason teachers give for leaving the profession.",
    source: "DfE, 2022",
  },
];

const BELIEFS = [
  {
    heading: "Finished, not a blank box",
    body: "Each tool asks a few questions, such as year group, subject and topic, and hands you something finished. There is no prompt writing and nothing to learn.",
  },
  {
    heading: "Built around the UK curriculum",
    body: "Teaching tools work with the national curricula of England, Scotland, Wales and Northern Ireland, with year groups and key stages built in.",
  },
  {
    heading: "The teacher stays in charge",
    body: "Everything Jooma makes opens in an editor. You check it, change it and decide what reaches your class.",
  },
  {
    heading: "Pupil data stays out",
    body: "Jooma never asks for pupil surnames or personal details, and your work is stored in the UK.",
  },
];

export default function AboutPage() {
  return (
    <div className={`jooma-v2 ${shared.page}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: toScript(
            graph([
              { "@type": "AboutPage", url: "https://www.jooma.ai/about", name: "About Jooma", about: { "@id": organization()["@id"] } },
              breadcrumbs([
                { name: "Home", path: "/" },
                { name: "About", path: "/about" },
              ]),
            ]),
          ),
        }}
      />
      <SquircleDefs />
      <LandingNav email={null} name={null} fullName={null} avatarUrl={null} isAdmin={false} linkBase="/" />

      <main>
        <section className={styles.hero}>
          <div className={shared.shell}>
            <span className={`${shared.eyebrow} ${styles.eyebrowLight}`}>About</span>
            <h1 className={styles.h1}>Giving teachers their evenings back</h1>
            <p className={styles.intro} data-testid="about-intro">
              {BRAND_DEFINITION}
            </p>
          </div>
        </section>

        <section className={styles.block}>
          <div className={shared.shell}>
            <h2 className={styles.h2}>Why Jooma exists</h2>
            <p className={styles.prose}>
              Teachers spend their evenings and weekends making the things they teach from: slides,
              worksheets, plans, reports and letters home. Most of that work follows a pattern a
              tool can follow too. Jooma does the first draft of that work, so the time goes back
              to teaching, and to the rest of life.
            </p>
            <ul className={styles.statRow}>
              {WORKLOAD.map((s) => (
                <li key={s.source}>
                  <b>{s.figure}</b>
                  <span>{s.text}</span>
                  <small>{s.source}</small>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={`${styles.block} ${shared.secAlt}`}>
          <div className={shared.shell}>
            <h2 className={styles.h2}>How we build it</h2>
            <ul className={styles.beliefs}>
              {BELIEFS.map((b) => (
                <li key={b.heading}>
                  <h3 className={styles.h3}>{b.heading}</h3>
                  <p>{b.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className={styles.block}>
          <div className={`${shared.shell} ${styles.split}`}>
            <div>
              <h2 className={styles.h2}>What Jooma makes</h2>
              <p className={styles.prose}>
                Thirty five tools for classroom teachers, early years practitioners, SENCOs and
                school leaders: slides, lesson and topic plans, worksheets, comprehensions, quizzes
                and exam papers, reports, behaviour plans, letters, policies and more. Jo, the
                assistant built into Jooma, opens the right tool from a plain English request.
              </p>
              <p className={styles.prose}>
                <Link href="/teacher-tools" className={styles.inlineLink}>
                  See every tool
                </Link>
              </p>
            </div>
            <div className={styles.ukCard}>
              <h2 className={styles.h3}>Get in touch</h2>
              <p>
                Questions, ideas or a school enquiry: email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className={styles.inlineLink}>
                  {CONTACT_EMAIL}
                </a>{" "}
                or use our <Link href="/contact" className={styles.inlineLink}>contact form</Link>.
                For how we handle data, see{" "}
                <Link href="/trust" className={styles.inlineLink}>trust and data protection</Link>.
              </p>
              {LEGAL_NAME && <p className={styles.legalLine}>Jooma is run by {LEGAL_NAME}.</p>}
            </div>
          </div>
        </section>

        <section className={styles.close}>
          <div className={shared.shell}>
            <h2>See what it makes for your class.</h2>
            <p>Try it free on the homepage, with no account and no card.</p>
            <Link href="/#try" className={`${shared.btn} ${shared.btnW}`}>
              Try it free
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
