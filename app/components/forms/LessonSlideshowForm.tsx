"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Copy, Check, ChevronDown } from "lucide-react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { SubjectField, TopicField, LessonCountField, AdditionalContextField } from "@/app/components/fields";
import GenerateOutlineButton from "@/app/components/ui/GenerateOutlineButton";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import { toTitleCase } from "@/app/lib/formOptions";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import { saveToolRun, type ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "lesson-slideshow";

interface LessonSlideData {
  type: "title" | "content" | "two-column" | "activity" | "key-fact";
  title: string;
  lessonTitle: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  imageSuggestion?: string;
  callout?: { type: "remember" | "key-term" | "example" | "discussion"; text: string };
  leftTitle?: string;
  leftContent?: string;
  rightTitle?: string;
  rightContent?: string;
  activityPrompt?: string;
  activityNote?: string;
  fact?: string;
  factSource?: string;
}

const REFINE_CHIPS = [
  "Make language simpler",
  "Add more activities",
  "Include more detail",
  "Add a key terms slide",
  "Make it more challenging",
  "Add a summary slide",
];

// ── Theme ──────────────────────────────────────────────────────────────────
const S_BG      = "rgb(248, 250, 252)";   // near-white slate
const S_TEXT    = "rgb(15, 23, 42)";      // slate-900
const S_ACCENT  = "rgb(37, 99, 235)";     // blue-600
const S_SECOND  = "rgb(100, 116, 139)";   // slate-500
const S_LIGHT   = "rgb(239, 246, 255)";   // blue-50

const HEADING_FONT: React.CSSProperties = { fontFamily: "var(--font-spectral)", color: S_TEXT };
const BODY_FONT:    React.CSSProperties = { fontFamily: "var(--font-karla)",    color: S_TEXT };

function toHex(rgb: string): string {
  return rgb.match(/\d+/g)!
    .map((n) => parseInt(n).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

// ── Slide shell ────────────────────────────────────────────────────────────
function SlideCanvas({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-5xl rounded-lg overflow-hidden shadow-xl" style={{ aspectRatio: "16 / 9", backgroundColor: S_BG }}>
        <div className="relative w-full h-full flex flex-col">{children}</div>
      </div>
      <div className="w-full max-w-5xl px-1 pt-2 flex justify-end">{footer}</div>
    </div>
  );
}

function SlideNumber({ n, total }: { n: number; total: number }) {
  return <span className="text-sm font-medium" style={{ ...BODY_FONT, color: S_SECOND }}>{n} / {total}</span>;
}

// ── Slide components ────────────────────────────────────────────────────────
function TitleSlide({ slide, index, total }: { slide: LessonSlideData; index: number; total: number }) {
  const objectives = slide.body?.split("\n").filter(l => l.trim());
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      <div className="h-2 shrink-0" style={{ backgroundColor: S_ACCENT }} />
      <div className="flex-1 flex flex-col px-20 py-10 overflow-hidden">
        <div className="flex-1 flex flex-col justify-center">
          {slide.subtitle && (
            <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: S_ACCENT }}>
              {slide.subtitle}
            </p>
          )}
          <h2 className="text-5xl font-bold leading-tight mb-6" style={HEADING_FONT}>{slide.title}</h2>
          {objectives && objectives.length > 0 && (
            <div className="rounded-xl px-6 py-5" style={{ backgroundColor: S_LIGHT, borderLeft: `4px solid ${S_ACCENT}` }}>
              <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: S_ACCENT }}>
                Learning Objectives
              </p>
              <ul className="space-y-1.5">
                {objectives.filter(l => l.startsWith("- ")).map((obj, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: S_ACCENT }} />
                    <span className="text-sm leading-snug" style={BODY_FONT}>{obj.replace(/^-\s*/, "")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="h-1 shrink-0" style={{ backgroundColor: S_ACCENT, opacity: 0.3 }} />
    </SlideCanvas>
  );
}

function ContentSlide({ slide, index, total }: { slide: LessonSlideData; index: number; total: number }) {
  const calloutLabels: Record<string, string> = {
    "key-term": "Key Term",
    "remember": "Remember",
    "example": "Example",
    "discussion": "Discussion",
  };
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      <div className="h-1 shrink-0" style={{ backgroundColor: S_ACCENT }} />
      <div className="flex-1 flex flex-col px-20 py-10 overflow-hidden">
        <div className="mb-4 shrink-0">
          <h3 className="text-4xl font-bold leading-snug" style={HEADING_FONT}>{slide.title}</h3>
          <p className="text-xs tracking-wide mt-1" style={{ ...BODY_FONT, color: S_ACCENT }}>{slide.lessonTitle}</p>
          <div className="mt-3 h-px" style={{ backgroundColor: S_ACCENT, opacity: 0.3 }} />
        </div>
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          {slide.body && (
            <p className="text-base leading-7" style={BODY_FONT}>{slide.body}</p>
          )}
          {slide.bullets?.length ? (
            <ul className="space-y-2">
              {slide.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: S_ACCENT }} />
                  <span className="text-sm leading-snug" style={BODY_FONT}>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {slide.callout && (
            <div className="flex flex-col gap-1 rounded-lg px-4 py-3" style={{ backgroundColor: S_LIGHT, borderLeft: `3px solid ${S_ACCENT}` }}>
              <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: S_ACCENT }}>
                {calloutLabels[slide.callout.type] ?? slide.callout.type}
              </p>
              <p className="text-sm leading-relaxed" style={BODY_FONT}>{slide.callout.text}</p>
            </div>
          )}
          {slide.imageSuggestion && (
            <div className="mt-auto">
              <div className="rounded-md px-4 py-2.5 text-center" style={{ backgroundColor: "rgba(37,99,235,0.04)", border: `1px dashed ${S_ACCENT}` }}>
                <p className="text-xs italic" style={{ ...BODY_FONT, color: S_SECOND }}>
                  {`<suggested image: "${slide.imageSuggestion}">`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </SlideCanvas>
  );
}

function TwoColumnSlide({ slide, index, total }: { slide: LessonSlideData; index: number; total: number }) {
  const renderContent = (content: string) => {
    if (content.includes("\n- ")) {
      const parts = content.split("\n- ");
      const intro = parts[0].trim();
      const items = parts.slice(1);
      return (
        <>
          {intro && <p className="text-sm leading-relaxed mb-2" style={BODY_FONT}>{intro}</p>}
          <ul className="space-y-2">
            {items.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: S_ACCENT }} />
                <span className="text-sm leading-snug" style={BODY_FONT}>{b.trim()}</span>
              </li>
            ))}
          </ul>
        </>
      );
    }
    return <p className="text-sm leading-relaxed" style={BODY_FONT}>{content}</p>;
  };

  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      <div className="h-1 shrink-0" style={{ backgroundColor: S_ACCENT }} />
      <div className="flex-1 flex flex-col px-20 py-10 overflow-hidden">
        <div className="mb-4 shrink-0">
          <h3 className="text-3xl font-bold leading-snug" style={HEADING_FONT}>{slide.title}</h3>
          <p className="text-xs tracking-wide mt-1" style={{ ...BODY_FONT, color: S_ACCENT }}>{slide.lessonTitle}</p>
          <div className="mt-3 h-px" style={{ backgroundColor: S_ACCENT, opacity: 0.3 }} />
        </div>
        <div className="flex-1 grid grid-cols-2 overflow-hidden">
          <div className="flex flex-col pr-8 border-r" style={{ borderColor: `rgba(37,99,235,0.2)` }}>
            {slide.leftTitle && (
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: S_ACCENT }}>{slide.leftTitle}</p>
            )}
            {slide.leftContent && renderContent(slide.leftContent)}
          </div>
          <div className="flex flex-col pl-8">
            {slide.rightTitle && (
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: S_ACCENT }}>{slide.rightTitle}</p>
            )}
            {slide.rightContent && renderContent(slide.rightContent)}
          </div>
        </div>
      </div>
    </SlideCanvas>
  );
}

