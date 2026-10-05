"use client";

import { useEffect, useState } from "react";
import ShareToHomePrompt from "./ShareToHomePrompt";

/**
 * The share prompt for a comprehension that has just been claimed from a free
 * try. A claimed run is restored rather than generated, so the result panel's
 * own after-save prompt never fires for it; GuestClaimer marks the URL with
 * ?fresh=1 instead. The editor reads the same flag for a claimed deck.
 */
export default function FreshSharePrompt() {
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("fresh") !== "1") return;
    if (!url.pathname.startsWith("/tools/comprehension-generator")) return;
    const run = url.searchParams.get("run");
    url.searchParams.delete("fresh");
    window.history.replaceState(window.history.state, "", url.toString());
    // Set from a microtask rather than in the effect body: the prompt then
    // renders in its own pass instead of cascading from this one.
    if (run) queueMicrotask(() => setRunId(run));
  }, []);

  return runId ? <ShareToHomePrompt kind="comprehension" resourceId={runId} /> : null;
}
