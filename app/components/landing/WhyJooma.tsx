"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowUpRight } from "lucide-react";

// Image placeholders — swap the gradient divs for <img className="absolute
// inset-0 w-full h-full object-cover" /> when the real photography is ready.
// Each card carries the copy revealed when it slides open.
const CARDS = [
  {
    gradient: "linear-gradient(160deg,#F6C61E,#E5A100)",
    title: "Built for Every Learner",
    desc: "Create engaging, personalised learning experiences that support students at every level.",
    cta: "Create Lessons",
  },
  {
    gradient: "linear-gradient(160deg,#C3B7A2,#9E9079)",
    title: "AI-Powered Creation",
    desc: "Generate worksheets, quizzes, and lesson plans instantly with smart tools designed for modern classrooms.",
    cta: "Try Now",
  },
  {
    gradient: "linear-gradient(160deg,#C0392B,#94251A)",
    title: "Built for Busy Educators",
    desc: "Reduce hours spent planning lessons, creating worksheets, and organising classroom materials.",
    cta: "Start Planning",
  },
];

export default function WhyJooma() {
  const [active, setActive] = useState(0);

  return (
    <section className="px-3 sm:px-4 pb-16">
      <div
        className="rounded-[28px] border py-12"
        style={{ backgroundColor: "#FBFAF6", borderColor: "#E9E6DC" }}
      >
        {/* Content — aligned to the same width as the other sections */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
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

          {/* Expanding cards — the active card slides open to reveal its details */}
          <div className="flex gap-3 sm:gap-4 h-96 sm:h-120">
            {CARDS.map((c, i) => {
              const isActive = i === active;
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isActive}
                  aria-label={c.title}
                  onClick={() => setActive(i)}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActive(i);
                    }
                  }}
                  className="relative rounded-2xl overflow-hidden cursor-pointer outline-none transition-all duration-450 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ background: c.gradient, flexGrow: isActive ? 3 : 1, flexBasis: 0 }}
                >
                  {/* Bottom scrim for text legibility */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: "linear-gradient(180deg, transparent 35%, rgba(20,15,10,0.55))" }}
                    aria-hidden="true"
                  />

                  {/* Collapsed label — vertical title */}
                  <span
                    className={`absolute bottom-5 left-1/2 text-sm font-semibold text-white whitespace-nowrap transition-opacity duration-300 ${
                      isActive ? "opacity-0" : "opacity-100"
                    }`}
                    style={{ writingMode: "vertical-rl", transform: "translateX(-50%) rotate(180deg)" }}
                    aria-hidden="true"
                  >
                    {c.title}
                  </span>

                  {/* Expanded details */}
                  <div
                    className={`absolute left-5 right-5 bottom-5 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isActive ? "opacity-100 translate-y-0 delay-100" : "opacity-0 translate-y-3 pointer-events-none"
                    }`}
                  >
                    <h3 className="text-lg font-bold text-white mb-1.5">{c.title}</h3>
                    <p className="text-xs leading-relaxed text-white/85 mb-4 max-w-xs">{c.desc}</p>
                    <Link
                      href="/signup"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 px-3.5 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-90"
                      style={{ backgroundColor: "#FFFFFF", color: "#030303" }}
                    >
                      {c.cta}
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
