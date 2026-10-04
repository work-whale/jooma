"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/*
 * The browser copy of StartTrial, fired once, then on to `next`.
 *
 * eventID is the user id, matching the server copy the Stripe webhook sends
 * (sendStartTrialEvent in lib/meta-capi.ts). That shared id is what makes Meta
 * count the pair as one trial. Do not change one without the other.
 *
 * WAITS FOR THE SNIPPET. MetaPixel loads with strategy="afterInteractive", so
 * its inline script runs AFTER this page hydrates, and this effect used to win
 * the race: Pixel Helper recorded StartTrial a quarter of a second before
 * fbq('init'). Without an extension supplying its own fbq, window.fbq does not
 * exist yet at that moment and the event is silently lost. The snippet defines
 * window.fbq and queues init in the same synchronous step, so once fbq exists
 * a track call is guaranteed to land after init.
 *
 * Gives up after MAX_WAIT_MS (no pixel configured, or an ad blocker ate it) and
 * forwards anyway; the server copy is then the one that counts. The navigation
 * is a client transition, so the document that queued the event stays alive to
 * send it once Meta's script loads.
 */
const POLL_MS = 50;
const MAX_WAIT_MS = 3000;

export default function StartTrialPixel({ eventId, next }: { eventId: string; next: string }) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    // `fired` guards only the event, never the wait: React runs effects twice
    // in development, and an early return here would leave the cleanup's
    // cancelled timer as the only thing that ever navigates.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();

    const attempt = () => {
      if (cancelled) return;
      if (window.fbq) {
        if (!fired.current) {
          fired.current = true;
          window.fbq("track", "StartTrial", {}, { eventID: eventId });
        }
        router.replace(next);
        return;
      }
      if (Date.now() - started >= MAX_WAIT_MS) {
        router.replace(next);
        return;
      }
      timer = setTimeout(attempt, POLL_MS);
    };
    attempt();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [eventId, next, router]);

  return (
    <main
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--j-bg)" }}
    >
      <p style={{ color: "var(--j-body)", fontSize: 15 }}>Starting your free trial…</p>
    </main>
  );
}