function ActivitySlide({ slide, index, total }: { slide: LessonSlideData; index: number; total: number }) {
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      <div className="h-1 shrink-0" style={{ backgroundColor: S_ACCENT }} />
      <div className="flex-1 flex flex-col px-20 py-10 overflow-hidden">
        <div className="mb-4 shrink-0">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: S_ACCENT }}>Activity</p>
          <h3 className="text-3xl font-bold leading-snug mt-1" style={HEADING_FONT}>{slide.title}</h3>
          <div className="mt-3 h-px" style={{ backgroundColor: S_ACCENT, opacity: 0.3 }} />
        </div>
        <div className="flex-1 flex flex-col justify-center gap-5">
          {slide.activityPrompt && (
            <div className="rounded-xl px-8 py-7" style={{ backgroundColor: S_LIGHT, border: `1.5px solid rgba(37,99,235,0.25)` }}>
              <p className="text-xl leading-relaxed font-medium text-center" style={HEADING_FONT}>
                {slide.activityPrompt}
              </p>
            </div>
          )}
          {slide.activityNote && (
            <p className="text-sm text-center" style={{ ...BODY_FONT, color: S_SECOND }}>{slide.activityNote}</p>
          )}
        </div>
      </div>
    </SlideCanvas>
  );
}

function KeyFactSlide({ slide, index, total }: { slide: LessonSlideData; index: number; total: number }) {
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      <div className="h-1 shrink-0" style={{ backgroundColor: S_ACCENT }} />
      <div className="flex-1 flex flex-col px-20 py-10 overflow-hidden">
        <div className="mb-4 shrink-0">
          <h3 className="text-2xl font-semibold leading-snug" style={HEADING_FONT}>{slide.title}</h3>
          <p className="text-xs tracking-wide mt-1" style={{ ...BODY_FONT, color: S_ACCENT }}>{slide.lessonTitle}</p>
          <div className="mt-3 h-px" style={{ backgroundColor: S_ACCENT, opacity: 0.3 }} />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {slide.fact && (
            <p
              className="text-3xl font-bold text-center leading-snug max-w-3xl"
              style={{ ...HEADING_FONT, color: S_ACCENT }}
            >
              {slide.fact}
            </p>
          )}
          {slide.factSource && (
            <>
              <div className="h-px w-16" style={{ backgroundColor: S_ACCENT, opacity: 0.35 }} />
              <p className="text-sm text-center max-w-xl" style={{ ...BODY_FONT, color: S_SECOND }}>
                {slide.factSource}
              </p>
            </>
          )}
        </div>
      </div>
    </SlideCanvas>
  );
}

