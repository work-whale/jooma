"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DotsThreeOutline } from "@phosphor-icons/react/dist/ssr";
import { isNavActive } from "@/app/lib/navActive";
import { NAV } from "@/app/components/v2/navItems";
import styles from "./BottomTabsV2.module.css";

/*
 * The phone tab bar: the four places a teacher goes most, within reach of a
 * thumb, and More for everything else.
 *
 * Only below the 900px breakpoint, where the rail is a drawer. More opens that
 * same drawer rather than a second menu, so Timetable, Colleagues, search,
 * pinned tools, plan, credits, Updates and Help each live in exactly one place.
 *
 * #app-tabbar is load-bearing: globals.css keys --j-bottom-ui off its presence,
 * which is how the page and the floating buttons know to clear it.
 */

const TABS = NAV.filter((item) => item.tab);

export default function BottomTabsV2({
  moreOpen,
  onMore,
  moreButtonRef,
}: {
  moreOpen: boolean;
  onMore: () => void;
  /** So AppShellV2 can return focus here when the drawer closes. */
  moreButtonRef?: React.Ref<HTMLButtonElement>;
}) {
  const pathname = usePathname();

  return (
    <nav id="app-tabbar" aria-label="Primary" className={styles.bar}>
      {TABS.map((item) => {
        const active = isNavActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`${styles.tab} ${active ? styles.tabOn : ""}`}
          >
            <item.Icon className={styles.icon} weight={active ? "fill" : "regular"} />
            <span className={styles.label}>{item.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        ref={moreButtonRef}
        onClick={onMore}
        aria-haspopup="dialog"
        aria-expanded={moreOpen}
        aria-controls="app-sidenav-v2"
        className={`${styles.tab} ${moreOpen ? styles.tabOn : ""}`}
      >
        <DotsThreeOutline className={styles.icon} weight={moreOpen ? "fill" : "regular"} />
        <span className={styles.label}>More</span>
      </button>
    </nav>
  );
}
