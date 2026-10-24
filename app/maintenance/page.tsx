// The holding page behind maintenance_mode. Reached by a rewrite from proxy.ts,
// so the teacher keeps the URL they asked for and a refresh puts them straight
// back into the app the moment maintenance is switched off.
//
// noindex because the rewrite serves this at every URL, "/" included, to
// crawlers as well as teachers. Without it a crawl during maintenance would
// store "Back in a moment" as the homepage.

import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Back in a moment",
  robots: { index: false },
};

export default function MaintenancePage() {
  return (
    <div
      className="min-h-dvh flex items-center justify-center p-6"
      style={{ backgroundColor: "var(--j-tint)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl px-10 py-12 text-center"
        style={{ backgroundColor: "var(--j-card)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo/logo-v2.svg"
          alt="Jooma"
          width={104}
          height={32}
          className="mx-auto mb-7"
          style={{ height: 34, width: "auto" }}
        />
        <h1 className="text-xl font-bold mb-2.5" style={{ color: "var(--j-purple)" }}>
          Back in a moment
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--j-body)" }}>
          We&apos;re making a quick update to Jooma. Nothing you&apos;ve made has been
          affected. Your resources will all be here when we&apos;re done.
        </p>
        <p className="text-sm mt-4" style={{ color: "var(--j-faint)" }}>
          Try refreshing in a few minutes.
        </p>
      </div>
    </div>
  );
}
