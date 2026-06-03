"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles, Undo2, Redo2, Check, Folder, MoreVertical,
} from "lucide-react";

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

// Each step pairs with a product mockup shown in the left preview pane.
const SLIDES = [ChatMock, QuizMock, FoldersMock, RecentMock];
const INTERVAL = 4200;

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  // Bumped on every advance or manual select — restarts the timer bar + replay.
  const [runId, setRunId] = useState(0);

  const select = (i: number) => {
    setActive(i);
    setRunId((r) => r + 1);
  };

  // Auto-advance; the timer restarts whenever runId changes (incl. manual clicks).
  useEffect(() => {
    const id = setTimeout(() => {
      setActive((a) => (a + 1) % SLIDES.length);
      setRunId((r) => r + 1);
    }, INTERVAL);
    return () => clearTimeout(id);
  }, [runId]);

  const ActiveSlide = SLIDES[active];

  return (
    <section id="how-it-works" className="px-3 sm:px-4 pb-16 scroll-mt-20">
      {/* Rounded panel — small inset from the page edge, like the hero */}
      <div
        className="rounded-[28px] border py-12"
        style={{ backgroundColor: "#FBFAF6", borderColor: "#E9E6DC" }}
      >
        {/* Content — aligned to the same width as the other sections */}
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
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
            {/* Animated preview — only the active mockup is mounted; keying by
                runId remounts it on every switch so the build replays from start. */}
            <div
              className="relative rounded-2xl overflow-hidden h-full min-h-115"
              style={{ backgroundColor: "#F1EFE3" }}
            >
              <div key={runId} className="absolute inset-0 flex items-center justify-center p-6 sm:p-8">
                <ActiveSlide />
              </div>
            </div>

            {/* Steps — highlight the active one, click to jump */}
            <div className="space-y-4">
              {STEPS.map((s, i) => {
                const isActive = i === active;
                return (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => select(i)}
                    aria-current={isActive}
                    className="relative overflow-hidden w-full text-left rounded-2xl border p-5 flex gap-3.5 transition-all duration-300 ease-out outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{
                      backgroundColor: "#FFFFFF",
                      borderColor: isActive ? s.color : "#EAE7DD",
                      boxShadow: isActive ? "0 16px 36px -18px rgba(40,34,24,0.32)" : "none",
                    }}
                  >
                    <span
                      className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white transition-transform duration-300"
                      style={{ backgroundColor: s.color, transform: isActive ? "scale(1.1)" : "scale(1)" }}
                    >
                      {s.n}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold mb-1" style={{ color: "#030303" }}>{s.title}</h3>
                      <p className="text-sm leading-relaxed" style={{ color: "#6b6055" }}>{s.desc}</p>
                    </div>

                    {/* Auto-advance timer bar — fills over INTERVAL, restarts via runId */}
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-0 right-0"
                        style={{ height: 3, backgroundColor: "rgba(40,34,24,0.08)" }}
                        aria-hidden="true"
                      >
                        <span
                          key={runId}
                          className="block h-full"
                          style={{
                            backgroundColor: s.color,
                            transformOrigin: "left center",
                            animation: `hiw-progress ${INTERVAL}ms linear forwards`,
                          }}
                        />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Preview mockups ─────────────────────────────────────────────────────── */

function ChatMock() {
  return (
    <div className="tp-float w-full max-w-sm flex flex-col gap-5">
      {/* User question */}
      <div className="hiw-rise flex items-center justify-end gap-2.5">
        <div className="rounded-2xl rounded-tr-md px-4 py-2.5 text-sm" style={{ backgroundColor: "#FFFFFF", color: "#030303" }}>
          How to involve parents more in class?
        </div>
        <Avatar gradient="linear-gradient(135deg,#a78bfa,#ec4899)" />
      </div>

      {/* AI response */}
      <div className="hiw-rise flex items-end gap-2.5" style={{ animationDelay: "0.18s" }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#1a1a1a" }}>
          <img src="/logo/icon.svg" alt="" className="w-5 h-5" />
        </div>
        <div className="rounded-2xl rounded-bl-md px-4 py-3 max-w-sm" style={{ backgroundColor: "#FFFFFF" }}>
          <p className="text-sm leading-relaxed mb-3" style={{ color: "#030303" }}>
            Here are some effective ways to increase parent involvement in your classroom:
          </p>
          <div className="space-y-2">
            {["88%", "72%", "80%"].map((w, i) => (
              <Bar key={i} w={w} h="8px" delay={`${0.3 + i * 0.12}s`} />
            ))}
          </div>
        </div>
      </div>

      {/* Thanks */}
      <div className="hiw-rise flex items-center justify-end gap-2.5" style={{ animationDelay: "0.5s" }}>
        <div className="rounded-2xl rounded-tr-md px-4 py-2 text-sm" style={{ backgroundColor: "rgba(255,255,255,0.55)", color: "#9a8f85" }}>
          Thanks!
        </div>
        <Avatar gradient="linear-gradient(135deg,#fcd34d,#f59e0b)" />
      </div>
    </div>
  );
}

function QuizMock() {
  return (
    <div className="tp-float w-full max-w-sm rounded-2xl border p-5" style={card}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[15px] font-bold" style={{ color: "#1a1a1a" }}>Quiz generator</h4>
        <div className="flex items-center gap-2">
          <Dot /><Dot />
          <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: "#1a1a1a" }}>Download</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 rounded-xl border px-2.5 py-2 mb-4" style={{ borderColor: "#EDEAE0" }}>
        <Undo2 className="w-3.5 h-3.5" style={{ color: "#9a8f85" }} />
        <Redo2 className="w-3.5 h-3.5" style={{ color: "#9a8f85" }} />
        <Bar w="40px" delay="0.2s" />
        <Dot /><Dot />
        <Bar w="34px" delay="0.35s" />
      </div>

      {/* Question lines */}
      <div className="flex gap-2 mb-4">
        <Bar w="40%" h="9px" delay="0.15s" />
        <Bar w="48%" h="9px" delay="0.3s" />
      </div>

      {/* Options */}
      <div className="grid grid-cols-2 gap-2.5">
        {[true, false, false, false].map((checked, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2.5" style={{ borderColor: "#EDEAE0" }}>
            <Bar w="58%" delay={`${0.45 + i * 0.15}s`} />
            <Checkbox checked={checked} delay="0.8s" />
          </div>
        ))}
      </div>
    </div>
  );
}

const FOLDERS = [
  { name: "Slideshow", tint: "#FBE7D6", ink: "#d98a3d" },
  { name: "Phonics support", tint: "#FAD9D5", ink: "#d9534f" },
  { name: "Modelled Text (WAGOLL)", tint: "#DCEFE2", ink: "#2e9d54" },
  { name: "Worksheet", tint: "#E5E9FB", ink: "#3B6FF5" },
];

function FoldersMock() {
  return (
    <div className="grid grid-cols-2 gap-3 w-full max-w-md">
      {FOLDERS.map((f, i) => (
        <div key={f.name} className="hiw-rise rounded-2xl border p-4" style={{ ...card, animationDelay: `${i * 0.09}s` }}>
          <div className="flex items-start justify-between mb-6">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: f.tint }}>
              <Folder className="w-4 h-4" style={{ color: f.ink }} />
            </div>
            <MoreVertical className="w-4 h-4" style={{ color: "#c4bdb2" }} />
          </div>
          <p className="text-[13px] font-semibold mb-0.5 truncate" style={{ color: "#1a1a1a" }}>{f.name}</p>
          <p className="text-[11px]" style={{ color: "#9a8f85" }}>12 items</p>
        </div>
      ))}
    </div>
  );
}

