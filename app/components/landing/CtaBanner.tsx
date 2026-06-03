import Link from "next/link";

// Full-bleed red call-to-action band with a subtle vertical-stripe texture on
// the right, matching the page's inset-panel rhythm.
export default function CtaBanner() {
  return (
    <section className="px-3 sm:px-4 pb-16">
      <div
        className="relative overflow-hidden rounded-[28px] px-6 py-20 sm:py-24 text-center"
        style={{ backgroundColor: "#D9453C" }}
      >
        {/* Decorative vertical stripes, fading in from the right */}
        <div
          className="absolute inset-y-0 right-0 w-3/5 pointer-events-none"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0, transparent 34px, rgba(255,255,255,0.05) 34px, rgba(255,255,255,0.05) 68px)",
            maskImage: "linear-gradient(to right, transparent, #000 80%)",
            WebkitMaskImage: "linear-gradient(to right, transparent, #000 80%)",
          }}
          aria-hidden="true"
        />

        <div className="relative max-w-3xl mx-auto">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-5 leading-[1.05]">
            Spend less time planning,<br />more time teaching
          </h2>
          <p
            className="text-sm md:text-base mx-auto mb-9 max-w-md leading-relaxed"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            Jooma uses AI to help you create personalised, curriculum-aligned
            resources in minutes. Spend less time planning, and more time teaching.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="px-6 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#030303" }}
            >
              Start Free Today
            </Link>
            <Link
              href="#how-it-works"
              className="px-6 py-3 rounded-xl text-sm font-semibold text-white border transition-colors hover:bg-white/10"
              style={{ borderColor: "rgba(255,255,255,0.65)" }}
            >
              See How It Works
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
