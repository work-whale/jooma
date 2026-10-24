import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SquircleDefs, ToolTile } from "@/app/components/v2/Squircle";
import LandingNav from "@/app/components/landing/v2/LandingNav";
import SiteFooter from "@/app/components/landing/v2/SiteFooter";
import shared from "@/app/components/landing/v2/landing.module.css";
import faqStyles from "@/app/components/landing/v2/Faq.module.css";
import { V2_CATEGORIES, V2_TOOLS, toolSolid } from "@/app/lib/tools";
import { TRIAL_DAYS } from "@/app/lib/plans";
import { FREE_TRIES_PER_DAY } from "@/app/lib/trial-limits";
import { inWords } from "@/app/lib/landing/faq";
import { TOOL_PAGES, toolPageBySlug, toolPagePath } from "@/app/lib/seo/tool-pages";
import { breadcrumbs, faqPage, graph, toolApplication, toScript } from "@/app/lib/seo/jsonld";
import styles from "../teacher-tools.module.css";

/**
 * A public page for one tool: the page someone searching "report writer for
 * teachers" lands on.
 *
 * The tool itself (/tools/<slug>) is behind a session and robots-blocked, so
 * before these pages existed the homepage's 35 tool cards pointed crawlers at
 * 35 redirects to /login, and nothing on the site could rank for a tool's name.
 *
 * Static: every page is built at deploy from app/lib/seo/tool-pages.ts, and a
 * slug that is not in it is a 404 rather than a page rendered on demand.
 *
 * "AI" is allowed on these pages in the title, the H1 and the intro, which is
 * how teachers search; nowhere else (the unit tests hold the data to that).
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOL_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = toolPageBySlug(slug);
  if (!page) return {};
  const path = toolPagePath(page);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: path },
    // Set in full: a page's openGraph replaces the root's rather than merging.
    openGraph: {
      type: "website",
      siteName: "Jooma",
      locale: "en_GB",
      url: path,
      title: `${page.title} | Jooma`,
      description: page.description,
    },
    twitter: {
      card: "summary_large_image",
      title: `${page.title} | Jooma`,
      description: page.description,
    },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = toolPageBySlug(slug);
  const tool = page && V2_TOOLS.find((t) => t.href === page.href);
  if (!page || !tool) notFound();

  const category = V2_CATEGORIES.find((c) => c.id === tool.category);
  const related = page.related
    .map((href) => {
      const t = V2_TOOLS.find((x) => x.href === href);
      const p = TOOL_PAGES.find((x) => x.href === href);
      return t && p ? { tool: t, page: p } : null;
    })
    .filter((x) => x !== null);

  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Teacher tools", path: "/teacher-tools" },
    { name: tool.label, path: toolPagePath(page) },
  ];

  // The free try on /create covers three tools. The rest start with the trial.
  const tryHref = page.guest ? `/create?tool=${page.guest}` : "/signup";
  const tryLabel = page.guest ? "Try it free, no sign up" : "Start free trial";
  const tryNote = page.guest
    ? `${capitalise(inWords(FREE_TRIES_PER_DAY))} free goes a day without an account.`
    : `${capitalise(inWords(TRIAL_DAYS))} days free on every plan. Cancel any time before it ends.`;

  return (
    <div className={`jooma-v2 ${shared.page}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: toScript(
            graph([toolApplication(page, tool), faqPage(page.faqs), breadcrumbs(crumbs)]),
          ),
        }}
      />
      <SquircleDefs />
      <LandingNav email={null} name={null} fullName={null} avatarUrl={null} isAdmin={false} linkBase="/" />

      <main>
        <section className={styles.hero}>
          <div className={shared.shell}>
            <nav aria-label="Breadcrumb" className={styles.crumbs}>
              <ol>
                {crumbs.map((c, i) => (
                  <li key={c.path}>
                    {i < crumbs.length - 1 ? <Link href={c.path}>{c.name}</Link> : <span aria-current="page">{c.name}</span>}
                  </li>
                ))}
              </ol>
            </nav>

            <div className={styles.heroHead}>
              <ToolTile icon={tool.icon} solid={toolSolid(tool)} />
              <span className={shared.eyebrow}>
                {category?.name} · {tool.name} in Jooma
              </span>
            </div>
            <h1 className={styles.h1}>{page.h1}</h1>
            <p className={styles.intro} data-testid="tool-intro">
              {page.intro}
            </p>

            <div className={styles.ctaRow}>
              <Link href={tryHref} className={`${shared.btn} ${shared.btnW}`}>
                {tryLabel}
              </Link>
              {/* For a teacher who already has an account. nofollow: the tool
                  is behind a session and robots-blocked. */}
              <Link href={tool.href} rel="nofollow" className={styles.openLink}>
                Already using Jooma? Open {tool.name}
              </Link>
            </div>
            <p className={styles.ctaNote}>{tryNote}</p>
          </div>
        </section>

        <section className={styles.block}>
          <div className={shared.shell}>
            <h2 className={styles.h2}>How it works</h2>
            <ol className={styles.steps}>
              {page.steps.map((step, i) => (
                <li key={step}>
                  <span className={styles.stepNum} aria-hidden="true">
                    {i + 1}
                  </span>
                  <p>{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`${styles.block} ${shared.secAlt}`}>
          <div className={`${shared.shell} ${styles.split}`}>
            <div>
              <h2 className={styles.h2}>What you get</h2>
              <ul className={styles.features}>
                {page.features.map((f) => (
                  <li key={f}>
                    <span className={shared.tick} aria-hidden="true">
                      ✓
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className={styles.ukCard}>
              <h2 className={styles.h3}>{page.uk.heading}</h2>
              <p>{page.uk.body}</p>
            </div>
          </div>
        </section>

        <section className={styles.block}>
          <div className={shared.shell}>
            <h2 className={`${styles.h2} ${styles.centre}`}>Questions about the {tool.label.toLowerCase()}</h2>
            <div className={faqStyles.faq}>
              {page.faqs.map((item, i) => (
                <details key={item.q} open={i === 0}>
                  <summary>{item.q}</summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {related.length > 0 && (
          <section className={`${styles.block} ${shared.secAlt}`}>
            <div className={shared.shell}>
              <h2 className={styles.h2}>Teachers who use this also use</h2>
              <div className={styles.related}>
                {related.map(({ tool: t, page: p }) => (
                  <Link key={t.href} href={toolPagePath(p)} className={styles.relatedCard}>
                    <ToolTile icon={t.icon} solid={toolSolid(t)} size="md" />
                    <span>
                      <b>{t.label}</b>
                      <span>{t.description}</span>
                    </span>
                  </Link>
                ))}
              </div>
              <p className={styles.allTools}>
                <Link href="/teacher-tools">See all thirty five tools</Link>
              </p>
            </div>
          </section>
        )}

        <section className={styles.close}>
          <div className={shared.shell}>
            <h2>Give yourself the evening back.</h2>
            <p>{tryNote}</p>
            <Link href={tryHref} className={`${shared.btn} ${shared.btnW}`}>
              {tryLabel}
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
