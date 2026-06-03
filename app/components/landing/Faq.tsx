"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "How does Jooma work?",
    a: "Describe your lesson topic, learning goals, or classroom needs, and Jooma instantly generates personalised teaching resources.",
  },
  {
    q: "Is Jooma aligned to the UK curriculum?",
    a: "Yes — every tool is built around the UK national curriculum, so resources are age-appropriate and aligned to your year group and subject.",
  },
  {
    q: "What types of resources can I create?",
    a: "Lesson plans, slideshows, worksheets, quizzes, comprehension activities, homework tasks, and pupil reports — over 30 classroom tools in one place.",
  },
  {
    q: "Can I edit generated content?",
    a: "Absolutely. Every resource is fully editable, so you can adjust the tone, difficulty, and content, then save it to your workspace to reuse anytime.",
  },
];

export default function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
        {/* Left — heading + contact */}
        <div className="lg:max-w-xs">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight" style={{ color: "#030303" }}>
            Frequently Asked{" "}
            <span className="underline decoration-2 underline-offset-4" style={{ textDecorationColor: "#D8D2C4" }}>
              Questions
            </span>
          </h2>

          <div className="h-px my-7 max-w-56" style={{ backgroundColor: "#D8D2C4" }} />

          <p className="text-sm leading-relaxed mb-6" style={{ color: "#6b6055" }}>
            Can&apos;t find what you&apos;re looking for?
            <br />
            We&apos;re here to help every step of the way.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#030303" }}
          >
            Get in touch
          </Link>
        </div>

        {/* Right — accordion */}
        <div className="space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = i === open;
            return (
              <div
                key={f.q}
                className="rounded-2xl border transition-shadow duration-300"
                style={{
                  backgroundColor: "#FBFAF6",
                  borderColor: isOpen ? "#E2DFD4" : "#E9E6DC",
                  boxShadow: isOpen ? "0 14px 34px -20px rgba(40,34,24,0.3)" : "none",
                }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between gap-4 text-left px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 rounded-2xl"
                >
                  <span className="text-sm font-semibold" style={{ color: "#030303" }}>{f.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    style={{ color: "#9a8f85" }}
                  />
                </button>

                {/* Smoothly collapsing answer (grid-rows trick) */}
                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-4 text-sm leading-relaxed" style={{ color: "#6b6055" }}>{f.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
