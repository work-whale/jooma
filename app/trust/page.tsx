import Link from "next/link";
import type { Metadata } from "next";
import { SquircleDefs } from "@/app/components/v2/Squircle";
import LandingNav from "@/app/components/landing/v2/LandingNav";
import SiteFooter from "@/app/components/landing/v2/SiteFooter";
import shared from "@/app/components/landing/v2/landing.module.css";
import faqStyles from "@/app/components/landing/v2/Faq.module.css";
import { CONTACT_EMAIL } from "@/app/lib/seo/brand";
import { SUB_PROCESSORS } from "@/app/lib/legal/sub-processors";
import { breadcrumbs, faqPage, graph, toScript } from "@/app/lib/seo/jsonld";
import type { FaqItem } from "@/app/lib/landing/faq";
import styles from "../teacher-tools/teacher-tools.module.css";

/**
 * What a school's data protection lead asks before staff use Jooma, answered
 * in plain English.
 *
 * NOTHING HERE MAY SAY MORE THAN THE PRIVACY POLICY. This page is the readable
 * version; app/privacy is the legal one, and the sub-processor table is the
 * same list (app/lib/legal/sub-processors.ts). If the policy changes, this
 * changes with it.
 *
 * Safeguarding detection is deliberately not described. The check exists
 * (app/lib/safeguarding.ts) but does not yet cover every tool, so describing
 * it to schools would promise more than it does. Add it here once it does.
 *
 * A procurement document, so "AI" is allowed here the way it is in the terms
 * and privacy policy (scripts/check-language.mjs).
 */

export const metadata: Metadata = {
  title: "Trust and data protection for schools",
  description:
    "Where Jooma stores data, what it asks for, who processes it and how long it is kept. The plain English guide for UK schools and trusts.",
  alternates: { canonical: "/trust" },
};

const FACTS: [string, string][] = [
  ["Where data is stored", "Accounts and everything you make are stored in the UK, in London."],
  ["Pupil data", "Jooma never asks for pupil surnames or personal details. A few tools ask for a first name so the writing reads naturally. Staff should not enter sensitive personal data about pupils."],
  ["AI processing", "Prompts are sent to OpenAI or Anthropic to generate content, depending on the tool."],
  ["Model training", "OpenAI does not use API data to train its models by default, and Anthropic's commercial terms state that it does not train on content sent through its API."],
  ["Transfers outside the UK", "Some providers are based in or transfer data to the United States. We rely on safeguards such as the UK International Data Transfer Agreement or Standard Contractual Clauses."],
  ["Retention", "Account data is kept while the account is open, and deleted or anonymised within 90 days of closing it, except where the law requires us to keep records, typically up to 7 years. Resources are kept until you delete them or close your account."],
  ["Security", "Encryption in transit (TLS), row level security in the database, and access controls on our systems."],
  ["Selling data", "We do not sell personal data, or share it with anyone for their own marketing."],
];

const QUESTIONS: FaqItem[] = [
  {
    q: "Where is our data stored?",
    a: "Accounts and the resources staff make are stored in the UK, in London. Prompts are processed by OpenAI or Anthropic, which may process data outside the UK under recognised safeguards.",
  },
  {
    q: "Do staff need to enter pupil data?",
    a: "No. Jooma never asks for pupil surnames or personal details. A few tools, such as the report writer, ask for a first name so the writing reads naturally. Staff should not enter sensitive personal data about pupils.",
  },
  {
    q: "Is our content used to train AI models?",
    a: "OpenAI does not use API data to train its models by default, and Anthropic's commercial terms state that it does not train on content sent through its API.",
  },
  {
    q: "Can we get a data processing agreement or help with a DPIA?",
    // Not "yes": whether a ready-made DPA exists is the business's to say.
    a: `Get in touch at ${CONTACT_EMAIL} and tell us what your school needs for your data protection paperwork.`,
  },
];

export default function TrustPage() {
  return (
    <div className={`jooma-v2 ${shared.page}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: toScript(
            graph([
              faqPage(QUESTIONS),
              breadcrumbs([
                { name: "Home", path: "/" },
                { name: "Trust and data protection", path: "/trust" },
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
            <span className={`${shared.eyebrow} ${styles.eyebrowLight}`}>For schools and trusts</span>
            <h1 className={styles.h1}>Trust and data protection</h1>
            <p className={styles.intro} data-testid="trust-intro">
              What schools ask before their staff use Jooma: where data is stored, what we ask for,
              who processes it and how long we keep it. This is the plain English version of our
              privacy policy, which is the full legal text.
            </p>
          </div>
        </section>

        <section className={styles.block}>
          <div className={shared.shell}>
            <h2 className={styles.h2}>The short version</h2>
            <div className={styles.factTable}>
              <table>
                <tbody>
                  {FACTS.map(([label, value]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={`${styles.block} ${shared.secAlt}`}>
          <div className={shared.shell}>
            <h2 className={styles.h2}>Who processes data for us</h2>
            <p className={styles.prose}>
              The companies that process personal data on our behalf, and what each one does. This
              is the same list as section 5 of our{" "}
              <Link href="/privacy" className={styles.inlineLink}>privacy policy</Link>.
            </p>
            <div className={styles.factTable} style={{ marginTop: 24 }}>
              <table>
                <tbody>
                  {SUB_PROCESSORS.map((p) => (
                    <tr key={p.name}>
                      <th scope="row">{p.name}</th>
                      <td>{p.purpose}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={styles.block}>
          <div className={shared.shell}>
            <h2 className={`${styles.h2} ${styles.centre}`}>Questions from data protection leads</h2>
            <div className={faqStyles.faq}>
              {QUESTIONS.map((item, i) => (
                <details key={item.q} open={i === 0}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
            <p className={`${styles.prose} ${styles.centre} ${styles.rightsLine}`}>
              Everyone has rights over their data under UK GDPR, set out in our{" "}
              <Link href="/privacy" className={styles.inlineLink}>privacy policy</Link>. You can also
              complain to the{" "}
              <a href="https://ico.org.uk" target="_blank" rel="noreferrer" className={styles.inlineLink}>
                Information Commissioner&apos;s Office
              </a>
              .
            </p>
          </div>
        </section>

        <section className={styles.close}>
          <div className={shared.shell}>
            <h2>Bringing Jooma to your whole school?</h2>
            <p>Pooled credits, an admin dashboard and one invoice. Tell us about your school.</p>
            <Link href="/contact?type=school" className={`${shared.btn} ${shared.btnW}`}>
              Talk to us
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
