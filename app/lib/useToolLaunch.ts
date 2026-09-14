"use client";

// Applies the two URL parameters a tool page can be launched with to the form's
// existing state.
//
//   ?run=<id>       Reopen a saved run. Every list in the app (Dashboard,
//                   Folders, Analytics) linked to the bare tool page before
//                   this, so clicking a row you had just generated threw the
//                   result away.
//   ?prefill=<b64>  Open with fields filled in from the assistant.
//
// Both reuse what the forms already have: `restore(run)` exists in all 34 forms
// for the history panel, and prefill fields are applied by a small per-form
// setter map. Neither needed a new code path inside the form.
//
// The values arrive as PROPS, read from the server page's `searchParams`, not
// from useSearchParams(). That hook forces a client-side bailout that would
// need a Suspense boundary around every tool form — the same reason app/login
// and app/help both read params on the server instead. See the note at
// app/login/page.tsx:39.
import { useEffect, useMemo, useRef } from "react";
import { getToolRun, type ToolRun } from "@/app/lib/toolRuns";
import { decodePrefill } from "@/app/lib/toolPrefill";
import { assistantToolFor } from "@/app/lib/assistant-tools";
import { usePrefersReducedMotion } from "@/app/lib/usePrefersReducedMotion";
import { useJoActivityPublisher } from "@/app/lib/JoActivityContext";
import {
  buildFillPlan,
  instantPlan,
  FIELD_GAP_MS,
  LAND_MS,
  TICK_MS,
} from "@/app/lib/toolFillPlan";

/** Applies one prefilled field to form state. Unknown keys are ignored. */
export type PrefillSetters = Record<string, (value: unknown) => void>;

/**
 * Fields the clearing pass must leave alone.
 *
 * The pass exists to stop a value the teacher chose in some OTHER tool last
 * week leaking into this one (ll:yearGroup and ll:curriculum persist in
 * localStorage). That reasoning does not apply to a field whose initial value
 * is a real answer rather than a leftover: clearing one of those does not
 * remove a stale choice, it removes a working default.
 *
 * Kept as a named set rather than a special case inside the loop so the next
 * field with a meaningful default has an obvious home.
 */
const NEVER_CLEARED = new Set(["differentiate"]);

/**
 * Whether this page has a Generate button Jo could offer to press.
 *
 * Read from the DOM rather than passed in, because the button lives inside the
 * form and the alternative is a prop threaded through all 35 of them. A tool
 * that does not use the shared GenerateButton (the three structured ones, or
 * anything added later) simply reports false, and the panel finishes without
 * asking rather than offering a button that goes nowhere.
 *
 * Only presence is checked here, not `disabled`. The teacher may still be
 * mid-edit when the fill ends, and the panel re-checks at the moment it would
 * actually click.
 */
function canGenerateHere(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector("[data-jo-generate]") !== null;
}

export interface ToolLaunchParams {
  /** `?run=` — a saved tool_runs id. */
  run?: string;
  /** `?prefill=` — a base64url payload from the assistant. */
  prefill?: string;
}

