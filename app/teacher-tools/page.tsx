import Link from "next/link";
import type { Metadata } from "next";
import { SquircleDefs, ToolTile } from "@/app/components/v2/Squircle";
import LandingNav from "@/app/components/landing/v2/LandingNav";
import SiteFooter from "@/app/components/landing/v2/SiteFooter";
import shared from "@/app/components/landing/v2/landing.module.css";
import { v2ToolsByCategory } from "@/app/lib/tools";
import { toolPageForHref, toolPagePath } from "@/app/lib/seo/tool-pages";
import { breadcrumbs, graph, toScript } from "@/app/lib/seo/jsonld";
import styles from "./teacher-tools.module.css";

/**
 * Every tool on one public page, grouped as the app groups them, each linking
 * to its own public page where it has one.
 *
 * The hub the tool pages hang off: the homepage links here, every tool page
 * links back, and the sitemap lists it. A tool without a public page yet is
 * shown but not linked, rather than linked to /tools/*, which a signed-out
 * visitor and every crawler would bounce off to /login.
 */

export const metadata: Metadata = {
  title: "Teacher tools: slides, planning, worksheets, reports and more",
  description:
    "Thirty five tools for UK teachers and school leaders, from lesson plans and worksheets to reports, behaviour plans and school policies.",
  alternates: { canonical: "/teacher-tools" },
};

export default function TeacherToolsIndex() {
  const groups = v2ToolsByCategory();

  return (
    <div className={`jooma-v2 ${shared.page}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: toScript(
            graph([
              breadcrumbs([
                { name: "Home", path: "/" },
                { name: "Teacher tools", path: "/teacher-tools" },
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
            <span className={`${shared.eyebrow} ${styles.eyebrowLight}`}>Teacher tools</span>
            <h1 className={styles.h1}>Thirty five tools for the jobs you take home</h1>
            <p className={styles.intro}>
              Every tool in Jooma, for UK teachers and school leaders. Each one asks a few questions,
              such as year group, subject and topic, and hands you something finished that you can
              edit, print or present.
            </p>
          </div>
        </section>

        <section className={styles.block}>
          <div className={shared.shell}>
            {groups.map((group) => (
              <div key={group.id}>
                <h2 className={`${styles.h3} ${styles.groupHeading}`}>{group.name}</h2>
                <div className={styles.indexGrid}>
                  {group.tools.map((tool) => {
                    const page = toolPageForHref(tool.href);
                    const body = (
                      <>
                        <ToolTile icon={tool.icon} solid={group.solid} size="md" />
                        <span>
                          <b>{tool.label}</b>
                          <small>{tool.description}</small>
                        </span>
                      </>
                    );
                    return page ? (
                      <Link key={tool.href} href={toolPagePath(page)} className={styles.indexCard}>
                        {body}
                      </Link>
                    ) : (
                      <div key={tool.href} className={styles.indexCard}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
