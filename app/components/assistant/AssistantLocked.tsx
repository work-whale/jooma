"use client";

import Link from "next/link";
import { Check } from "lucide-react";

/**
 * What a Free teacher sees in place of the assistant.
 *
 * Shown rather than hidden: the nav item stays visible and this page does the
 * selling. Hiding it would spare a click and cost the conversion.
 *
 * Presentation only — proxy.ts is what actually refuses the request, so a
 * teacher who works around this UI still gets a 402 and the upgrade modal.
 */
export default function AssistantLocked() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 sm:px-6 lg:px-10 text-center">
      <h2 className="text-[32px] font-semibold text-dark" style={{ letterSpacing: "0.38px" }}>
        Your teaching assistant
      </h2>
      <p className="mt-4 max-w-md text-sm text-muted">
        Ask anything about planning, assessment, behaviour or SEND — and have it set
        up your tools for you.
      </p>

      <ul className="mt-8 space-y-3 text-left">
        {[
          "Answers grounded in UK curriculum and classroom practice",
          "Opens the right tool with the details already filled in",
          "Reads your own documents and works from them",
          "Every conversation saved and searchable",
        ].map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-dark">
            <Check className="mt-0.5 w-4 h-4 shrink-0" style={{ color: "var(--j-purple)" }} />
            {item}
          </li>
        ))}
      </ul>

      {/* The plans page, where the cards can sell every plan and move a
          subscriber up or down from the one they have. */}
      <Link
        href="/pricing"
        className="mt-8 rounded-xl bg-(--j-purple) px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Upgrade to Pro, £7.99 a month
      </Link>
      <p className="mt-3 text-xs text-muted">Cancel any time.</p>
    </div>
  );
}
