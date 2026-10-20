"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Question, Medal, X } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/app/lib/auth/client";
import { TOOLS, V2_TOOLS, toolSolid } from "@/app/lib/tools";
import { useCreditMeter } from "@/app/lib/useCreditMeter";
import { useBadgeProgress } from "@/app/lib/useBadgeProgress";
import { usePlanBadge } from "@/app/lib/usePlanBadge";
import { usePinnedTools } from "@/app/lib/usePinnedTools";
import { isNavActive } from "@/app/lib/navActive";
import { useFocusTrap } from "@/app/lib/useFocusTrap";
import { NAV, AMBASSADOR_NAV, type NavItem } from "@/app/components/v2/navItems";
import Wordmark from "@/app/components/v2/Wordmark";
import AmbassadorWordmark from "@/app/components/v2/AmbassadorWordmark";
import TopUpModal from "@/app/components/v2/TopUpModal";
import ToolSearch from "@/app/components/layout/ToolSearch";
import { AccountLinks, type Account } from "@/app/components/v2/AccountLinks";
import { ToolTile } from "@/app/components/v2/Squircle";
import styles from "./SideNavV2.module.css";

/*
 * The 250px rail.
 *
 * Icons are Phosphor at REGULAR weight: this is interface chrome, and fill
 * weight is reserved for glyphs sitting inside a coloured tile.
 *
 * Nav counts are live values, not decoration. "Make" counts the tools that
 * actually exist; "Library" counts the teacher's own saved resources.
 */

/**
 * Show the top-up button once this fraction of the month's credits or less is
 * left. The mirror of PROMINENT_AT (0.8 USED) in the billing page's
 * AllowanceMeter — same moment, counted from the other end.
 */
const LOW_CREDIT_AT = 0.2;

interface SideNavV2Props {
  /** Below 900px the rail is an off-canvas drawer; this is its open state. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  /** Phones: the account links at the foot of the drawer. */
  account?: Account;
  /** "account" when the avatar opened the drawer: it opens at those links. */
  openAt?: "top" | "account";
}

