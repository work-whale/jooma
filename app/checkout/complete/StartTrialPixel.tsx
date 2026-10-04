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
 * window.fbq is the queueing stub from the MetaPixel snippet, so the call is
 * safe even before Meta's script has loaded; the navigation below is a client
 * transition, so the page that queued it stays alive to send it. Absent when
 * no pixel is configured or an ad blocker ate it, in which case the server copy
 * is the one that counts.
 */
export default function StartTrialPixel({ eventId, next }: { eventId: string; next: string }) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    window.fbq?.("track", "StartTrial", {}, { eventID: eventId });
    router.replace(next);
  }, [eventId, next, router]);

  return (
    <main
      style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--j-bg)" }}
    >
      <p style={{ color: "var(--j-body)", fontSize: 15 }}>Starting your free trial…</p>
    </main>
  );
}