function SlideSkeleton() {
  const cards = [
    { delay: "0s",    scale: 1,    zIndex: 4, opacity: 1 },
    { delay: "0.15s", scale: 0.97, zIndex: 3, opacity: 0.75 },
    { delay: "0.3s",  scale: 0.94, zIndex: 2, opacity: 0.5 },
    { delay: "0.45s", scale: 0.91, zIndex: 1, opacity: 0.3 },
  ];
  return (
    <div className="flex flex-col items-center">
      <style>{`@keyframes float-ls { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }`}</style>
      <div className="w-full max-w-5xl" style={{ aspectRatio: "16 / 9", position: "relative" }}>
        {cards.map((card, i) => (
          <div key={i} style={{
            position: "absolute", inset: 0, borderRadius: "0.5rem", overflow: "hidden",
            backgroundColor: S_BG, boxShadow: "0 20px 60px rgba(0,0,0,0.12)",
            transform: `scale(${card.scale})`, transformOrigin: "bottom center",
            zIndex: card.zIndex, opacity: card.opacity,
            animation: "float-ls 2s ease-in-out infinite", animationDelay: card.delay,
          }}>
            <div style={{ height: 4, backgroundColor: S_ACCENT }} />
            <div style={{ padding: "2.5rem 4rem", height: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ height: 28, borderRadius: 4, width: "55%", backgroundColor: "rgba(37,99,235,0.1)" }} />
              <div style={{ height: 1, backgroundColor: S_ACCENT, opacity: 0.2 }} />
              {[1, 0.9, 0.8, 0.65].map((w, j) => (
                <div key={j} style={{ height: 12, borderRadius: 4, width: `${w * 100}%`, backgroundColor: "rgba(37,99,235,0.06)" }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="w-full max-w-5xl px-1 pt-2 flex items-center gap-2" style={{ marginTop: "0.5rem" }}>
        <Loader2 className="w-3 h-3 animate-spin" style={{ color: S_ACCENT }} />
        <span className="text-xs" style={{ color: S_ACCENT }}>Generating slide...</span>
      </div>
    </div>
  );
}

function slidesToMarkdown(slides: LessonSlideData[]): string {
  return slides.map((s) => {
    if (s.type === "title") {
      return `# ${s.title}\n\n${s.subtitle ?? ""}\n\n${s.body ?? ""}`;
    }
    if (s.type === "key-fact") {
      return `## ${s.title}\n\n**${s.fact ?? ""}**\n\n${s.factSource ?? ""}`;
    }
    if (s.type === "two-column") {
      return `## ${s.title}\n\n**${s.leftTitle ?? ""}**\n${s.leftContent ?? ""}\n\n**${s.rightTitle ?? ""}**\n${s.rightContent ?? ""}`;
    }
    if (s.type === "activity") {
      return [`## Activity: ${s.title}`, s.activityPrompt, s.activityNote ? `*${s.activityNote}*` : ""].filter(Boolean).join("\n\n");
    }
    const lines = [`## ${s.title}`];
    if (s.body) lines.push(s.body);
    if (s.callout) lines.push(`> **${s.callout.type}:** ${s.callout.text}`);
    if (s.bullets?.length) lines.push(s.bullets.map(b => `- ${b}`).join("\n"));
    if (s.imageSuggestion) lines.push(`*Suggested image: "${s.imageSuggestion}"*`);
    return lines.join("\n\n");
  }).join("\n\n---\n\n");
}

async function exportSlidesToPdf(slides: LessonSlideData[], filename: string) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const W = 1280, H = 720;
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-${W + 100}px;top:0;width:${W}px;height:${H}px;overflow:hidden;`;
  document.body.appendChild(container);
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [W, H], hotfixes: ["px_scaling"] });

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const el = document.createElement("div");
    el.style.cssText = `width:${W}px;height:${H}px;background:${S_BG};display:flex;flex-direction:column;overflow:hidden;font-family:var(--font-karla),sans-serif;`;
    const bar = document.createElement("div");
    bar.style.cssText = `height:8px;flex-shrink:0;background:${S_ACCENT};`;
    el.appendChild(bar);

    if (s.type === "title") {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;justify-content:center;padding:60px 120px;`;
      if (s.subtitle) {
        const sub = document.createElement("p");
        sub.style.cssText = `font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:${S_ACCENT};font-weight:700;margin-bottom:20px;`;
        sub.textContent = s.subtitle;
        body.appendChild(sub);
      }
      const h = document.createElement("h1");
      h.style.cssText = `font-family:var(--font-spectral),serif;font-size:52px;font-weight:700;color:${S_TEXT};line-height:1.15;margin-bottom:32px;`;
      h.textContent = s.title;
      body.appendChild(h);
      if (s.body) {
        const objBox = document.createElement("div");
        objBox.style.cssText = `background:${S_LIGHT};border-left:4px solid ${S_ACCENT};border-radius:12px;padding:20px 24px;`;
        const objLabel = document.createElement("p");
        objLabel.style.cssText = `font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:${S_ACCENT};font-weight:700;margin-bottom:10px;`;
        objLabel.textContent = "Learning Objectives";
        objBox.appendChild(objLabel);
        const objText = document.createElement("p");
        objText.style.cssText = `font-size:14px;line-height:1.6;color:${S_TEXT};white-space:pre-line;`;
        objText.textContent = s.body.replace(/^- /gm, "• ").replace(/\n- /g, "\n• ");
        objBox.appendChild(objText);
        body.appendChild(objBox);
      }
      el.appendChild(body);

    } else if (s.type === "key-fact") {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;padding:40px 76px;`;
      const hb = document.createElement("div");
      hb.style.cssText = `margin-bottom:16px;flex-shrink:0;`;
      const h2 = document.createElement("h2");
      h2.style.cssText = `font-family:var(--font-spectral),serif;font-size:24px;font-weight:600;color:${S_TEXT};`;
      h2.textContent = s.title;
      const div = document.createElement("div");
      div.style.cssText = `height:1px;margin-top:12px;background:${S_ACCENT};opacity:0.3;`;
      hb.appendChild(h2); hb.appendChild(div);
      body.appendChild(hb);
      const centre = document.createElement("div");
      centre.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;`;
      const factEl = document.createElement("p");
      factEl.style.cssText = `font-family:var(--font-spectral),serif;font-size:36px;font-weight:700;color:${S_ACCENT};text-align:center;line-height:1.3;max-width:900px;`;
      factEl.textContent = s.fact ?? "";
      centre.appendChild(factEl);
      if (s.factSource) {
        const div2 = document.createElement("div");
        div2.style.cssText = `height:1px;width:48px;background:${S_ACCENT};opacity:0.35;`;
        const src = document.createElement("p");
        src.style.cssText = `font-size:13px;color:${S_SECOND};text-align:center;`;
        src.textContent = s.factSource;
        centre.appendChild(div2); centre.appendChild(src);
      }
      body.appendChild(centre);
      el.appendChild(body);

    } else if (s.type === "two-column") {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;padding:40px 76px;`;
      const hb = document.createElement("div");
      hb.style.cssText = `margin-bottom:16px;flex-shrink:0;`;
      const h2 = document.createElement("h2");
      h2.style.cssText = `font-family:var(--font-spectral),serif;font-size:30px;font-weight:700;color:${S_TEXT};`;
      h2.textContent = s.title;
      const div = document.createElement("div");
      div.style.cssText = `height:1px;margin-top:12px;background:${S_ACCENT};opacity:0.3;`;
      hb.appendChild(h2); hb.appendChild(div);
      body.appendChild(hb);
      const cols = document.createElement("div");
      cols.style.cssText = `flex:1;display:flex;gap:0;`;
      const mkCol = (title: string | undefined, content: string | undefined, left: boolean) => {
        const col = document.createElement("div");
        col.style.cssText = `flex:1;display:flex;flex-direction:column;${left ? "padding-right:32px;border-right:1px solid rgba(37,99,235,0.2);" : "padding-left:32px;"}`;
        if (title) { const t = document.createElement("p"); t.style.cssText = `font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${S_ACCENT};margin-bottom:10px;`; t.textContent = title; col.appendChild(t); }
        if (content) { const c = document.createElement("p"); c.style.cssText = `font-size:13px;line-height:1.6;color:${S_TEXT};white-space:pre-line;`; c.textContent = content.replace(/\n- /g, "\n• "); col.appendChild(c); }
        return col;
      };
      cols.appendChild(mkCol(s.leftTitle, s.leftContent, true));
      cols.appendChild(mkCol(s.rightTitle, s.rightContent, false));
      body.appendChild(cols);
      el.appendChild(body);

    } else if (s.type === "activity") {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;padding:40px 76px;`;
      const hb = document.createElement("div");
      hb.style.cssText = `margin-bottom:16px;flex-shrink:0;`;
      const label = document.createElement("p");
      label.style.cssText = `font-size:9px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:${S_ACCENT};`;
      label.textContent = "Activity";
      const h2 = document.createElement("h2");
      h2.style.cssText = `font-family:var(--font-spectral),serif;font-size:30px;font-weight:700;color:${S_TEXT};margin-top:4px;`;
      h2.textContent = s.title;
      const div = document.createElement("div");
      div.style.cssText = `height:1px;margin-top:12px;background:${S_ACCENT};opacity:0.3;`;
      hb.appendChild(label); hb.appendChild(h2); hb.appendChild(div);
      body.appendChild(hb);
      const centre = document.createElement("div");
      centre.style.cssText = `flex:1;display:flex;flex-direction:column;justify-content:center;gap:16px;`;
      if (s.activityPrompt) {
        const box = document.createElement("div");
        box.style.cssText = `background:${S_LIGHT};border:1.5px solid rgba(37,99,235,0.25);border-radius:12px;padding:28px 40px;text-align:center;`;
        const pt = document.createElement("p");
        pt.style.cssText = `font-family:var(--font-spectral),serif;font-size:22px;font-weight:500;color:${S_TEXT};line-height:1.5;`;
        pt.textContent = s.activityPrompt;
        box.appendChild(pt);
        centre.appendChild(box);
      }
      if (s.activityNote) {
        const note = document.createElement("p");
        note.style.cssText = `font-size:13px;color:${S_SECOND};text-align:center;`;
        note.textContent = s.activityNote;
        centre.appendChild(note);
      }
      body.appendChild(centre);
      el.appendChild(body);

    } else {
      // content
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;padding:40px 76px;`;
      const hb = document.createElement("div");
      hb.style.cssText = `margin-bottom:16px;flex-shrink:0;`;
      const h2 = document.createElement("h2");
      h2.style.cssText = `font-family:var(--font-spectral),serif;font-size:34px;font-weight:700;line-height:1.2;color:${S_TEXT};`;
      h2.textContent = s.title;
      const sub = document.createElement("p");
      sub.style.cssText = `font-size:11px;color:${S_ACCENT};margin-top:4px;`;
      sub.textContent = s.lessonTitle;
      const div = document.createElement("div");
      div.style.cssText = `height:1px;margin-top:12px;background:${S_ACCENT};opacity:0.3;`;
      hb.appendChild(h2); hb.appendChild(sub); hb.appendChild(div);
      body.appendChild(hb);
      if (s.body) { const bt = document.createElement("p"); bt.style.cssText = `font-size:15px;line-height:1.7;color:${S_TEXT};margin-bottom:12px;`; bt.textContent = s.body; body.appendChild(bt); }
      if (s.bullets?.length) {
        const ul = document.createElement("ul");
        ul.style.cssText = `list-style:none;display:flex;flex-direction:column;gap:8px;padding:0;margin:0;`;
        for (const b of s.bullets) {
          const li = document.createElement("li");
          li.style.cssText = `font-size:14px;line-height:1.5;color:${S_TEXT};display:flex;align-items:flex-start;gap:10px;`;
          const dot = document.createElement("span");
          dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${S_ACCENT};flex-shrink:0;margin-top:5px;`;
          const txt = document.createElement("span"); txt.textContent = b;
          li.appendChild(dot); li.appendChild(txt); ul.appendChild(li);
        }
        body.appendChild(ul);
      }
      if (s.callout) {
        const cBox = document.createElement("div");
        cBox.style.cssText = `margin-top:12px;background:${S_LIGHT};border-left:3px solid ${S_ACCENT};border-radius:8px;padding:10px 14px;`;
        const cLabel = document.createElement("p");
        cLabel.style.cssText = `font-size:9px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${S_ACCENT};margin-bottom:4px;`;
        cLabel.textContent = s.callout.type === "key-term" ? "Key Term" : s.callout.type === "remember" ? "Remember" : s.callout.type === "example" ? "Example" : "Discussion";
        const cText = document.createElement("p");
        cText.style.cssText = `font-size:13px;line-height:1.5;color:${S_TEXT};`;
        cText.textContent = s.callout.text;
        cBox.appendChild(cLabel); cBox.appendChild(cText); body.appendChild(cBox);
      }
      if (s.imageSuggestion) {
        const imgBox = document.createElement("div");
        imgBox.style.cssText = `margin-top:auto;border:1px dashed ${S_ACCENT};border-radius:6px;padding:8px 14px;text-align:center;`;
        const imgText = document.createElement("p");
        imgText.style.cssText = `font-size:11px;font-style:italic;color:${S_SECOND};`;
        imgText.textContent = `<suggested image: "${s.imageSuggestion}">`;
        imgBox.appendChild(imgText); body.appendChild(imgBox);
      }
      el.appendChild(body);
    }

    container.innerHTML = "";
    container.appendChild(el);
    await document.fonts.ready;
    const canvas = await html2canvas(el, { width: W, height: H, scale: 2, useCORS: true, backgroundColor: S_BG });
    if (i > 0) pdf.addPage([W, H], "landscape");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H);
  }
  document.body.removeChild(container);
  pdf.save(`${filename}.pdf`);
}

async function exportSlidesToPptx(slides: LessonSlideData[], filename: string) {
  const pptxgen = (await import("pptxgenjs")).default;
  const prs = new pptxgen();
  prs.layout = "LAYOUT_WIDE";
  const BG = toHex(S_BG);
  const TXT = toHex(S_TEXT);
  const ACC = toHex(S_ACCENT);
  const SEC = toHex(S_SECOND);
  const LT  = toHex(S_LIGHT);

  for (const slide of slides) {
    const s = prs.addSlide();
    s.background = { color: BG };
    s.addShape(prs.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.1, fill: { color: ACC }, line: { color: ACC, width: 0 } });

    if (slide.type === "title") {
      if (slide.subtitle) s.addText(slide.subtitle.toUpperCase(), { x: 0.9, y: 0.8, w: 11.53, h: 0.3, fontSize: 9, bold: true, color: ACC, fontFace: "Karla", charSpacing: 3 });
      s.addText(slide.title, { x: 0.9, y: 1.2, w: 11.53, h: 1.8, fontSize: 42, bold: true, color: TXT, fontFace: "Spectral", wrap: true });
      if (slide.body) {
        s.addShape(prs.ShapeType.roundRect, { x: 0.9, y: 3.1, w: 11.53, h: 3.4, fill: { color: LT }, line: { color: ACC, width: 2 }, rectRadius: 0.15 });
        s.addText("LEARNING OBJECTIVES", { x: 1.1, y: 3.3, w: 11.13, h: 0.35, fontSize: 8, bold: true, color: ACC, fontFace: "Karla", charSpacing: 2 });
        s.addText(slide.body.replace(/^- /gm, "• ").replace(/\n- /g, "\n• "), { x: 1.1, y: 3.7, w: 11.13, h: 2.6, fontSize: 13, color: TXT, fontFace: "Karla", wrap: true, valign: "top" });
      }
    } else if (slide.type === "key-fact") {
      s.addText(slide.title, { x: 0.9, y: 0.3, w: 11.53, h: 0.65, fontSize: 22, bold: true, color: TXT, fontFace: "Spectral", wrap: true });
      s.addShape(prs.ShapeType.rect, { x: 0.9, y: 1.0, w: 11.53, h: 0.02, fill: { color: SEC }, line: { color: SEC, width: 0 } });
      s.addText(slide.fact ?? "", { x: 1.5, y: 1.5, w: 10.33, h: 3.5, fontSize: 30, bold: true, color: ACC, fontFace: "Spectral", align: "center", valign: "middle", wrap: true });
      if (slide.factSource) s.addText(slide.factSource, { x: 1.5, y: 5.2, w: 10.33, h: 0.5, fontSize: 12, color: SEC, fontFace: "Karla", align: "center" });
    } else if (slide.type === "two-column") {
      s.addText(slide.title, { x: 0.9, y: 0.3, w: 11.53, h: 0.75, fontSize: 26, bold: true, color: TXT, fontFace: "Spectral", wrap: true });
      s.addShape(prs.ShapeType.rect, { x: 0.9, y: 1.1, w: 11.53, h: 0.02, fill: { color: SEC }, line: { color: SEC, width: 0 } });
      s.addShape(prs.ShapeType.rect, { x: 6.67, y: 1.3, w: 0.02, h: 5.9, fill: { color: SEC }, line: { color: SEC, width: 0 } });
      if (slide.leftTitle) s.addText(slide.leftTitle.toUpperCase(), { x: 0.9, y: 1.3, w: 5.5, h: 0.3, fontSize: 9, bold: true, color: ACC, fontFace: "Karla", charSpacing: 2 });
      if (slide.leftContent) s.addText(slide.leftContent.replace(/\n- /g, "\n• "), { x: 0.9, y: 1.7, w: 5.5, h: 5.3, fontSize: 13, color: TXT, fontFace: "Karla", wrap: true, valign: "top" });
      if (slide.rightTitle) s.addText(slide.rightTitle.toUpperCase(), { x: 7.0, y: 1.3, w: 5.5, h: 0.3, fontSize: 9, bold: true, color: ACC, fontFace: "Karla", charSpacing: 2 });
      if (slide.rightContent) s.addText(slide.rightContent.replace(/\n- /g, "\n• "), { x: 7.0, y: 1.7, w: 5.5, h: 5.3, fontSize: 13, color: TXT, fontFace: "Karla", wrap: true, valign: "top" });
    } else if (slide.type === "activity") {
      s.addText("ACTIVITY", { x: 0.9, y: 0.3, w: 11.53, h: 0.3, fontSize: 9, bold: true, color: ACC, fontFace: "Karla", charSpacing: 3 });
      s.addText(slide.title, { x: 0.9, y: 0.65, w: 11.53, h: 0.75, fontSize: 26, bold: true, color: TXT, fontFace: "Spectral", wrap: true });
      s.addShape(prs.ShapeType.rect, { x: 0.9, y: 1.45, w: 11.53, h: 0.02, fill: { color: SEC }, line: { color: SEC, width: 0 } });
      if (slide.activityPrompt) {
        s.addShape(prs.ShapeType.roundRect, { x: 1.5, y: 2.0, w: 10.33, h: 3.0, fill: { color: LT }, line: { color: ACC, width: 1.5 }, rectRadius: 0.15 });
        s.addText(slide.activityPrompt, { x: 1.7, y: 2.2, w: 9.93, h: 2.6, fontSize: 18, bold: true, color: TXT, fontFace: "Spectral", align: "center", valign: "middle", wrap: true });
      }
      if (slide.activityNote) s.addText(slide.activityNote, { x: 1.5, y: 5.2, w: 10.33, h: 0.5, fontSize: 12, color: SEC, fontFace: "Karla", align: "center" });
    } else {
      // content
      s.addText(slide.title, { x: 0.9, y: 0.3, w: 11.53, h: 0.85, fontSize: 28, bold: true, color: TXT, fontFace: "Spectral", wrap: true });
      s.addText(slide.lessonTitle, { x: 0.9, y: 1.2, w: 11.53, h: 0.28, fontSize: 10, color: ACC, fontFace: "Karla" });
      s.addShape(prs.ShapeType.rect, { x: 0.9, y: 1.52, w: 11.53, h: 0.02, fill: { color: SEC }, line: { color: SEC, width: 0 } });
      let y = 1.7;
      if (slide.body) { s.addText(slide.body, { x: 0.9, y, w: 11.53, h: 1.6, fontSize: 13, color: TXT, fontFace: "Karla", wrap: true, valign: "top" }); y += 1.7; }
      if (slide.bullets?.length) {
        s.addText(slide.bullets.map(b => ({ text: b, options: { bullet: { type: "bullet" as const }, color: TXT } })), { x: 0.9, y, w: 11.53, h: 2.0, fontSize: 12, fontFace: "Karla", wrap: true, valign: "top" });
        y += slide.bullets.length * 0.4 + 0.2;
      }
      if (slide.callout) {
        s.addShape(prs.ShapeType.roundRect, { x: 0.9, y, w: 11.53, h: 0.85, fill: { color: LT }, line: { color: ACC, width: 2 }, rectRadius: 0.1 });
        s.addText(`${slide.callout.type === "key-term" ? "KEY TERM" : slide.callout.type === "remember" ? "REMEMBER" : slide.callout.type === "example" ? "EXAMPLE" : "DISCUSSION"}: ${slide.callout.text}`, { x: 1.1, y: y + 0.1, w: 11.13, h: 0.65, fontSize: 12, color: TXT, fontFace: "Karla", wrap: true });
      }
      if (slide.imageSuggestion) s.addText(`<suggested image: "${slide.imageSuggestion}">`, { x: 0.9, y: 6.8, w: 11.53, h: 0.4, fontSize: 10, color: SEC, fontFace: "Karla", italic: true, align: "center" });
    }
  }
  await prs.writeFile({ fileName: `${filename}.pptx` });
}

