"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./Reveal.module.css";

/**
 * Fades and lifts its children in once they scroll into view.
 *
 * Unobserves after firing: this runs on every section of a long marketing page,
 * and an observer left attached keeps calling back for the rest of the visit
 * for no benefit. Content is in the DOM from the first render either way, so
 * nothing here is hidden from search engines, and a browser with JavaScript
 * disabled shows it straight away (the `scripting: none` rule in
 * Reveal.module.css).
 */
export default function Reveal({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Always starts false, including on the server, so the markup React
  // hydrates against matches what it rendered. Deciding this from
  // `typeof IntersectionObserver` at initialisation would differ between the
  // server (undefined) and a browser (defined) and mismatch on hydration.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // An old browser, or a test environment without the API: reveal on the
    // next tick rather than leaving the content permanently invisible. The
    // timeout keeps this out of the effect body, where a synchronous setState
    // would cause a cascading render.
    if (typeof IntersectionObserver === "undefined") {
      const t = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(t);
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -50px 0px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLElement>}
      className={`${styles.rv} ${shown ? styles.in : ""} ${className}`}
    >
      {children}
    </Tag>
  );
}
