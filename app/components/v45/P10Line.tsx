"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePresenting } from "@/app/lib/presenting";
import { useResourcesRow } from "@/app/lib/useResources";
import { limitKey, PROMPT_COPY } from "@/app/lib/prompts";
import { p10Line } from "@/app/lib/prompt-views";
import { logPrompt } from "@/app/lib/prompt-client";
import type { AccountPlan } from "@/app/lib/plan-config";
import { eligible, openLimited as open } from "./promptLatch";
import { promptStyles as styles } from "./PromptSheet";

/*
 * P10 (Jooma 4.5 Step 5): Standard opening the top-up picker sees one line at
 * its top, once per allowance period. "Buy top-up" is the picker itself, so
 * the only button here is "Switch to Pro instead", which opens the plan picker.
 */

export function P10Line({ onSwitch }: { onSwitch: () => void }) {
  const router = useRouter();
  const presenting = usePresenting();
  const { row } = useResourcesRow();
  const plan = (row?.plan ?? null) as AccountPlan | null;
  const text = plan ? p10Line(plan) : null;
  const key = limitKey("P10", new Date(), row?.period_start ? new Date(row.period_start) : null);
  const show = text !== null && plan !== null && eligible("P10", plan, presenting, key);

  useEffect(() => {
    if (show) open("P10", key);
  }, [show, key]);

  if (!show || !text) return null;
  return (
    <p className={styles.pickerLine} data-testid="prompt-P10">
      {text}
      <button
        type="button"
        onClick={() => {
          logPrompt("P10", "clicked", "switch_to_pro");
          onSwitch();
          router.push("/pricing?plan=pro&from=P10");
        }}
      >
        {PROMPT_COPY.P10.buttons[0]}
      </button>
    </p>
  );
}
