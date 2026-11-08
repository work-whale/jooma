"use client";

// "Your free trial has ended", as a popup rather than a line across the top.
//
// WHO: a locked account that had the no-card trial and has never paid. Not a
// lapsed subscriber (TrialBanner speaks to them) and not an ambassador
// applicant's review trial, which has no start stamp.
//
// WHEN:
//   offer open      once a day, on the first page of the day, with the 50%
//                   offer and its countdown, until they pay or it runs out
//   offer run out   once more, to say it has gone, then never again
//   no offer data   (the migration not yet applied) once a day, plain
//
// "Once" is remembered in localStorage. That is a per-browser convenience,
// which is all this needs: a second device showing it once more is harmless.
// When storage is blocked it falls back to once per page load of the app.
//
// Never on /pricing: that page already shows the offer above the plans.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "@phosphor-icons/react/dist/ssr";
import { useAccountAccess } from "@/app/lib/useAccountAccess";
import { useFocusTrap } from "@/app/lib/useFocusTrap";
import OfferCountdown from "./OfferCountdown";
import styles from "./TrialOffer.module.css";

export const POPUP_DAY_KEY = "jooma.trialEnded.lastShownDay";
export const POPUP_GONE_KEY = "jooma.trialOffer.goneShown";

/** Remembered for this page load when localStorage is unavailable. */
let shownThisLoad = false;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function read(key: string): string | null | undefined {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return undefined; // blocked
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* blocked: shownThisLoad covers it */
  }
}

type Variant = "offer" | "gone" | "plain";

export default function TrialEndedModal() {
  const access = useAccountAccess();
  const pathname = usePathname();
  const [variant, setVariant] = useState<Variant | null>(null);
  const [offerEnded, setOfferEnded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLAnchorElement>(null);

  // Decide once, after the account state arrives.
  useEffect(() => {
    if (!access || variant !== null || shownThisLoad) return;
    if (access.state !== "locked" || !access.hadTrial || access.lapsed) return;
    if (pathname?.startsWith("/pricing")) return;

    let next: Variant | null = null;
    if (access.trialOffer) {
      if (read(POPUP_DAY_KEY) !== today()) next = "offer";
    } else if (access.trialOfferExpiredAt) {
      // Blocked storage reads as unseen, so it shows once per load instead.
      if (read(POPUP_GONE_KEY) !== "1") next = "gone";
    } else if (read(POPUP_DAY_KEY) !== today()) {
      next = "plain";
    }
    if (!next) return;

    // A beat after the page has painted, so it lands on a settled screen
    // rather than flashing up while the dashboard is still loading in.
    const chosen = next;
    const id = window.setTimeout(() => {
      shownThisLoad = true;
      if (chosen === "gone") write(POPUP_GONE_KEY, "1");
      else write(POPUP_DAY_KEY, today());
      setVariant(chosen);
    }, 600);
    return () => window.clearTimeout(id);
  }, [access, pathname, variant]);

  const open = variant !== null;
  useFocusTrap(panelRef, open);

  // Escape closes; focus starts on the main button; the page behind stops
  // scrolling while it is up.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVariant(null);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primaryRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const close = () => setVariant(null);
  const offer = variant === "offer" && access?.trialOffer && !offerEnded ? access.trialOffer : null;

  return createPortal(
    <div
      className={styles.scrim}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-ended-title"
        data-testid="trial-ended-modal"
        data-variant={variant}
      >
        <button type="button" className={styles.close} onClick={close} aria-label="Close">
          <X size={18} weight="bold" />
        </button>

        {offer ? (
          <>
            <span className={styles.badge}>50% off your first month</span>
            <h2 id="trial-ended-title" className={styles.title}>
              Your free trial has ended
            </h2>
            <p className={styles.lead}>
              Thanks for trying Jooma. Choose any monthly plan in the next 7 days and your{" "}
              <strong>first month is half price</strong>. No code needed.
            </p>
            <p className={styles.endsLabel}>Offer ends in</p>
            <OfferCountdown endsAt={offer.endsAt} onExpire={() => setOfferEnded(true)} />
            <div className={styles.actions}>
              <Link ref={primaryRef} href="/pricing" className={styles.primary} onClick={close}>
                Get 50% off
              </Link>
              <button type="button" className={styles.secondary} onClick={close}>
                Continue with free tools
              </button>
            </div>
            <p className={styles.fine}>
              Then the usual monthly price. Cancel any time. Got a code from an ambassador? You can
              still add it on the plans page.
            </p>
          </>
        ) : variant === "gone" || (variant === "offer" && offerEnded) ? (
          <>
            <h2 id="trial-ended-title" className={styles.title}>
              Your 50% offer has ended
            </h2>
            <p className={styles.lead}>
              Your account is still here, and you can keep making slides, comprehensions and
              worksheets for free. Choose a plan any time for all 35 tools and exports.
            </p>
            <div className={styles.actions}>
              <Link ref={primaryRef} href="/pricing" className={styles.primary} onClick={close}>
                Choose a plan
              </Link>
              <button type="button" className={styles.secondary} onClick={close}>
                Continue with free tools
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="trial-ended-title" className={styles.title}>
              Your free trial has ended
            </h2>
            <p className={styles.lead}>
              Choose a plan to keep using all 35 tools and exports. You can still make slides,
              comprehensions and worksheets for free.
            </p>
            <div className={styles.actions}>
              <Link ref={primaryRef} href="/pricing" className={styles.primary} onClick={close}>
                Choose a plan
              </Link>
              <button type="button" className={styles.secondary} onClick={close}>
                Continue with free tools
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
