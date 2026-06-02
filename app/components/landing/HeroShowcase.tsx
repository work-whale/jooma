"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { Search, Bell, Plus, Sparkles, ChevronDown, FileText, Clock, Layers } from "lucide-react";

type Tab = "generate" | "tools" | "assistant";

const TABS: { id: Tab; label: string }[] = [
  { id: "generate", label: "Generate Panel" },
  { id: "tools", label: "All Tools" },
  { id: "assistant", label: "AI assistant" },
];

// The product preview that sits under the hero. The tab switcher swaps between
// three faux-UI panels. Everything inside the frame is inert (a "screenshot"),
// so it's marked aria-hidden and non-interactive.
export default function HeroShowcase() {
  const [tab, setTab] = useState<Tab>("generate");

  return (
    <div className="w-full">
      {/* Segmented tab switcher */}
      <div className="flex justify-center mb-7">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-full border"
          style={{ backgroundColor: "transparent", borderColor: "#E2DFD4" }}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
                style={{
                  backgroundColor: active ? "#F1EFE3" : "transparent",
                  color: active ? "#1a1a1a" : "#6b6055",
                  boxShadow: active ? "0 1px 2px rgba(40,34,24,0.10)" : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Preview frame */}
      <div
        className="mx-auto max-w-5xl rounded-2xl overflow-hidden select-none pointer-events-none"
        style={{
          backgroundColor: "#F4F2EA",
          // Fade the bottom of the preview into the white panel as it goes down.
          maskImage: "linear-gradient(to bottom, #000 58%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 58%, transparent 100%)",
        }}
        aria-hidden="true"
      >
        <div className="flex" style={{ height: 600 }}>
          <PreviewSidebar tab={tab} />
          <div className="flex-1 min-w-0 flex flex-col">
            <PreviewTopBar tab={tab} />
            <div className="flex-1 p-5" style={{ backgroundColor: "#F4F2EA" }}>
              {tab === "generate" && <GeneratePanel />}
              {tab === "tools" && <ToolsPanel />}
              {tab === "assistant" && <AssistantPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Chrome ──────────────────────────────────────────────────────────────── */

const NAV = [
  { icon: "/icons/dashboard.svg", label: "Dashboard" },
  { icon: "/icons/tools.svg", label: "Tools" },
  { icon: "/icons/folders.svg", label: "Folders" },
  { icon: "/icons/ai-assistant.svg", label: "AI assistant" },
];

function PreviewSidebar({ tab }: { tab: Tab }) {
  const activeLabel = tab === "tools" ? "Tools" : tab === "assistant" ? "AI assistant" : "Dashboard";
  return (
    <aside
      className="hidden sm:flex flex-col gap-1 w-44 shrink-0 p-4 border-r"
      style={{ borderColor: "#E7E3D7", backgroundColor: "#F4F2EA" }}
    >
      <img src="/logo/logo.svg" alt="" style={{ height: 20, width: "auto" }} className="mb-5 ml-1" />
      {NAV.map((n) => {
        const active = n.label === activeLabel;
        return (
          <div
            key={n.label}
            className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px]"
            style={{
              backgroundColor: active ? "#1a1a1a" : "transparent",
              color: active ? "#fff" : "#6b6055",
            }}
          >
            <img
              src={n.icon}
              alt=""
              width={15}
              height={15}
              style={{ filter: active ? "brightness(0) invert(1)" : "brightness(0) opacity(0.55)" }}
            />
            {n.label}
          </div>
        );
      })}
    </aside>
  );
}

function PreviewTopBar({ tab }: { tab: Tab }) {
  const title = tab === "tools" ? "Tools" : tab === "assistant" ? "AI assistant" : "Dashboard";
  return (
    <div
      className="flex items-center justify-between px-5 py-3 border-b"
      style={{ borderColor: "#E7E3D7", backgroundColor: "#F4F2EA" }}
    >
      <span className="text-[15px] font-medium">{title}</span>
      <div className="flex items-center gap-2.5">
        <div
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs"
          style={{ borderColor: "#E2DFD4", color: "#9a8f85", width: 170 }}
        >
          <Search className="w-3.5 h-3.5" />
          Search anything
        </div>
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium"
          style={{ borderColor: "#E2DFD4", color: "#6b6055" }}
        >
          Connect Storage
          <ChevronDown className="w-3 h-3" />
        </div>
        <Bell className="w-4 h-4" style={{ color: "#9a8f85" }} />
        <div className="w-7 h-7 rounded-full" style={{ background: "linear-gradient(135deg,#E0463F,#c25034)" }} />
      </div>
    </div>
  );
}

/* ── Generate Panel (the dashboard) ──────────────────────────────────────── */

const STATS = [
  { value: "4 lesson plans", sub: "+2 vs last week", bg: "#FDE8E1", chip: "#E0463F", icon: FileText },
  { value: "15 hours", sub: "On planning", bg: "#DDEFE2", chip: "#2e9d54", icon: Clock },
  { value: "Flashcards", sub: "Used 12 times", bg: "#FBF1D5", chip: "#d99a00", icon: Layers },
  { value: "7 worksheets", sub: "Ready to use", bg: "#E5E9FB", chip: "#3B6FF5", icon: FileText },
];

const CHIPS = ["Mini math quiz for Year 2", "Shapes quiz", "Idea for parent involvement", "Fraction worksheet"];

function GeneratePanel() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4" style={{ backgroundColor: "#FFFFFF", borderColor: "#EDEAE0" }}>
        <SectionHead title="Here's your activity overview" caption="12 hours saved — more time for coffee or creativity" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          {STATS.map((s) => (
            <div key={s.value} className="rounded-xl p-3.5 border" style={{ backgroundColor: s.bg, borderColor: "rgba(0,0,0,0.04)" }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center mb-5" style={{ backgroundColor: s.chip }}>
                <s.icon className="w-3.5 h-3.5 text-white" />
              </div>
              <p className="text-[13px] font-bold" style={{ color: "#1a1a1a" }}>{s.value}</p>
              <p className="text-[11px]" style={{ color: "#8a8078" }}>{s.sub}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI assistant input */}
      <div className="rounded-xl border p-4" style={{ backgroundColor: "#FFFFFF", borderColor: "#EDEAE0" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-[13px] font-bold" style={{ color: "#1a1a1a" }}>AI assistant</span>
          <Plus className="w-3.5 h-3.5" style={{ color: "#9a8f85" }} />
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 mb-3" style={{ borderColor: "#E2DFD4" }}>
          <span className="text-xs flex-1" style={{ color: "#9a8f85" }}>Try: &lsquo;Create a Year 5 multiplication quiz&rsquo;</span>
          <Pill label="Level" />
          <Pill label="Tone" />
          <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: "#1a1a1a" }}>
            <Sparkles className="w-3 h-3 text-white" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <span key={c} className="px-2.5 py-1 rounded-full text-[11px] font-medium border" style={{ borderColor: "#E2DFD4", color: "#6b6055" }}>{c}</span>
          ))}
        </div>
      </div>

      {/* Recently added */}
      <div className="rounded-xl border p-4" style={{ backgroundColor: "#FFFFFF", borderColor: "#EDEAE0" }}>
        <SectionHead title="Recently added (16)" caption="" />
        <div className="mt-3">
          <div className="grid grid-cols-5 gap-2 px-1 py-2 text-[11px] font-semibold border-b" style={{ color: "#9a8f85", borderColor: "#EDEAE0" }}>
            <span>Name</span><span>Type</span><span>Subject</span><span>Year</span><span>Date</span>
          </div>
          <div className="grid grid-cols-5 gap-2 px-1 py-2.5 text-[11px] items-center" style={{ color: "#6b6055" }}>
            <span className="font-medium" style={{ color: "#1a1a1a" }}>Using exclamation marks</span>
            <span>Worksheet</span><span>English</span><span>Year 2</span><span>Oct 23, 2025</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── All Tools ───────────────────────────────────────────────────────────── */

const TOOL_CARDS = [
  { icon: "/icons/tool-lesson-plans.svg", label: "Lesson Planner", tag: "Planning" },
  { icon: "/icons/tool-slideshow.svg", label: "Slideshow Generator", tag: "Slides" },
  { icon: "/icons/tool-worksheets.svg", label: "Worksheet Generator", tag: "Assessment" },
  { icon: "/icons/tool-quiz-generator.svg", label: "Quiz Generator", tag: "Assessment" },
  { icon: "/icons/tool-comprehension-generator.svg", label: "Comprehension", tag: "Literacy" },
  { icon: "/icons/tool-report-writer.svg", label: "Report Writer", tag: "Admin" },
];

function ToolsPanel() {
  return (
    <div className="space-y-4">
      <SectionHead title="Browse 35+ classroom tools" caption="Every tool built around the UK curriculum" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {TOOL_CARDS.map((t) => (
          <div key={t.label} className="rounded-xl border p-3.5 flex items-center gap-3" style={{ backgroundColor: "#FFFFFF", borderColor: "#EDEAE0" }}>
            <img src={t.icon} alt="" className="w-9 h-9 shrink-0" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: "#1a1a1a" }}>{t.label}</p>
              <span className="text-[11px]" style={{ color: "#8a8078" }}>{t.tag}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── AI assistant ────────────────────────────────────────────────────────── */

function AssistantPanel() {
  // Column with messages on top and the composer pushed to the bottom — like a
  // real chat. Height is capped so the input lands just above the frame's
  // bottom fade and stays fully visible.
  return (
    <div className="flex flex-col max-w-xl mx-auto" style={{ height: 300 }}>
      <div className="flex-1 space-y-3 pt-1">
        <Bubble who="you">Create a Year 4 lesson on the water cycle with a starter activity.</Bubble>
        <Bubble who="ai">
          <p className="font-semibold mb-1" style={{ color: "#1a1a1a" }}>Water Cycle — Year 4</p>
          <div className="space-y-1.5">
            {["88%", "96%", "72%"].map((w, i) => (
              <div key={i} className="h-1.5 rounded-full" style={{ width: w, backgroundColor: "#d8cfc2" }} />
            ))}
          </div>
        </Bubble>
      </div>
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5" style={{ borderColor: "#E2DFD4", backgroundColor: "#FFFFFF" }}>
        <span className="text-xs flex-1" style={{ color: "#9a8f85" }}>Ask the assistant anything…</span>
        <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ backgroundColor: "#1a1a1a" }}>
          <Sparkles className="w-3 h-3 text-white" />
        </div>
      </div>
    </div>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

function SectionHead({ title, caption }: { title: string; caption: string }) {
  return (
    <div className="flex items-end justify-between">
      <div>
        <h3 className="text-[14px] font-bold" style={{ color: "#1a1a1a" }}>{title}</h3>
        {caption && <p className="text-[11px] mt-0.5" style={{ color: "#8a8078" }}>{caption}</p>}
      </div>
      <span className="text-[11px] font-semibold" style={{ color: "#c25034" }}>See all</span>
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border" style={{ borderColor: "#E2DFD4", color: "#6b6055" }}>
      {label}<ChevronDown className="w-2.5 h-2.5" />
    </span>
  );
}

function Bubble({ who, children }: { who: "you" | "ai"; children: React.ReactNode }) {
  const isYou = who === "you";
  return (
    <div className={`flex ${isYou ? "justify-end" : "justify-start"}`}>
      <div
        className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[12px] border"
        style={{
          backgroundColor: isYou ? "#1a1a1a" : "#FFFFFF",
          color: isYou ? "#fff" : "#6b6055",
          borderColor: isYou ? "#1a1a1a" : "#EDEAE0",
        }}
      >
        {children}
      </div>
    </div>
  );
}
