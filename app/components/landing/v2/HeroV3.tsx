import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { ToolTile } from "@/app/components/v2/Squircle";
import { V2_TOOLS, toolSolid } from "@/app/lib/tools";
import { HERO_TOOLS, type HeroToolId } from "@/app/lib/landing/hero-ideas";
import { formatVisitors } from "@/app/lib/visitors";
import HeroTry from "./HeroTry";
import MadeWithJooma, { type ShowcaseCard } from "./MadeWithJooma";
import shared from "./landing.module.css";
import styles from "./HeroV3.module.css";

function tiles(size: "tab" | "md" | "xs"): Record<HeroToolId, React.ReactNode> {
  return Object.fromEntries(
    HERO_TOOLS.map((t) => [t.id, <ToolTile key={t.id} icon={t.icon} solid={t.solid} size={size} />]),
  ) as Record<HeroToolId, React.ReactNode>;
}

/**
 * The v3 hero: one colour field, one white box.
 *
 * A visitor picks Slides or Comprehension, types what they are teaching and
 * goes straight to /create to make it for free. Under the box, the real count
 * of people who have visited (the admin Stats figure, worded for the page),
 * every tool as a slow marquee, and resources teachers have chosen to share.
 */
export default function HeroV3({
  headline,
  visitors,
  showcase,
}: {
  headline: string;
  visitors: number | null;
  showcase: ShowcaseCard[];
}) {
  return (
    <section className={styles.hero} id="try">
      <div className={styles.band}>
        <div className={`${shared.shell} ${styles.bandIn}`}>
          <h1 className={styles.h1}>{headline}</h1>

          <HeroTry tabTiles={tiles("tab")} boxTiles={tiles("md")} pillTiles={tiles("xs")} />

          {visitors !== null && (
            <div className={styles.proof}>
              <span className={styles.lp}>
                <i className={styles.pip} aria-hidden="true" />
                <strong data-testid="hero-count">{formatVisitors(visitors)}</strong>&nbsp;teachers using
                Jooma right now
              </span>
            </div>
          )}

          <div className={styles.strip}>
            <a className={styles.stripLab} href="#tools">
              Thirty five tools in all <ArrowRight weight="bold" aria-hidden="true" />
            </a>
            <div className={styles.marq}>
              <div className={styles.marqIn}>
                {/* Twice over, so the loop has no seam. The copy is hidden from
                    assistive tech: one list of the tools is enough. */}
                {[0, 1].map((pass) => (
                  <span key={pass} className={styles.marqSet} aria-hidden={pass === 1 ? true : undefined}>
                    {V2_TOOLS.map((t) => (
                      <span key={`${pass}-${t.href}`} className={styles.tp} title={t.description}>
                        <ToolTile icon={t.icon} solid={toolSolid(t)} size="xs" />
                        {t.name}
                      </span>
                    ))}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <MadeWithJooma items={showcase} />
    </section>
  );
}
