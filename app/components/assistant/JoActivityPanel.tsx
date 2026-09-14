"use client";

// What Jo is doing on a tool page, and the offer to generate when it is done.
//
// Mounted in app/(app)/tools/layout.tsx rather than inside a form. Three
// reasons, all of them load-bearing:
//
//   1. The layout is not remounted between tool pages, so the panel survives
//      the form remounting beneath it.
//   2. The form's sidebar column is composed in each of the 35 server pages and
//      sits inside the form's own grid, so reaching it would mean editing them.
//   3. The panel outlives the fill: it still has a question to ask after
//      useToolLaunch has finished.
//
// ── The one thing this must never do ──
// Generate on its own. There is no timer here that reaches the button, and no
// path to it that a teacher did not click. Silence leaves the question standing
// forever, which is the correct answer to "what if they walk away".
import { Check, Circle, Loader2, X } from "lucide-react";
import { useJoActivity } from "@/app/lib/JoActivityContext";
import { v2ToolForSlug } from "@/app/lib/tools";

export default function JoActivityPanel() {
  const activity = useJoActivity();
  if (!activity || activity.status === "idle") return null;

  const { status, slug, steps, stop, dismiss, accept } = activity;
  const toolName = slug ? (v2ToolForSlug(slug)?.name ?? null) : null;

  /**
   * Press the form's own Generate button.
   *
   * Deliberately a click on the real control rather than a call into the form.
   * The button's own `disabled` rule stays the single source of truth on
   * whether a generation may start, so a form that is mid-edit, already
   * generating, or unchanged since the last run simply ignores this.
   */
  const generateNow = () => {
    const button = document.querySelector<HTMLButtonElement>("[data-jo-generate]");
    accept();
    if (!button || button.disabled) return;
    button.click();
    button.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <aside
      // polite, and only the step labels: a per-character live region would
      // read a field letter by letter to a screen reader.
      role="status"
      aria-live="polite"
      aria-label="What Jo is doing"
      // Marks this subtree as Jo's own, so the fill's interrupt listener does
      // not read a press on Stop (or anywhere else in here) as the teacher
      // taking over the form. See onIntervene in useToolLaunch.ts.
      data-jo-panel=""
      className="panel-slide-in fixed z-30 bottom-0 left-0 right-0 lg:left-auto lg:bottom-6 lg:right-6 lg:w-[300px]"
    >
      <div
        className="border-t lg:border lg:rounded-2xl p-4 shadow-lg"
        style={{
          backgroundColor: "var(--j-card)",
          borderColor: "var(--j-line)",
        }}
      >
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[12px] font-bold" style={{ color: "var(--j-ink)" }}>
              {status === "filling" ? "Jo is filling this in" : "Jo filled this in"}
            </p>
            {toolName && (
              <p className="text-[10px] truncate" style={{ color: "var(--j-faint)" }}>
                {toolName}
              </p>
            )}
          </div>

          {status === "filling" && (
            <button
              type="button"
              onClick={stop}
              className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors hover:bg-(--j-tint)"
              style={{ color: "var(--j-muted)" }}
            >
              Stop
            </button>
          )}

          {(status === "done" || status === "stopped") && (
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="shrink-0 rounded-lg p-1 transition-colors hover:bg-(--j-tint)"
              style={{ color: "var(--j-faint)" }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </header>

        {steps.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {steps.map((step) => (
              <li key={step.field} className="flex items-center gap-2 text-[11px]">
                {step.state === "filled" ? (
                  <Check className="w-3 h-3 shrink-0" style={{ color: "var(--j-purple)" }} />
                ) : step.state === "active" ? (
                  <Loader2
                    className="w-3 h-3 shrink-0 animate-spin"
                    style={{ color: "var(--j-purple)" }}
                  />
                ) : (
                  <Circle className="w-3 h-3 shrink-0" style={{ color: "var(--j-line-2)" }} />
                )}
                <span
                  className="truncate"
                  style={{
                    color:
                      step.state === "pending" ? "var(--j-faint)" : "var(--j-ink)",
                  }}
                >
                  {step.label}
                </span>
              </li>
            ))}
          </ul>
        )}

        {status === "asking" && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--j-line)" }}>
            <p className="text-[12px] font-bold" style={{ color: "var(--j-ink)" }}>
              Generate this now?
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={generateNow}
                className="rounded-full px-3 py-1.5 text-[12px] font-bold text-white transition-colors bg-(--j-purple) hover:bg-(--j-deep)"
              >
                Yes, generate
              </button>
              {/* Quieter, but never hidden: checking first is a perfectly good
                  answer, and it is the one that costs nothing. */}
              <button
                type="button"
                onClick={dismiss}
                className="rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-(--j-tint)"
                style={{ color: "var(--j-muted)" }}
              >
                I&apos;ll check the inputs first
              </button>
            </div>
          </div>
        )}

        {status === "stopped" && (
          <p className="mt-3 text-[11px]" style={{ color: "var(--j-muted)" }}>
            Stopped. The form is yours.
          </p>
        )}

        {status === "done" && (
          <p className="mt-3 text-[11px]" style={{ color: "var(--j-muted)" }}>
            Check the details, then press Generate when you are ready.
          </p>
        )}
      </div>
    </aside>
  );
}
