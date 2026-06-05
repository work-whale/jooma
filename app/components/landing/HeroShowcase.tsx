"use client";

/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useSyncExternalStore } from "react";
import { Search, Bell, Plus, Sparkles, ChevronDown, FileText, Clock, Layers, ArrowUp, ArrowRight } from "lucide-react";
import { TOOLS } from "@/app/lib/tools";
import ToolIcon from "@/app/components/ToolIcon";

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
  // True while the AI-assistant clip has "navigated" into the Lesson Planner
  // tool, so the sidebar + top bar update to match the routed-to screen.
  const [assistantOnTool, setAssistantOnTool] = useState(false);

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
                onClick={() => { setAssistantOnTool(false); setTab(t.id); }}
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

      {/* Preview frame — an inert autoplay "clip": no selection, default cursor,
          and non-interactive. The Tools and AI assistant panels animate on a
          loop so they read like a muted screen recording. */}
      <div
        className="mx-auto max-w-5xl rounded-2xl overflow-hidden select-none pointer-events-none cursor-default"
        style={{
          backgroundColor: "#F4F2EA",
          // Fade the bottom of the preview into the white panel as it goes down.
          maskImage: "linear-gradient(to bottom, #000 58%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, #000 58%, transparent 100%)",
        }}
        aria-hidden="true"
      >
        <div className="flex" style={{ height: 600 }}>
          <PreviewSidebar tab={tab} onTool={assistantOnTool} />
          <div className="flex-1 min-w-0 flex flex-col">
            <PreviewTopBar tab={tab} onTool={assistantOnTool} />
            <div className="flex-1 p-5" style={{ backgroundColor: "#F4F2EA" }}>
              {tab === "generate" && <GeneratePanel />}
              {tab === "tools" && <ToolsPanel />}
              {tab === "assistant" && <AssistantPanel onNav={setAssistantOnTool} />}
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

