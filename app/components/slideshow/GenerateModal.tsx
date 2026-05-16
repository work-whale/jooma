"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X, Target, Key, Image as ImageIcon, ChevronLeft, ChevronRight, Headphones, Video as VideoIcon } from "lucide-react";
import { createPresentation } from "@/app/lib/presentations";
import { SLIDESHOW_THEMES } from "@/app/lib/slideshowThemes";

// sessionStorage key used to hand the generation params from this modal to the
// editor page, which kicks off the SSE stream after navigation.
export const GENERATION_STORAGE_KEY = "jooma:generation-params";

export type YoutubeLength = "short" | "medium" | "long" | "any";

export interface GenerationParams {
  topic: string;
  year?: string;
  readingLevel?: string;
  slideCount?: number;
  additionalInstructions?: string;
  includeObjectives?: boolean;
  includeVocab?: boolean;
  includeAudio?: boolean;
  includeYouTube?: boolean;
  youtubeLength?: YoutubeLength;
  imageSource?: "auto" | "ai" | "web";
  imageStyle?: "storybook" | "illustration" | "photographic" | "painted" | "line-drawing" | "comic-book";
  themeId?: string;
}

interface Props {
  onClose: () => void;
}

const YEARS = [
  "Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13",
];

const READING_LEVELS = [
  "Same as Year",
  "One year below",
  "Two years below",
  "One year above",
];

const SLIDE_COUNTS = [5, 6, 8, 10, 12, 14];

type ImageSource = "auto" | "ai" | "web";
type ImageStyle = "storybook" | "illustration" | "photographic" | "painted" | "line-drawing" | "comic-book";

const IMAGE_STYLES: { id: ImageStyle; label: string }[] = [
  { id: "storybook", label: "Storybook" },
  { id: "illustration", label: "Illustration" },
  { id: "photographic", label: "Photographic" },
  { id: "painted", label: "Painted" },
  { id: "line-drawing", label: "Line drawing" },
  { id: "comic-book", label: "Comic book" },
];

