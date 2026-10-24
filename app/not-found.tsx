import Link from "next/link";
import type { Metadata } from "next";

// Every URL nothing serves lands here, signed in or out. Before it existed a
// signed-out visitor was sent to /login instead (see app/lib/route-access.ts),
// so a crawler saw a mistyped or deleted address as a redirect to a working
// page rather than as a 404.
//
// No loading.tsx sits above this, so the response is not streamed and the
// status really is 404, not a 200 carrying a "not found" message.

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <div
      className="min-h-dvh flex items-center justify-center p-6"
      style={{ backgroundColor: "var(--j-tint)" }}
    >
      <div
        className="w-full max-w-md rounded-3xl px-10 py-12 text-center"
        style={{ backgroundColor: "var(--j-card)" }}
      >
        <Link href="/" aria-label="Jooma home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo/logo-v2.svg"
            alt="Jooma"
            width={104}
            height={32}
            className="mx-auto mb-7"
            style={{ height: 34, width: "auto" }}
          />
        </Link>
        <h1 className="text-xl font-bold mb-2.5" style={{ color: "var(--j-purple)" }}>
          We can&apos;t find that page
        </h1>
        <p className="text-sm leading-relaxed" style={{ color: "var(--j-body)" }}>
          The link may be old, or the address may have a typo in it.
        </p>
        <div className="mt-6 flex flex-col gap-2.5 text-sm font-semibold">
          <Link href="/" style={{ color: "var(--j-purple)" }}>
            Go to the homepage
          </Link>
          <Link href="/create" style={{ color: "var(--j-purple)" }}>
            Make a resource free
          </Link>
          <Link href="/contact" style={{ color: "var(--j-faint)" }}>
            Contact us
          </Link>
        </div>
      </div>
    </div>
  );
}
