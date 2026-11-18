"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react/dist/ssr";
import { createClient } from "@/app/lib/auth/client";
import { useAccountAccess } from "@/app/lib/useAccountAccess";
import { usePresenting } from "@/app/lib/presenting";
import { canShowPrompt, PROMPT_COPY, type PromptId } from "@/app/lib/prompts";
import { p2View, p12Line } from "@/app/lib/prompt-views";
import { trialDateLong, trialPrompt } from "@/app/lib/account-plan";
import { minutesSavedFor } from "@/app/lib/plan-config";
import {
  dismissedUntil,
  dismissPrompt,
  logPrompt,
  markPopupShown,
  markShown,
  popupShownThisVisit,
  shownBefore,
} from "@/app/lib/prompt-client";
import PromptSheet, { promptStyles as styles } from "./PromptSheet";

/*
 * The Jooma 4.5 prompts that belong to the account rather than to an action,
 * mounted once in the app shell:
 *
 *   launch-day trial  an account moved to Free with trial_pending starts its
 *                     10 days of Pro at this login (spec Step 8, rule 3)
 *   P1 banner         Pro trial, days 7 to 10, on Today only; hides for the
 *                     rest of the UK day once closed
 *   P2 pop-up         Free straight from the trial, first visit after it ends,
 *                     once ever
 *   P12 banner        a paid plan whose last payment failed, every screen
 *                     until fixed; "Not now" hides it for 7 days
 *
 * Nothing at all while presenting. All of it is null before the plans engine
 * migration, because only a 4.5 row carries these fields.
 */

const P2_WINDOW_DAYS = 14;

export default function PlanPromptsHost() {
  const access = useAccountAccess();
  const presenting = usePresenting();
  const pathname = usePathname();
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  // P2 marks itself shown as it opens, which would make the rules hide it on
  // the next render; once it opens it stays until closed.
  const [p2Open, setP2Open] = useState<"no" | "open" | "done">("no");

  // Launch day: start the waiting trial once, then reload so every surface
  // reads the trial.
  useEffect(() => {
    if (!access?.trialPending || access.accountPlan !== "free") return;
    let once = false;
    try {
      once = window.sessionStorage.getItem("jooma.trial.pending") === "1";
      window.sessionStorage.setItem("jooma.trial.pending", "1");
    } catch {
      /* no storage: try once per page */
    }
    if (once) return;
    void fetch("/api/trial/start", { method: "POST" }).then((res) => {
      if (res.ok) window.location.reload();
    });
  }, [access]);

  // P2: Free, the trial ended in the last fortnight, never shown before.
  // Decided in an effect (it reads localStorage), and latched: P2 marks itself
  // shown as it opens, which would otherwise hide it on the next render.
  useEffect(() => {
    if (!access || presenting || p2Open !== "no") return;
    const ended = access.trialEndedAt ?? null;
    const eligible =
      access.accountPlan === "free" &&
      ended !== null &&
      Date.now() - ended.getTime() < P2_WINDOW_DAYS * 86_400_000 &&
      canShowPrompt("P2", {
        plan: access.accountPlan,
        presenting,
        popupShownThisVisit: popupShownThisVisit(),
        dismissedUntil: dismissedUntil("P2"),
        shownBefore: shownBefore("P2"),
        now: new Date(),
      });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a one-way latch from browser storage
    if (eligible) setP2Open("open");
  }, [access, presenting, p2Open]);

  const ctx = (id: PromptId) =>
    access
      ? {
          plan: access.accountPlan,
          presenting,
          popupShownThisVisit: typeof window !== "undefined" && popupShownThisVisit(),
          dismissedUntil: typeof window !== "undefined" ? dismissedUntil(id) : null,
          shownBefore: typeof window !== "undefined" && shownBefore(id),
          now: new Date(),
        }
      : null;

  if (!access || presenting) return null;

  // P12: payment failed, every screen.
  const p12Ctx = ctx("P12");
  const showP12 = Boolean(access.paymentFailedAt) && p12Ctx !== null && canShowPrompt("P12", p12Ctx);

  // P1: days 7 to 10 of the trial, on Today.
  const p1Ctx = ctx("P1");
  const showP1 =
    pathname === "/dashboard" &&
    access.accountPlan === "pro_trial" &&
    access.trialEndsAt !== null &&
    access.trialStartedAt !== null &&
    trialPrompt(access.trialStartedAt, new Date()) === "banner" &&
    p1Ctx !== null &&
    canShowPrompt("P1", p1Ctx);

  const ended = access.trialEndedAt ?? null;

  return (
    <>
      {showP12 && <P12Banner plan={access.accountPlan} onDone={rerender} />}
      {showP1 && access.trialEndsAt && <P1Banner ends={access.trialEndsAt} onDone={rerender} />}
      {p2Open === "open" && ended && access.trialStartedAt && (
        <P2Popup from={access.trialStartedAt} to={ended} onDone={() => setP2Open("done")} />
      )}
    </>
  );
}

