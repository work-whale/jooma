/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ArrowRight, Sparkles, Clock, FileCheck, Check } from "lucide-react";
import { TOOLS } from "@/app/lib/tools";

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

      {/* Nav */}
      <nav className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <img src="/logo/logo.svg" alt="Jooma" style={{ height: 26, width: "auto" }} />
        <div className="flex items-center gap-2">
          <Link href="/pricing" className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors hover:bg-black/5" style={{ color: "#1a1a1a" }}>
            Pricing
          </Link>
          <Link href="/login" className="px-4 py-2 text-sm font-semibold rounded-xl transition-colors hover:bg-black/5" style={{ color: "#1a1a1a" }}>
            Log in
          </Link>
          <Link href="/signup" className="px-4 py-2 text-sm font-semibold rounded-xl text-white transition-opacity hover:opacity-90" style={{ backgroundColor: "#1a1a1a" }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mb-6"
          style={{ backgroundColor: "#FAE3D9", color: "#c25034" }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI lesson planning for teachers
        </span>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-5 leading-[1.05]" style={{ color: "#1a1a1a" }}>
          Save hours of<br />planning time
        </h1>
        <p className="text-lg max-w-xl mx-auto mb-9" style={{ color: "#6b6055" }}>
          Create differentiated lessons, worksheets, slideshows and more —
          instantly, with AI built for the classroom.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#1a1a1a" }}
          >
            Start for free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center px-6 py-3 rounded-xl text-sm font-semibold border transition-colors hover:bg-black/5"
            style={{ borderColor: "#DAD8D0", color: "#1a1a1a" }}
          >
            See pricing
          </Link>
        </div>
        <p className="text-xs mt-5" style={{ color: "#9a8f85" }}>
          No card required · 5 free generations every month
        </p>
      </section>

      {/* Popular tools — animated previews */}
      <section className="max-w-7xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#c25034" }}>
            See it in action
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight" style={{ color: "#1a1a1a" }}>
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
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: "#c25034" }}>
            {TOOLS.length}+ tools
          </p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3" style={{ color: "#1a1a1a" }}>
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
                <h3 className="font-semibold mb-1" style={{ color: "#1a1a1a" }}>{f.label}</h3>
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
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-center mb-12" style={{ color: "#1a1a1a" }}>
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
              <h3 className="font-semibold text-lg mb-1.5" style={{ color: "#1a1a1a" }}>{s.title}</h3>
              <p className="text-sm leading-relaxed max-w-xs mx-auto" style={{ color: "#6b6055" }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div
          className="rounded-3xl px-8 py-14 text-center"
          style={{ backgroundColor: "#1a1a1a" }}
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
            style={{ backgroundColor: "#FFCC33", color: "#1a1a1a" }}
          >
            Start for free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-10 border-t" style={{ borderColor: "#DAD8D0" }}>
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <img src="/logo/logo.svg" alt="Jooma" style={{ height: 22, width: "auto" }} />
          <div className="flex items-center gap-6 text-sm" style={{ color: "#6b6055" }}>
            <Link href="/pricing" className="hover:opacity-70 transition-opacity">Pricing</Link>
            <Link href="/terms" className="hover:opacity-70 transition-opacity">Terms</Link>
            <Link href="/privacy" className="hover:opacity-70 transition-opacity">Privacy</Link>
            <Link href="/login" className="hover:opacity-70 transition-opacity">Log in</Link>
          </div>
          <p className="text-xs" style={{ color: "#9a8f85" }}>© {new Date().getFullYear()} Jooma</p>
        </div>
      </footer>

    </div>
  );
}

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
          <h3 className="font-semibold text-sm" style={{ color: "#1a1a1a" }}>{label}</h3>
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
