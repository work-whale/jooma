"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PromptSheet, { promptStyles as styles } from "./PromptSheet";
import { p3View } from "@/app/lib/prompt-views";
import { PROMPT_COPY } from "@/app/lib/prompts";
import { logPrompt, markPopupShown, markShown, popupShownThisVisit } from "@/app/lib/prompt-client";
import { trialDateLong } from "@/app/lib/account-plan";
import { usePresenting } from "@/app/lib/presenting";
import { refreshResources } from "@/app/lib/useResources";
import type { OutOfResources } from "@/app/lib/resources";

/*
 * P3 (out of resources) and P5 (pictures locked), Jooma 4.5 spec Step 5.
 *
 * Both are sheets that answer something the teacher just did, so they show
 * every time (no snooze) and are not limited to one per visit. Neither ever
 * shows while presenting. Neither touches the form underneath: closing one
 * leaves everything typed where it was.
 *
 * Every Go Pro / Keep Pro opens the plan picker (/pricing) on Pro.
 */

const PICKER = "/pricing?plan=pro";

export function P3Sheet({ payload, onClose }: { payload: OutOfResources; onClose: () => void }) {
  const router = useRouter();
  const presenting = usePresenting();
  const view = p3View(payload);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server says P3 or P3b (Phase 2): a second run-out on Free, in a
  // different week, opens the half-price first month once per account. Until
  // it answers nothing shows; if it cannot answer, P3.
  const [decided, setDecided] = useState<{ prompt: "P3" | "P3b"; offerEndsAt?: string } | null>(null);

  useEffect(() => {
    if (!view || presenting) return;
    let live = true;
    fetch("/api/run-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ popupAllowed: !popupShownThisVisit() }),
    })
      .then((r) => (r.ok ? r.json() : { prompt: "P3" }))
      .catch(() => ({ prompt: "P3" }))
      .then((d: { prompt?: string; offerEndsAt?: string }) => {
        if (!live) return;
        const p3b = d.prompt === "P3b" && typeof d.offerEndsAt === "string";
        if (p3b) {
          markShown("P3b");
          markPopupShown();
        }
        logPrompt(p3b ? "P3b" : "P3", "shown");
        setDecided(p3b ? { prompt: "P3b", offerEndsAt: d.offerEndsAt } : { prompt: "P3" });
      });
    return () => {
      live = false;
    };
    // Once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!view || presenting || !decided) return null;

  if (decided.prompt === "P3b" && decided.offerEndsAt) {
    const c = PROMPT_COPY.P3b;
    const dismiss = () => {
      logPrompt("P3b", "dismissed");
      onClose();
    };
    return (
      <PromptSheet
        id="P3b"
        kicker="Free plan"
        title={c.title}
        onClose={dismiss}
        buttons={[
          {
            label: c.buttons[0],
            onClick: () => {
              logPrompt("P3b", "clicked", "picker");
              onClose();
              router.push("/pricing?plan=pro&interval=month&from=P3b");
            },
          },
          { label: c.buttons[1], kind: "link", onClick: dismiss },
        ]}
      >
        <p className={styles.need}>{view.need}</p>
        <p className={styles.body}>{c.body({ ends: trialDateLong(new Date(decided.offerEndsAt)) })}</p>
      </PromptSheet>
    );
  }

  const close = () => {
    logPrompt("P3", "dismissed");
    onClose();
  };

  const switchToFree = async () => {
    setBusy(true);
    setError(null);
    logPrompt("P3", "clicked", "switch_to_free");
    try {
      const res = await fetch("/api/trial/end", { method: "POST" });
      if (!res.ok) throw new Error();
      refreshResources();
      // The plan chip, meter and gates all read the new plan on reload.
      window.location.reload();
    } catch {
      setBusy(false);
      setError("That didn't work. Please try again.");
    }
  };

  return (
    <PromptSheet
      id="P3"
      kicker={view.variant === "trial" ? "Pro trial" : "Free plan"}
      title={view.title}
      onClose={close}
      buttons={[
        {
          label: view.primary.label,
          onClick: () => {
            logPrompt("P3", "clicked", "picker");
            onClose();
            router.push(`${PICKER}&from=P3`);
          },
        },
        {
          label: view.secondary.label,
          kind: view.variant === "trial" ? "secondary" : "link",
          disabled: busy,
          onClick: view.secondary.action === "switch_to_free" ? () => void switchToFree() : close,
        },
      ]}
    >
      <p className={styles.need}>{view.need}</p>
      <p className={styles.body}>{view.body}</p>
      {error && (
        <p className={styles.body} role="alert">
          {error}
        </p>
      )}
    </PromptSheet>
  );
}

export function P5Sheet({ onClose, onLibrary }: { onClose: () => void; onLibrary?: () => void }) {
  const router = useRouter();
  const presenting = usePresenting();
  useEffect(() => {
    if (!presenting) logPrompt("P5", "shown");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (presenting) return null;
  const c = PROMPT_COPY.P5;
  return (
    <PromptSheet
      id="P5"
      kicker="Picture slides"
      pictures
      title={c.title}
      onClose={() => {
        logPrompt("P5", "dismissed");
        onClose();
      }}
      buttons={[
        {
          label: c.buttons[0],
          onClick: () => {
            logPrompt("P5", "clicked", "picker");
            onClose();
            router.push(`${PICKER}&from=P5`);
          },
        },
        {
          label: c.buttons[1],
          kind: "secondary",
          onClick: () => {
            logPrompt("P5", "clicked", "library");
            onLibrary?.();
            onClose();
          },
        },
      ]}
    >
      <p className={styles.body}>{c.body}</p>
    </PromptSheet>
  );
}
