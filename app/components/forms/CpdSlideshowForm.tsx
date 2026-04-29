"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Sparkles, Minus, Plus, Copy, Check, ChevronDown } from "lucide-react";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";

interface SlideData {
  type: "title" | "content";
  title: string;
  presentationTitle: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  imageSuggestion?: string;
}

type PresentationFocus = "Practical application" | "Research and theory";
type ContentFormat = "Text" | "Text and bullet point summary";

const REFINE_CHIPS = [
  "Translate to...",
  "Make each slide more detailed",
  "Include a slide on...",
  "Make the language more accessible",
  "Add discussion questions to each slide",
];

function toHex(rgb: string): string {
  return rgb.match(/\d+/g)!
    .map((n) => parseInt(n).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function exportSlidesToPdf(slides: SlideData[], filename: string) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const W = 1280;
  const H = 720;

  // Off-screen container at exact slide dimensions
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-${W + 100}px;top:0;width:${W}px;height:${H}px;overflow:hidden;`;
  document.body.appendChild(container);

  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [W, H], hotfixes: ["px_scaling"] });

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];

    // Build slide element mirroring the React components
    const el = document.createElement("div");
    el.style.cssText = `width:${W}px;height:${H}px;background:${C_BG};display:flex;flex-direction:column;overflow:hidden;font-family:var(--font-karla),sans-serif;`;

    // Top accent bar
    const bar = document.createElement("div");
    bar.style.cssText = `height:8px;flex-shrink:0;background:${C_RED};`;
    el.appendChild(bar);

    if (s.type === "title") {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 120px;`;

      const label = document.createElement("p");
      label.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:${C_RED};margin-bottom:28px;`;
      label.textContent = "Professional Development — Teachers";

      const title = document.createElement("h1");
      title.style.cssText = `font-family:var(--font-spectral),serif;font-size:52px;font-weight:700;line-height:1.15;color:${C_TEXT};margin-bottom:24px;`;
      title.textContent = s.title;

      body.appendChild(label);
      body.appendChild(title);

      if (s.subtitle) {
        const sub = document.createElement("p");
        sub.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:17px;line-height:1.6;color:${C_RED};max-width:640px;`;
        sub.textContent = s.subtitle;
        body.appendChild(sub);
      }

      el.appendChild(body);

      const bottomBar = document.createElement("div");
      bottomBar.style.cssText = `height:3px;flex-shrink:0;background:${C_GRAY};`;
      el.appendChild(bottomBar);
    } else {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;padding:44px 76px 36px;overflow:hidden;`;

      // Heading block
      const headingBlock = document.createElement("div");
      headingBlock.style.cssText = `margin-bottom:20px;flex-shrink:0;`;

      const heading = document.createElement("h2");
      heading.style.cssText = `font-family:var(--font-spectral),serif;font-size:34px;font-weight:700;line-height:1.2;color:${C_TEXT};`;
      heading.textContent = s.title;

      const presTitle = document.createElement("p");
      presTitle.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:12px;letter-spacing:0.05em;color:${C_RED};margin-top:6px;`;
      presTitle.textContent = s.presentationTitle;

      const divider = document.createElement("div");
      divider.style.cssText = `height:1px;margin-top:13px;background:${C_RED};opacity:0.4;`;

      headingBlock.appendChild(heading);
      headingBlock.appendChild(presTitle);
      headingBlock.appendChild(divider);
      body.appendChild(headingBlock);

      if (s.body) {
        const bodyText = document.createElement("p");
        bodyText.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:15px;line-height:1.7;color:${C_TEXT};margin-bottom:14px;`;
        bodyText.textContent = s.body;
        body.appendChild(bodyText);
      }

      if (s.bullets?.length) {
        const ul = document.createElement("ul");
        ul.style.cssText = `list-style:none;display:flex;flex-direction:column;gap:9px;padding:0;margin:0;`;
        for (const b of s.bullets) {
          const li = document.createElement("li");
          li.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:14px;line-height:1.5;color:${C_TEXT};display:flex;align-items:flex-start;gap:10px;`;
          const dot = document.createElement("span");
          dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${C_RED};flex-shrink:0;margin-top:5px;`;
          const txt = document.createElement("span");
          txt.textContent = b;
          li.appendChild(dot);
          li.appendChild(txt);
          ul.appendChild(li);
        }
        body.appendChild(ul);
      }

      if (s.imageSuggestion) {
        const imgBox = document.createElement("div");
        imgBox.style.cssText = `margin-top:auto;border:1px dashed ${C_RED};border-radius:6px;padding:9px 14px;text-align:center;`;
        const imgText = document.createElement("p");
        imgText.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:11px;font-style:italic;color:${C_GRAY};`;
        imgText.textContent = `<suggested search for images: "${s.imageSuggestion}">`;
        imgBox.appendChild(imgText);
        body.appendChild(imgBox);
      }

      el.appendChild(body);
    }

    container.innerHTML = "";
    container.appendChild(el);
    await document.fonts.ready;

    const canvas = await html2canvas(el, { width: W, height: H, scale: 2, useCORS: true, backgroundColor: C_BG });

    if (i > 0) pdf.addPage([W, H], "landscape");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H);
  }

  document.body.removeChild(container);
  pdf.save(`${filename}.pdf`);
}