function PreviewSidebar({ tab, onTool }: { tab: Tab; onTool: boolean }) {
  const activeLabel = onTool || tab === "tools" ? "Tools" : tab === "assistant" ? "AI assistant" : "Dashboard";
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

function PreviewTopBar({ tab, onTool }: { tab: Tab; onTool: boolean }) {
  const title = onTool ? "Lesson Planner" : tab === "tools" ? "Tools" : tab === "assistant" ? "AI assistant" : "Dashboard";
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

// Reduced-motion preference — when set we freeze the loops on a representative
// static frame instead of animating. Read via useSyncExternalStore so it stays
// hydration-safe (the server snapshot is "no preference").
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

const TOOL_CATEGORIES = ["All", "Planning", "Assessment", "Literacy", "SEND", "Leadership"];

// Search terms the panel auto-types on a loop to demo filtering.
const DEMO_QUERIES = ["quiz", "report", "phonics", "eyfs"];

function ToolsPanel() {
  const reduced = usePrefersReducedMotion();
  const [query, setQuery] = useState("");

  // Auto-type each demo query, hold, erase, then move to the next — a looping
  // typewriter so the grid below appears to filter itself, like a screen clip.
  useEffect(() => {
    if (reduced) {
      setQuery("quiz");
      return;
    }
    let qi = 0;
    let ci = 0;
    let phase: "type" | "hold" | "erase" = "type";
    let t: ReturnType<typeof setTimeout>;

    const step = () => {
      const word = DEMO_QUERIES[qi];
      if (phase === "type") {
        ci++;
        setQuery(word.slice(0, ci));
        t = setTimeout(step, ci >= word.length ? ((phase = "hold"), 1900) : 120);
      } else if (phase === "hold") {
        phase = "erase";
        t = setTimeout(step, 120);
      } else {
        ci--;
        setQuery(word.slice(0, Math.max(0, ci)));
        if (ci <= 0) {
          phase = "type";
          qi = (qi + 1) % DEMO_QUERIES.length;
          t = setTimeout(step, 550);
        } else {
          t = setTimeout(step, 55);
        }
      }
    };

    t = setTimeout(step, 800);
    return () => clearTimeout(t);
  }, [reduced]);

  const q = query.trim().toLowerCase();
  const filtered = TOOLS.filter(
    (t) =>
      !q ||
      t.label.toLowerCase().includes(q) ||
      t.tag.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q),
  );

  return (
    <div>
      <SectionHead title={`Browse ${TOOLS.length}+ classroom tools`} caption="Every tool is built around the UK curriculum" />

      {/* Search bar — auto-typed text with a blinking caret (inert). */}
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 mt-3" style={{ borderColor: "#E2DFD4", backgroundColor: "#FFFFFF" }}>
        <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "#9a8f85" }} />
        <span className="flex-1 text-xs truncate" style={{ color: query ? "#1a1a1a" : "#9a8f85" }}>
          {query || `Search ${TOOLS.length}+ tools…`}
          {!reduced && <span className="hs-caret" />}
        </span>
      </div>

      {/* Category chips — decorative, "All" shown active. */}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {TOOL_CATEGORIES.map((c) => {
          const active = c === "All";
          return (
            <span
              key={c}
              className="px-2.5 py-1 rounded-full text-[11px] font-medium border"
              style={{
                backgroundColor: active ? "#1a1a1a" : "#FFFFFF",
                color: active ? "#FFFFFF" : "#6b6055",
                borderColor: active ? "#1a1a1a" : "#E2DFD4",
              }}
            >
              {c}
            </span>
          );
        })}
      </div>

      {/* Results grid — newly matching cards pop in as the search filters. */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
        {filtered.map((t, i) => (
          <div
            key={t.href}
            className="hs-pop rounded-xl border p-3.5 flex items-center gap-3"
            style={{ backgroundColor: "#FFFFFF", borderColor: "#EDEAE0", animationDelay: `${Math.min(i, 8) * 0.04}s` }}
          >
            <ToolIcon name={t.icon} className="w-9 h-9 shrink-0" />
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

type ChatMsg = { id: number; who: "you" | "ai"; node: React.ReactNode };

// The scripted conversation the assistant plays through on a loop.
// The prompt the assistant types, then routes the user into the matching tool.
const ASSISTANT_PROMPT = "Create me a Year 4 lesson plan on the water cycle";

// The "link" the assistant returns — looks like a clickable route into the
// Lesson Planner tool. `active` shows the pressed/just-clicked highlight.
function ToolLinkCard({ active }: { active: boolean }) {
  return (
    <div
      className="mt-2.5 flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all"
      style={{
        borderColor: active ? "#1a1a1a" : "#EDEAE0",
        backgroundColor: active ? "#F1EFE3" : "#FFFFFF",
        boxShadow: active ? "0 0 0 2px rgba(26,26,26,0.18)" : "none",
      }}
    >
      <ToolIcon name="planner" className="w-7 h-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold leading-tight" style={{ color: "#1a1a1a" }}>Lesson Planner</p>
        <p className="text-[10px]" style={{ color: "#8a8078" }}>Opens the tool, prefilled for you</p>
      </div>
      <span className="flex items-center gap-1 text-[11px] font-semibold shrink-0" style={{ color: "#c25034" }}>
        Open <ArrowRight className="w-3 h-3" />
      </span>
    </div>
  );
}

function ToolField({ label, value, delay }: { label: string; value: string; delay: number }) {
  return (
    <div className="hs-pop" style={{ animationDelay: `${delay}s` }}>
      <p className="text-[10px] mb-1" style={{ color: "#8a8078" }}>{label}</p>
      <div className="rounded-lg border px-2.5 py-1.5 text-[12px] font-medium" style={{ borderColor: "#E2DFD4", backgroundColor: "#FAF9F5", color: "#1a1a1a" }}>
        {value}
      </div>
    </div>
  );
}

function LessonSection({ title, widths, delay }: { title: string; widths: string[]; delay: number }) {
  return (
    <div className="hs-pop" style={{ animationDelay: `${delay}s` }}>
      <p className="text-[11px] font-semibold mb-1.5" style={{ color: "#c25034" }}>{title}</p>
      <div className="space-y-1.5">
        {widths.map((w, i) => (
          <div key={i} className="h-1.5 rounded-full" style={{ width: w, backgroundColor: "#d8cfc2" }} />
        ))}
      </div>
    </div>
  );
}

// The faux Lesson Planner screen the assistant "navigates" to — prefilled
// fields plus a lesson that builds itself in.
function LessonPlannerToolView() {
  return (
    <div className="hs-view-in">
      <div className="flex items-center gap-2.5 mb-3">
        <ToolIcon name="planner" className="w-9 h-9 shrink-0" />
        <div className="min-w-0">
          <p className="text-[14px] font-bold leading-tight" style={{ color: "#1a1a1a" }}>Lesson Planner</p>
          <p className="text-[11px]" style={{ color: "#8a8078" }}>Prefilled from your request</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold shrink-0" style={{ backgroundColor: "#EAEFF7", color: "#3B6FF5" }}>
          <Sparkles className="w-2.5 h-2.5" /> Auto-filled
        </span>
      </div>

      <div className="rounded-xl border p-3.5 mb-3 grid grid-cols-2 gap-3" style={{ backgroundColor: "#FFFFFF", borderColor: "#EDEAE0" }}>
        <ToolField label="Year group" value="Year 4" delay={0.05} />
        <ToolField label="Subject" value="Science" delay={0.12} />
        <ToolField label="Topic" value="The Water Cycle" delay={0.19} />
        <ToolField label="Duration" value="60 minutes" delay={0.26} />
      </div>

      <div className="rounded-xl border p-4" style={{ backgroundColor: "#FFFFFF", borderColor: "#EDEAE0" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[13px] font-bold" style={{ color: "#1a1a1a" }}>Water Cycle — Year 4</p>
          <span className="text-[11px] font-semibold" style={{ color: "#2e9d54" }}>Generated</span>
        </div>
        <div className="space-y-3">
          <LessonSection title="Starter" widths={["92%", "78%"]} delay={0.38} />
          <LessonSection title="Main activity" widths={["96%", "88%", "72%"]} delay={0.54} />
          <LessonSection title="Plenary" widths={["84%", "64%"]} delay={0.72} />
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="hs-typing-dot w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "#b3a48f", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function AssistantPanel({ onNav }: { onNav: (onTool: boolean) => void }) {
  const reduced = usePrefersReducedMotion();
  const [view, setView] = useState<"chat" | "tool">("chat");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [composer, setComposer] = useState("");
  const [typing, setTyping] = useState(false);

  // Loop: type the prompt → "send" it → typing → reply with a tool link →
  // "click" the link → cross-fade into the Lesson Planner tool → hold → repeat.
  useEffect(() => {
    if (reduced) {
      setMessages([
        { id: 1, who: "you", node: ASSISTANT_PROMPT },
        { id: 2, who: "ai", node: (
          <div>
            <p>I&apos;ll open the <span className="font-semibold" style={{ color: "#1a1a1a" }}>Lesson Planner</span> and prefill it from your request.</p>
            <ToolLinkCard active={false} />
          </div>
        ) },
      ]);
      return;
    }

    let cancelled = false;
    let id = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) => new Promise<void>((res) => { timeouts.push(setTimeout(res, ms)); });

    (async () => {
      while (!cancelled) {
        // Reset to an empty chat.
        onNav(false);
        setView("chat");
        setMessages([]);
        setComposer("");
        setTyping(false);
        await wait(500);

        // Type the prompt into the composer.
        for (let i = 1; i <= ASSISTANT_PROMPT.length; i++) {
          if (cancelled) return;
          setComposer(ASSISTANT_PROMPT.slice(0, i));
          await wait(40);
        }
        await wait(450);
        if (cancelled) return;

        // Send it.
        setComposer("");
        setMessages([{ id: ++id, who: "you", node: ASSISTANT_PROMPT }]);
        await wait(550);
        if (cancelled) return;

        // Assistant thinks, then replies with the tool link.
        setTyping(true);
        await wait(1300);
        if (cancelled) return;
        setTyping(false);
        setMessages((m) => [
          ...m,
          { id: ++id, who: "ai", node: (
            <div>
              <p>I&apos;ll open the <span className="font-semibold" style={{ color: "#1a1a1a" }}>Lesson Planner</span> and prefill it from your request.</p>
              <ToolLinkCard active={false} />
            </div>
          ) },
        ]);
        await wait(1300);
        if (cancelled) return;

        // "Click" the link — highlight it, then navigate to the tool.
        setMessages((m) =>
          m.map((msg) =>
            msg.who === "ai"
              ? { ...msg, node: (
                  <div>
                    <p>I&apos;ll open the <span className="font-semibold" style={{ color: "#1a1a1a" }}>Lesson Planner</span> and prefill it from your request.</p>
                    <ToolLinkCard active />
                  </div>
                ) }
              : msg,
          ),
        );
        await wait(750);
        if (cancelled) return;

        onNav(true);
        setView("tool");
        await wait(3600);
      }
    })();

    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
      onNav(false);
    };
  }, [reduced, onNav]);

  if (view === "tool") {
    return <LessonPlannerToolView />;
  }

  return (
    <div className="flex flex-col max-w-xl mx-auto" style={{ height: 300 }}>
      <div className="flex-1 space-y-3 pt-1 overflow-hidden">
        {messages.map((m) => (
          <Bubble key={m.id} who={m.who}>{m.node}</Bubble>
        ))}
        {typing && <Bubble who="ai"><TypingDots /></Bubble>}
      </div>

      {/* Composer — auto-typed text with a blinking caret (inert). */}
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2.5 mt-3" style={{ borderColor: "#E2DFD4", backgroundColor: "#FFFFFF" }}>
        <span className="flex-1 text-xs truncate" style={{ color: composer ? "#1a1a1a" : "#9a8f85" }}>
          {composer || "Ask the assistant anything…"}
          {!reduced && <span className="hs-caret" />}
        </span>
        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: "#1a1a1a" }}>
          <ArrowUp className="w-3 h-3 text-white" />
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
