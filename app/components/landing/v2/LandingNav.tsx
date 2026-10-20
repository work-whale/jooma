"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { List, X } from "@phosphor-icons/react";
import Wordmark from "@/app/components/v2/Wordmark";
import { formatVisitors } from "@/app/lib/visitors";
import { useFocusTrap } from "@/app/lib/useFocusTrap";
import NavAuth from "../NavAuth";
import shared from "./landing.module.css";
import styles from "./LandingNav.module.css";

const LINKS = [
  { href: "#try", label: "Try it free" },
  { href: "#tools", label: "Tools" },
  { href: "#pricing", label: "Pricing" },
  { href: "#schools", label: "Schools" },
];

/**
 * The sticky landing header.
 *
 * Purple with the white wordmark the whole way down. At rest it sits over the
 * hero's purple band with no ground of its own; once the page scrolls it takes
 * a solid purple ground and a soft shadow, so the page reads as passing under
 * it. The visitor count joins it then, so the figure stays in view after the
 * hero that shows it has gone.
 *
 * On a phone the links and the account sit behind a menu button at the top
 * right, so the bar is one short row.
 *
 * Signed out it shows Log in and Start free. Signed in it defers to NavAuth for
 * the account routes (dashboard, admin, billing, sign out), so they stay
 * defined in exactly one place. NavAuth's own signed-out branch is styled for
 * the old cream theme, so it is only mounted when there is a session to show.
 */
export default function LandingNav({
  email,
  name,
  fullName,
  avatarUrl,
  isAdmin,
  visitors = null,
  linkBase = "",
}: {
  email: string | null;
  name: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  visitors?: number | null;
  /** "/" on any page but the landing page, so the section links go back to it
   *  rather than looking for sections that are not there. */
  linkBase?: string;
}) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── The phone menu ──
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = () => setOpen(false);

  useFocusTrap(headerRef, open);
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    // pointerdown, not mousedown: iOS Safari sends no mouse events for a tap
    // on something that is not itself clickable.
    const onDown = (e: PointerEvent) => {
      if (!headerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Turning a phone or unfolding a Fold past the breakpoint leaves the
    // desktop bar, which has no menu to keep open.
    const wide = window.matchMedia("(min-width: 861px)");
    const onWide = () => wide.matches && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      wide.removeEventListener("change", onWide);
    };
  }, [open]);

  return (
    <header
      ref={headerRef}
      className={`${styles.nav} ${stuck || open ? styles.stuck : ""}`}
      data-landing-nav=""
    >
      <div className={`${shared.shell} ${styles.inner}`}>
        <Link href="/" className={styles.brand} aria-label="Jooma" onClick={close}>
          <Wordmark />
        </Link>

        <nav className={styles.links} aria-label="Main">
          {LINKS.map((link) => (
            <a key={link.href} className={styles.link} href={`${linkBase}${link.href}`}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className={styles.right}>
          {visitors !== null && (
            <span className={styles.count}>
              <i className={styles.pip} aria-hidden="true" />
              <b>{formatVisitors(visitors)}</b>&nbsp;teachers
            </span>
          )}
          {email ? (
            <span className={styles.auth}>
              <NavAuth
                name={name}
                fullName={fullName}
                avatarUrl={avatarUrl}
                email={email}
                isAdmin={isAdmin}
              />
            </span>
          ) : (
            <>
              <Link className={styles.link} href="/login">
                Log in
              </Link>
              <Link className={`${shared.btn} ${shared.btnP} ${styles.cta}`} href="/signup">
                Start free
              </Link>
            </>
          )}
        </div>

        <button
          ref={toggleRef}
          type="button"
          className={styles.burger}
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X weight="bold" aria-hidden="true" /> : <List weight="bold" aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div id="landing-menu" ref={panelRef} className={styles.panel}>
          <nav className={styles.panelLinks} aria-label="Main">
            {LINKS.map((link) => (
              <a key={link.href} className={styles.panelLink} href={`${linkBase}${link.href}`} onClick={close}>
                {link.label}
              </a>
            ))}
          </nav>
          <div className={styles.panelAccount}>
            {email ? (
              <NavAuth
                variant="list"
                name={name}
                fullName={fullName}
                avatarUrl={avatarUrl}
                email={email}
                isAdmin={isAdmin}
                onNavigate={close}
              />
            ) : (
              <>
                <Link className={styles.panelLink} href="/login" onClick={close}>
                  Log in
                </Link>
                <Link className={`${shared.btn} ${shared.btnP} ${styles.panelCta}`} href="/signup" onClick={close}>
                  Start free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