export default function SideNavV2({ mobileOpen = false, onMobileClose, account, openAt = "top" }: SideNavV2Props) {
  const pathname = usePathname();
  const credits = useCreditMeter();
  const badges = useBadgeProgress();
  const plan = usePlanBadge();
  const nav = plan.ambassador ? [...NAV, AMBASSADOR_NAV] : NAV;
  const [topUpOpen, setTopUpOpen] = useState(false);

  // Pinned tools — a shared store, kept in sync with the Library page live.
  const pinnedHrefs = usePinnedTools();
  const pinnedTools = pinnedHrefs.flatMap((href) => {
    const tool = V2_TOOLS.find((t) => t.href === href);
    return tool ? [tool] : [];
  });

  // The teacher's saved resource count, and the two unread badges. Re-fetched
  // on navigation so the counts settle after a generation is saved or a
  // notification is read, without needing a full reload.
  const [resourceCount, setResourceCount] = useState<number | null>(null);
  const [colleagueCount, setColleagueCount] = useState<number | null>(null);
  const [supportUnread, setSupportUnread] = useState(0);
  const [announceUnread, setAnnounceUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const [runs, colleagues, support, announce] = await Promise.all([
        // head + exact count: no rows come back, just the number. RLS scopes it
        // to the signed-in teacher.
        supabase.from("tool_runs").select("id", { count: "exact", head: true }),
        // colleague_edges stores both directions, so this is already the
        // connection count without a de-duplicating OR. Counted here rather
        // than via listColleagues(), which also fetches every profile.
        supabase.from("colleague_edges").select("other_id", { count: "exact", head: true }),
        supabase.rpc("my_support_unread"),
        supabase.rpc("my_announcements_unread"),
      ]);
      if (cancelled) return;
      setResourceCount(runs.count ?? null);
      // null on error (the table is absent on an environment without the
      // migration), which hides the count rather than showing a false zero.
      setColleagueCount(colleagues.error ? null : colleagues.count ?? null);
      setSupportUnread(Number(support.data ?? 0));
      setAnnounceUnread(Number(announce.data ?? 0));
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Focus moves into the drawer when it opens, so a keyboard or screen-reader
  // user is not left behind on the page underneath. AppShellV2 handles
  // returning focus to the burger on close. Opened from the avatar, it lands
  // on the account section instead, scrolled into view.
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!mobileOpen) return;
    if (openAt === "account" && accountRef.current) {
      accountRef.current.scrollIntoView({ block: "end" });
      accountRef.current.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
    } else {
      closeButtonRef.current?.focus();
    }
  }, [mobileOpen, openAt]);

  // While it is a drawer it is a modal: Tab cycles inside it rather than
  // escaping to the page dimmed behind the backdrop. Stands down while the
  // top-up modal is open: that renders outside the drawer and runs its own.
  const asideRef = useRef<HTMLElement>(null);
  useFocusTrap(asideRef, mobileOpen && !topUpOpen);

  const countFor = (item: NavItem): number | null => {
    if (item.count === "tools") return TOOLS.length;
    if (item.count === "resources") return resourceCount;
    // Hidden at zero: "Colleagues 0" reads as a failure state, and the empty
    // page already explains how to connect to someone.
    if (item.count === "colleagues") return colleagueCount || null;
    return null;
  };

  return (
    <>
      <aside
        id="app-sidenav-v2"
        ref={asideRef}
        className={`${styles.side} ${mobileOpen ? styles.sideOpen : ""}`}
        // Dialog semantics only while it is open as the phone drawer. On
        // desktop it is the page's plain sidebar.
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label={mobileOpen ? "Menu" : undefined}
      >
        <div className={styles.head}>
          {/* An ambassador's rail carries the Jooma Ambassador lockup. 27px
              keeps "jooma" inside it the same size as the plain 22px mark. */}
          <Link
            href="/dashboard"
            className={styles.logo}
            aria-label={plan.ambassador ? "Jooma Ambassador, go to Today" : "Jooma, go to Today"}
          >
            {plan.ambassador ? <AmbassadorWordmark height={27} /> : <Wordmark height={22} />}
          </Link>
          {/* Drawer-only. The rail has nothing to close. */}
          <button
            type="button"
            ref={closeButtonRef}
            onClick={onMobileClose}
            aria-label="Close navigation"
            className={styles.close}
          >
            <X className={styles.closeIcon} />
          </button>
        </div>

        {/* Tool search. Lives in the drawer on mobile because the top bar has
            no room for it there: its results panel alone is wider than a phone. */}
        <div className={styles.drawerSearch}>
          <ToolSearch variant="drawer" onNavigate={onMobileClose} />
        </div>

        <nav className={styles.nav} aria-label="Main">
          {nav.map((item) => {
            const count = countFor(item);

            if (item.soon) {
              return (
                <span
                  key={item.label}
                  className={`${styles.navitem} ${styles.navitemSoon}`}
                  aria-disabled="true"
                >
                  <item.Icon className={styles.navicon} />
                  {item.label}
                  <span className={styles.soon}>Soon</span>
                </span>
              );
            }

            const active = isNavActive(item.href, pathname);

            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`${styles.navitem} ${
                  item.gold ? (active ? styles.navitemGoldOn : styles.navitemGold) : ""
                } ${active && !item.gold ? styles.navitemOn : ""}`}
              >
                <item.Icon
                  className={styles.navicon}
                  weight={active || item.gold ? "fill" : "regular"}
                />
                {item.label}
                {count !== null && <span className={styles.count}>{count}</span>}
              </Link>
            );
          })}
        </nav>

        {/* The level box, directly under the nav rather than down with credits.
            Shown from level 1 with an empty track, as in the mockup: "9 more
            badges to reach Level 2" is a goal rather than a judgement, and
            hiding it until something is earned meant most teachers would
            never discover the collection exists. Only the migration not being
            applied hides it. */}
        {badges.available && !badges.loading && (
          <Link href="/profile?section=badges" className={styles.levelBox}>
            <div className={styles.meterTop}>
              <span className={styles.meterName}>
                <Medal weight="fill" className={styles.levelIcon} />
                Level {badges.level}
              </span>
              <span className={styles.meterVal}>
                {/* "None yet" rather than "0 of 100": the count is the one
                    place a zero would read as a verdict on the teacher. */}
                {badges.earnedCount === 0
                  ? "None yet"
                  : `${badges.earnedCount} of ${badges.total}`}
              </span>
            </div>
            <div className={styles.track}>
              <i
                className={styles.trackFill}
                style={{ width: `${Math.round(badges.levelFraction * 100)}%` }}
              />
            </div>
            <p className={styles.meterNote}>
              {badges.toNextLevel === 0
                ? "The full set. Nothing left to climb."
                : `${badges.toNextLevel} more ${
                    badges.toNextLevel === 1 ? "badge" : "badges"
                  } to reach Level ${badges.level + 1}`}
            </p>
          </Link>
        )}

        <div className={styles.foot}>
          {/* Pinned from the Library page. */}
          {pinnedTools.length > 0 && (
            <div className={styles.pinned}>
              <span className={styles.pinnedHead}>Pinned</span>
              {pinnedTools.map((tool) => (
                <Link key={tool.href} href={tool.href} className={styles.pinnedItem}>
                  <ToolTile icon={tool.icon} solid={toolSolid(tool)} size="xs" />
                  <span className={styles.pinnedName}>{tool.name}</span>
                </Link>
              ))}
            </div>
          )}


          {/* The plan they are on, and the way to change it, for everybody.
              Directly above credits because the two answer one question
              between them: what do I have, and how much of it is left. The
              button always goes to /pricing, the one place plans change. */}
          <div
            className={`${styles.plan} ${plan.ambassador ? styles.planGold : ""}`}
            data-testid="sidebar-plan"
          >
            <div className={styles.meterTop}>
              <span className={styles.meterName}>Your plan</span>
              <span
                className={`${styles.planPill} ${plan.ambassador ? styles.planPillGold : ""}`}
              >
                {plan.loading ? " " : plan.label}
              </span>
            </div>
            {!plan.loading && plan.note && <p className={styles.meterNote}>{plan.note}</p>}
            {!plan.loading && (
              <Link href={plan.cta.href} className={styles.upgrade} onClick={onMobileClose}>
                {plan.cta.label}
              </Link>
            )}
          </div>

          {/* Credits live HERE and in the account page, nowhere else. No per
              tool costs on cards, no chips on list rows. */}
          {credits.metered && (
            <div className={styles.meter}>
              <div className={styles.meterTop}>
                <span className={styles.meterName}>Credits</span>
                <span className={styles.meterVal}>
                  {credits.loading
                    ? "—"
                    : `${credits.remaining.toLocaleString("en-GB")} left`}
                </span>
              </div>
              <div className={styles.track}>
                <i
                  className={styles.trackFill}
                  style={{ width: `${Math.round(credits.fraction * 100)}%` }}
                />
              </div>
              <p className={styles.meterNote}>
                Refills to {credits.allowance.toLocaleString("en-GB")} on{" "}
                {credits.refillsOn.toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "long",
                })}
              </p>
              {/* The METER is always shown on a metered plan; the BUTTON only
                  once credits are actually running low. Offering to sell more
                  to someone with most of the month's allowance left is a nag,
                  and pricing_rules carries the same instinct as `hide_counter`.

                  MIND THE INVERSION: this fraction is credits REMAINING (see
                  useCreditMeter), while AllowanceMeter's same-named fraction is
                  the proportion USED. `remaining <= 0.2` here and `used >= 0.8`
                  there are the same moment described from opposite ends — they
                  are not a contradiction to be tidied up.

                  Suppressed while loading so the button cannot flash on against
                  the initial remaining=0 before real figures arrive. */}
              {!credits.loading && credits.fraction <= LOW_CREDIT_AT && (
                <button
                  type="button"
                  className={styles.topup}
                  onClick={() => setTopUpOpen(true)}
                >
                  Top up credits
                </button>
              )}
            </div>
          )}

          <div className={styles.sideFoot}>
            <Link href="/notifications" className={styles.footLink}>
              <Bell className={styles.footIcon} />
              Updates
              {announceUnread > 0 && <span className={styles.badge}>{announceUnread}</span>}
            </Link>
            <Link href="/help" className={styles.footLink}>
              <Question className={styles.footIcon} />
              Help
              {supportUnread > 0 && <span className={styles.badge}>{supportUnread}</span>}
            </Link>
          </div>

          {/* Drawer-only (hidden in CSS on the desktop rail, where the avatar's
              dropdown carries them). */}
          {account && (
            <div ref={accountRef} className={styles.account} aria-label="Account" role="group">
              <AccountLinks account={account} variant="drawer" onNavigate={onMobileClose} />
            </div>
          )}
        </div>
      </aside>

      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </>
  );
}
