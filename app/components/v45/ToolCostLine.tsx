"use client";

import { useState } from "react";
import { useResourcesRow } from "@/app/lib/useResources";
import Link from "next/link";
import { costLine, p4Line } from "@/app/lib/prompt-views";
import { outOfResourcesPayload } from "@/app/lib/resources";
import { estimateFor, roundEstimate } from "@/app/lib/tool-estimates";
import { useDeckPictures } from "@/app/lib/deck-pictures-store";
import type { AccountPlan } from "@/app/lib/plan-config";
import { P3Sheet } from "./PlanSheets";
import styles from "./PromptSheet.module.css";

/*
 * The cost line on a tool page (Jooma 4.5 spec Step 2, "Running out", rule 1):
 * the balance is checked as soon as a tool opens, not only on Make.
 *
 *   enough      "Usually about 15 resources. You have 640."
 *   not enough  "This usually needs about 30. You have 12." with a button that
 *               opens P3 (Free and the trial) at once. Make is refused by the
 *               server with the same numbers, and UpgradeGate opens P3 again,
 *               so the form underneath is never cleared.
 *
 * Nothing before the plans engine migration, for School, or while loading.
 */

/** Pages whose server check uses another tool's estimate: every deck is gated
 *  as /api/slideshow, so CPD decks are checked against the slideshow figure. */
const GATED_AS: Record<string, string> = { "cpd-slideshow": "slideshow" };

export default function ToolCostLine({ slug: page }: { slug: string }) {
  const slug = GATED_AS[page] ?? page;
  const { meter, row } = useResourcesRow();
  const [open, setOpen] = useState(false);
  // A deck's generated pictures, as its form currently has them set.
  const deckPictures = useDeckPictures();
  const pictures = slug === "slideshow" ? deckPictures : 0;
  if (!meter || meter === "missing" || !meter.metered) return null;

  const line = costLine(slug, meter.remaining, { pictures });
  const plan = meter.plan as AccountPlan;
  const p3 = !line.enough && (plan === "free" || plan === "pro_trial");
  const p4 = p4Line(plan, meter.remaining, line.enough);

  return (
    <>
      <p className={`${styles.cost} ${line.enough ? "" : styles.costShort}`} data-testid="tool-cost-line">
        <span>{line.text}</span>
        {p3 && (
          <button type="button" className={styles.costBtn} onClick={() => setOpen(true)}>
            See options
          </button>
        )}
      </p>
      {p4 && (
        <p className={styles.cost} data-testid="prompt-P4">
          <span>{p4}</span>
          <Link href="/pricing?plan=pro&from=P4" className={styles.costBtn}>
            See plans
          </Link>
        </p>
      )}
      {open && p3 && (
        <P3Sheet
          payload={outOfResourcesPayload(plan, {
            needed: roundEstimate(estimateFor(slug, { pictures })),
            left: meter.remaining,
            refillAt: row?.next_refill_at ? new Date(row.next_refill_at) : null,
          })}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