function useLoggedOnce(id: PromptId) {
  useEffect(() => {
    logPrompt(id, "shown");
  }, [id]);
}

function P1Banner({ ends, onDone }: { ends: Date; onDone: () => void }) {
  const router = useRouter();
  useLoggedOnce("P1");
  const c = PROMPT_COPY.P1;
  return (
    <div className={styles.banner} role="status" data-testid="prompt-P1">
      <p className={styles.bannerText}>{c.banner({ ends: trialDateLong(ends) })}</p>
      <div className={styles.bannerActions}>
        <button
          type="button"
          className={styles.bannerBtn}
          onClick={() => {
            logPrompt("P1", "clicked", "keep_pro");
            router.push("/pricing?plan=pro&from=P1");
          }}
        >
          {c.buttons[0]}
        </button>
        <button
          type="button"
          className={styles.bannerLink}
          onClick={() => {
            logPrompt("P1", "clicked", "compare");
            router.push("/pricing?from=P1");
          }}
        >
          {c.buttons[1]}
        </button>
        <button
          type="button"
          className={styles.bannerClose}
          aria-label="Hide for today"
          onClick={() => {
            dismissPrompt("P1");
            onDone();
          }}
        >
          <X weight="bold" />
        </button>
      </div>
    </div>
  );
}

function P12Banner({ plan, onDone }: { plan: string; onDone: () => void }) {
  useLoggedOnce("P12");
  const [busy, setBusy] = useState(false);
  const openPortal = async () => {
    logPrompt("P12", "clicked", "update_card");
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string };
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
    } catch {
      /* fall through */
    }
    setBusy(false);
    window.location.assign("/profile?section=subscription");
  };
  return (
    <div className={styles.banner} role="status" data-testid="prompt-P12">
      <p className={styles.bannerText}>{p12Line(plan)}</p>
      <div className={styles.bannerActions}>
        <button type="button" className={styles.bannerBtn} disabled={busy} onClick={() => void openPortal()}>
          {PROMPT_COPY.P12.buttons[0]}
        </button>
        <button
          type="button"
          className={styles.bannerClose}
          aria-label="Not now"
          onClick={() => {
            dismissPrompt("P12");
            onDone();
          }}
        >
          <X weight="bold" />
        </button>
      </div>
    </div>
  );
}

function P2Popup({ from, to, onDone }: { from: Date; to: Date; onDone: () => void }) {
  const router = useRouter();
  const [made, setMade] = useState<{ count: number; minutes: number } | null>(null);

  // What they made during the trial, for "You made 14 resources and saved
  // about 5 hours". RLS keeps this to their own runs.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await createClient()
        .from("tool_runs")
        .select("tool_slug")
        .gte("created_at", from.toISOString())
        .lte("created_at", to.toISOString())
        .limit(500);
      if (cancelled) return;
      const rows = (data ?? []) as { tool_slug: string | null }[];
      setMade({
        count: rows.length,
        minutes: rows.reduce((m, r) => m + minutesSavedFor(r.tool_slug ?? ""), 0),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  // Shown, and remembered, once the numbers are in.
  useEffect(() => {
    if (!made) return;
    markShown("P2");
    markPopupShown();
  }, [made]);

  const view = useMemo(() => (made ? p2View({ made: made.count, minutes: made.minutes }) : null), [made]);
  if (!view) return null;

  const close = () => {
    dismissPrompt("P2");
    onDone();
  };
  return (
    <PromptSheet
      id="P2"
      kicker="Free plan"
      title={view.title}
      onClose={close}
      buttons={[
        {
          label: view.buttons[0],
          onClick: () => {
            logPrompt("P2", "clicked", "keep_pro");
            onDone();
            router.push("/pricing?plan=pro&from=P2");
          },
        },
        {
          label: view.buttons[1],
          kind: "link",
          onClick: () => {
            logPrompt("P2", "clicked", "standard");
            onDone();
            router.push("/pricing?plan=standard&from=P2");
          },
        },
        { label: view.buttons[2], kind: "link", onClick: close },
      ]}
    >
      <p className={styles.body}>{view.body}</p>
    </PromptSheet>
  );
}