export function useToolLaunch(opts: {
  params: ToolLaunchParams | undefined;
  /** The form's existing history-restore function. */
  onRestore: (run: ToolRun) => void;
  /** Per-field setters, for the tools the assistant can prefill. */
  prefill?: PrefillSetters;
}) {
  const runId = opts.params?.run;
  const prefillParam = opts.params?.prefill;

  // Whether this page load is a prefill, derived rather than stored: it is a
  // pure function of the URL, so state (and an effect to set it) would be a
  // second source of truth for something already known during render.
  //
  // decodePrefill is cheap — a base64 decode, a JSON.parse and a field walk over
  // a payload capped at 8KB — and memoised on the parameter, so it runs once per
  // distinct URL rather than once per keystroke.
  const decoded = useMemo(
    () => (runId ? null : decodePrefill(prefillParam)),
    [prefillParam, runId],
  );
  const prefilled = decoded !== null;

  // Latest callbacks without making them effect dependencies: the setters are
  // rebuilt every render, and depending on them would re-run the effect — and
  // re-apply the prefill over the teacher's edits — on every keystroke.
  //
  // Written in an effect rather than during render. Assigning to a ref while
  // rendering is unsafe under concurrent React, where a render can be discarded
  // or replayed; effects only run for renders that were committed.
  const ref = useRef(opts);
  useEffect(() => {
    ref.current = opts;
  });

  // Guard against re-applying after the teacher has started editing.
  const appliedRun = useRef<string | null>(null);
  const appliedPrefill = useRef<string | null>(null);

  const reducedMotion = usePrefersReducedMotion();
  const publisher = useJoActivityPublisher();

  // ?run= wins when both are present: a saved run is a real artefact, a prefill
  // is only a suggestion about one that does not exist yet.
  //
  // The guard is claimed only AFTER onRestore actually runs, never up front.
  // Claiming it before awaiting made this fail every time under Strict Mode's
  // double mount: the first pass marked the run applied and started the fetch,
  // cleanup set cancelled = true, and the second pass then saw the run as
  // already-applied and returned early. The one in-flight fetch resolved into a
  // cancelled closure and dropped the result, so the tool opened blank — the
  // saved output only appeared after clicking it again in Recents.
  useEffect(() => {
    if (!runId || appliedRun.current === runId) return;
    let cancelled = false;
    void (async () => {
      try {
        const run = await getToolRun(runId);
        if (cancelled) return;
        // A missing run — or someone else's, which RLS makes indistinguishable —
        // opens the tool empty. Better than an error page for a link that may
        // simply be old.
        if (!run) return;
        // Re-checked after the await: a second effect pass may have restored
        // this same run while the fetch was in flight, and re-applying would
        // overwrite edits the teacher had already started making.
        if (appliedRun.current === runId) return;
        appliedRun.current = runId;
        ref.current.onRestore(run);
      } catch {
        /* Same outcome as not found. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    if (!decoded || !prefillParam) return;

    // The motion mode is part of the claim, not just the param.
    //
    // usePrefersReducedMotion returns false on the server and on the very first
    // client render, then corrects itself once mounted. Claiming on the param
    // alone meant that correction re-ran this effect, found the prefill already
    // applied, and returned early — leaving the form EMPTY, because the first
    // pass had started an animation the re-render then tore down. Keying on
    // both lets the corrected pass redo the fill in the right mode, while a
    // Strict Mode double mount (same param, same mode) still claims once.
    const claim = `${prefillParam}::${reducedMotion ? "still" : "motion"}`;
    if (appliedPrefill.current === claim) return;

    const setters = ref.current.prefill;
    if (!setters) return;

    // Claimed here, and RELEASED in cleanup if this pass is torn down before it
    // finishes. That release is the whole point.
    //
    // This used to claim and never release, on the reasoning that Strict Mode's
    // second pass should see the claim and stand down. It does — and that was
    // the bug. In development React mounts twice: pass 1 claimed and scheduled
    // the first tick 110ms out, React tore pass 1 down immediately and cleanup
    // killed that timer, then pass 2 saw the claim already set and returned
    // early without starting a replacement. The timer that would have typed was
    // dead and nothing ever started another, so the form sat empty while the
    // console showed the effect running twice with a claim already in place.
    //
    // Releasing on teardown means a pass that never got to run hands the claim
    // back, and the surviving pass does the work. A pass that COMPLETES keeps
    // the claim (see the finish path), so a later re-render still cannot refill
    // over the teacher's edits.
    appliedPrefill.current = claim;
    let claimed = true;
    /** Keep the claim: the fill reached its end, so it must not run again. */
    const settle = () => {
      claimed = false;
    };

    // Every registered setter is called, not just the ones the assistant filled.
    //
    // Several fields persist in localStorage and are shared across tools
    // (ll:yearGroup, ll:curriculum), so a field the assistant did NOT fill would
    // otherwise keep whatever was last chosen in some other tool. A teacher who
    // asks for a Year 6 quiz and gets Year 5 — because that is what they picked
    // last week — reads it as the assistant ignoring them. Clearing is the only
    // way a prefill can mean "these are the fields, and nothing else".
    //
    // Only on the prefill path: ?run= restores a saved artefact, where blanking
    // an unset field would destroy real data.
    //
    // This pass stays INSTANT even when the fill is animated. Staging the
    // clears would show the form emptying itself field by field, which reads as
    // a malfunction rather than as an assistant starting work.
    const schema = assistantToolFor(decoded.slug)?.fields as
      | { properties?: Record<string, { type?: string }> }
      | undefined;

    for (const [key, setter] of Object.entries(setters)) {
      if (decoded.fields[key] !== undefined) continue;
      // A field whose default MEANS something is not a stale value, and
      // clearing it destroys the meaning. `differentiate` starts at "no" and
      // several forms gate Generate on `differentiate === "no" || levels.length`
      // (LessonPlannerForm.tsx:48), so blanking it to "" left a fully prefilled
      // form that could never be submitted: "" is neither "no" nor a chosen
      // band. Omitting differentiation means "no", which is what the teacher
      // would have had anyway, and they can still switch it on in one click.
      if (NEVER_CLEARED.has(key)) continue;
      // Only the field types that actually carry stale values are cleared, and
      // only with a value of the right shape — the setters cast blindly
      // (`v as string[]`), so the wrong shape would corrupt form state.
      //
      // Numbers are left alone deliberately: they are initialised to real
      // defaults (numQuestions starts at 5, not at nothing), and there is no
      // empty number. Blanking one would put "" into a numeric control and
      // break Generate — a worse bug than the one being fixed.
      const type = schema?.properties?.[key]?.type;
      if (type === "array") setter([]);
      else if (type === "string") setter("");
    }

    // The fields the assistant DID fill are applied on a schedule, so the
    // teacher sees Jo work down the form. Everything below is about that.
    const built = buildFillPlan(decoded, Object.keys(setters));
    if (!built) return;

    const plan = reducedMotion ? instantPlan(built) : built;

    // Reduced motion: apply everything now, report it, create no timers and
    // install no listeners. Same end state, no animation.
    if (reducedMotion) {
      for (const step of plan.steps) setters[step.field]?.(step.value);
      publisher.begin(plan.slug, plan.steps);
      publisher.finish({ canAsk: canGenerateHere() });
      // Done synchronously, so there is nothing for a teardown to cancel and
      // the claim must stand.
      settle();
      return;
    }

    // ── The interrupt flag ──
    // Read at the top of every tick. A ref rather than state because the chain
    // runs outside React's render cycle and must see the change in the same
    // task the teacher's keystroke arrived in.
    let aborted = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const halt = () => {
      if (aborted) return;
      aborted = true;
      if (timer) clearTimeout(timer);
      timer = null;
      // The teacher took over. That is a real outcome, so the claim stands and
      // the fill does not restart behind them.
      settle();
      publisher.abort();
    };

    /**
     * The teacher touched the form, so Jo stops.
     *
     * Capture phase, on the document, for two reasons. Capture so this runs
     * before React's synthetic handler and the form's own onChange, and
     * document-level because this hook holds setters, not elements: reaching
     * the individual controls would mean every form handing over refs, which is
     * the 35 file change this design exists to avoid.
     *
     * Jo's own writes cannot trigger this. React state updates dispatch no DOM
     * input event, so nothing here fires from a setter call. Converting a field
     * to an uncontrolled input later would break that assumption.
     */
    const onIntervene = (event: Event) => {
      // Real user input only. A synthetic event carries isTrusted false, and
      // acting on those meant a programmatic click anywhere in the app could
      // silently cancel the fill.
      if (!event.isTrusted) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Jo's own panel is not the teacher taking over. Stop lives there and
      // calls halt() directly; treating a press on it as an intervention as
      // well would abort twice and, worse, meant any press on the panel at all
      // cancelled the fill.
      if (target.closest("[data-jo-panel]")) return;

      // Only controls inside the form being filled. This used to be the whole
      // document, which is the bug this comment exists to prevent coming back:
      // the listener is attached the instant the fill starts, so ONE click
      // anywhere in the app — the nav rail, a sidebar button, a mouse release
      // still travelling from the composer's send button across the navigation
      // — halted the fill before it typed a character. The teacher saw an empty
      // form and a refresh appeared to "fix" it, because a reload has no
      // preceding click.
      const form = target.closest("form, [data-jo-form]");
      if (!form) return;

      if (target.closest("input, textarea, select, button, [role='button']")) halt();
    };

    document.addEventListener("input", onIntervene, true);
    // A stepper, a chip or opening a select emits no input event, but each is
    // just as much the teacher taking over.
    document.addEventListener("pointerdown", onIntervene, true);

    publisher.begin(plan.slug, plan.steps);
    publisher.onStop(halt);

    let stepIndex = 0;
    let charIndex = 0;

    const runStep = () => {
      if (aborted) return;

      if (stepIndex >= plan.steps.length) {
        document.removeEventListener("input", onIntervene, true);
        document.removeEventListener("pointerdown", onIntervene, true);
        // Ran to completion, so the claim stands: this prefill is done.
        settle();
        publisher.finish({ canAsk: canGenerateHere() });
        return;
      }

      const step = plan.steps[stepIndex];
      const setter = ref.current.prefill?.[step.field];
      if (!setter) {
        stepIndex += 1;
        charIndex = 0;
        timer = setTimeout(runStep, 0);
        return;
      }

      if (charIndex === 0) publisher.advance(step.field);

      if (step.mode === "land") {
        setter(step.value);
        stepIndex += 1;
        charIndex = 0;
        timer = setTimeout(runStep, LAND_MS + FIELD_GAP_MS);
        return;
      }

      const full = String(step.value);
      charIndex = Math.min(full.length, charIndex + step.charsPerTick);
      setter(full.slice(0, charIndex));

      if (charIndex >= full.length) {
        stepIndex += 1;
        charIndex = 0;
        timer = setTimeout(runStep, FIELD_GAP_MS);
        return;
      }
      timer = setTimeout(runStep, TICK_MS);
    };

    timer = setTimeout(runStep, FIELD_GAP_MS);

    return () => {
      // Mount, unmount, mount must leave nothing behind: no orphaned timer, no
      // listener still watching a form that is gone.
      aborted = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("input", onIntervene, true);
      document.removeEventListener("pointerdown", onIntervene, true);
      publisher.onStop(null);

      // Torn down before the fill reached an outcome, so give the claim back.
      // Without this, Strict Mode's double mount kills pass 1's timer and then
      // pass 2 declines to start because the claim looks taken, and the form
      // never fills. Same for any re-render that remounts mid-fill.
      if (claimed && appliedPrefill.current === claim) {
        appliedPrefill.current = null;
      }
    };
  }, [decoded, prefillParam, reducedMotion, publisher]);

  // Only `prefilled`, unchanged, which is what all 35 forms destructure. An
  // extra `filling` flag was considered and dropped: no form reads it, the
  // panel has the publisher instead, and holding it as state meant a setState
  // inside this effect — a cascading render on every tool page for a value
  // nothing consumed.
  return { prefilled };
}
