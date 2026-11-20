"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MagnifyingGlass, Star } from "@phosphor-icons/react/dist/ssr";
import { useAppShell } from "@/app/components/v2/AppShellContext";
import { ToolTile } from "@/app/components/v2/Squircle";
import { V2_TOOLS, categoriesAToZ, toolSolid, type V2Tool } from "@/app/lib/tools";
import { useFavouriteTools, toggleFavouriteTool } from "@/app/lib/useFavouriteTools";
import app from "@/app/components/v2/app.module.css";
import styles from "./ToolsGrid.module.css";

/*
 * Make.
 *
 * Search matches name, description AND synonyms. The synonyms are the tools'
 * old names, and they are what keeps "worksheet generator" finding Worksheets
 * for a teacher arriving from Google or from muscle memory. They are hidden,
 * never rendered.
 *
 * No credit costs anywhere on these cards. Credits live in the sidebar meter
 * and on the account page, and nowhere else.
 *
 * Favourites sit on top (Slides, Worksheets and Comprehension until the
 * teacher changes them), then the categories A to Z.
 */

const CATEGORIES = categoriesAToZ();

function toggleStar(href: string) {
  void toggleFavouriteTool(href);
}

export default function ToolsGrid({ disabledSlugs }: { disabledSlugs: string[] }) {
  useAppShell({ title: "Make" });

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  // Starred tools, saved to the teacher's profile and shared with the
  // sidebar, so both change the instant a star does.
  const favouriteHrefs = useFavouriteTools();

  // Tools an admin has switched off in /admin/tools. Resolved on the server and
  // passed in, rather than fetched here: filtering client-side would render the
  // disabled tools for a frame before removing them, which reads as a glitch.
  // The proxy blocks the route and the API regardless — this only stops us
  // advertising something that would refuse.
  const available = useMemo(() => {
    const disabled = new Set(disabledSlugs);
    return V2_TOOLS.filter((t) => !disabled.has(t.href.replace("/tools/", "")));
  }, [disabledSlugs]);

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return available;
    return available.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        // The old names. Never displayed, only matched.
        t.synonyms.some((s) => s.toLowerCase().includes(q)),
    );
  }, [available, query]);

  const sections = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        ...c,
        tools: matches.filter((t) => t.category === c.id),
      })).filter((c) => c.tools.length > 0 && (category === "all" || category === c.id)),
    [matches, category],
  );

  // In the order they were starred, not the order of the tool list.
  const favourites = favouriteHrefs.flatMap((href) => matches.filter((t) => t.href === href));

  return (
    // Marks the well wide: see .wrap:has() in app.module.css.
    <div data-well="wide">
      <div className={app.hello}>
        <h1>What would you like to make?</h1>
        <p className={app.helloSub}>
          {available.length} tools, grouped by what they are for. Star the ones you use most.
        </p>
      </div>

      <div className={styles.searchRow}>
        <div className={app.search}>
          <MagnifyingGlass className={app.searchIcon} />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${available.length} tools. Try cover lesson, or report`}
            aria-label="Search tools"
            className={app.searchInput}
          />
        </div>
      </div>

      <div className={styles.cats} role="group" aria-label="Filter by category" data-testid="tool-filters">
        <button
          type="button"
          onClick={() => setCategory("all")}
          aria-pressed={category === "all"}
          className={`${app.chip} ${category === "all" ? app.chipOn : ""}`}
        >
          Everything
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            aria-pressed={category === c.id}
            className={`${app.chip} ${category === c.id ? app.chipOn : ""}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Favourites cut across categories, so they sit above them and only
          while showing everything: inside a single category they would repeat
          cards already on screen a few rows down. */}
      {category === "all" && favourites.length > 0 && (
        <section className={styles.section} data-testid="favourites">
          <div className={styles.catHead}>
            <h2>Favourites</h2>
            <span className={styles.catCount}>
              {favourites.length} {favourites.length === 1 ? "tool" : "tools"}
            </span>
          </div>
          <div className={styles.grid}>
            {favourites.map((tool) => (
              <ToolCard key={tool.href} tool={tool} starred onToggleStar={toggleStar} />
            ))}
          </div>
        </section>
      )}

      {sections.map((section) => (
        <section key={section.id} className={styles.section}>
          <div className={styles.catHead}>
            <h2>{section.name}</h2>
            <span className={styles.catCount}>
              {section.tools.length} {section.tools.length === 1 ? "tool" : "tools"}
            </span>
          </div>
          <div className={styles.grid}>
            {section.tools.map((tool) => (
              <ToolCard
                key={tool.href}
                tool={tool}
                solid={section.solid}
                starred={favouriteHrefs.includes(tool.href)}
                onToggleStar={toggleStar}
              />
            ))}
          </div>
        </section>
      ))}

      {sections.length === 0 && (
        <div className={app.panel}>
          <div className={app.empty}>
            <span className={app.emptyIcon}>
              <MagnifyingGlass weight="fill" />
            </span>
            <p className={app.emptyTitle}>Nothing matches that</p>
            <p className={app.emptyBody}>
              Try a shorter phrase, or pick a category above to browse.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ToolCard({
  tool,
  solid,
  starred,
  onToggleStar,
}: {
  tool: V2Tool;
  solid?: string;
  starred: boolean;
  onToggleStar: (href: string) => void;
}) {
  return (
    // The Link is a SIBLING overlay, not a parent, so clicking the star
    // never hits the anchor, which is what stops the page transition firing on
    // a star. `title` carries the full description: it is clamped to two lines,
    // and the browser's own tooltip is how the rest is read.
    <div className={styles.card} title={tool.description}>
      <Link href={tool.href} aria-label={tool.name} className={styles.cardLink} />

      <div className={styles.cardBody}>
        <ToolTile icon={tool.icon} solid={solid ?? toolSolid(tool)} size="md" />
        <div className={styles.cardText}>
          <h3>{tool.name}</h3>
          <p>{tool.description}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onToggleStar(tool.href)}
        title={starred ? "Remove from favourites" : "Add to favourites"}
        aria-label={starred ? `Remove ${tool.name} from favourites` : `Add ${tool.name} to favourites`}
        aria-pressed={starred}
        className={`${styles.pin} ${starred ? styles.pinOn : ""}`}
      >
        <Star weight={starred ? "fill" : "regular"} className={styles.pinIcon} />
      </button>
    </div>
  );
}
