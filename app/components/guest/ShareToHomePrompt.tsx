"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/app/lib/auth/client";

type Kind = "slides" | "comprehension" | "worksheet";

/**
 * "Share this on the Jooma homepage?"
 *
 * A small pill after a generation lands in a teacher's library. Yes queues the
 * resource for an admin to approve for the landing page's "Made with Jooma"
 * row, with the teacher's full name, subject, year and country on the card,
 * which the pill says before they answer. No is remembered too, so the same
 * resource is never asked about twice. Closing it decides nothing.
 */
export default function ShareToHomePrompt({ kind, resourceId }: { kind: Kind; resourceId: string }) {
  const [state, setState] = useState<"checking" | "ask" | "sent" | "hidden">("checking");
  const [busy, setBusy] = useState(false);

  // Only ask about a resource nobody has answered for yet.
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const column = kind === "slides" ? "presentation_id" : "tool_run_id";
    void (async () => {
      const { data, error } = await supabase
        .from("showcase_items")
        .select("id")
        .eq(column, resourceId)
        .maybeSingle();
      if (cancelled) return;
      // An error (most likely the table not existing yet) means stay quiet.
      if (error || data) {
        setState("hidden");
        return;
      }
      // A beat after the result appears, so it does not compete with it.
      window.setTimeout(() => !cancelled && setState("ask"), 1500);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, resourceId]);

  useEffect(() => {
    if (state !== "sent") return;
    const t = window.setTimeout(() => setState("hidden"), 8000);
    return () => window.clearTimeout(t);
  }, [state]);

  const answer = async (consent: boolean) => {
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_showcase_consent", {
      p_kind: kind,
      p_resource_id: resourceId,
      p_consent: consent,
    });
    setBusy(false);
    if (error) {
      setState("hidden");
      return;
    }
    setState(consent ? "sent" : "hidden");
  };

  if (state === "checking" || state === "hidden") return null;

  return (
    <div
      role="dialog"
      aria-label="Share on the Jooma homepage"
      data-testid="share-prompt"
      className="fixed right-5 bottom-5 z-80 w-[min(360px,calc(100vw-2.5rem))] rounded-2xl border p-4 shadow-xl"
      style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
    >
      <button
        type="button"
        onClick={() => setState("hidden")}
        className="absolute right-2.5 top-2.5 p-1 rounded-md cursor-pointer"
        style={{ color: "var(--j-faint)" }}
        aria-label="Close"
      >
        <X className="w-4 h-4" />
      </button>

      {state === "ask" ? (
        <>
          <p className="text-sm font-bold pr-6" style={{ color: "var(--j-ink)" }}>
            Share this on the Jooma homepage?
          </p>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--j-muted)" }}>
            Other teachers would see it with your full name, subject, year group and country. We check
            everything before it goes up.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => answer(true)}
              className="flex-1 rounded-full px-4 py-2 text-sm font-bold cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: "var(--j-purple)", color: "#fff" }}
            >
              Yes, share it
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => answer(false)}
              className="flex-1 rounded-full border px-4 py-2 text-sm font-bold cursor-pointer disabled:opacity-50"
              style={{ borderColor: "var(--j-line-2)", color: "var(--j-ink)" }}
            >
              No thanks
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3 pr-6">
          <p className="text-sm font-semibold" style={{ color: "var(--j-ink)" }}>
            Thanks. Sent for review.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => answer(false)}
            className="text-sm font-bold cursor-pointer disabled:opacity-50"
            style={{ color: "var(--j-purple)" }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
