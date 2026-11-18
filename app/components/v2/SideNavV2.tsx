"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  CaretLeft,
  ImageSquare,
  Lightning,
  LockSimple,
  Question,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/app/lib/auth/client";
import { TOOLS, V2_TOOLS, toolSolid } from "@/app/lib/tools";
import { useCreditMeter } from "@/app/lib/useCreditMeter";
import { useBadgeProgress } from "@/app/lib/useBadgeProgress";
import { usePlanBadge } from "@/app/lib/usePlanBadge";
import { useAccountAccess } from "@/app/lib/useAccountAccess";
import { chipLabel } from "@/app/lib/plan-badge";
import { usePinnedTools } from "@/app/lib/usePinnedTools";
import { isNavActive } from "@/app/lib/navActive";
import { useFocusTrap } from "@/app/lib/useFocusTrap";
import { meterState, meterValue } from "@/app/lib/resource-meter";
import { PLAN_CONFIG, topUpsAllowed, type AccountPlan } from "@/app/lib/plan-config";
import { trialDateShort } from "@/app/lib/account-plan";
import { planBlockV45 } from "@/app/lib/prompt-views";
import { NAV, AMBASSADOR_NAV, type NavItem } from "@/app/components/v2/navItems";
import Wordmark from "@/app/components/v2/Wordmark";
import AmbassadorWordmark from "@/app/components/v2/AmbassadorWordmark";
import TopUpModal from "@/app/components/v2/TopUpModal";
import ToolSearch from "@/app/components/layout/ToolSearch";
import { AccountLinks, type Account } from "@/app/components/v2/AccountLinks";
import { ToolTile } from "@/app/components/v2/Squircle";
import PlanCountdown from "./PlanCountdown";
import styles from "./SideNavV2.module.css";

/*
 * The sidebar, v4 (docs/Jooma version 4.5/15-jooma-dashboard-v4.html).
 *
 * Dark chrome. From the top: the wordmark with the plan chip and the collapse
 * button, the nav, pinned tools, then pushed to the foot the resources meter,
 * the picture slides row, the plan block and a footer with the level and help.
 *
 * Collapsed (desktop only) it is a 70px rail: icons with tooltips, and a
 * lightning badge with the number left once resources are worth watching.
 * Below 900px it is the phone drawer as before, dark too.
 *
 * Icons are Phosphor at REGULAR weight: chrome, not a glyph in a tile.
 */

