"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowsClockwise } from "@phosphor-icons/react";
import {
  HERO_TOOLS,
  heroHref,
  heroTool,
  ideasAt,
  type HeroToolId,
} from "@/app/lib/landing/hero-ideas";
import styles from "./HeroV3.module.css";

/**
 * The interactive half of the v3 hero: the tool picker, the topic box, and the
 * example ideas under it.
 *
 * Create opens /create with the tool and topic, where the visitor finishes the
 * inputs with Jo and makes the real thing without an account. An empty box
 * asks for a topic rather than opening the tool with nothing, and Worksheets is
 * shown, not hidden, until the guest flow supports it.
 *
 * The tiles arrive pre-rendered from the server: the icon set is the SSR build
 * of Phosphor, and passing nodes keeps it out of this bundle.
 */
export default function HeroTry({
  tabTiles,
  boxTiles,
  pillTiles,
}: {
  tabTiles: Record<HeroToolId, React.ReactNode>;
  boxTiles: Record<HeroToolId, React.ReactNode>;
  pillTiles: Record<HeroToolId, React.ReactNode>;
}) {
  const router = useRouter();
  const [tool, setTool] = useState<HeroToolId>("slides");
  const [topic, setTopic] = useState("");
  const [idle, setIdle] = useState(true);
  const [offset, setOffset] = useState(0);
  const [spin, setSpin] = useState(false);
  const [nudge, setNudge] = useState(false);

  const current = heroTool(tool);
  const href = heroHref(tool, topic);
  const inputId = "hero-topic";

  const wake = () => setIdle(false);

  const go = (e?: React.MouseEvent | React.FormEvent) => {
    if (href) return; // the Link navigates
    e?.preventDefault();
    wake();
    setNudge(true);
    window.setTimeout(() => setNudge(false), 600);
    document.getElementById(inputId)?.focus();
  };

  return (
    <>
      <div className={styles.tsel} role="tablist" aria-label="Choose a tool">
        {HERO_TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tool === t.id}
            className={`${styles.ts} ${tool === t.id ? styles.tsOn : ""}`}
            onClick={() => setTool(t.id)}
          >
            {tabTiles[t.id]}
            {t.name}
            {!t.available && <span className={styles.soon}>Coming soon</span>}
          </button>
        ))}
      </div>

      <form
        className={`${styles.box} ${idle ? styles.idle : ""} ${nudge ? styles.nudge : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (href) router.push(href);
          else go(e);
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a,button")) return;
          wake();
          document.getElementById(inputId)?.focus();
        }}
      >
        <span className={styles.bt}>{boxTiles[tool]}</span>
        <span className={styles.field}>
          {idle && !topic && <span className={styles.caret} aria-hidden="true" />}
          <input
            id={inputId}
            aria-label="What are you teaching?"
            autoComplete="off"
            value={topic}
            maxLength={200}
            disabled={!current.available}
            placeholder={idle ? "" : current.placeholder}
            onFocus={wake}
            onChange={(e) => {
              wake();
              setTopic(e.target.value);
            }}
          />
        </span>
        {current.available ? (
          <Link
            className={styles.create}
            href={href ?? "#try"}
            onClick={(e) => {
              if (!href) go(e);
            }}
            prefetch={false}
          >
            Create <ArrowRight weight="bold" aria-hidden="true" />
          </Link>
        ) : (
          <span className={`${styles.create} ${styles.createOff}`} aria-disabled="true">
            Coming soon
          </span>
        )}
      </form>

      <div className={styles.eg}>
        {ideasAt(offset).map(([id, text]) => (
          <button
            key={`${id}-${text}`}
            type="button"
            className={styles.egp}
            onClick={() => {
              setTool(id);
              setTopic(text);
              wake();
              document.getElementById(inputId)?.focus({ preventScroll: true });
            }}
          >
            {pillTiles[id]}
            <b>{heroTool(id).name}</b>&nbsp;{text}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`${styles.moreEg} ${spin ? styles.spin : ""}`}
        onClick={() => {
          setOffset((o) => o + 3);
          setSpin(true);
          window.setTimeout(() => setSpin(false), 520);
        }}
      >
        <ArrowsClockwise aria-hidden="true" />
        More ideas
      </button>
    </>
  );
}