const RECENT = [
  { name: "Using exclamation marks", tint: "#FBE7D6" },
  { name: "Doubling numbers up to 20", tint: "#FAD9D5" },
  { name: "Needs of living things", tint: "#E5E9FB" },
];

function RecentMock() {
  return (
    <div className="tp-float w-full max-w-md rounded-2xl border p-5" style={card}>
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-[15px] font-bold" style={{ color: "#1a1a1a" }}>
          Recently added <span style={{ color: "#9a8f85" }}>(16)</span>
        </h4>
        <span className="text-xs font-semibold" style={{ color: "#c25034" }}>See all</span>
      </div>
      <div className="space-y-2.5">
        {RECENT.map((r, i) => (
          <div
            key={r.name}
            className="hiw-rise flex items-center gap-3 rounded-xl border px-3 py-2.5"
            style={{ borderColor: "#EDEAE0", animationDelay: `${i * 0.12}s` }}
          >
            <div className="w-7 h-7 rounded-lg shrink-0" style={{ backgroundColor: r.tint }} />
            <span className="text-[12px] font-medium flex-1 truncate" style={{ color: "#1a1a1a" }}>{r.name}</span>
            <Bar w="38px" delay={`${0.3 + i * 0.15}s`} />
            <Bar w="26px" delay={`${0.42 + i * 0.15}s`} />
            <MoreVertical className="w-4 h-4 shrink-0" style={{ color: "#c4bdb2" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  backgroundColor: "#FFFFFF",
  borderColor: "#EDEAE0",
  boxShadow: "0 12px 32px -16px rgba(40,34,24,0.22)",
};

function Avatar({ gradient }: { gradient: string }) {
  return <div className="w-9 h-9 rounded-full shrink-0" style={{ background: gradient }} />;
}

// A skeleton bar that grows in from the left when its slide mounts (hiw-grow).
function Bar({ w, h = "6px", delay = "0s" }: { w: string; h?: string; delay?: string }) {
  return (
    <span
      className="hiw-grow rounded-full block shrink-0"
      style={{ width: w, height: h, backgroundColor: "#E4E0D6", animationDelay: delay }}
    />
  );
}

function Dot() {
  return <span className="w-4 h-4 rounded-md shrink-0" style={{ backgroundColor: "#EFECE2" }} />;
}

function Checkbox({ checked, delay = "0s" }: { checked: boolean; delay?: string }) {
  return (
    <span
      className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${checked ? "hiw-rise" : ""}`}
      style={{
        backgroundColor: checked ? "#1a1a1a" : "transparent",
        border: checked ? "none" : "1.5px solid #D8D2C4",
        animationDelay: delay,
      }}
    >
      {checked && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
    </span>
  );
}
