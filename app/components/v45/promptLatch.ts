"use client";

import { canShowPrompt, type PromptId } from "@/app/lib/prompts";
import type { AccountPlan } from "@/app/lib/plan-config";
import {
  dismissedUntil,
  lastShownKey,
  markShownIn,
  popupShownThisVisit,
  shownBefore,
} from "@/app/lib/prompt-client";

/*
 * Shared by the Phase 2 prompts with a limit (P6, P9, P10). Once one has opened
 * in a day or period it stays for this page session even if its component
 * remounts: marking it shown and then re-deciding on remount hid P2 before
 * anyone saw it (Step 10, test 3).
 */

export const latched = new Map<PromptId, string>();

export function eligible(id: PromptId, plan: AccountPlan, presenting: boolean, key: string | null): boolean {
  if (key && latched.get(id) === key) return !presenting;
  return canShowPrompt(id, {
    plan,
    presenting,
    popupShownThisVisit: popupShownThisVisit(),
    dismissedUntil: dismissedUntil(id),
    shownBefore: shownBefore(id),
    now: new Date(),
    limitKey: key,
    lastShownKey: lastShownKey(id),
  });
}

export function openLimited(id: PromptId, key: string | null) {
  if (latched.get(id) === key) return;
  if (key) latched.set(id, key);
  markShownIn(id, key);
}