// ── Main form ──────────────────────────────────────────────────────────────
export default function LessonSlideshowForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(8);
  const [additionalContext, setAdditionalContext] = useState("");
  const [includeImageSuggestions, setIncludeImageSuggestions] = useState(true);

  const [slides, setSlides] = useState<LessonSlideData[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  // Raw form state — saved as history input so a past run can refill the form.
  const formState = { curriculum, yearGroup, mixed, subject, topic, slideCount, additionalContext, includeImageSuggestions };

  // Slides are a structured array, not markdown — store as JSON text.
  const persist = (s: LessonSlideData[]) => {
    if (!s.length) return;
    saveToolRun({
      toolSlug: TOOL_SLUG,
      title: topic || subject || null,
      input: formState,
      output: JSON.stringify(s),
    })
      .then(() => setHistoryKey((k) => k + 1))
      .catch(() => {});
  };

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setTopic((i.topic as string) ?? "");
    setSlideCount((i.slideCount as number) ?? 8);
    setAdditionalContext((i.additionalContext as string) ?? "");
    setIncludeImageSuggestions(i.includeImageSuggestions === undefined ? true : Boolean(i.includeImageSuggestions));
    try {
      setSlides(JSON.parse(run.output) as LessonSlideData[]);
    } catch {
      setSlides(null);
    }
    setLastGenerated(JSON.stringify({ topic: i.topic, subject: i.subject, yearGroup: i.yearGroup, mixed: i.mixed, slideCount: i.slideCount, additionalContext: i.additionalContext, includeImageSuggestions: i.includeImageSuggestions }));
  };

  const userScrolledUp = useRef(false);
  const isGeneratingRef = useRef(false);
  const isBusy = isGenerating || isRefining;

  useEffect(() => {
    isGeneratingRef.current = isGenerating || isRefining;
    if (isGenerating) userScrolledUp.current = false;
  }, [isGenerating, isRefining]);

  useEffect(() => {
    const onScroll = () => {
      if (!isGeneratingRef.current) return;
      const distFromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      userScrolledUp.current = distFromBottom > 80;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (isBusy && !userScrolledUp.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }, [slides, isBusy]);

  const canGenerate = topic.trim() && (mixed || yearGroup);
  const formSnapshot = JSON.stringify({ topic, subject, yearGroup, mixed, slideCount, additionalContext, includeImageSuggestions });
  const unchangedSinceGeneration = slides !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setSlides([]);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/lesson-slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          topic,
          subject: subject ? toTitleCase(subject) : undefined,
          yearGroup: mixed ? "Mixed" : yearGroup,
          slideCount,
          additionalContext: additionalContext.trim() || undefined,
          includeImageSuggestions,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const collected: LessonSlideData[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              const slide = JSON.parse(trimmed) as LessonSlideData;
              collected.push(slide);
              setSlides((prev) => [...(prev ?? []), slide]);
            } catch { /* skip */ }
          }
        }
      }
      const remaining = buffer.trim();
      if (remaining.startsWith("{") && remaining.endsWith("}")) {
        try {
          const slide = JSON.parse(remaining) as LessonSlideData;
          collected.push(slide);
          setSlides((prev) => [...(prev ?? []), slide]);
        } catch { /* skip */ }
      }
      persist(collected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSlides(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!slides || !instruction.trim()) return;
    setIsRefining(true);
    try {
      const res = await fetch("/api/lesson-slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refine", slides, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refinement failed");
      setSlides(data.slides);
      persist(data.slides);
    } catch { /* silent */ } finally {
      setIsRefining(false);
      setRefineInstruction("");
    }
  };

  const handleCopy = async () => {
    if (!slides) return;
    await navigator.clipboard.writeText(slidesToMarkdown(slides));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showResults = slides !== null && (slides.length > 0 || isGenerating);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
        </div>
        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <CurriculumYearFields
              curriculum={curriculum} onCurriculumChange={setCurriculum}
              yearGroup={yearGroup} onYearGroupChange={setYearGroup}
              mixed={mixed} onMixedChange={setMixed}
            />

            <SubjectField value={subject} onChange={setSubject} />

            <TopicField
              value={topic}
              onChange={setTopic}
              placeholders={[
                "e.g. The Solar System",
                "e.g. The Water Cycle",
                "e.g. World War One — Causes",
                "e.g. Fractions and Decimals",
              ]}
            />

            <LessonCountField
              value={slideCount}
              onChange={setSlideCount}
              label="Number of slides"
              unit="slides"
              min={4}
              max={20}
            />

            <AdditionalContextField
              value={additionalContext}
              onChange={setAdditionalContext}
              label="Learning objectives / additional context"
              rows={4}
              placeholders={[
                "e.g. Pupils should be able to name the planets in order",
                "e.g. Focus on causes and consequences. Include discussion activities.",
                "e.g. Cover both advantages and disadvantages. Link to real-world examples.",
              ]}
              labelSlot={
                <GenerateOutlineButton
                  topic={topic}
                  subject={subject}
                  yearGroup={mixed ? "Mixed" : yearGroup}
                  onGenerate={setAdditionalContext}
                />
              }
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Additional options</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeImageSuggestions}
                  onChange={(e) => setIncludeImageSuggestions(e.target.checked)}
                  className="accent-gray-900 w-4 h-4" />
                <span className="text-sm text-gray-700">Include image suggestions</span>
              </label>
            </div>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!slides} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum(""); setYearGroup(""); setMixed(false);
                  setSubject(""); setTopic(""); setSlideCount(8);
                  setAdditionalContext(""); setIncludeImageSuggestions(true);
                  setSlides(null); setError(null); setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating || unchangedSinceGeneration}
                isGenerating={isGenerating}
                hasResult={slides !== null}
              />
            </div>
          </Card>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">{error}</div>
      )}

      {showResults && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">My results</h2>
              {isGenerating && (
                <span className="text-xs text-gray-500 font-medium">{slides!.length} of {slideCount} slides</span>
              )}
            </div>
            {slides && slides.length > 0 && !isGenerating && (
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
                  {copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy to clipboard</>}
                </button>
                <div className="relative">
                  <button onClick={() => setShowDownloadMenu(v => !v)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
                    Download <ChevronDown className="w-4 h-4" />
                  </button>
                  {showDownloadMenu && (
                    <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-10 py-1">
                      <button onClick={async () => { await exportSlidesToPdf(slides!, `lesson-${topic.slice(0, 30).replace(/\s+/g, "-") || "slideshow"}`); setShowDownloadMenu(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Download PDF</button>
                      <button onClick={async () => { await exportSlidesToPptx(slides!, `lesson-${topic.slice(0, 30).replace(/\s+/g, "-") || "slideshow"}`); setShowDownloadMenu(false); }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Download PPTX</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-slate-400 rounded-xl px-16 py-14 space-y-8">
            {slides!.map((slide, i) => {
              const props = { key: i, slide, index: i, total: isGenerating ? slideCount : slides!.length };
              if (slide.type === "title")      return <TitleSlide      {...props} />;
              if (slide.type === "two-column") return <TwoColumnSlide  {...props} />;
              if (slide.type === "activity")   return <ActivitySlide   {...props} />;
              if (slide.type === "key-fact")   return <KeyFactSlide    {...props} />;
              return <ContentSlide {...props} />;
            })}
            {isGenerating && <SlideSkeleton />}
          </div>
        </div>
      )}

      {slides && slides.length > 0 && !isGenerating && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-gray-900">Want to refine your results?</h3>
          <p className="text-sm font-medium text-gray-600">What would you like to change?</p>
          <textarea
            value={refineInstruction}
            onChange={(e) => setRefineInstruction(e.target.value)}
            placeholder="Type changes here"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 resize-none bg-white"
          />
          <div className="flex flex-wrap gap-2">
            {REFINE_CHIPS.map((chip) => (
              <button key={chip} type="button" onClick={() => setRefineInstruction(chip)}
                className="text-xs text-gray-600 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-100 transition-colors">
                {chip}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => handleRefine(refineInstruction)}
            disabled={isRefining || !refineInstruction.trim()}
            className="bg-[#1a1a1a] text-white py-2 px-6 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2">
            {isRefining ? <><Loader2 className="w-4 h-4 animate-spin" />Refining...</> : "Refine results"}
          </button>
        </div>
      )}
    </div>
  );
}
