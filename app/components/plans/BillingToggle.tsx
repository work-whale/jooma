"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import type { BillingInterval } from "@/app/lib/plans";
import styles from "./PlanCard.module.css";

/*
 * Monthly or yearly, above a grid of plan cards. Shared by the landing page,
 * /welcome and the profile, for a teacher choosing their first plan.
 *
 * Controlled: the caller owns the interval, because the same value also picks
 * the card prices and goes to checkout. Yearly comes first, and the callers
 * open on it (DEFAULT_INTERVAL), since it is the better deal.
 *
 * THE MOTION
 * A purple thumb slides between the two options with a slight spring, rather
 * than the selected option simply repainting. The options are different widths
 * ("Yearly" carries its saving pill), so the thumb is sized and placed from the
 * chosen label's real geometry, and re-measured if the track resizes (a web
 * font arriving late, a narrow screen wrapping the options onto two lines).
 *
 * It is written straight to the DOM from the layout effect rather than through
 * state: a measurement copied into state is a second render for nothing, and
 * the lint rule rejects setState in an effect anyway.
 *
 * Until it has been measured once (before hydration, or with JavaScript off)
 * the checked option paints its own purple background, so the control never
 * renders with nothing selected. See .toggleTrack:not([data-ready]) in the CSS.
 *
 * Once the teacher has switched, `data-switched` on the fieldset lets the cards
 * that follow it animate their prices. Only after a real switch, so nothing
 * moves on page load. See .toggle[data-switched] ~ .grid in the CSS.
 */
export default function BillingToggle({
  value,
  onChange,
  /** The best saving on offer, e.g. 25, for "Save up to 25%". 0 hides it. */
  savePercent,
}: {
  value: BillingInterval;
  onChange: (next: BillingInterval) => void;
  savePercent: number;
}) {
  // Unique per instance, so two toggles on one page never share a radio group.
  const name = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);
  const [switched, setSwitched] = useState(false);

  useLayoutEffect(() => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    if (!track || !thumb) return;

    const place = () => {
      const active = track.querySelector<HTMLElement>(`[data-option="${value}"]`);
      if (!active) return;
      // Bounding rects rather than offset*, which round to whole pixels and
      // left the thumb half a pixel short of the label. Measured from the
      // track's padding edge, which is where the thumb's top/left 0 sits.
      const a = active.getBoundingClientRect();
      const t = track.getBoundingClientRect();
      const x = a.left - t.left - track.clientLeft;
      const y = a.top - t.top - track.clientTop;
      thumb.style.width = `${a.width}px`;
      thumb.style.height = `${a.height}px`;
      thumb.style.transform = `translate(${x}px, ${y}px)`;
    };

    place();

    // The first placement lands without a transition, so the thumb does not
    // fly in from the corner on load. Every placement after it slides.
    if (!track.dataset.ready) {
      requestAnimationFrame(() => {
        track.dataset.ready = "1";
      });
    }

    const observer = new ResizeObserver(place);
    observer.observe(track);
    return () => observer.disconnect();
  }, [value]);

  const options: { id: BillingInterval; label: string }[] = [
    { id: "year", label: "Yearly" },
    { id: "month", label: "Monthly" },
  ];

  return (
    <fieldset className={styles.toggle} data-switched={switched || undefined}>
      <legend className={styles.srOnly}>Billing period</legend>
      <div className={styles.toggleTrack} ref={trackRef}>
        <span className={styles.toggleThumb} ref={thumbRef} aria-hidden="true" />
        {options.map((option) => (
          <label key={option.id} className={styles.toggleLabel} data-option={option.id}>
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => {
                setSwitched(true);
                onChange(option.id);
              }}
              className={styles.toggleInput}
            />
            <span className={styles.toggleOption}>
              {option.label}
              {option.id === "year" && savePercent > 0 && (
                <span className={styles.toggleSave}>Save up to {savePercent}%</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
