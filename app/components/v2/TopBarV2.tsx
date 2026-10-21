"use client";

import { useRef, useState, useEffect } from "react";
import { useFocusTrap } from "@/app/lib/useFocusTrap";
import { useMediaQuery } from "@/app/lib/useMediaQuery";
import { Crown, List, X } from "@phosphor-icons/react/dist/ssr";
import ToolSearch from "@/app/components/layout/ToolSearch";
import NotificationBell from "@/app/components/layout/NotificationBell";
import Avatar from "@/app/components/ui/Avatar";
import { AccountLinks, type Account } from "@/app/components/v2/AccountLinks";
import styles from "./TopBarV2.module.css";

interface TopBarV2Props {
  title: string;
  account: Account;
  /** Whether the phone drawer is open; the burger shows a close icon then. */
  menuOpen: boolean;
  /** Opens or closes the phone drawer. */
  onMenu: () => void;
  /** Phones: the avatar opens the drawer at its account section. */
  onAccount: () => void;
  /** Where focus goes back to when the drawer closes: the burger, or the
   *  avatar when that is what opened it. */
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
  avatarButtonRef: React.RefObject<HTMLButtonElement | null>;
}

/* Below 900px the drawer is opened from the burger at the right of this bar.
   The avatar stays beside the bell, and on a phone it opens the same drawer at
   the account links rather than a dropdown of its own. */
export default function TopBarV2({
  title,
  account,
  menuOpen,
  onMenu,
  onAccount,
  menuButtonRef,
  avatarButtonRef,
}: TopBarV2Props) {
  const phone = useMediaQuery("(max-width: 900px)");
  const { avatarUrl, name: displayName, ambassador } = account;

  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const dropdownOpen = profileOpen && !phone;

  // pointerdown, not mousedown: iOS Safari does not send mouse events for a
  // tap on something that is not itself clickable, so a tap on the page
  // background never closed the menu.
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, []);

  // Open: focus the first item, and keep Tab inside the menu. Escape closes
  // it and hands focus back to the avatar, so a keyboard user is never left
  // stranded where the menu used to be.
  useFocusTrap(menuPanelRef, dropdownOpen);
  useEffect(() => {
    if (!dropdownOpen) return;
    menuPanelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setProfileOpen(false);
      avatarButtonRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dropdownOpen]);

  return (
    <header className={styles.top}>
      {/* min-width: 0 and an ellipsis, not a non-shrinking title: a rigid title
          next to this many controls is what pushed the row off a phone. */}
      <h2 className={styles.title}>{title}</h2>

      <div className={styles.right}>
        {/* Search. Hidden below 900px, where it lives in the nav drawer. */}
        <div className={styles.search}>
          <ToolSearch variant="bar" />
        </div>

        {/* A bell reads as "news for you", so it goes where the notifications
            are. Support replies badge the Help link in the sidebar instead,
            alongside the conversations themselves. */}
        <NotificationBell />

        <div className={styles.profile} ref={profileRef}>
          <button
            type="button"
            ref={avatarButtonRef}
            onClick={phone ? onAccount : () => setProfileOpen((v) => !v)}
            aria-label={phone ? "Account" : "Account menu"}
            aria-haspopup={phone ? "dialog" : "menu"}
            aria-expanded={phone ? menuOpen : profileOpen}
            aria-controls={phone ? "app-sidenav-v2" : "account-menu"}
            className={styles.avatarBtn}
          >
            {/* A verified ambassador wears a gold ring and a crown everywhere in
                Jooma; an applicant under review, a dashed ring. */}
            <span
              className={`${styles.avatarRing} ${
                ambassador === "active" ? styles.avatarGold : ambassador === "pending" ? styles.avatarPending : ""
              }`}
              data-ambassador={ambassador}
            >
              <Avatar url={avatarUrl} name={displayName} size={ambassador === "active" || ambassador === "pending" ? 31 : 37} />
              {ambassador === "active" && <Crown weight="fill" className={styles.avatarCrown} aria-hidden />}
            </span>
          </button>

          {dropdownOpen && (
            <div
              id="account-menu"
              ref={menuPanelRef}
              className={styles.menuPanel}
              role="menu"
              aria-label="Account"
            >
              <AccountLinks account={account} variant="menu" />
            </div>
          )}
        </div>

        {/* Phones only (hidden in CSS above 900px). */}
        <button
          type="button"
          ref={menuButtonRef}
          onClick={onMenu}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls="app-sidenav-v2"
          className={styles.burger}
        >
          {menuOpen ? <X className={styles.burgerIcon} /> : <List className={styles.burgerIcon} />}
        </button>
      </div>
    </header>
  );
}
