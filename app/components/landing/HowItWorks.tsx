/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Sparkles } from "lucide-react";

const STEPS = [
  {
    n: 1,
    color: "#EAB308",
    title: "AI support for daily tasks",
    desc: "Automate worksheets, quizzes, and lesson preparation with intelligent AI support.",
  },
  {
    n: 2,
    color: "#22C55E",
    title: "Generate AI-Powered Resources",
    desc: "Our AI instantly creates personalised lesson plans, worksheets, quizzes, homework tasks, presentations, and classroom activities aligned to your curriculum.",
  },
  {
    n: 3,
    color: "#3B6FF5",
    title: "Edit, Save & Reuse",
    desc: "Customize any resource with real-time editing tools, save it to your workspace, and reuse or adapt materials whenever you need them.",
  },
  {
    n: 4,
    color: "#E0463F",
    title: "Teach With Confidence",
    desc: "Deliver engaging, differentiated lessons faster while reducing planning time and keeping every student supported.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="px-3 sm:px-4 pb-16 scroll-mt-20">
      <div
        className="rounded-[28px] border px-6 sm:px-12 py-12"
        style={{ backgroundColor: "#FBFAF6", borderColor: "#E9E6DC" }}
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5 mb-10">
          <div className="max-w-xl">
            <span
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium mb-5"
              style={{ backgroundColor: "#E1F0E8", color: "#1f7a43" }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              How It Works
            </span>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-3" style={{ color: "#030303" }}>
              How Jooma Works
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "#6b6055" }}>
              Everything you need to get started, manage projects, and work smarter with Jooma.
            </p>
          </div>
          <Link
            href="/signup"
            className="shrink-0 inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#030303" }}
          >
            Explore Features
          </Link>
        </div>

        {/* Content */}
        <div className="grid lg:grid-cols-2 gap-6 items-stretch">
          {/* Chat mockup */}
          <div
            className="rounded-2xl p-6 sm:p-8 flex flex-col justify-center gap-5"
            style={{ backgroundColor: "#F1EFE3" }}
          >
            {/* User question */}
            <div className="flex items-center justify-end gap-2.5">
              <div
                className="rounded-2xl rounded-tr-md px-4 py-2.5 text-sm"
                style={{ backgroundColor: "#FFFFFF", color: "#030303" }}
              >
                How to involve parents more in class?
              </div>
              <Avatar gradient="linear-gradient(135deg,#a78bfa,#ec4899)" />
            </div>

            {/* AI response */}
            <div className="flex items-end gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#1a1a1a" }}
              >
                <img src="/logo/icon.svg" alt="" className="w-5 h-5" />
              </div>
              <div
                className="rounded-2xl rounded-bl-md px-4 py-3 max-w-sm"
                style={{ backgroundColor: "#FFFFFF" }}
              >
                <p className="text-sm leading-relaxed mb-3" style={{ color: "#030303" }}>
                  Here are some effective ways to increase parent involvement in your classroom:
                </p>
                <div className="space-y-2">
                  {["88%", "72%", "80%"].map((w, i) => (
                    <div key={i} className="h-2 rounded-full" style={{ width: w, backgroundColor: "#E4E0D6" }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Thanks */}
            <div className="flex items-center justify-end gap-2.5">
              <div
                className="rounded-2xl rounded-tr-md px-4 py-2 text-sm"
                style={{ backgroundColor: "rgba(255,255,255,0.55)", color: "#9a8f85" }}
              >
                Thanks!
              </div>
              <Avatar gradient="linear-gradient(135deg,#fcd34d,#f59e0b)" />
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-4">
            {STEPS.map((s) => (
              <div
                key={s.title}
                className="rounded-2xl border p-5 flex gap-3.5"
                style={{ backgroundColor: "#FFFFFF", borderColor: "#EAE7DD" }}
              >
                <span
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ backgroundColor: s.color }}
                >
                  {s.n}
                </span>
                <div>
                  <h3 className="text-base font-semibold mb-1" style={{ color: "#030303" }}>{s.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#6b6055" }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Avatar({ gradient }: { gradient: string }) {
  return <div className="w-9 h-9 rounded-full shrink-0" style={{ background: gradient }} />;
}
