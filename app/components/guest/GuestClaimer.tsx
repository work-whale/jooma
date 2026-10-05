"use client";

import { useEffect, useState } from "react";
import { GUEST_WORK_FLAG } from "@/app/lib/guest-cookie";
import {
  PENDING_ACTION_KEY,
  claimDestination,
  parsePendingAction,
  type ClaimedLike,
} from "@/app/lib/guest-actions";

/**
 * Brings a new teacher's free tries into their library.
 *
 * Mounted in the signed in shell, so it first runs on the page they reach
 * AFTER onboarding (or straight after logging in), never in the middle of the
 * profile, plan or checkout steps, which it would otherwise interrupt.
 *
 * Does nothing at all unless the guest flag cookie is set, which only the
 * /api/try routes set. So for every teacher who never used /create this is one
 * cookie read per page load and no request.
 */
export default function GuestClaimer() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    // Arrived at the library after claiming several: say so here, since the
    // page that claimed them was replaced by this one.
    const url = new URL(window.location.href);
    const claimedCount = Number(url.searchParams.get("claimed"));
    if (claimedCount > 0) {
      url.searchParams.delete("claimed");
      window.history.replaceState(window.history.state, "", url.toString());
      queueMicrotask(() =>
        setToast(`${claimedCount} resources from your free tries are now in your library.`),
      );
    }

    if (!document.cookie.split("; ").some((c) => c === `${GUEST_WORK_FLAG}=1`)) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/try/claim", { method: "POST" });
        // 403 is the profile gate: signed in but not onboarded yet. Leave the
        // flag in place and try again on a later page.
        if (!res.ok) return;
        const { claimed } = (await res.json()) as { claimed: (ClaimedLike & { title: string })[] };
        if (cancelled || !claimed?.length) return;

        let pending = null;
        try {
          pending = parsePendingAction(localStorage.getItem(PENDING_ACTION_KEY));
          localStorage.removeItem(PENDING_ACTION_KEY);
        } catch {
          // Storage blocked. The work is claimed either way; only the shortcut
          // to the action they pressed is lost.
        }

        const n = claimed.length;
        setToast(
          n === 1
            ? `"${claimed[0].title}" is now in your library.`
            : `${n} resources from your free tries are now in your library.`,
        );
        const to = claimDestination(claimed, pending);
        // A full navigation, not router.push: this shell stays mounted across
        // client navigations, so ThenAction and the share prompt, which read
        // the URL when they mount, would never see ?then or ?fresh. It also
        // refreshes the library counts in the sidebar. Once per sign up.
        if (to) window.setTimeout(() => window.location.assign(to), 900);
      } catch {
        // Network trouble. The flag stays, so the next page tries again.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed left-1/2 bottom-6 z-90 -translate-x-1/2 rounded-full px-5 py-3 text-sm font-semibold shadow-xl"
      style={{ backgroundColor: "var(--j-ink, #1D1730)", color: "#fff", maxWidth: "90vw" }}
    >
      {toast}
    </div>
  );
}
