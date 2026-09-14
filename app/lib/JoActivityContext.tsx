"use client";

// What Jo is doing on a tool page, and the one control that stops it.
//
// The producer is useToolLaunch, which runs inside each of the 35 forms. The
// consumer is JoActivityPanel, which sits in app/(app)/tools/layout.tsx, outside
// them. A form cannot render the panel: the panel has to outlive the fill and
// sit beside the form rather than inside its grid, and threading it through
// would mean editing all 35. So the hook publishes here and the layout reads.
//
// The provider lives in the tools layout, which is not remounted between tool
// pages, so the panel survives the form remounting beneath it.
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FillStep } from "@/app/lib/toolFillPlan";

/**
 * Where a run has got to.
 *
 *   idle     nothing to report; the panel renders nothing
 *   filling  Jo is working down the form
 *   asking   the fill finished and the teacher is being asked to generate
 *   stopped  the teacher took over, by typing or by pressing Stop
 *   done     the question was answered, or there was nothing to ask
 *
 * "asking" is a distinct state rather than a flag on "done" because it is the
 * only one that offers to spend the teacher's credits, and that is worth being
 * able to see in one place.
 */
export type JoStatus = "idle" | "filling" | "asking" | "stopped" | "done";

export interface JoFieldState {
  field: string;
  label: string;
  state: "pending" | "active" | "filled";
}

export interface JoActivity {
  status: JoStatus;
  /** Which tool is being filled, for the panel's heading. */
  slug: string | null;
  steps: JoFieldState[];
  /** Stop the fill where it is. Never reverts what is already filled. */
  stop: () => void;
  /** The teacher declined to generate now. Collapses the question. */
  dismiss: () => void;
  /** The teacher asked to generate. Clears the question; the panel does the rest. */
  accept: () => void;
}

const JoActivityContext = createContext<JoActivity | null>(null);

/**
 * What the hook calls to report progress.
 *
 * Separate from the reading context so a form never accidentally depends on the
 * panel's state and re-renders on every field: these callbacks are stable, and
 * useToolLaunch subscribes to none of the values above.
 */
export interface JoActivityPublisher {
  begin: (slug: string, steps: FillStep[]) => void;
  advance: (field: string) => void;
  finish: (opts: { canAsk: boolean }) => void;
  abort: () => void;
  /** Registered by the hook so the panel's Stop can reach the running chain. */
  onStop: (handler: (() => void) | null) => void;
}

const JoPublisherContext = createContext<JoActivityPublisher | null>(null);

/**
 * Every call a no-op, for when there is no provider.
 *
 * Deliberately NOT the throwing behaviour of useAssistantChats. That hook is
 * used by one page; this one is used by all 35 forms, and a tool page must not
 * white-screen because it was rendered somewhere the panel does not exist — a
 * test harness, a future embed, or a route group that forgets the provider.
 * Silence is the correct failure here: the form still fills, nothing reports it.
 */
const NO_OP: JoActivityPublisher = {
  begin: () => {},
  advance: () => {},
  finish: () => {},
  abort: () => {},
  onStop: () => {},
};

/** Read the current activity. Returns null outside the provider. */
export function useJoActivity(): JoActivity | null {
  return useContext(JoActivityContext);
}

/** Report progress. Safe to call anywhere; no-ops without a provider. */
export function useJoActivityPublisher(): JoActivityPublisher {
  return useContext(JoPublisherContext) ?? NO_OP;
}

export function JoActivityProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<JoStatus>("idle");
  const [slug, setSlug] = useState<string | null>(null);
  const [steps, setSteps] = useState<JoFieldState[]>([]);

  // The running chain's teardown, handed over by useToolLaunch. A ref because
  // it changes on every fill and nothing should re-render when it does.
  const stopHandler = useRef<(() => void) | null>(null);

  const onStop = useCallback((handler: (() => void) | null) => {
    stopHandler.current = handler;
  }, []);

  const begin = useCallback((nextSlug: string, plan: FillStep[]) => {
    setSlug(nextSlug);
    setSteps(
      plan.map((step) => ({
        field: step.field,
        label: step.label,
        state: "pending" as const,
      })),
    );
    setStatus("filling");
  }, []);

  /** Mark a field active, and everything before it filled. */
  const advance = useCallback((field: string) => {
    setSteps((prev) => {
      const index = prev.findIndex((s) => s.field === field);
      if (index === -1) return prev;
      return prev.map((step, i) => ({
        ...step,
        state: i < index ? "filled" : i === index ? "active" : step.state,
      }));
    });
  }, []);

  const finish = useCallback(({ canAsk }: { canAsk: boolean }) => {
    setSteps((prev) => prev.map((step) => ({ ...step, state: "filled" as const })));
    // Nothing to press means nothing to ask about: a tool whose form does not
    // use the shared Generate button still gets a completed panel, just no
    // question. See JoActivityPanel.
    setStatus(canAsk ? "asking" : "done");
    stopHandler.current = null;
  }, []);

  /**
   * The teacher took over.
   *
   * Leaves every filled field exactly as it is, including the one that was
   * half typed. They asked to take control, not to undo.
   */
  const abort = useCallback(() => {
    setStatus((prev) => (prev === "filling" ? "stopped" : prev));
    stopHandler.current = null;
  }, []);

  const stop = useCallback(() => {
    stopHandler.current?.();
    stopHandler.current = null;
    setStatus("stopped");
  }, []);

  const dismiss = useCallback(() => setStatus("done"), []);
  const accept = useCallback(() => setStatus("done"), []);

  const publisher = useMemo<JoActivityPublisher>(
    () => ({ begin, advance, finish, abort, onStop }),
    [begin, advance, finish, abort, onStop],
  );

  const activity = useMemo<JoActivity>(
    () => ({ status, slug, steps, stop, dismiss, accept }),
    [status, slug, steps, stop, dismiss, accept],
  );

  return (
    <JoPublisherContext.Provider value={publisher}>
      <JoActivityContext.Provider value={activity}>
        {children}
      </JoActivityContext.Provider>
    </JoPublisherContext.Provider>
  );
}