async function exportSlidesToPptx(slides: SlideData[], filename: string) {
  const pptxgen = (await import("pptxgenjs")).default;
  const prs = new pptxgen();
  prs.layout = "LAYOUT_WIDE"; // 13.33" × 7.5"

  const BG  = toHex(C_BG);
  const TXT = toHex(C_TEXT);
  const ACC = toHex(C_RED);
  const SEC = toHex(C_GRAY);

  for (const slide of slides) {
    const s = prs.addSlide();
    s.background = { color: BG };

    // Top accent bar
    s.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: "100%", h: 0.08,
      fill: { color: ACC }, line: { color: ACC, width: 0 },
    });

    if (slide.type === "title") {
      s.addText("PROFESSIONAL DEVELOPMENT — TEACHERS", {
        x: 0, y: 2.5, w: "100%", h: 0.35,
        align: "center", fontSize: 9, color: ACC,
        fontFace: "Karla", charSpacing: 4,
      });
      s.addText(slide.title, {
        x: 1.5, y: 2.95, w: 10.33, h: 2.4,
        align: "center", fontSize: 36, bold: true,
        color: TXT, fontFace: "Spectral", wrap: true,
      });
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 2, y: 5.5, w: 9.33, h: 1.0,
          align: "center", fontSize: 14,
          color: ACC, fontFace: "Karla", wrap: true,
        });
      }
      // Bottom bar
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 7.47, w: "100%", h: 0.03,
        fill: { color: SEC }, line: { color: SEC, width: 0 },
      });
    } else {
      s.addText(slide.title, {
        x: 0.9, y: 0.45, w: 11.53, h: 0.85,
        fontSize: 28, bold: true,
        color: TXT, fontFace: "Spectral", wrap: true,
      });
      s.addText(slide.presentationTitle, {
        x: 0.9, y: 1.35, w: 11.53, h: 0.28,
        fontSize: 10, color: ACC, fontFace: "Karla",
      });
      // Divider
      s.addShape(prs.ShapeType.rect, {
        x: 0.9, y: 1.68, w: 11.53, h: 0.02,
        fill: { color: SEC }, line: { color: SEC, width: 0 },
      });

      let y = 1.85;

      if (slide.body) {
        s.addText(slide.body, {
          x: 0.9, y, w: 11.53, h: 1.9,
          fontSize: 13, color: TXT, fontFace: "Karla",
          wrap: true, valign: "top",
        });
        y += 2.0;
      }

      if (slide.bullets?.length) {
        s.addText(
          slide.bullets.map((b) => ({ text: b, options: { bullet: { type: "bullet" as const }, color: TXT } })),
          { x: 0.9, y, w: 11.53, h: 2.2, fontSize: 12, fontFace: "Karla", wrap: true, valign: "top" },
        );
        y += slide.bullets.length * 0.4 + 0.2;
      }

      if (slide.imageSuggestion) {
        s.addText(`<suggested search for images: "${slide.imageSuggestion}">`, {
          x: 0.9, y: 6.8, w: 11.53, h: 0.4,
          fontSize: 10, color: SEC, fontFace: "Karla",
          italic: true, align: "center",
        });
      }
    }
  }

  await prs.writeFile({ fileName: `${filename}.pptx` });
}

