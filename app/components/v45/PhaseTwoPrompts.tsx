"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "@phosphor-icons/react/dist/ssr";
import { useAccountAccess } from "@/app/lib/useAccountAccess";
import { usePresenting } from "@/app/lib/presenting";
import { refreshResources, useResourcesRow } from "@/app/lib/useResources";
import { limitKey } from "@/app/lib/prompts";
import { p6View, p7Sheet, p9View } from "@/app/lib/prompt-views";
import { refineCheck } from "@/app/lib/plan-features";
import { EXPORTED_EVENT } from "@/app/lib/export-mark";
import type { AccountPlan } from "@/app/lib/plan-config";
import { dismissPrompt, logPrompt } from "@/app/lib/prompt-client";
import { eligible, latched, openLimited as open } from "./promptLatch";
import TopUpModal from "@/app/components/v2/TopUpModal";
import PromptSheet, { promptStyles as styles } from "./PromptSheet";

/*
 * The Phase 2 prompts (Jooma 4.5 spec Step 5) that need a screen:
 *
 *   P6Note       after an export on Free or the trial, a small note at the
 *                foot of the screen; once a UK day, closing it snoozes 7 days
 *   P7Sheet      all 10 of Free's weekly refines used (from UpgradeGate)
 *   RefinesLine  "2 refines left this week." under Ask Jo, on Free
 *   P9Banner     Standard, 80% of the allowance used with more than 7 days to
 *                the refill, on Today, once per allowance period
 *   P10Line      Standard opening the top-up picker, once per allowance period
 *                (its own file, P10Line.tsx, because TopUpModal imports it)
 *
 * P8 lives in Today's greeting (TodayView). Every "Go Pro" or "Switch to Pro"
 * opens the plan picker on Pro, with from=<id> so checkout_started carries it.
 * Nothing at all while presenting.
 *
 * Once a limited prompt has opened it stays for this page session, even if
 * the component remounts (the P2 lesson from Step 10: marking on open and
 * re-deciding on remount hid it before anyone saw it).
 */

/* ── P6 ─────────────────────────────────────────────────────────────────── */

const NOTE_MS = 8000;

export function P6Note() {
  const router = useRouter();
  const access = useAccountAccess();
  const presenting = usePresenting();
  const [shown, setShown] = useState(false);
  const plan = access?.accountPlan ?? null;
  // The listener is added once; it reads the latest plan from here.
  const state = useRef({ plan, presenting });
  useEffect(() => {
    state.current = { plan, presenting };
  }, [plan, presenting]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onExported = () => {
      const { plan: p, presenting: pr } = state.current;
      if (!p || !p6View(p)) return;
      const key = limitKey("P6", new Date());
      if (!eligible("P6", p, pr, key) || latched.get("P6") === key) return;
      open("P6", key);
      setShown(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setShown(false), NOTE_MS);
    };
    window.addEventListener(EXPORTED_EVENT, onExported);
    return () => {
      window.removeEventListener(EXPORTED_EVENT, onExported);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const view = plan ? p6View(plan) : null;
  if (!shown || !view || presenting) return null;
  return (
    <div className={styles.note} role="status" data-testid="prompt-P6">
      <p className={styles.noteText}>{view.text}</p>
      <button
        type="button"
        className={styles.bannerBtn}
        onClick={() => {
          logPrompt("P6", "clicked", "go_pro");
          setShown(false);
          router.push("/pricing?plan=pro&from=P6");
        }}
      >
        {view.button}
      </button>
      <button
        type="button"
        className={styles.bannerClose}
        aria-label="Not now"
        onClick={() => {
          dismissPrompt("P6");
          setShown(false);
        }}
      >
        <X weight="bold" />
      </button>
    </div>
  );
}

/* ── P7 ─────────────────────────────────────────────────────────────────── */

export function P7Sheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  useEffect(() => logPrompt("P7", "shown"), []);
  const v = p7Sheet();
  return (
    <PromptSheet
      id="P7"
      kicker="Free plan"
      title={v.title}
      onClose={onClose}
      buttons={[
        {
          label: v.buttons[0],
          onClick: () => {
            logPrompt("P7", "clicked", "go_pro");
            onClose();
            router.push("/pricing?plan=pro&from=P7");
          },
        },
        {
          label: v.buttons[1],
          kind: "secondary",
          onClick: () => {
            logPrompt("P7", "clicked", "ok");
            onClose();
          },
        },
      ]}
    >
      <p className={styles.body}>{v.body}</p>
    </PromptSheet>
  );
}

/** Under Ask Jo, on Free: the line at 2 refines left or fewer. Re-reads the
 *  count each time Jo finishes a reply, because every message is a refine. */
export function RefinesLine({ busy, className }: { busy: boolean; className?: string }) {
  const { row } = useResourcesRow();
  const was = useRef(busy);
  useEffect(() => {
    if (was.current && !busy) refreshResources();
    was.current = busy;
  }, [busy]);
  const plan = (row?.plan ?? null) as AccountPlan | null;
  if (plan !== "free") return null;
  const check = refineCheck(plan, Number(row?.refines_used ?? 0));
  if (!check.ok || !check.line) return null;
  return (
    <p className={className} data-testid="prompt-P7-line">
      {check.line}
    </p>
  );
}

/* ── P9 ─────────────────────────────────────────────────────────────────── */

export function P9Banner() {
  const router = useRouter();
  const presenting = usePresenting();
  const { row } = useResourcesRow();
  const [topUp, setTopUp] = useState(false);
  const [closed, setClosed] = useState(false);

  const now = new Date();
  const plan = (row?.plan ?? null) as AccountPlan | null;
  const view =
    plan === "standard" && row
      ? p9View({
          plan,
          allowance: Number(row.allowance ?? 0),
          allowanceLeft: Number(row.allowance_left ?? 0),
          nextRefillAt: row.next_refill_at ? new Date(row.next_refill_at) : null,
          now,
        })
      : null;
  const key = limitKey("P9", now, row?.period_start ? new Date(row.period_start) : null);
  const show = !closed && view !== null && plan !== null && eligible("P9", plan, presenting, key);

  useEffect(() => {
    if (show) open("P9", key);
  }, [show, key]);

  if (!show || !view) return topUp ? <TopUpModal open onClose={() => setTopUp(false)} /> : null;
  return (
    <>
      <div className={styles.banner} role="status" data-testid="prompt-P9">
        <p className={styles.bannerText}>{view.text}</p>
        <div className={styles.bannerActions}>
          <button
            type="button"
            className={styles.bannerBtn}
            onClick={() => {
              logPrompt("P9", "clicked", "switch_to_pro");
              router.push("/pricing?plan=pro&from=P9");
            }}
          >
            {view.buttons[0]}
          </button>
          <button
            type="button"
            className={styles.bannerLink}
            onClick={() => {
              logPrompt("P9", "clicked", "top_up");
              setTopUp(true);
            }}
          >
            {view.buttons[1]}
          </button>
          <button
            type="button"
            className={styles.bannerClose}
            aria-label="Not now"
            onClick={() => {
              dismissPrompt("P9");
              setClosed(true);
            }}
          >
            <X weight="bold" />
          </button>
        </div>
      </div>
      <TopUpModal open={topUp} onClose={() => setTopUp(false)} />
    </>
  );
}
