/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight, Sparkles, Clock, FileCheck, Check, ChevronDown } from "lucide-react";
import { TOOLS } from "@/app/lib/tools";
import HeroShowcase from "@/app/components/landing/HeroShowcase";

const FEATURED = [
  { icon: "/icons/tool-lesson-plans.svg", label: "Lesson Planner", desc: "Structured plans from a topic and objective in seconds." },
  { icon: "/icons/tool-slideshow.svg", label: "Slideshow Generator", desc: "A full classroom deck — slides, activities, and images." },
  { icon: "/icons/tool-worksheets.svg", label: "Worksheet Generator", desc: "Differentiated worksheets for any year group." },
  { icon: "/icons/tool-quiz-generator.svg", label: "Quiz Generator", desc: "Editable quizzes, export to Kahoot, Blooket and more." },
  { icon: "/icons/tool-comprehension-generator.svg", label: "Comprehension", desc: "Bespoke reading activities tailored to your class." },
  { icon: "/icons/tool-report-writer.svg", label: "Report Writer", desc: "Personalised pupil reports from a few quick notes." },
];

const STEPS = [
  { icon: Sparkles, title: "Pick a tool", desc: "Choose from 30+ AI tools built for the classroom." },
  { icon: FileCheck, title: "Add your details", desc: "Topic, year group, and any specifics — that's it." },
  { icon: Clock, title: "Save hours", desc: "Get editable, ready-to-use resources in seconds." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: "#F1EFE3" }}>

      {/* Nav — aligned to the panel edges below */}
      <nav className="px-9 sm:px-10 py-5 flex items-center justify-between">
        <img src="/logo/logo.svg" alt="Jooma" style={{ height: 26, width: "auto" }} />

        {/* Centred links — hidden on small screens */}
        <div className="hidden md:flex items-center gap-7 text-sm font-medium" style={{ color: "#4a423a" }}>
          <a href="#tools" className="transition-colors hover:text-black">Features</a>
          <a href="#how-it-works" className="transition-colors hover:text-black">How It Works</a>
          <Link href="/pricing" className="transition-colors hover:text-black">Pricing</Link>
          <Link href="/pricing" className="transition-colors hover:text-black">Schools</Link>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/login" className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors hover:bg-black/5" style={{ color: "#030303" }}>
            Log In
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#030303" }}
          >
            Let&apos;s Try Free
            <ArrowRight className="w-3.5 h-3.5 -rotate-45" />
          </Link>
        </div>
      </nav>

      {/* Hero + showcase — framed in a lighter rounded panel that spans the
          screen with a small inset from the page background */}
      <div className="px-3 sm:px-4 pb-16">
        <div
          className="rounded-[28px] border px-6 pt-14 pb-12"
          style={{ backgroundColor: "#FFFFFF", borderColor: "#E9E6DC" }}
        >
          {/* Hero */}
          <div className="max-w-4xl mx-auto text-center">
            <span
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs mb-7 "
              style={{ backgroundColor: "#EAEFF7", color: "#3B6FF5", borderColor: "#D6DEF2" }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI-Powered Lesson Creation
            </span>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-[1.04]" style={{ color: "#030303" }}>
              Create personalised lessons<br />in minutes, not hours.
            </h1>
            <p className="text-base max-w-2xl mx-auto mb-8 leading-normal" style={{ color: "#030303" }}>
              Jooma helps teachers generate personalised, curriculum-aligned lessons
              in minutes — reducing planning time while improving classroom engagement.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#030303" }}
            >
              Get Started
            </Link>
            <p className="text-xs mt-5" style={{ color: "#9a8f85" }}>
              No card required · 5 free generations every month
            </p>
          </div>

          {/* Product showcase */}
          <div className="mt-12">
            <HeroShowcase />
          </div>
        </div>
      </div>

      {/* Popular tools — animated previews */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#c25034" }}>
            See it in action
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: "#030303" }}>
            Popular with teachers
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <PreviewCard
            icon="/icons/tool-lesson-plans.svg"
            label="Lesson Planner"
            desc="Structured plans written for you in seconds."
          >
            <LessonPlannerPreview />
          </PreviewCard>

          <PreviewCard
            icon="/icons/tool-slideshow.svg"
            label="Slideshow Generator"
            desc="A full classroom deck, built slide by slide."
          >
            <SlideshowPreview />
          </PreviewCard>

          <PreviewCard
            icon="/icons/tool-quiz-generator.svg"
            label="Quiz Generator"
            desc="Instant quizzes with the answers marked."
          >
            <QuizPreview />
          </PreviewCard>
        </div>
      </section>

      {/* Tools */}
      <section id="tools" className="max-w-7xl mx-auto px-6 py-16 scroll-mt-20">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#c25034" }}>
            {TOOLS.length}+ tools
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3" style={{ color: "#030303" }}>
            Everything you need to teach
          </h2>
          <p className="text-base max-w-xl mx-auto" style={{ color: "#6b6055" }}>
            From a single lesson to a whole scheme of work — every tool is built
            around the UK curriculum.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURED.map((f) => (
            <div
              key={f.label}
              className="rounded-2xl p-6 border flex items-start gap-4"
              style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}
            >
              <img src={f.icon} alt="" className="w-11 h-11 shrink-0" />
              <div>
                <h3 className="font-semibold mb-1" style={{ color: "#030303" }}>{f.label}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#6b6055" }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 text-sm font-semibold transition-all hover:gap-2.5"
            style={{ color: "#c25034" }}
          >
            Explore all tools
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-5xl mx-auto px-6 py-16 scroll-mt-20">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-12" style={{ color: "#030303" }}>
          How it works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {STEPS.map((s, i) => (
            <div key={s.title} className="text-center">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ backgroundColor: "#FAE3D9" }}
              >
                <s.icon className="w-6 h-6" style={{ color: "#c25034" }} />
              </div>
              <p className="text-xs font-semibold mb-1" style={{ color: "#9a8f85" }}>Step {i + 1}</p>
              <h3 className="font-semibold text-lg mb-1.5" style={{ color: "#030303" }}>{s.title}</h3>
              <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: "#6b6055" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div
          className="rounded-3xl px-8 py-14 text-center"
          style={{ backgroundColor: "#030303" }}
        >
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4 text-white">
            Get your evenings back
          </h2>
          <p className="text-base max-w-lg mx-auto mb-8" style={{ color: "#bdb8af" }}>
            Join teachers using Jooma to plan smarter and spend less time on prep.
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#FFCC33", color: "#030303" }}
          >
            Start for free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-3 sm:px-4 pb-4">
        <div className="rounded-[28px] px-8 sm:px-14 py-12" style={{ backgroundColor: "#141310" }}>
          {/* Logo + socials (left) and link columns (right) */}
          <div className="flex flex-col md:flex-row md:justify-between gap-12">
            <div className="flex flex-col justify-between gap-10">
              <div className="flex items-center gap-2.5">
                <img src="/logo/icon.svg" alt="" style={{ height: 34, width: "auto" }} />
                <span className="text-xl font-bold tracking-tight text-white">JOOMA</span>
              </div>
              <div className="flex items-center gap-3">
                {SOCIALS.map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    aria-label={s.label}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
                    style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
                  >
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="rgba(255,255,255,0.8)" aria-hidden="true">
                      <path d={s.path} />
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 md:gap-16">
              {FOOTER_COLS.map((col) => (
                <div key={col.title}>
                  <p className="text-xs font-semibold mb-4" style={{ color: "#7a766c" }}>{col.title}</p>
                  <ul className="space-y-3">
                    {col.links.map((l) => (
                      <li key={l.label}>
                        <Link href={l.href} className="text-sm transition-colors hover:text-white" style={{ color: "#c4bfb4" }}>
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px my-8" style={{ backgroundColor: "rgba(255,255,255,0.1)" }} />

          {/* Bottom row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
              © {new Date().getFullYear()} Jooma. All rights reserved.
            </p>
            <div className="flex items-center gap-1.5 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
              English
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}

// ── Footer data ───────────────────────────────────────────────────────────────

const FOOTER_COLS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "#tools" },
      { label: "How It Works", href: "#how-it-works" },
      { label: "Use Cases", href: "#tools" },
      { label: "Integrations", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", href: "#" },
      { label: "Our Mission", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Press", href: "#" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Blog", href: "#" },
      { label: "Help Centre", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Press", href: "#" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Cookie Policy", href: "/privacy" },
    ],
  },
];

// Brand glyphs as inline SVG paths (simple-icons), so the footer needs no icon
// dependency.
const SOCIALS: { label: string; href: string; path: string }[] = [
  { label: "Facebook", href: "#", path: "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" },
  { label: "X", href: "#", path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" },
  { label: "Instagram", href: "#", path: "M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" },
  { label: "LinkedIn", href: "#", path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" },
  { label: "TikTok", href: "#", path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" },
];

// ── Animated tool previews ────────────────────────────────────────────────────
// Each preview is a pure-CSS looping mockup. The preview stage is inert
// (pointer-events-none, select-none, default cursor) so it reads like a muted
// autoplay clip rather than something to click or highlight.

function PreviewCard({
  icon,
  label,
  desc,
  children,
}: {
  icon: string;
  label: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border overflow-hidden flex flex-col cursor-default"
      style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}
    >
      {/* Preview stage — inert, like a video */}
      <div
        className="h-44 flex items-center justify-center px-6 select-none pointer-events-none cursor-default"
        style={{ backgroundColor: "#F2EEE2" }}
        aria-hidden="true"
      >
        {children}
      </div>
      {/* Label */}
      <div className="flex items-center gap-3 p-5 border-t" style={{ borderColor: "#EDEAE0" }}>
        <img src={icon} alt="" className="w-10 h-10 shrink-0" />
        <div>
          <h3 className="font-semibold text-sm" style={{ color: "#030303" }}>{label}</h3>
          <p className="text-xs leading-relaxed" style={{ color: "#6b6055" }}>{desc}</p>
        </div>
      </div>
    </div>
  );
}

function LessonPlannerPreview() {
  // A document writing itself, line by line.
  const lines = ["88%", "100%", "72%", "94%", "60%"];
  return (
    <div
      className="tp-float w-full max-w-57.5 rounded-xl bg-white p-4"
      style={{ boxShadow: "0 4px 14px rgba(0,0,0,0.06)", border: "1px solid #EDEAE0" }}
    >
      <div className="h-2 w-14 rounded-full mb-3" style={{ backgroundColor: "#D13435" }} />
      <div
        className="tp-line h-2.5 rounded-full mb-3"
        style={{ width: "80%", backgroundColor: "#2c1d10", animationDelay: "0s" }}
      />
      <div className="space-y-2">
        {lines.map((w, i) => (
          <div
            key={i}
            className="tp-line h-1.5 rounded-full"
            style={{ width: w, backgroundColor: "#c8bdb0", animationDelay: `${0.3 + i * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function SlideshowPreview() {
  // A slide assembling: title, image, body lines, with progress dots.
  return (
    <div
      className="tp-float w-full max-w-62.5 rounded-xl overflow-hidden"
      style={{ backgroundColor: "#FBF5E3", boxShadow: "0 4px 14px rgba(0,0,0,0.06)", border: "1px solid #EDE6D2" }}
    >
      <div className="p-4">
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <div
              className="tp-fade-up h-3 w-20 rounded-full mb-2.5"
              style={{ backgroundColor: "#2C9C9C", animationDelay: "0s" }}
            />
            <div
              className="tp-line h-1.5 w-full rounded-full mb-1.5"
              style={{ backgroundColor: "#b3a48f", animationDelay: "0.35s" }}
            />
            <div
              className="tp-line h-1.5 rounded-full mb-1.5"
              style={{ width: "85%", backgroundColor: "#b3a48f", animationDelay: "0.5s" }}
            />
            <div
              className="tp-line h-1.5 rounded-full"
              style={{ width: "70%", backgroundColor: "#b3a48f", animationDelay: "0.65s" }}
            />
          </div>
          <div
            className="tp-fade-up w-14 h-14 rounded-lg shrink-0"
            style={{
              background: "linear-gradient(135deg, #cdbfa3 0%, #a8b8a0 100%)",
              animationDelay: "0.2s",
            }}
          />
        </div>
        <div className="flex gap-1.5 mt-4 justify-center">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="tp-fade-up w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: i === 0 ? "#2C9C9C" : "#d6cdb8", animationDelay: `${0.7 + i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuizPreview() {
  // A question with four options; the correct one turns green with a tick.
  const opts = ["62%", "48%", "70%", "55%"];
  const correct = 1;
  return (
    <div
      className="tp-float w-full max-w-60 rounded-xl bg-white p-4"
      style={{ boxShadow: "0 4px 14px rgba(0,0,0,0.06)", border: "1px solid #EDEAE0" }}
    >
      <div
        className="tp-line h-2 rounded-full mb-3"
        style={{ width: "82%", backgroundColor: "#2c1d10", animationDelay: "0s" }}
      />
      <div className="space-y-2">
        {opts.map((w, i) => {
          const isCorrect = i === correct;
          return (
            <div
              key={i}
              className={`relative h-6 rounded-md flex items-center px-2.5 ${isCorrect ? "tp-correct" : ""}`}
              style={!isCorrect ? { backgroundColor: "#e7eef7" } : undefined}
            >
              <div className="h-1.5 rounded-full" style={{ width: w, backgroundColor: "#94a3b8" }} />
              {isCorrect && (
                <div
                  className="tp-check absolute right-1.5 top-1 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "#2e9d54" }}
                >
                  <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
