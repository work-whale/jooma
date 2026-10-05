"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Wordmark from "@/app/components/v2/Wordmark";
import { formatVisitors } from "@/app/lib/visitors";
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
 * Sits transparent over the hero's purple band, white on purple, and turns to
 * the light bar once the page has scrolled. The visitor count joins it then,
 * so the figure stays in view after the hero that shows it has gone.
 *
 * Signed out it shows Log in and Start free. Signed in it defers to NavAuth for
 * the avatar dropdown, so the routes into the app (dashboard, admin, billing,
 * sign out) stay defined in exactly one place. NavAuth's own signed-out branch
 * is styled for the old cream theme, so it is only mounted when there is a
 * session to show.
 */
export default function LandingNav({
  email,
  name,
  fullName,
  avatarUrl,
  isAdmin,
  visitors = null,
}: {
  email: string | null;
  name: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  visitors?: number | null;
}) {
  // Drops a hairline under the bar once the page has moved, so the header
  // separates from the content without being a permanent line at rest.
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`${styles.nav} ${stuck ? styles.stuck : styles.onBand}`}>
      <div className={`${shared.shell} ${styles.inner}`}>
        <Link href="/" className={styles.brand} aria-label="Jooma">
          <Wordmark />
        </Link>

        <nav className={styles.links}>
          {LINKS.map((link) => (
            <a key={link.href} className={styles.link} href={link.href}>
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
      </div>
    </header>
  );
}
