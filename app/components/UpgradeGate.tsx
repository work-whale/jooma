"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

// Centralised upgrade prompt. Rather than editing every tool form, this patches
// window.fetch once and watches for the 402 the proxy returns when a free user
// hits the monthly generation cap (tagged with the `x-upgrade-required` header).
// On a hit it opens a modal linking to /pricing. The response body is left
// untouched so each form's own error handling still runs.
export default function UpgradeGate() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const original = window.fetch;
    window.fetch = async (...args) => {
      const res = await original(...args);
      if (res.status === 402 && res.headers.get("x-upgrade-required")) {
        setOpen(true);
      }
      return res;
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(26,26,26,0.45)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-7 border"
        style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute top-4 right-4 p-1 rounded-lg transition-colors hover:bg-black/5"
          style={{ color: "#8a8078" }}
        >
          <X className="w-4 h-4" />
        </button>

        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "#FAD4C8" }}
        >
          <Sparkles className="w-5 h-5" style={{ color: "#c25034" }} />
        </div>

        <h2 className="text-lg font-bold tracking-tight mb-1.5" style={{ color: "#1a1a1a" }}>
          You&apos;ve used all your free generations
        </h2>
        <p className="text-sm mb-6" style={{ color: "#6b6055" }}>
          You&apos;ve reached your 5 free generations for this month. Upgrade to
          Pro Teacher for unlimited generations, full curriculum alignment, and
          editable outputs.
        </p>

        <div className="flex items-center gap-3">
          <Link
            href="/pricing"
            onClick={() => setOpen(false)}
            className="flex-1 text-center py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#E0463F", color: "#fff" }}
          >
            Upgrade to Pro
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="py-2.5 px-4 rounded-xl text-sm font-semibold transition-colors hover:bg-black/5"
            style={{ color: "#6b6055" }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
