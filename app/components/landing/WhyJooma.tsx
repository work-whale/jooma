import Link from "next/link";
import { Sparkles, ArrowUpRight, ImageIcon } from "lucide-react";

// Image placeholders — swap the gradient divs for <img className="absolute
// inset-0 w-full h-full object-cover" /> when the real photography is ready.
const CARDS = [
  { gradient: "linear-gradient(160deg,#F6C61E,#E5A100)" }, // large (overlay sits here)
  { gradient: "linear-gradient(160deg,#C3B7A2,#9E9079)" }, // neutral / desk
  { gradient: "linear-gradient(160deg,#C0392B,#94251A)" }, // red
];

export default function WhyJooma() {
  return (
    <section className="px-3 sm:px-4 pb-16">
      <div
        className="rounded-[28px] border px-6 sm:px-12 py-12"
        style={{ backgroundColor: "#FBFAF6", borderColor: "#E9E6DC" }}
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5 mb-8">
          <div className="max-w-xl">
            <span
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium mb-5"
              style={{ backgroundColor: "#FCE4DF", color: "#c25034" }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Why Jooma
            </span>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3" style={{ color: "#030303" }}>
              Why Teachers Choose us
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "#6b6055" }}>
              Create personalised, curriculum-ready lessons in minutes with
              AI-powered tools for modern educators.
            </p>
          </div>
          <Link
            href="/signup"
            className="shrink-0 inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#030303" }}
          >
            Start Planning
          </Link>
        </div>

        {/* Image cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Large card with overlay */}
          <div
            className="md:col-span-2 relative rounded-2xl overflow-hidden h-72 sm:h-80"
            style={{ background: CARDS[0].gradient }}
          >
            <ImageIcon className="absolute right-5 bottom-5 w-10 h-10 text-white/25" />
            <div
              className="absolute top-4 left-4 w-[230px] rounded-2xl p-4"
              style={{ backgroundColor: "#FFFFFF", boxShadow: "0 8px 24px -8px rgba(40,34,24,0.25)" }}
            >
              <h3 className="text-sm font-semibold mb-1.5" style={{ color: "#030303" }}>Built for Every Learner</h3>
              <p className="text-xs leading-relaxed mb-4" style={{ color: "#6b6055" }}>
                Create engaging, personalised learning experiences that support
                students at every level.
              </p>
              <Link
                href="/signup"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:bg-black/5"
                style={{ borderColor: "#E2DFD4", color: "#030303" }}
              >
                Create Lessons
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Two smaller cards */}
          {CARDS.slice(1).map((c, i) => (
            <div
              key={i}
              className="relative rounded-2xl overflow-hidden h-72 sm:h-80"
              style={{ background: c.gradient }}
            >
              <ImageIcon className="absolute right-5 bottom-5 w-9 h-9 text-white/25" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
