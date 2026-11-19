"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePresenting } from "@/app/lib/presenting";
import { CONSENT_EVENT, consentCookie, readConsent } from "@/app/lib/cookie-consent";
import styles from "./CookieBanner.module.css";

/*
 * The cookie banner (Jooma 4.5 Step 7). The Meta pixel loads only after
 * Accept (MetaPixel reads the same cookie). Accept and Reject look the same
 * and sit side by side: rejecting is as easy as accepting.
 *
 * Rendered only after the page has read the cookie, so it never flashes for a
 * visitor who already chose. Hidden while slides are presented. The footer's
 * "Cookie settings" link (#cookie-settings) opens it again.
 */

const SETTINGS_HASH = "#cookie-settings";

export default function CookieBanner() {
  const presenting = usePresenting();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const decide = () => {
      if (window.location.hash === SETTINGS_HASH) {
        setOpen(true);
        return;
      }
      setOpen(readConsent(document.cookie) === "undecided");
    };
    decide();
    window.addEventListener("hashchange", decide);
    return () => window.removeEventListener("hashchange", decide);
  }, []);

  const choose = (choice: "accepted" | "rejected") => {
    document.cookie = consentCookie(choice);
    if (choice === "rejected") {
      // Meta's own first-party cookies, if the pixel ran before, and our own
      // "where you came from" cookie (privacy policy section 9).
      for (const name of ["_fbp", "_fbc", "jooma_attr"]) {
        document.cookie = `${name}=; Max-Age=0; Path=/`;
        document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.${window.location.hostname.replace(/^www\./, "")}`;
      }
    }
    if (window.location.hash === SETTINGS_HASH) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT));
    // Saved on the profile when signed in, so server-side Meta events follow
    // the same choice. Fire and forget: a signed-out visitor gets a 204.
    void fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choice }),
      keepalive: true,
    }).catch(() => {});
    setOpen(false);
  };

  if (!open || presenting) return null;
  return (
    <div className={styles.banner} role="region" aria-label="Cookies" data-testid="cookie-banner">
      <p className={styles.text}>
        Jooma uses one advertising cookie, from Meta, to see which adverts bring teachers here. Sign-in cookies are
        always on. <Link href="/privacy">Privacy</Link>
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={() => choose("rejected")}>
          Reject
        </button>
        <button type="button" className={styles.btn} onClick={() => choose("accepted")}>
          Accept
        </button>
      </div>
    </div>
  );
}