export default function GenerateModal({ onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [topic, setTopic] = useState("");
  const [year, setYear] = useState("");
  const [readingLevel, setReadingLevel] = useState(READING_LEVELS[0]);
  const [slideCount, setSlideCount] = useState(8);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [themeId, setThemeId] = useState<string>("light");

  const [includeObjectives, setIncludeObjectives] = useState(false);
  const [includeVocab, setIncludeVocab] = useState(false);
  const [includeAudio, setIncludeAudio] = useState(false);
  const [includeYouTube, setIncludeYouTube] = useState(false);
  const [youtubeLength, setYoutubeLength] = useState<"short" | "medium" | "long" | "any">("short");
  const [imageSource, setImageSource] = useState<ImageSource>("auto");
  // Default to "illustration" — works better for classroom decks than realistic
  // photography (and DALL·E/gpt-image's safety filter rejects fewer prompts).
  const [imageStyle, setImageStyle] = useState<ImageStyle>("illustration");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [outlineError, setOutlineError] = useState<string | null>(null);

  const handleGenerateOutline = async () => {
    if (!topic.trim() || outlineBusy) return;
    setOutlineBusy(true);
    setOutlineError(null);
    try {
      const r = await fetch("/api/generate-lesson-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          year: year || undefined,
          readingLevel,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed");
      }
      const data: { outline: string } = await r.json();
      setAdditionalInstructions(data.outline);
    } catch (err) {
      setOutlineError(err instanceof Error ? err.message : "Failed to generate outline");
    } finally {
      setOutlineBusy(false);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [busy, onClose]);

  const canContinue = topic.trim().length > 0;

  const handleGenerate = async () => {
    if (!topic.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Create an empty presentation up-front so we have an editor URL to navigate to.
      // The editor reads the params back out of sessionStorage and runs the stream there.
      const created = await createPresentation({ title: "Generating…", slides: [] });
      const params: GenerationParams = {
        topic: topic.trim(),
        year: year || undefined,
        readingLevel,
        slideCount,
        additionalInstructions: additionalInstructions.trim() || undefined,
        includeObjectives,
        includeVocab,
        includeAudio,
        includeYouTube,
        youtubeLength: includeYouTube ? youtubeLength : undefined,
        imageSource,
        imageStyle: imageSource === "web" ? undefined : imageStyle,
        themeId,
      };
      sessionStorage.setItem(`${GENERATION_STORAGE_KEY}:${created.id}`, JSON.stringify(params));
      router.push(`/editor/${created.id}`);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => { if (!busy) onClose(); }}
      />
      <div
        className="relative rounded-2xl shadow-2xl w-full max-w-2xl border max-h-[90vh] overflow-hidden flex flex-col"
        style={{ borderColor: "#DAD8D0", backgroundColor: "#FAF9F5" }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-6 pb-4 border-b" style={{ borderColor: "#DAD8D0" }}>
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: "#FFCC33" }}
          >
            <Sparkles className="w-5 h-5" style={{ color: "#1a1a1a" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold" style={{ color: "#1a1a1a" }}>
              {step === 1 ? "Pick your topic" : step === 2 ? "Pick a theme" : "Refine your slideshow"}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === 1
                ? "Let's start with the basics."
                : step === 2
                ? "Choose a visual style for your slides."
                : "Pick your preferences or we'll surprise you."}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className="h-1.5 w-6 rounded-full"
                style={{ backgroundColor: step === n ? "#1a1a1a" : "#DAD8D0" }}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {step === 2 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SLIDESHOW_THEMES.map((t) => {
                const selected = themeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThemeId(t.id)}
                    disabled={busy}
                    className="rounded-xl border-2 overflow-hidden text-left transition-transform hover:scale-[1.02] focus:outline-none disabled:opacity-60"
                    style={{
                      borderColor: selected ? "#1a1a1a" : "#DAD8D0",
                      backgroundColor: "#fff",
                    }}
                    aria-pressed={selected}
                  >
                    <div
                      className="aspect-4/3 p-3 flex flex-col justify-between"
                      style={{
                        backgroundColor: t.palette.background,
                        color: t.palette.text,
                        fontFamily: t.fonts.heading,
                      }}
                    >
                      <div
                        className="h-1 w-8 rounded-full"
                        style={{ backgroundColor: t.palette.accent }}
                      />
                      <div>
                        <p className="text-sm font-bold leading-tight" style={{ fontFamily: t.fonts.heading }}>
                          {t.name}
                        </p>
                        <p
                          className="text-[10px] mt-0.5 leading-tight"
                          style={{ color: t.palette.muted, fontFamily: t.fonts.body }}
                        >
                          Lorem ipsum dolor sit amet
                        </p>
                      </div>
                    </div>
                    <div
                      className="px-3 py-2 border-t flex items-center justify-between"
                      style={{ borderColor: selected ? "#1a1a1a" : "#DAD8D0" }}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: "#1a1a1a" }}>
                          {t.name}
                        </p>
                        <p className="text-[10px] text-gray-500 truncate">{t.description}</p>
                      </div>
                      {selected && (
                        <div
                          className="w-4 h-4 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: "#1a1a1a" }}
                        >
                          <svg viewBox="0 0 20 20" className="w-2.5 h-2.5 text-white fill-current">
                            <path d="M7.6 13.6 4 10l1.4-1.4 2.2 2.2 7-7L16 5.2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : step === 1 ? (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-gray-700">Lesson topic</span>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="E.g. The Solar System"
                  required
                  disabled={busy}
                  autoFocus
                  className="mt-1 w-full px-3 py-2.5 text-sm bg-white border rounded-xl focus:outline-none focus:ring-2 disabled:opacity-60"
                  style={{ borderColor: "#DAD8D0" }}
                />
              </label>

              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700">Year</span>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full px-3 py-2.5 text-sm bg-white border rounded-xl focus:outline-none disabled:opacity-60"
                    style={{ borderColor: "#DAD8D0" }}
                  >
                    <option value="">Choose a year</option>
                    {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700">Reading level</span>
                  <select
                    value={readingLevel}
                    onChange={(e) => setReadingLevel(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full px-3 py-2.5 text-sm bg-white border rounded-xl focus:outline-none disabled:opacity-60"
                    style={{ borderColor: "#DAD8D0" }}
                  >
                    {READING_LEVELS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-700">Slides</span>
                  <select
                    value={slideCount}
                    onChange={(e) => setSlideCount(Number(e.target.value))}
                    disabled={busy}
                    className="mt-1 w-full px-3 py-2.5 text-sm bg-white border rounded-xl focus:outline-none disabled:opacity-60"
                    style={{ borderColor: "#DAD8D0" }}
                  >
                    {SLIDE_COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-700">
                    Additional instructions <span className="text-gray-400 font-normal">(optional)</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleGenerateOutline}
                    disabled={outlineBusy || busy || !topic.trim()}
                    title={!topic.trim() ? "Enter a lesson topic first" : "Let AI sketch an outline for you"}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-md border transition-colors disabled:opacity-50"
                    style={{ borderColor: "#0f5f3a", color: "#0f5f3a", backgroundColor: "#fff" }}
                  >
                    {outlineBusy ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Generating…
                      </>
                    ) : (
                      <>
                        Generate lesson outline
                        <Sparkles className="w-3 h-3" />
                      </>
                    )}
                  </button>
                </div>
                <textarea
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="You can include specific topics, learning objectives or paste in existing lesson plans..."
                  rows={3}
                  disabled={busy || outlineBusy}
                  className="w-full px-3 py-2 text-sm bg-white border rounded-xl focus:outline-none disabled:opacity-60"
                  style={{ borderColor: "#DAD8D0" }}
                />
                {outlineError && <p className="text-[11px] text-red-600 mt-1">{outlineError}</p>}
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Lesson</p>
                <div className="space-y-2">
                  <ToggleCard
                    icon={<Target className="w-4 h-4 text-rose-600" />}
                    iconBg="bg-rose-100"
                    title="Learning objectives"
                    description="Add a slide listing what students will know or be able to do"
                    checked={includeObjectives}
                    onChange={setIncludeObjectives}
                    disabled={busy}
                  />
                  <ToggleCard
                    icon={<Key className="w-4 h-4 text-amber-600" />}
                    iconBg="bg-amber-100"
                    title="Key vocabulary"
                    description="Add a slide with key terms and definitions"
                    checked={includeVocab}
                    onChange={setIncludeVocab}
                    disabled={busy}
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Resources</p>
                <div className="space-y-2">
                  <div
                    className="rounded-xl border transition-colors overflow-hidden"
                    style={
                      includeYouTube
                        ? { backgroundColor: "#fff", borderColor: "#1a1a1a" }
                        : { backgroundColor: "#fff", borderColor: "#DAD8D0" }
                    }
                  >
                    <button
                      type="button"
                      onClick={() => setIncludeYouTube(!includeYouTube)}
                      disabled={busy}
                      className="w-full flex items-center gap-3 p-3 text-left disabled:opacity-60"
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-red-100">
                        <VideoIcon className="w-4 h-4 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>YouTube video</p>
                        <p className="text-xs text-gray-500 truncate">We&apos;ll include a relevant video for you</p>
                      </div>
                      <div
                        className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
                        style={
                          includeYouTube
                            ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a" }
                            : { borderColor: "#DAD8D0" }
                        }
                      >
                        {includeYouTube && (
                          <svg viewBox="0 0 20 20" className="w-3 h-3 text-white fill-current">
                            <path d="M7.6 13.6 4 10l1.4-1.4 2.2 2.2 7-7L16 5.2z" />
                          </svg>
                        )}
                      </div>
                    </button>
                    {includeYouTube && (
                      <div
                        className="px-3 pb-3 pt-2 flex items-center gap-3"
                        style={{ borderTop: "1px solid #F0EFE8" }}
                      >
                        <p className="text-xs font-semibold text-gray-700 shrink-0">Video length</p>
                        <select
                          value={youtubeLength}
                          onChange={(e) => setYoutubeLength(e.target.value as typeof youtubeLength)}
                          disabled={busy}
                          className="flex-1 px-2.5 py-1.5 text-xs bg-white border rounded-lg focus:outline-none disabled:opacity-60"
                          style={{ borderColor: "#DAD8D0" }}
                        >
                          <option value="short">Under 5 mins</option>
                          <option value="medium">5 – 20 mins</option>
                          <option value="long">20+ mins</option>
                          <option value="any">Any length</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <ToggleCard
                    icon={<Headphones className="w-4 h-4 text-gray-700" />}
                    iconBg="bg-gray-100"
                    title="Audio activities"
                    description="Listening clips with activities. Not just for language lessons!"
                    badge="New"
                    checked={includeAudio}
                    onChange={setIncludeAudio}
                    disabled={busy}
                  />
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Images</p>
                <div className="bg-white border rounded-xl p-4 space-y-4" style={{ borderColor: "#DAD8D0" }}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                      <ImageIcon className="w-4 h-4 text-sky-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>Image source</p>
                      <p className="text-xs text-gray-500">Choose between AI-generated, web search, or a mix</p>
                    </div>
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    {([
                      { id: "auto", label: "Auto (mix)" },
                      { id: "ai", label: "AI-generated" },
                      { id: "web", label: "Web search" },
                    ] as const).map((opt) => {
                      const selected = imageSource === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setImageSource(opt.id)}
                          disabled={busy}
                          className="px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors"
                          style={
                            selected
                              ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a", color: "#fff" }
                              : { backgroundColor: "#fff", borderColor: "#DAD8D0", color: "#1a1a1a" }
                          }
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {imageSource !== "web" && (
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-2">AI image style</p>
                      <div className="grid grid-cols-3 gap-2">
                        {IMAGE_STYLES.map((s) => {
                          const selected = imageStyle === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setImageStyle(s.id)}
                              disabled={busy}
                              className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg border capitalize transition-colors"
                              style={
                                selected
                                  ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a", color: "#fff" }
                                  : { backgroundColor: "#fff", borderColor: "#DAD8D0", color: "#1a1a1a" }
                              }
                            >
                              {s.label}
                            </button>
                          );
                        })}
                      </div>
                      {imageSource === "ai" && (
                        <p className="text-[10px] text-gray-400 mt-2">AI generation adds a few seconds per slide.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 p-4 border-t" style={{ borderColor: "#DAD8D0" }}>
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canContinue}
                className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : step === 2 ? (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={busy}
                className="px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={busy || !topic.trim()}
                className="px-4 py-2 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 min-w-36 justify-center"
                style={{ backgroundColor: "#FFCC33", color: "#1a1a1a" }}
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Opening editor…
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate slideshow
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ToggleCard({
  icon, iconBg, title, description, checked, onChange, disabled, badge,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className="w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left disabled:opacity-60"
      style={
        checked
          ? { backgroundColor: "#fff", borderColor: "#1a1a1a" }
          : { backgroundColor: "#fff", borderColor: "#DAD8D0" }
      }
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>{title}</p>
          {badge && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "#FFCC33", color: "#1a1a1a" }}
            >
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">{description}</p>
      </div>
      <div
        className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
        style={
          checked
            ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a" }
            : { borderColor: "#DAD8D0" }
        }
      >
        {checked && (
          <svg viewBox="0 0 20 20" className="w-3 h-3 text-white fill-current">
            <path d="M7.6 13.6 4 10l1.4-1.4 2.2 2.2 7-7L16 5.2z" />
          </svg>
        )}
      </div>
    </button>
  );
}
