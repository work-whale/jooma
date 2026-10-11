"use client";

import { useEffect, useState } from "react";
import ShareToHomePrompt from "./ShareToHomePrompt";

const KIND_BY_PATH = {
  "/tools/comprehension-generator": "comprehension",
  "/tools/worksheet-generator": "worksheet",
} as const;

/**
 * The share prompt for a comprehension or worksheet that has just been claimed
 * from a free try. A claimed run is restored rather than generated, so the result panel's
 * own after-save prompt never fires for it; GuestClaimer marks the URL with
 * ?fresh=1 instead. The editor reads the same flag for a claimed deck.
 */
export default function FreshSharePrompt() {
  const [claimed, setClaimed] = useState<{ kind: "comprehension" | "worksheet"; runId: string } | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("fresh") !== "1") return;
    const path = (Object.keys(KIND_BY_PATH) as (keyof typeof KIND_BY_PATH)[]).find((p) =>
      url.pathname.startsWith(p),
    );
    if (!path) return;
    const run = url.searchParams.get("run");
    url.searchParams.delete("fresh");
    window.history.replaceState(window.history.state, "", url.toString());
    // Set from a microtask rather than in the effect body: the prompt then
    // renders in its own pass instead of cascading from this one.
    if (run) queueMicrotask(() => setClaimed({ kind: KIND_BY_PATH[path], runId: run }));
  }, []);

  return claimed ? <ShareToHomePrompt kind={claimed.kind} resourceId={claimed.runId} /> : null;
}