interface SideNavV2Props {
  /** Below 900px the rail is an off-canvas drawer; this is its open state. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  /** Phones: the account links at the foot of the drawer. */
  account?: Account;
  /** "account" when the avatar opened the drawer: it opens at those links. */
  openAt?: "top" | "account";
  /** Desktop: the 70px rail. Ignored as a drawer. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function SideNavV2({
  mobileOpen = false,
  onMobileClose,
  account,
  openAt = "top",
  collapsed = false,
  onToggleCollapsed,
}: SideNavV2Props) {
  const pathname = usePathname();
  const credits = useCreditMeter();
  const badges = useBadgeProgress();
  const plan = usePlanBadge();
  const access = useAccountAccess();
  const chip = chipLabel(
    plan,
    access?.accountPlan === "pro_trial" && access.state === "trial" ? "pro_trial" : access?.state === "free" ? "free" : null,
  );
  const nav = plan.ambassador ? [...NAV, AMBASSADOR_NAV] : NAV;
  // Jooma 4.5: the plan block from the plan in force. The trial shows its real
  // end date (P1's chip) and no ticking countdown. An ambassador's free Pro
  // keeps its own block. Null before the migration (no 4.5 row).
  const v45Block =
    access && (access.state === "free" || access.accountPlan === "pro_trial" || access.resourcesV45) && !plan.ambassador
      ? planBlockV45(access.accountPlan, access.trialEndsAt)
      : null;
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
        // connection count without a de-duplicating OR.
        supabase.from("colleague_edges").select("other_id", { count: "exact", head: true }),
        supabase.rpc("my_support_unread"),
        supabase.rpc("my_announcements_unread"),
      ]);
      if (cancelled) return;
      setResourceCount(runs.count ?? null);
      // null on error hides the count rather than showing a false zero.
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

  // While it is a drawer it is a modal: Tab cycles inside it. Stands down
  // while the top-up modal is open: that renders outside the drawer.
  const asideRef = useRef<HTMLElement>(null);
  useFocusTrap(asideRef, mobileOpen && !topUpOpen);

  const countFor = (item: NavItem): number | null => {
    if (item.count === "tools") return TOOLS.length;
    if (item.count === "resources") return resourceCount;
    // Hidden at zero: "Colleagues 0" reads as a failure state.
    if (item.count === "colleagues") return colleagueCount || null;
    return null;
  };

  // The meter. Calm states the allowance; watch and low show what is left.
  const state = credits.loading ? "calm" : meterState(credits.remaining, credits.allowance);
  const showRailWarn = credits.metered && !credits.loading && state !== "calm";
  const refill = credits.refillsOn
    ? credits.refillsOn.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" })
    : null;
  // The line under the meter: when it refills, or when the trial ends.
  const refillLine =
    credits.period === "trial"
      ? credits.endsOn
        ? `Trial ends ${trialDateShort(credits.endsOn)}.`
        : ""
      : refill
        ? credits.period === "week"
          ? `Back to ${PLAN_CONFIG.free.resources} on Sunday.`
          : `Refills ${refill}.`
        : "";
  // 4.5: only plans that can buy a pack are offered one. Before 4.5 (plan
  // null) the meter only ever shows for paid plans, which could.
  const canTopUp = credits.plan === null || topUpsAllowed(credits.plan as AccountPlan);
  const per = credits.period === "trial" ? "in your trial" : `a ${credits.period}`;

  // Desktop only: the drawer is never a rail.
  const mini = collapsed && !mobileOpen;

  return (
    <>
      <aside
        id="app-sidenav-v2"
        ref={asideRef}
        className={`${styles.side} ${mobileOpen ? styles.sideOpen : ""} ${mini ? styles.mini : ""}`}
        data-collapsed={mini ? "true" : undefined}
        // Dialog semantics only while it is open as the phone drawer.
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label={mobileOpen ? "Menu" : undefined}
      >
        <div className={styles.head}>
          <Link
            href="/dashboard"
            className={styles.logo}
            aria-label={plan.ambassador ? "Jooma Ambassador, go to Today" : "Jooma, go to Today"}
          >
            <span className={styles.logoFull}>
              {plan.ambassador ? <AmbassadorWordmark height={25} /> : <Wordmark height={20} />}
            </span>
            {/* The collapsed rail carries the "j" alone. */}
            <svg className={styles.logoMark} viewBox="0 0 270 967" aria-hidden>
              <g transform="translate(65,745) scale(1,-1)" fill="currentColor">
                <path d="M-11 -222Q-26 -222 -40.5 -220.5Q-55 -219 -65 -217V-89Q-48 -92 -31 -92Q12 -92 33.5 -74.0Q55 -56 55 -20V546H205V-20Q205 -84 179.5 -129.5Q154 -175 105.5 -198.5Q57 -222 -11 -222ZM55 595V745H205V595Z" />
              </g>
            </svg>
          </Link>
          {!plan.loading && chip && (
            <span
              className={`${styles.planChip} ${plan.ambassador ? styles.planChipGold : ""}`}
              data-testid="sidebar-plan-chip"
            >
              {chip}
            </span>
          )}
          <button
            type="button"
            className={styles.collapse}
            onClick={onToggleCollapsed}
            aria-label={mini ? "Expand the sidebar" : "Collapse the sidebar"}
            aria-pressed={mini}
            title={mini ? "Expand" : "Collapse"}
          >
            <CaretLeft weight="bold" className={styles.collapseIcon} />
          </button>
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

        {/* Tool search, drawer only: the top bar has no room for it on a phone. */}
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
                  data-tip={item.label}
                >
                  <item.Icon className={styles.navicon} />
                  <span className={styles.lab}>{item.label}</span>
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
                data-tip={item.label}
                className={`${styles.navitem} ${
                  item.gold ? (active ? styles.navitemGoldOn : styles.navitemGold) : ""
                } ${active && !item.gold ? styles.navitemOn : ""}`}
              >
                <item.Icon className={styles.navicon} weight={active || item.gold ? "fill" : "regular"} />
                <span className={styles.lab}>{item.label}</span>
                {count !== null && <span className={styles.count}>{count}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Pinned from the Make page. */}
        {pinnedTools.length > 0 && (
          <div className={styles.pinned}>
            <span className={styles.pinnedHead}>Pinned</span>
            {pinnedTools.map((tool) => (
              <Link key={tool.href} href={tool.href} className={styles.pinnedItem} data-tip={tool.name}>
                <ToolTile icon={tool.icon} solid={toolSolid(tool)} size="xs" />
                <span className={styles.pinnedName}>{tool.name}</span>
              </Link>
            ))}
          </div>
        )}

        <div className={styles.spacer} />

        {/* The collapsed rail's one warning: what is left, once it matters. */}
        {showRailWarn && (
          <Link
            href="/profile?section=subscription"
            className={styles.railWarn}
            aria-label={`${credits.remaining.toLocaleString("en-GB")} resources left`}
          >
            <span className={styles.railWarnIcon}>
              <Lightning weight="fill" />
              <span className={styles.pip} />
            </span>
            <span className={styles.railWarnNum}>{credits.remaining.toLocaleString("en-GB")}</span>
          </Link>
        )}

        <div className={styles.foot}>
          {credits.metered && (
            <div className={styles.meters}>
              <div className={`${styles.meter} ${styles[`meter_${state}`]}`} data-testid="sidebar-resources">
                <div className={styles.meterTop}>
                  <span className={styles.meterName}>Resources</span>
                  <span className={styles.meterVal}>
                    {credits.loading
                      ? "…"
                      : meterValue({ left: credits.remaining, allowance: credits.allowance, period: credits.period })}
                  </span>
                </div>
                {!credits.loading && state !== "calm" && (
                  <div
                    className={styles.track}
                    role="progressbar"
                    aria-label={`Resources left ${credits.period === "week" ? "this week" : credits.period === "trial" ? "in your trial" : "this month"}`}
                    aria-valuemin={0}
                    aria-valuemax={credits.allowance}
                    aria-valuenow={credits.remaining}
                  >
                    <i className={styles.trackFill} style={{ width: `${Math.round(credits.fraction * 100)}%` }} />
                  </div>
                )}
                <p className={styles.meterNote}>
                  {state === "calm"
                    ? refillLine
                    : `of ${credits.allowance.toLocaleString("en-GB")} ${per}. ${refillLine}`.trim()}
                </p>
                {/* Offered only once it is actually low: selling more to someone
                    with most of the month left is a nag. Suppressed while
                    loading so it cannot flash on against the initial zero. */}
                {!credits.loading && state === "low" && canTopUp && (
                  <button type="button" className={styles.topup} onClick={() => setTopUpOpen(true)}>
                    Top up
                  </button>
                )}
              </div>

              {/* Orange is picture slides and nothing else. Free and Standard
                  get library photos, so the row is locked there. */}
              {credits.pictures ? (
                <div className={styles.meter} data-testid="sidebar-pictures">
                  <div className={styles.meterTop}>
                    <span className={styles.meterName}>
                      <ImageSquare weight="fill" className={styles.picIcon} aria-hidden />
                      Picture slides
                    </span>
                    <span className={styles.meterVal}>Included</span>
                  </div>
                </div>
              ) : (
                <div className={`${styles.meter} ${styles.meterLocked}`} data-testid="sidebar-pictures">
                  <div className={styles.meterTop}>
                    <span className={styles.meterName}>Picture slides</span>
                    <span className={styles.meterVal}>Library photos</span>
                  </div>
                  <p className={styles.lockRow}>
                    <LockSimple weight="fill" aria-hidden />
                    <span>Pro and Max only</span>
                  </p>
                </div>
              )}
            </div>
          )}

          {!credits.metered && !credits.loading && plan.plan === "free" && (
            <div className={styles.meters}>
              <div className={`${styles.meter} ${styles.meterLocked}`}>
                <div className={styles.meterTop}>
                  <span className={styles.meterName}>Picture slides</span>
                  <span className={styles.meterVal}>None</span>
                </div>
                <p className={styles.lockRow}>
                  <LockSimple weight="fill" aria-hidden />
                  <span>On every paid plan</span>
                </p>
              </div>
            </div>
          )}

          {/* What they have and the one way to change it. Always /pricing. */}
          <div
            className={`${styles.plan} ${plan.ambassador ? styles.planGold : ""} ${
              plan.countdown?.kind === "offer" ? styles.planOfferCard : ""
            }`}
            data-testid="sidebar-plan"
          >
            <span className={styles.srOnly}>Your plan: {plan.loading ? "" : plan.label}</span>
            {v45Block ? (
              <>
                {v45Block.note && (
                  <p className={styles.planNote} data-testid="sidebar-plan-note">
                    {v45Block.note}
                  </p>
                )}
                <Link href={v45Block.cta.href} className={styles.upgrade} onClick={onMobileClose}>
                  {v45Block.cta.label}
                </Link>
              </>
            ) : (
              <>
                {!plan.loading && plan.countdown ? (
                  <PlanCountdown countdown={plan.countdown} note={plan.note} />
                ) : (
                  !plan.loading && plan.note && <p className={styles.planNote}>{plan.note}</p>
                )}
                {!plan.loading && (
                  <Link href={plan.cta.href} className={styles.upgrade} onClick={onMobileClose}>
                    {plan.cta.label}
                  </Link>
                )}
              </>
            )}
          </div>

          <div className={styles.sideFoot}>
            {badges.available && !badges.loading ? (
              <Link href="/profile?section=badges" className={styles.level}>
                <span className={styles.levelDot} />
                Level {badges.level}
              </Link>
            ) : (
              <span />
            )}
            <span className={styles.footLinks}>
              <Link href="/notifications" className={styles.footLink} aria-label="Updates">
                <Bell className={styles.footIcon} />
                {announceUnread > 0 && <span className={styles.badge}>{announceUnread}</span>}
              </Link>
              <Link href="/help" className={styles.footLink}>
                <Question className={styles.footIcon} />
                Help
                {supportUnread > 0 && <span className={styles.badge}>{supportUnread}</span>}
              </Link>
            </span>
          </div>

          {/* Drawer-only (the avatar's dropdown carries them on desktop). */}
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