function slidesToMarkdown(slides: SlideData[]): string {
  return slides
    .map((s) => {
      if (s.type === "title") {
        return `# ${s.title}\n\n${s.subtitle ?? ""}`;
      }
      const lines: string[] = [`## ${s.title}`];
      if (s.body) lines.push(s.body);
      if (s.bullets?.length) lines.push(s.bullets.map((b) => `- ${b}`).join("\n"));
      if (s.imageSuggestion) lines.push(`*Suggested image: "${s.imageSuggestion}"*`);
      return lines.join("\n\n");
    })
    .join("\n\n---\n\n");
}

// ── Slide theme ────────────────────────────────────────────────
const C_BG   = "rgb(249, 246, 239)";  // cream background
const C_TEXT = "rgb(38, 25, 17)";     // near-black dark brown primary text
const C_RED  = "rgb(102, 74, 50)";    // dark warm brown accent (bars, bullets, dividers)
const C_GRAY = "rgb(191, 175, 160)";  // warm tan secondary text (labels, subtitles)

const HEADING_FONT: React.CSSProperties = { fontFamily: "var(--font-spectral)", color: C_TEXT };
const BODY_FONT:    React.CSSProperties = { fontFamily: "var(--font-karla)",    color: C_TEXT };

function SlideCanvas({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-full max-w-5xl rounded-lg overflow-hidden shadow-xl"
        style={{ aspectRatio: "16 / 9", backgroundColor: C_BG }}
      >
        <div className="relative w-full h-full flex flex-col">
          {children}
        </div>
      </div>
      <div className="w-full max-w-5xl px-1 pt-2 flex justify-end">
        {footer}
      </div>
    </div>
  );
}

function SlideNumber({ n, total }: { n: number; total: number }) {
  return (
    <span className="text-sm font-medium text-white/70" style={BODY_FONT}>
      {n} / {total}
    </span>
  );
}

function TitleSlide({ slide, index, total }: { slide: SlideData; index: number; total: number }) {
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      {/* Top accent bar */}
      <div className="h-1 shrink-0" style={{ backgroundColor: C_RED }} />

      <div className="flex-1 flex flex-col items-center justify-center text-center px-24">
        <p
          className="text-md tracking-widest uppercase mb-6"
          style={{ ...BODY_FONT, color: C_RED }}
        >
          Professional Development — Teachers
        </p>
        <h2
          className="text-5xl font-bold leading-tight mb-5 max-w-2xl"
          style={HEADING_FONT}
        >
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p className="text-md leading-relaxed max-w-lg" style={{ ...BODY_FONT, color: C_RED }}>
            {slide.subtitle}
          </p>
        )}
      </div>

      {/* Bottom accent bar */}
      <div className="h-0.5 shrink-0" style={{ backgroundColor: C_RED }} />
    </SlideCanvas>
  );
}

