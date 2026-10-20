"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChatTeardropDots, X } from "@phosphor-icons/react/dist/ssr";
import { useMediaQuery } from "@/app/lib/useMediaQuery";
import { DESKTOP_HINT_TEXT, hintScope } from "@/app/lib/desktopHint";
import styles from "./jo.module.css";

/*
 * Jo's nudge on a phone: the tools work here, and are roomier on a desktop.
 *
 * Phones and Folds only (the app's 900px breakpoint), once per tool per
 * session, a moment after the page settles so it does not land on top of the
 * first tap. It sits under the top bar rather than along the bottom, where the
 * Jo button, the activity card and the editor's filmstrip already live.
 * Dismissed by its close button or after a few seconds on its own.
 */

const KEY = "jooma:desktop-hint:";
const SHOW_AFTER_MS = 2000;
const HIDE_AFTER_MS = 9000;

function seen(scope: string): boolean {
  try {
    return window.sessionStorage.getItem(KEY + scope) === "1";
  } catch {
    return false;
  }
}

function markSeen(scope: string) {
  try {
    window.sessionStorage.setItem(KEY + scope, "1");
  } catch {
    /* private window or blocked storage: it may show again, which is fine */
  }
}

export default function DesktopHintPill() {
  const phone = useMediaQuery("(max-width: 900px)");
  const pathname = usePathname();
  const scope = hintScope(pathname);
  const [shownFor, setShownFor] = useState<string | null>(null);

  useEffect(() => {
    if (!phone || seen(scope)) return;
    const show = window.setTimeout(() => {
      markSeen(scope);
      setShownFor(scope);
    }, SHOW_AFTER_MS);
    return () => window.clearTimeout(show);
  }, [phone, scope]);

  const visible = phone && shownFor === scope;

  useEffect(() => {
    if (!visible) return;
    const hide = window.setTimeout(() => setShownFor(null), HIDE_AFTER_MS);
    return () => window.clearTimeout(hide);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="desktop-hint"
      className="panel-slide-in fixed z-70 left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+4.5rem)] w-max max-w-[calc(100vw-1.5rem)] flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-1 shadow-lg border"
      style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
    >
      <span aria-hidden="true" className={`${styles.orb} ${styles.orbSmall}`}>
        <ChatTeardropDots weight="fill" />
      </span>
      <p className="text-[12.5px] leading-snug font-semibold min-w-0" style={{ color: "var(--j-ink)" }}>
        <span className="sr-only">Jo says: </span>
        {DESKTOP_HINT_TEXT}
      </p>
      <button
        type="button"
        onClick={() => setShownFor(null)}
        aria-label="Dismiss"
        className="grid place-items-center w-11 h-11 -my-2 shrink-0 rounded-full active:bg-black/5"
        style={{ color: "var(--j-muted)" }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
