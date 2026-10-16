"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MagnifyingGlass, PushPin } from "@phosphor-icons/react/dist/ssr";
import { useAppShell } from "@/app/components/v2/AppShellContext";
import { ToolTile } from "@/app/components/v2/Squircle";
import { V2_TOOLS, V2_CATEGORIES, toolSolid, type V2Tool } from "@/app/lib/tools";
import { usePinnedTools, togglePin } from "@/app/lib/usePinnedTools";
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
 */

export default function ToolsGrid({ disabledSlugs }: { disabledSlugs: string[] }) {
  useAppShell({ title: "Make" });

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  // Pinned tools live in a shared localStorage-backed store
  // (useSyncExternalStore), so this grid and the sidebar stay in sync the
  // instant a pin changes.
  const pinnedHrefs = usePinnedTools();

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
      V2_CATEGORIES.map((c) => ({
        ...c,
        tools: matches.filter((t) => t.category === c.id),
      })).filter((c) => c.tools.length > 0 && (category === "all" || category === c.id)),
    [matches, category],
  );

  const pinned = matches.filter((t) => pinnedHrefs.includes(t.href));

  return (
    <>
      <div className={app.hello}>
        <p className={app.helloWhen}>{available.length} tools</p>
        <h1>What would you like to make?</h1>
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

      <div className={styles.cats}>
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={`${app.chip} ${category === "all" ? app.chipOn : ""}`}
        >
          Everything
        </button>
        {V2_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`${app.chip} ${category === c.id ? app.chipOn : ""}`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Pinned cuts across categories, so it sits above them and only while
          showing everything — inside a single category it would repeat cards
          already on screen a few rows down. */}
      {category === "all" && pinned.length > 0 && (
        <section className={styles.section}>
          <div className={styles.catHead}>
            <h2>Pinned</h2>
            <span className={styles.catCount}>
              {pinned.length} {pinned.length === 1 ? "tool" : "tools"}
            </span>
          </div>
          <div className={styles.grid}>
            {pinned.map((tool) => (
              <ToolCard key={tool.href} tool={tool} pinned onTogglePin={togglePin} />
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
                pinned={pinnedHrefs.includes(tool.href)}
                onTogglePin={togglePin}
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
    </>
  );
}

function ToolCard({
  tool,
  solid,
  pinned,
  onTogglePin,
}: {
  tool: V2Tool;
  solid?: string;
  pinned: boolean;
  onTogglePin: (href: string) => void;
}) {
  return (
    // The Link is a SIBLING overlay, not a parent, so clicking the pin button
    // never hits the anchor — which is what stops the page transition firing on
    // a pin. `title` carries the full description: it is clamped to two lines,
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
        onClick={() => onTogglePin(tool.href)}
        title={pinned ? "Unpin" : "Pin to the sidebar"}
        aria-label={pinned ? `Unpin ${tool.name}` : `Pin ${tool.name} to the sidebar`}
        aria-pressed={pinned}
        className={`${styles.pin} ${pinned ? styles.pinOn : ""}`}
      >
        <PushPin weight={pinned ? "fill" : "regular"} className={styles.pinIcon} />
      </button>
    </div>
  );
}