function ContentSlide({ slide, index, total }: { slide: SlideData; index: number; total: number }) {
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      {/* Top accent bar */}
      <div className="h-1 shrink-0" style={{ backgroundColor: C_RED }} />

      <div className="flex-1 flex flex-col px-20 py-14 overflow-hidden">
        {/* Heading */}
        <div className="mb-5 shrink-0">
          <h3 className="text-4xl font-bold leading-snug" style={HEADING_FONT}>
            {slide.title}
          </h3>
          <p className="text-sm tracking-wide mt-1" style={{ ...BODY_FONT, color: C_RED }}>
            {slide.presentationTitle}
          </p>
          <div className="mt-3 h-px" style={{ backgroundColor: C_RED, opacity: 0.4 }} />
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {slide.body && (
            <p className="text-base leading-7" style={BODY_FONT}>
              {slide.body}
            </p>
          )}

          {slide.bullets?.length ? (
            <ul className="space-y-2.5">
              {slide.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: C_RED }}
                  />
                  <span className="text-sm leading-snug" style={BODY_FONT}>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {slide.imageSuggestion && (
            <div className="mt-auto">
              <div
                className="rounded-md px-4 py-2.5 text-center"
                style={{ backgroundColor: "rgba(38,25,17,0.04)", border: `1px dashed ${C_RED}` }}
              >
                <p className="text-xs italic" style={{ ...BODY_FONT, color: C_GRAY }}>
                  {`<suggested search for images: "${slide.imageSuggestion}">`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </SlideCanvas>
  );
}

function SlideSkeleton() {
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-full max-w-5xl rounded-lg overflow-hidden shadow-xl animate-pulse"
        style={{ aspectRatio: "16 / 9", backgroundColor: C_BG }}
      >
        <div className="h-1" style={{ backgroundColor: C_RED, opacity: 0.4 }} />
        <div className="px-16 pt-10 pb-10 h-full flex flex-col gap-5">
          <div className="space-y-2 shrink-0">
            <div className="h-6 rounded w-1/2" style={{ backgroundColor: "rgba(38,25,17,0.1)" }} />
            <div className="h-3 rounded w-1/4" style={{ backgroundColor: "rgba(38,25,17,0.07)" }} />
            <div className="h-px mt-3" style={{ backgroundColor: C_RED, opacity: 0.4 }} />
          </div>
          <div className="space-y-3 flex-1">
            {[1, 0.92, 0.82, 0.7].map((w, i) => (
              <div key={i} className="h-3 rounded" style={{ width: `${w * 100}%`, backgroundColor: "rgba(38,25,17,0.07)" }} />
            ))}
          </div>
        </div>
      </div>
      <div className="w-full max-w-5xl px-1 pt-2 flex items-center gap-2">
        <Loader2 className="w-3 h-3 animate-spin" style={{ color: C_RED }} />
        <span className="text-xs" style={{ color: C_RED }}>Generating slide...</span>
      </div>
    </div>
  );
}

export default function CpdSlideshowForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(4);
  const [additionalFocus, setAdditionalFocus] = useState("");
  const [presentationFocus, setPresentationFocus] = useState<PresentationFocus>("Practical application");
  const [contentFormat, setContentFormat] = useState<ContentFormat>("Text and bullet point summary");
  const [includeImageSuggestions, setIncludeImageSuggestions] = useState(true);

  const [slides, setSlides] = useState<SlideData[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const userScrolledUp = useRef(false);
  const isGeneratingRef = useRef(isGenerating || isRefining);
  const isBusy = isGenerating || isRefining;

  // Keep ref in sync so the scroll listener always sees the latest value
  useEffect(() => {
    isGeneratingRef.current = isGenerating || isRefining;
    if (isGenerating) {
      userScrolledUp.current = false;
    }
  }, [isGenerating, isRefining]);

  // Listen for scroll — disable auto-scroll if user scrolls up, re-enable if they reach the bottom
  useEffect(() => {
    const onScroll = () => {
      if (!isGeneratingRef.current) return;
      const distFromBottom =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      userScrolledUp.current = distFromBottom > 80;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Pin to bottom on every new chunk — instant (no smooth) to avoid jitter
  useEffect(() => {
    if (isBusy && !userScrolledUp.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }, [slides, isBusy]);

  const canGenerate = topic.trim();
  const formSnapshot = JSON.stringify({ topic, slideCount, additionalFocus, presentationFocus, contentFormat, includeImageSuggestions });
  const unchangedSinceGeneration = slides !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setSlides([]);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/cpd-slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          topic,
          slideCount,
          additionalFocus,
          presentationFocus,
          contentFormat,
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

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse any complete JSON lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              const slide = JSON.parse(trimmed) as SlideData;
              setSlides((prev) => [...(prev ?? []), slide]);
            } catch {
              // incomplete or malformed line — skip
            }
          }
        }
      }

      // Handle any remaining buffered content
      const remaining = buffer.trim();
      if (remaining.startsWith("{") && remaining.endsWith("}")) {
        try {
          const slide = JSON.parse(remaining) as SlideData;
          setSlides((prev) => [...(prev ?? []), slide]);
        } catch {
          // ignore
        }
      }
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
      const res = await fetch("/api/cpd-slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refine", slides, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refinement failed");
      setSlides(data.slides);
    } catch {
      // silently fail
    } finally {
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

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

  const showResults = slides !== null && (slides.length > 0 || isGenerating);
  const expectedCount = slideCount;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">{sidebar}</div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Topic</label>
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Adaptive teaching strategies for mixed-ability classrooms"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Number of slides</label>
              <div className="flex items-center gap-0">
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={slideCount}
                  onChange={(e) => setSlideCount(Number(e.target.value))}
                  onBlur={() => setSlideCount(Math.min(20, Math.max(2, slideCount || 4)))}
                  className="w-20 border border-gray-200 rounded-l-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent text-center"
                />
                <button type="button" onClick={() => setSlideCount((n) => Math.max(2, n - 1))} disabled={slideCount <= 2}
                  className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => setSlideCount((n) => Math.min(20, n + 1))} disabled={slideCount >= 20}
                  className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 rounded-r-md text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Additional focus areas</label>
              <textarea
                value={additionalFocus}
                onChange={(e) => setAdditionalFocus(e.target.value)}
                placeholder="e.g. Include practical activities, focus on KS3 application, add time for group reflection"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Presentation focus</label>
                <div className="flex flex-col gap-2 pt-1">
                  {(["Practical application", "Research and theory"] as PresentationFocus[]).map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="presentationFocus" checked={presentationFocus === val}
                        onChange={() => setPresentationFocus(val)} className="accent-gray-900" />
                      <span className="text-sm text-gray-700">{val}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Content format</label>
                <div className="flex flex-col gap-2 pt-1">
                  {(["Text", "Text and bullet point summary"] as ContentFormat[]).map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="contentFormat" checked={contentFormat === val}
                        onChange={() => setContentFormat(val)} className="accent-gray-900" />
                      <span className="text-sm text-gray-700">{val}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

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
              <button type="button" onClick={() => setConfirmingReset(true)} disabled={!slides}
                className="border border-gray-200 text-gray-600 py-3 px-5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50">
                Reset
              </button>
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setTopic(""); setSlideCount(4); setAdditionalFocus("");
                  setPresentationFocus("Practical application");
                  setContentFormat("Text and bullet point summary");
                  setIncludeImageSuggestions(true);
                  setSlides(null); setError(null); setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <button type="button" onClick={handleGenerate}
                disabled={!canGenerate || isGenerating || unchangedSinceGeneration}
                className="flex-1 bg-[#1a1a1a] text-white py-3 px-6 rounded-xl text-sm font-semibold hover:bg-gray-800 active:bg-gray-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {isGenerating
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
                  : <><Sparkles className="w-4 h-4" />{slides ? "Regenerate" : "Generate"}</>}
              </button>
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
                <span className="text-xs text-gray-500 font-medium">
                  {slides!.length} of {expectedCount} slides
                </span>
              )}
            </div>
            {slides && slides.length > 0 && !isGenerating && (
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
                  {copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy to clipboard</>}
                </button>
                <div className="relative">
                  <button onClick={() => setShowDownloadMenu((v) => !v)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
                    Download <ChevronDown className="w-4 h-4" />
                  </button>
                  {showDownloadMenu && (
                    <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-10 py-1">
                      <button
                        onClick={async () => {
                          await exportSlidesToPdf(slides!, `cpd-${topic.slice(0, 30).replace(/\s+/g, "-") || "slideshow"}`);
                          setShowDownloadMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        Download PDF
                      </button>
                      <button
                        onClick={async () => {
                          await exportSlidesToPptx(slides!, `cpd-${topic.slice(0, 30).replace(/\s+/g, "-") || "slideshow"}`);
                          setShowDownloadMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        Download PPTX
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-stone-400 rounded-xl px-16 py-14 space-y-8">
            {slides!.map((slide, i) =>
              slide.type === "title"
                ? <TitleSlide key={i} slide={slide} index={i} total={isGenerating ? expectedCount : slides!.length} />
                : <ContentSlide key={i} slide={slide} index={i} total={isGenerating ? expectedCount : slides!.length} />
            )}
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
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent resize-none bg-white"
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
