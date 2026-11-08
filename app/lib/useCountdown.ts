"use client";

import { useEffect, useState } from "react";

/**
 * Milliseconds left until `endsAt`, ticking every `everyMs`, or null until the
 * component has mounted.
 *
 * Null first on purpose: the server renders at a different moment from the
 * browser, so a number in the first render would never match and React would
 * throw a hydration mismatch on every countdown. Callers render a quiet
 * placeholder for null.
 */
export function useCountdown(endsAt: Date | string | null, everyMs = 1000): number | null {
  const end = endsAt ? new Date(endsAt).getTime() : null;
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (end === null) return;
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const id = window.setInterval(tick, everyMs);
    return () => window.clearInterval(id);
  }, [end, everyMs]);

  return end === null ? null : left;
}
