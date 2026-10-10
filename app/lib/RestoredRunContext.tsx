"use client";

// Which saved run a tool page last reopened, for the result panel.
//
// Thirty of the text tools' forms restore a run (from ?run= or the history
// panel) by setting its output as their result and nothing else, so the panel
// never learnt which run it was showing. Ask Jo needs to: it keeps its
// conversation against the run and saves its edits into it. Rather than add a
// runId to thirty forms, the two places every restore goes through publish it
// here (useToolLaunch and ToolHistoryPanel), and ResultPanel reads it.

import { createContext, useCallback, useContext, useMemo, useState } from "react";

interface RestoredRun {
  id: string;
  /** Bumped on every restore, so reopening the same run twice still counts. */
  at: number;
}

const Ctx = createContext<{ run: RestoredRun | null; publish: (id: string) => void } | null>(null);

export function RestoredRunProvider({ children }: { children: React.ReactNode }) {
  const [run, setRun] = useState<RestoredRun | null>(null);
  const publish = useCallback((id: string) => setRun((prev) => ({ id, at: (prev?.at ?? 0) + 1 })), []);
  const value = useMemo(() => ({ run, publish }), [run, publish]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Report a restore. A no-op outside a tool page. */
export function usePublishRestoredRun(): (id: string) => void {
  return useContext(Ctx)?.publish ?? noop;
}

export function useRestoredRun(): RestoredRun | null {
  return useContext(Ctx)?.run ?? null;
}

function noop() {}
