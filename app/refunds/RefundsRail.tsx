"use client";

import { useEffect, useRef } from "react";
import styles from "./refunds.module.css";

/*
 * The contents rail beside the clauses. It highlights the clause being read.
 *
 * The page itself is static and server rendered; this is the only part that
 * needs the browser. The rootMargin is the owner's markup's: a clause counts as
 * "current" once its top is within the upper part of the screen, below the
 * sticky header.
 */

export interface RailItem {
  id: string;
  label: string;
}

export default function RefundsRail({ items }: { items: RailItem[] }) {
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = nav.current;
    if (!root || !("IntersectionObserver" in window)) return;
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>("a"));
    const targets = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          for (const a of links) {
            a.classList.toggle(styles.on, a.getAttribute("href") === `#${e.target.id}`);
          }
        }
      },
      { rootMargin: "-80px 0px -72% 0px" },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav ref={nav} className={styles.rail} aria-label="On this page">
      <p className={styles.railLbl}>On this page</p>
      {items.map((i) => (
        <a key={i.id} href={`#${i.id}`}>
          {i.label}
        </a>
      ))}
    </nav>
  );
}
