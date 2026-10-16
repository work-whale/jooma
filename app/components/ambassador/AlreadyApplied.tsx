"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SealCheck } from "@phosphor-icons/react";
import s from "./programme.module.css";

/** How long the message stays before the dashboard opens. */
const REDIRECT_MS = 3000;

/** Set in this tab once an application is sent. */
const APPLIED_KEY = "jooma:ambassador-applied";

/** Remember, for this tab, that the application has been sent. */
export function markApplied() {
  try {
    sessionStorage.setItem(APPLIED_KEY, "1");
  } catch {
    // Blocked storage: the server-side check still catches a fresh load.
  }
}

function readApplied(): boolean {
  try {
    return sessionStorage.getItem(APPLIED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Re-read when the browser restores a page from its back-forward cache. */
function subscribe(onChange: () => void) {
  window.addEventListener("pageshow", onChange);
  return () => window.removeEventListener("pageshow", onChange);
}

/**
 * Shows AlreadyApplied instead of its children once this tab has sent an
 * application. The server pages already refuse someone who has applied, but
 * Back can show a copy the browser or the router kept from before they signed,
 * without asking the server; this catches that.
 */
export function AppliedGuard({ children }: { children: React.ReactNode }) {
  const applied = useSyncExternalStore(subscribe, readApplied, () => false);
  return applied ? <AlreadyApplied /> : <>{children}</>;
}

/**
 * Shown instead of the application form to someone who has already sent one:
 * most often after pressing Back (or the mouse's back button) straight after
 * signing, which used to land them on an empty step one. Says so, then takes
 * them to the dashboard; the button is for anyone who doesn't want to wait.
 */
export default function AlreadyApplied() {
  const router = useRouter();

  useEffect(() => {
    const t = window.setTimeout(() => router.replace("/dashboard"), REDIRECT_MS);
    return () => window.clearTimeout(t);
  }, [router]);

  return (
    <div className={`${s.root} ${s.wrap} ${s.narrow}`} data-testid="already-applied">
      <div className={s.statebox}>
        <span className={s.stateIc}>
          <SealCheck size={32} weight="fill" />
        </span>
        <h1 className={s.h1}>You have already applied.</h1>
        <p role="status">Your application is with us. Taking you to your dashboard…</p>
        <div className={s.actions} style={{ justifyContent: "center" }}>
          <Link href="/dashboard" replace className={`${s.btn} ${s.btnPrimary}`}>
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
