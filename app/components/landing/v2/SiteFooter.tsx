import Link from "next/link";
import Wordmark from "@/app/components/v2/Wordmark";
import shared from "./landing.module.css";
import styles from "./SiteFooter.module.css";

/**
 * Every link here goes somewhere real.
 *
 * The old footer carried eleven dead `href="#"` links across Company and
 * Resources columns. A footer full of links that do nothing is worse than a
 * short one, so this lists only pages that exist.
 *
 * Contact and School enquiries point at /contact rather than a mailto: those
 * addresses (support@, schools@) never existed, and a mailto collects none of
 * the fields needed to qualify a school lead. /contact is in PUBLIC_PATHS.
 *
 * Refunds and cancellation points at the terms section that covers both,
 * because /refunds does not exist yet (and now answers with a 404 rather than
 * the login page, so a broken link there would be a broken link). Stripe will
 * ask for a refund policy page. When it is built, point this at it and add it
 * to PUBLIC_PATHS in app/lib/route-access.ts and to the sitemap.
 */
const COLUMNS = [
  {
    heading: "Product",
    links: [
      { href: "/#try", label: "Try it" },
      { href: "/#tools", label: "Tools" },
      // The public index, so every page that shows this footer (the tool
      // pages included) links the hub they hang off.
      { href: "/teacher-tools", label: "All teacher tools" },
      { href: "/#pricing", label: "Pricing" },
      { href: "/#schools", label: "For schools" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/contact?type=school", label: "School enquiries" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
      { href: "/terms#payment", label: "Refunds and cancellation" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer className={styles.foot}>
      <div className={shared.shell}>
        <div className={styles.grid}>
          <div>
            <Link href="/" className={styles.brand} aria-label="Jooma">
              <Wordmark />
            </Link>
            <p className={styles.blurb}>
              Teaching resources built around the UK curriculum, by people who have taught.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.heading}>
              <h4>{column.heading}</h4>
              <ul>
                {column.links.map((link) => (
                  <li key={link.label}>
                    {link.href.startsWith("/") ? (
                      <Link href={link.href}>{link.label}</Link>
                    ) : (
                      <a href={link.href}>{link.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={styles.base}>
          <span>&copy; {new Date().getFullYear()} Jooma. All rights reserved.</span>
          <span>Made in the UK</span>
        </div>
      </div>
    </footer>
  );
}
