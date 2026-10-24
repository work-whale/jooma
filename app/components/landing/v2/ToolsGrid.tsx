import Link from "next/link";
import { v2ToolsByCategory } from "@/app/lib/tools";
import { toolPageForHref, toolPagePath } from "@/app/lib/seo/tool-pages";
import { ToolTile } from "@/app/components/v2/Squircle";
import Reveal from "./Reveal";
import shared from "./landing.module.css";
import styles from "./ToolsGrid.module.css";

/**
 * All 35 tools, grouped by category.
 *
 * Generated from app/lib/tools.ts, the same array the signed-in app reads, so
 * the marketing page cannot claim a tool that does not exist or miss one that
 * does. Each card links to its real route.
 *
 * No credit costs here. Cost belongs on the tool form, where someone is about
 * to spend, not on a card they are still browsing.
 *
 * Where a card goes depends on who is looking. Signed in, straight to the tool.
 * Signed out, to the tool's public page under /teacher-tools where it has one:
 * /tools/* is behind a session and robots-blocked, so for a visitor and for
 * every crawler those links were 35 redirects to /login.
 */
export default function ToolsGrid({ signedIn }: { signedIn: boolean }) {
  const groups = v2ToolsByCategory();
  const hrefFor = (href: string) => {
    if (signedIn) return href;
    const page = toolPageForHref(href);
    return page ? toolPagePath(page) : href;
  };

  return (
    <section className={`${shared.sec} ${shared.secAlt}`} id="tools">
      <div className={shared.shell}>
        <Reveal className={`${shared.secHead} ${shared.secHeadCentre}`}>
          <span className={shared.eyebrow}>Thirty five tools</span>
          <h2>If it takes your evening, there is a tool for it.</h2>
          <p className={shared.lede}>
            Planning and resources, yes. Also the reports, the behaviour plans, the parent letters
            and the inspection folder nobody else builds for you.
          </p>
        </Reveal>

        {groups.map((group) => (
          <Reveal key={group.id}>
            <h3 className={styles.groupHeading}>{group.name}</h3>
            <div className={styles.grid}>
              {group.tools.map((tool) => (
                <Link key={tool.href} href={hrefFor(tool.href)} className={styles.card}>
                  <ToolTile icon={tool.icon} solid={group.solid} />
                  <span className={styles.cardText}>
                    <span className={styles.cardName}>{tool.name}</span>
                    <span className={styles.cardDesc}>{tool.description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
