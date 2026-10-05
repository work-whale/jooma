import Link from "next/link";
import { ToolTile } from "@/app/components/v2/Squircle";
import MiniSlide from "@/app/components/editor/MiniSlide";
import type { SlideJSON } from "@/app/lib/presentations";
import shared from "./landing.module.css";
import styles from "./HeroV3.module.css";

export interface ShowcaseCard {
  slug: string;
  kind: "slides" | "comprehension" | "worksheet";
  title: string;
  subject: string | null;
  year_label: string | null;
  region: string | null;
  teacher_name: string | null;
  first_slide: SlideJSON | null;
}

const KIND = {
  slides: { label: "Slides", icon: "presentation-chart", solid: "#5B2ED6" },
  comprehension: { label: "Comprehension", icon: "book-open-text", solid: "#1D6FD0" },
  worksheet: { label: "Worksheet", icon: "file-text", solid: "#0F8A63" },
} as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** The drawn thumbnail for a resource with no slide to show. */
function Placeholder({ kind }: { kind: ShowcaseCard["kind"] }) {
  if (kind === "worksheet") {
    return (
      <div className={`${styles.ph} ${styles.phWs}`}>
        {["#9FD9C4", "#A9CBEC", "#CDBCF7"].map((c) => (
          <div key={c} className={styles.phCol}>
            <s style={{ background: c }} />
            <i style={{ width: "88%" }} />
            <i style={{ width: "74%" }} />
            <i style={{ width: "82%" }} />
            <i style={{ width: "60%" }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={`${styles.ph} ${styles.phCp}`}>
      <span className={styles.phHd} />
      <i style={{ width: "97%" }} />
      <i style={{ width: "92%" }} />
      <i style={{ width: "99%" }} />
      <i style={{ width: "64%" }} />
      <div className={styles.phQ}>
        <i style={{ width: "80%" }} />
        <i style={{ width: "66%" }} />
        <i style={{ width: "74%" }} />
      </div>
    </div>
  );
}

/**
 * "Made with Jooma": resources teachers chose to share on this page.
 *
 * Every card is opt in. A teacher is asked after a generation whether it can
 * appear here with their name, and an admin approves it in /admin/showcase
 * before it does. Hidden entirely until there is something to show: an empty
 * row of placeholder teachers would be worse than no row.
 */
export default function MadeWithJooma({ items }: { items: ShowcaseCard[] }) {
  if (items.length === 0) return null;

  return (
    <div className={styles.made}>
      <div className={shared.shell}>
        <div className={styles.madeH}>
          <h3>Made with Jooma</h3>
          <p>Real resources, shared by the teachers who made them.</p>
        </div>
        <div className={styles.madeRow}>
          {items.map((item) => {
            const k = KIND[item.kind];
            const name = item.teacher_name ?? "A Jooma teacher";
            const meta = [item.subject, item.year_label, item.region].filter(Boolean).join(" · ");
            return (
              <Link key={item.slug} className={styles.mcard} href={`/made/${item.slug}`}>
                <div className={styles.thumb}>
                  {item.kind === "slides" && item.first_slide ? (
                    <div className={styles.thumbSlide}>
                      <MiniSlide
                        slide={item.first_slide}
                        width={384}
                        themeId={item.first_slide.themeId}
                        thumbnailMode
                      />
                    </div>
                  ) : (
                    <Placeholder kind={item.kind} />
                  )}
                  <span className={styles.tag}>
                    <ToolTile icon={k.icon} solid={k.solid} size="xs" />
                    {k.label}
                  </span>
                </div>
                <div className={styles.mbody}>
                  <h4>{item.title}</h4>
                  <span className={styles.mby}>
                    <span className={styles.mav} aria-hidden="true">
                      {initials(name)}
                    </span>
                    <span>
                      <b>{name}</b>
                      {meta && <span>{meta}</span>}
                    </span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
