"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
// No sparkle glyph: the brand bible bans them alongside wands and gradient
// shimmer, for the same reason it bans the word "AI" in front of a teacher.
import { Medal, Zap, Clock, X } from "lucide-react";
import TopUpModal from "@/app/components/v2/TopUpModal";

// Centralised quota prompt. Rather than editing every tool form, this patches
// window.fetch once and watches for the blocks the server returns when a gate
// refuses a request. On a hit it opens a modal whose copy and CTA come from the
// response body.
//
// Three shapes arrive here (see quotaBlockBody in lib/generation-guard.ts):
//   action: "upgrade" — no active subscription, so nothing to spend.  402
//   action: "topup"   — a paid account used its monthly AI allowance.  402
//   action: "wait"    — the fair-use rate limit; clears on its own.    429
//
// The "wait" case deliberately offers NO call to action. A Pro teacher who
// generated too quickly has nothing to buy, and showing them an upgrade button
// would be both wrong and irritating.

interface QuotaBlock {
  error?: string;
  action?: "upgrade" | "topup" | "wait";
  reason?: "plan_required" | "credit_exhausted" | "rate_limited";
}

export default function UpgradeGate() {
  const [block, setBlock] = useState<QuotaBlock | null>(null);
  const [topUpOpen, setTopUpOpen] = useState(false);

  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const res = await original(...args);
      // 402 + x-upgrade-required is a quota that money fixes; 429 is the
      // fair-use rate limit, which time fixes.
      const isQuota = res.status === 402 && res.headers.get("x-upgrade-required");
      const isRateLimit = res.status === 429;
      if (isQuota || isRateLimit) {
        // MUST clone: the caller still needs to read this body, and json()
        // consumes the stream. Reading the original here would break every
        // tool form's own error handling.
        const body = await res
          .clone()
          .json()
          .catch(() => null);
        setBlock((body as QuotaBlock) ?? { action: "upgrade" });
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  if (!block) return null;

  const isTopUp = block.action === "topup";
  const isWait = block.action === "wait" || block.reason === "rate_limited";
  const close = () => setBlock(null);

  const title = isWait
    ? "Just a moment"
    : isTopUp
      ? "You've used this month's AI allowance"
      : "Choose a plan to start creating";

  // The server writes copy that already names the real numbers and reset time,
  // so prefer it over anything hardcoded here. These fallbacks deliberately
  // name no size or price: the packs and plans on offer are read at the moment
  // the chooser opens, and a figure written here would be one more place to
  // forget when either changes.
  const message =
    block.error ??
    (isWait
      ? "You've hit the fair-use limit for this hour. Try again shortly."
      : isTopUp
        ? "Top up to keep going. Extra credits last until the end of the month."
        : "Every plan starts with a free trial, and you can cancel before it ends.");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(29,23,48,0.45)" }}
      onClick={close}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-7 border"
        style={{ backgroundColor: "var(--j-card)", borderColor: "var(--j-line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute top-4 right-4 p-1 rounded-lg transition-colors hover:bg-black/5"
          style={{ color: "var(--j-faint)" }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Three tones for three different situations, and the distinction is
            the point: a rate limit clears on its own, a top-up is a small
            purchase, an upgrade is a plan change. Slate, amber, purple. */}
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
          style={{
            backgroundColor: isWait
              ? "var(--j-tint-slate)"
              : isTopUp
                ? "var(--j-tint-amber)"
                : "var(--j-tint)",
          }}
        >
          {isWait ? (
            <Clock className="w-5 h-5" style={{ color: "var(--j-muted)" }} />
          ) : isTopUp ? (
            <Zap className="w-5 h-5" style={{ color: "#b07a1e" }} />
          ) : (
            <Medal className="w-5 h-5" style={{ color: "var(--j-purple)" }} />
          )}
        </div>

        <h2 className="text-lg font-bold tracking-tight mb-1.5" style={{ color: "var(--j-ink)" }}>
          {title}
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--j-body)" }}>
          {message}
        </p>

        <div className="flex items-center gap-3">
          {/* No CTA for a rate limit: there is nothing to buy, and the block
              clears by itself. Just let them dismiss it. */}
          {isWait ? (
            <button
              type="button"
              onClick={close}
              className="flex-1 text-center py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--j-purple)", color: "#fff" }}
            >
              Got it
            </button>
          ) : isTopUp ? (
            /* Opens the chooser rather than buying a fixed pack. The label used
               to name one size and price, both of which are wrong as soon as a
               second pack exists — and picking on the teacher's behalf at the
               moment they are blocked is the worst time to do it. */
            <button
              type="button"
              onClick={() => setTopUpOpen(true)}
              className="flex-1 text-center py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--j-purple)", color: "#fff" }}
            >
              Top up credits
            </button>
          ) : (
            /* "See plans", not "Upgrade to Pro": there is more than one plan to
               choose from, and this lands on the subscription section where all
               of them are shown with their real prices. /pricing is the
               logged-out marketing page and only ever sells Pro. */
            <Link
              href="/profile?section=subscription"
              onClick={close}
              className="flex-1 text-center py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: "var(--j-purple)", color: "#fff" }}
            >
              See plans
            </Link>
          )}
          {!isWait && (
            <button
              type="button"
              onClick={close}
              className="py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors hover:bg-black/5"
              style={{ color: "var(--j-muted)" }}
            >
              Maybe later
            </button>
          )}
        </div>
      </div>

      {/* Stacks above this block modal: TopUpModal portals to document.body at
          z-index 80, and this overlay is z-50 in the normal flow. */}
      <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} />
    </div>
  );
}
