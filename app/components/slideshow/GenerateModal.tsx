"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, X, Target, Key, Image as ImageIcon, ChevronLeft, ChevronRight, Headphones, Video as VideoIcon, BookOpen, HelpCircle, FileUp, FolderSymlink, Link as LinkIcon, CheckCircle2, ChevronDown, GraduationCap, Layers, Info } from "lucide-react";
import { createPresentation } from "@/app/lib/presentations";
import ResourceLibraryModal from "./ResourceLibraryModal";
import { THEME_CATEGORIES, getThemesByCategory, DEFAULT_THEME_ID, ART_STYLES, getThemeArt, DEFAULT_ART_STYLE, type ArtStyleId } from "@/app/lib/slideshowThemes";
import { COUNTRIES, CURRICULA, getCurriculaForCountry, getSubjectsForCurriculum, getStrandsForSubject } from "@/app/lib/curriculum";
import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "@/app/components/fields/PlaceholderOverlay";

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
  /** Curated key-vocabulary terms (AI-suggested, teacher-edited). Only sent
   *  when includeVocab is on and at least one term is selected. */
  vocabulary?: string[];
  includeAudio?: boolean;
  includeYouTube?: boolean;
  youtubeLength?: YoutubeLength;
  imageSource?: "auto" | "ai" | "web";
  /** Auto mode only: how many of every 10 images come from web search (the rest
   *  are AI-generated). Default 8 → 8 web : 2 AI. */
  imageMixWeb?: number;
  imageStyle?: "storybook" | "illustration" | "photographic" | "painted" | "line-drawing" | "comic-book";
  themeId?: string;
  artStyle?: string;
  /** Extracted text from a teacher-supplied resource (URL or uploaded file).
   *  Fed to the AI as base material so the deck reflects the actual lesson
   *  content. Truncated by the extract route to ~30k chars. */
  resourceText?: string;
  /** Short human label for the resource — e.g. "report.pdf" or
   *  "wikipedia.org/wiki/Photosynthesis". Shown in the UI as a chip and used
   *  in the AI prompt header. */
  resourceSource?: string;
  /** Curriculum alignment — collected via the "Align to curriculum" toggle.
   *  Sent to the AI as additional context so the deck targets the right
   *  subject/strand. No standards lookup behind it (yet). */
  curriculum?: {
    countryId: string;
    countryName: string;
    curriculumName: string;
    grade: string;
    subject: string;
    strand: string;
  };
}

interface Props {
  onClose: () => void;
}

const YEARS = [
  "Reception", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6",
  "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12", "Year 13",
  "Adult learners",
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

  // Lock background scroll while the modal is open; restore on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const [topic, setTopic] = useState("");
  // Cycling typewriter placeholder, matching the other tool forms.
  const topicPlaceholder = useTypingPlaceholder([
    "E.g. The French Revolution",
    "E.g. The Water Cycle",
    "E.g. Photosynthesis",
    "E.g. World War One — Causes",
    "E.g. Fractions and Decimals",
  ]);
  const [year, setYear] = useState("");
  const [readingLevel, setReadingLevel] = useState(READING_LEVELS[0]);
  const [slideCount, setSlideCount] = useState(8);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  // Auto-grow the instructions textarea with its content (up to a max, then it
  // scrolls). Re-runs when the text changes, incl. when "Generate outline" fills it.
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = instructionsRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 260)}px`;
  }, [additionalInstructions]);
  const [themeId, setThemeId] = useState<string>(DEFAULT_THEME_ID);
  const [artStyle, setArtStyle] = useState<ArtStyleId>(DEFAULT_ART_STYLE);

  const [includeObjectives, setIncludeObjectives] = useState(false);
  const [includeVocab, setIncludeVocab] = useState(false);
  // Key-vocabulary curation. `vocabTerms` is the unified list the teacher sees
  // (AI suggestions + their own additions), each with a checked flag. We track
  // which topic the suggestions were fetched for so re-enabling after a topic
  // change re-fetches.
  const [vocabTerms, setVocabTerms] = useState<{ term: string; checked: boolean }[]>([]);
  const [vocabBusy, setVocabBusy] = useState(false);
  const [vocabError, setVocabError] = useState<string | null>(null);
  const [vocabFetchedFor, setVocabFetchedFor] = useState<string | null>(null);
  const [vocabInput, setVocabInput] = useState("");
  const [includeAudio, setIncludeAudio] = useState(false);
  const [includeYouTube, setIncludeYouTube] = useState(false);
  // Curriculum alignment — toggled off by default. The dropdowns below cascade
  // off the selected country / curriculum / subject.
  const [alignCurriculum, setAlignCurriculum] = useState(false);
  const [curCountryId, setCurCountryId] = useState("england");
  const [curCurriculumId, setCurCurriculumId] = useState("england-national");
  const [curGrade, setCurGrade] = useState("");
  const [curSubject, setCurSubject] = useState("");
  const [curStrand, setCurStrand] = useState("");
  // Resource attached in Step 1 — always available (no toggle).
  // When attached, the extracted text gets sent to the AI as base material.
  const [resourceText, setResourceText] = useState("");
  const [resourceSource, setResourceSource] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [resourceBusy, setResourceBusy] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [youtubeLength, setYoutubeLength] = useState<"short" | "medium" | "long" | "any">("short");
  const [imageSource, setImageSource] = useState<ImageSource>("auto");
  // Auto mode web:AI split (web parts out of 10). Default 8 → 8 web : 2 AI.
  const [imageMixWeb, setImageMixWeb] = useState(8);
  // Default to "illustration" — works better for classroom decks than realistic
  // photography (and DALL·E/gpt-image's safety filter rejects fewer prompts).
  const [imageStyle, setImageStyle] = useState<ImageStyle>("illustration");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outlineBusy, setOutlineBusy] = useState(false);
  const [outlineError, setOutlineError] = useState<string | null>(null);
  const [subjectSuggesting, setSubjectSuggesting] = useState(false);

  // Auto-fill the curriculum subject/strand from the topic (via AI) when the
  // "Align to curriculum" section is opened. Keyed by curriculum + topic so it
  // runs once per combination and never overrides a subject the user picked.
  const subjectSuggestKeyRef = useRef("");
  useEffect(() => {
    if (!alignCurriculum || !topic.trim() || curSubject) return;
    const subjects = getSubjectsForCurriculum(curCurriculumId);
    if (subjects.length === 0) return;
    const key = `${curCurriculumId}::${topic.trim().toLowerCase()}`;
    if (subjectSuggestKeyRef.current === key) return;
    subjectSuggestKeyRef.current = key;
    let cancelled = false;
    setSubjectSuggesting(true);
    (async () => {
      try {
        const res = await fetch("/api/suggest-subject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: topic.trim(), subjects }),
        });
        if (!res.ok || cancelled) return;
        const { subject, strand } = (await res.json()) as { subject: string; strand: string };
        if (cancelled || !subject) return;
        setCurSubject(subject);
        if (strand) setCurStrand(strand);
      } catch {
        /* best-effort — leave the dropdown for the user to fill */
      } finally {
        if (!cancelled) setSubjectSuggesting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [alignCurriculum, topic, curCurriculumId, curSubject]);

  const handleGenerateOutline = async () => {
    if (!topic.trim() || !year || outlineBusy) return;
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
          // Feed the subject/curriculum the wizard already knows so the outline
          // is subject-aware and curriculum-aligned, not just topic + year.
          subject: curSubject || undefined,
          curriculum: alignCurriculum && curCurriculumId
            ? (CURRICULA.find((c) => c.id === curCurriculumId)?.name ?? undefined)
            : undefined,
          strand: alignCurriculum ? (curStrand || undefined) : undefined,
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

  // Fetch AI vocabulary suggestions for the current topic. Pre-checked so the
  // teacher starts with a usable list and just unchecks what they don't want.
  const fetchVocabSuggestions = async () => {
    const t = topic.trim();
    if (!t || vocabBusy) return;
    setVocabBusy(true);
    setVocabError(null);
    try {
      const r = await fetch("/api/suggest-vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: t, year: year || undefined }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed");
      }
      const data: { terms: string[] } = await r.json();
      setVocabTerms((prev) => {
        // Preserve any custom terms the teacher already added.
        const existing = new Set(prev.map((v) => v.term.toLowerCase()));
        const suggestions = data.terms
          .filter((term) => !existing.has(term.toLowerCase()))
          .map((term) => ({ term, checked: true }));
        return [...prev, ...suggestions];
      });
      setVocabFetchedFor(t);
    } catch (err) {
      setVocabError(err instanceof Error ? err.message : "Couldn't suggest vocabulary");
    } finally {
      setVocabBusy(false);
    }
  };

  // When the teacher enables Key vocabulary, fetch suggestions once for the
  // current topic (if we haven't already for this topic).
  const handleToggleVocab = (on: boolean) => {
    setIncludeVocab(on);
    if (on && topic.trim() && vocabFetchedFor !== topic.trim() && !vocabBusy) {
      fetchVocabSuggestions();
    }
  };

  const toggleVocabTerm = (term: string) => {
    setVocabTerms((prev) => prev.map((v) => v.term === term ? { ...v, checked: !v.checked } : v));
  };

  const addCustomVocab = () => {
    const t = vocabInput.trim();
    if (!t) return;
    setVocabTerms((prev) =>
      prev.some((v) => v.term.toLowerCase() === t.toLowerCase())
        ? prev
        : [...prev, { term: t, checked: true }],
    );
    setVocabInput("");
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
        vocabulary: includeVocab
          ? vocabTerms.filter((v) => v.checked).map((v) => v.term)
          : undefined,
        includeAudio,
        includeYouTube,
        youtubeLength: includeYouTube ? youtubeLength : undefined,
        imageSource,
        imageMixWeb: imageSource === "auto" ? imageMixWeb : undefined,
        imageStyle: imageSource === "web" ? undefined : imageStyle,
        themeId,
        artStyle,
        resourceText: resourceText || undefined,
        resourceSource: resourceSource || undefined,
        curriculum:
          alignCurriculum && curSubject && curStrand
            ? {
                countryId: curCountryId,
                countryName: COUNTRIES.find((c) => c.id === curCountryId)?.name ?? "",
                curriculumName:
                  CURRICULA.find((c) => c.id === curCurriculumId)?.name ?? "",
                grade: curGrade || year || "",
                subject: curSubject,
                strand: curStrand,
              }
            : undefined,
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
      {/* Wrapper: card + optional side panel share a height via items-stretch. */}
      <div className="relative z-10 flex items-stretch justify-center gap-3 w-full max-h-[90vh]">
      <div
        className="relative rounded-2xl shadow-2xl w-full max-w-2xl border overflow-hidden flex flex-col"
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
              {step === 1 ? "Pick your topic" : step === 2 ? "Refine your slideshow" : "Pick a theme"}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {step === 1
                ? "Let's start with the basics."
                : step === 2
                ? "Pick your preferences or we'll surprise you."
                : "Choose a visual style for your slides."}
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
          {step === 3 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {THEME_CATEGORIES.map((cat) => {
                const themes = getThemesByCategory(cat.id);
                if (themes.length === 0) return null;
                return (
                  <Fragment key={cat.id}>
                    <div className="col-span-2 sm:col-span-3 flex items-center justify-between gap-2 mt-2 first:mt-0">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-semibold text-gray-700">{cat.label}</span>
                        <span className="text-[10px] text-gray-400">{cat.description}</span>
                      </div>
                      {/* Art-style toggle only on the categories with both variants. */}
                      {(cat.id === "classic" || cat.id === "scenic") && (
                        <div className="flex gap-0.5 p-0.5 rounded-lg bg-gray-100 shrink-0">
                          {ART_STYLES.map((s) => {
                            const active = artStyle === s.id;
                            return (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => setArtStyle(s.id)}
                                className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors ${
                                  active ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
                                }`}
                              >
                                {s.name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {themes.map((t) => {
                      const selected = themeId === t.id;
                      const art = getThemeArt(t, artStyle);
                      return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setThemeId(t.id)}
                    disabled={busy}
                    className="rounded-xl border-2 overflow-hidden text-left transition-shadow hover:shadow-md focus:outline-none disabled:opacity-60"
                    style={{
                      borderColor: selected ? "#1a1a1a" : "#DAD8D0",
                      backgroundColor: "#fff",
                    }}
                    aria-pressed={selected}
                  >
                    <div
                      className="aspect-4/3 p-3 flex flex-col justify-between relative overflow-hidden"
                      style={{
                        backgroundColor: t.palette.background,
                        backgroundImage: art ? `url(${art.src})` : undefined,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        color: t.palette.text,
                        fontFamily: t.fonts.heading,
                      }}
                    >
                      {/* Legibility veil over the illustration background */}
                      {art && (
                        <div className="absolute inset-0" style={{ backgroundColor: art.scrim }} />
                      )}
                      <div
                        className="relative h-1 w-8 rounded-full"
                        style={{ backgroundColor: t.palette.accent }}
                      />
                      <div className="relative">
                        <p
                          className="text-sm font-bold leading-tight"
                          style={{ fontFamily: t.fonts.heading, color: t.palette.headingColor ?? t.palette.text }}
                        >
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
                  </Fragment>
                );
              })}
            </div>
          ) : step === 1 ? (
            <>
              {/* Topic input */}
              <div className="relative">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder=""
                  required
                  disabled={busy}
                  autoFocus
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  name="lesson-topic"
                  className="w-full px-4 py-3 text-sm bg-white border rounded-xl focus:outline-none focus:ring-2 disabled:opacity-60 placeholder:text-gray-400"
                  style={{ borderColor: "#DAD8D0", fontSize: "15px" }}
                />
                {!topic && <PlaceholderOverlay text={topicPlaceholder} />}
              </div>

              {/* Inline pill selectors */}
              <div className="flex flex-wrap gap-2">
                <PillSelect
                  icon={<GraduationCap className="w-3.5 h-3.5" />}
                  value={year}
                  placeholder="Year group"
                  options={[{ value: "", label: "Any year" }, ...YEARS.map((y) => ({ value: y, label: y }))]}
                  onChange={setYear}
                  disabled={busy}
                />
                <PillSelect
                  icon={<BookOpen className="w-3.5 h-3.5" />}
                  value={readingLevel}
                  placeholder="Reading level"
                  options={READING_LEVELS.map((r) => ({ value: r, label: r }))}
                  onChange={setReadingLevel}
                  disabled={busy}
                />
                <div className="flex items-center gap-1.5">
                  <PillSelect
                    icon={<Layers className="w-3.5 h-3.5" />}
                    value={String(slideCount)}
                    placeholder="Slides"
                    options={SLIDE_COUNTS.map((c) => ({ value: String(c), label: `${c} slides` }))}
                    onChange={(v) => setSlideCount(Number(v))}
                    disabled={busy}
                  />
                  <span className="relative group inline-flex">
                    <Info className="w-4 h-4 text-gray-400 cursor-help" aria-label="About slide count" tabIndex={0} />
                    <span
                      role="tooltip"
                      className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-60 px-3 py-2 rounded-lg bg-gray-900 text-white text-[11px] font-normal leading-snug text-left opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-events-none transition-opacity z-20 shadow-lg"
                    >
                      This is the base number of content slides. Extra slides for
                      activities, audio and a video are added on top, so your deck
                      may end up a little longer.
                    </span>
                  </span>
                </div>
              </div>

              {/* Instructions textarea */}
              <div>
                <textarea
                  ref={instructionsRef}
                  value={additionalInstructions}
                  onChange={(e) => setAdditionalInstructions(e.target.value)}
                  placeholder="Any specific instructions or topics?"
                  rows={3}
                  disabled={busy || outlineBusy}
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  name="lesson-instructions"
                  className="w-full px-3 py-2.5 text-sm bg-white border rounded-xl focus:outline-none resize-none overflow-y-auto disabled:opacity-60 placeholder:text-gray-400"
                  style={{ borderColor: "#DAD8D0", minHeight: "76px", maxHeight: "260px" }}
                />
                <div className="flex items-center justify-between mt-1.5 px-0.5">
                  {outlineError
                    ? <p className="text-[11px] text-red-600">{outlineError}</p>
                    : <span />
                  }
                  <button
                    type="button"
                    onClick={handleGenerateOutline}
                    disabled={outlineBusy || busy || !topic.trim() || !year}
                    title={!topic.trim() ? "Enter a lesson topic first" : !year ? "Select a year group first" : "Let AI sketch an outline for you"}
                    className="flex items-center gap-1 text-[12px] font-semibold transition-colors disabled:opacity-40"
                    style={{ color: "#0f5f3a" }}
                  >
                    {outlineBusy
                      ? <><Loader2 className="w-3 h-3 animate-spin" />Generating…</>
                      : <><Sparkles className="w-3 h-3" />Generate outline</>
                    }
                  </button>
                </div>
              </div>

              {/* Always-visible upload zone */}
              <InlineUploadZone
                busy={resourceBusy}
                text={resourceText}
                source={resourceSource}
                error={resourceError}
                onAttach={async (input) => {
                  setResourceBusy(true);
                  setResourceError(null);
                  try {
                    let res: Response;
                    if (input.kind === "url") {
                      res = await fetch("/api/extract-resource", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: input.url }),
                      });
                    } else {
                      const fd = new FormData();
                      fd.append("file", input.file);
                      res = await fetch("/api/extract-resource", { method: "POST", body: fd });
                    }
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({}));
                      throw new Error(err.error || err.message || "Couldn't read that resource");
                    }
                    const data: { text: string; source: string } = await res.json();
                    if (!data.text?.trim()) throw new Error("Resource was empty or unreadable");
                    setResourceText(data.text);
                    setResourceSource(data.source);
                  } catch (err) {
                    setResourceError(err instanceof Error ? err.message : "Extraction failed");
                  } finally {
                    setResourceBusy(false);
                  }
                }}
                onClear={() => { setResourceText(""); setResourceSource(""); setResourceError(null); }}
                onOpenLibrary={() => setLibraryOpen(true)}
                disabled={busy}
              />
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Lesson</p>
                <div className="space-y-2">
                  <CurriculumAlignmentCard
                    checked={alignCurriculum}
                    onChange={setAlignCurriculum}
                    countryId={curCountryId}
                    onCountryChange={(id) => {
                      setCurCountryId(id);
                      // Cascade: when country flips, default to its first
                      // curriculum (if any) and reset subject/strand.
                      const first = getCurriculaForCountry(id)[0]?.id ?? "";
                      setCurCurriculumId(first);
                      setCurSubject("");
                      setCurStrand("");
                    }}
                    curriculumId={curCurriculumId}
                    onCurriculumChange={(id) => {
                      setCurCurriculumId(id);
                      setCurSubject("");
                      setCurStrand("");
                    }}
                    grade={curGrade || year}
                    onGradeChange={setCurGrade}
                    subject={curSubject}
                    onSubjectChange={(s) => { setCurSubject(s); setCurStrand(""); }}
                    strand={curStrand}
                    onStrandChange={setCurStrand}
                    disabled={busy}
                    suggesting={subjectSuggesting}
                  />
                  <ToggleCard
                    icon={<Target className="w-4 h-4 text-rose-600" />}
                    iconBg="bg-rose-100"
                    title="Learning objectives"
                    description="Add a slide listing what students will know or be able to do"
                    checked={includeObjectives}
                    onChange={setIncludeObjectives}
                    disabled={busy}
                  />
                  <div
                    className="rounded-xl border transition-colors overflow-hidden"
                    style={
                      includeVocab
                        ? { backgroundColor: "#fff", borderColor: "#1a1a1a" }
                        : { backgroundColor: "#fff", borderColor: "#DAD8D0" }
                    }
                  >
                    <button
                      type="button"
                      onClick={() => handleToggleVocab(!includeVocab)}
                      disabled={busy}
                      className="w-full flex items-center gap-3 p-3 text-left disabled:opacity-60"
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-amber-100">
                        <Key className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>Key vocabulary</p>
                        <p className="text-xs text-gray-500 truncate">Add a slide with key terms — we&apos;ll suggest them for you</p>
                      </div>
                      <div
                        className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
                        style={
                          includeVocab
                            ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a" }
                            : { borderColor: "#DAD8D0" }
                        }
                      >
                        {includeVocab && (
                          <svg viewBox="0 0 20 20" className="w-3 h-3 text-white fill-current">
                            <path d="M7.6 13.6 4 10l1.4-1.4 2.2 2.2 7-7L16 5.2z" />
                          </svg>
                        )}
                      </div>
                    </button>
                    {includeVocab && (
                      <div className="px-3 pb-3 pt-2 space-y-2.5" style={{ borderTop: "1px solid #F0EFE8" }}>
                        {/* Suggestions */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-xs font-semibold text-gray-700">Suggestions</p>
                            <button
                              type="button"
                              onClick={fetchVocabSuggestions}
                              disabled={vocabBusy || !topic.trim()}
                              className="text-[11px] font-medium text-violet-600 hover:text-violet-700 disabled:opacity-40 flex items-center gap-1"
                            >
                              {vocabBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              {vocabTerms.length > 0 ? "Suggest more" : "Suggest"}
                            </button>
                          </div>
                          {vocabBusy && vocabTerms.length === 0 ? (
                            <div className="flex items-center gap-2 text-xs text-gray-400 py-1">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Finding key terms…
                            </div>
                          ) : vocabTerms.length === 0 ? (
                            <p className="text-[11px] text-gray-400">
                              {topic.trim() ? "No suggestions yet — tap Suggest." : "Enter a topic first."}
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {vocabTerms.map((v) => (
                                <button
                                  key={v.term}
                                  type="button"
                                  onClick={() => toggleVocabTerm(v.term)}
                                  className="w-full flex items-center gap-2 text-left group"
                                >
                                  <span
                                    className="w-4 h-4 rounded border flex items-center justify-center shrink-0"
                                    style={
                                      v.checked
                                        ? { backgroundColor: "#2e7d52", borderColor: "#2e7d52" }
                                        : { borderColor: "#CBD5C0", backgroundColor: "#fff" }
                                    }
                                  >
                                    {v.checked && (
                                      <svg viewBox="0 0 20 20" className="w-2.5 h-2.5 text-white fill-current">
                                        <path d="M7.6 13.6 4 10l1.4-1.4 2.2 2.2 7-7L16 5.2z" />
                                      </svg>
                                    )}
                                  </span>
                                  <span className={`text-sm ${v.checked ? "text-gray-800" : "text-gray-400 line-through"}`}>
                                    {v.term}
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                          {vocabError && <p className="text-[10px] text-red-600 mt-1">{vocabError}</p>}
                        </div>
                        {/* Add your own */}
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">Add your own</p>
                          <input
                            type="text"
                            value={vocabInput}
                            onChange={(e) => setVocabInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); addCustomVocab(); }
                            }}
                            placeholder="Type and press enter to add"
                            disabled={busy}
                            autoComplete="off"
                            data-1p-ignore
                            data-lpignore="true"
                            name="vocab-term"
                            className="w-full px-3 py-2 text-sm bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60"
                            style={{ borderColor: "#DAD8D0" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
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

                  {imageSource === "auto" && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold text-gray-700">Web / AI mix</p>
                        <p className="text-[11px] text-gray-500">
                          <span className="font-semibold text-gray-700">{imageMixWeb}</span> web
                          {" · "}
                          <span className="font-semibold text-gray-700">{10 - imageMixWeb}</span> AI
                        </p>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={1}
                        value={imageMixWeb}
                        onChange={(e) => setImageMixWeb(Number(e.target.value))}
                        disabled={busy}
                        className="w-full accent-gray-900 disabled:opacity-60"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                        <span>All AI</span>
                        <span>All web</span>
                      </div>
                    </div>
                  )}

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
      {libraryOpen && (
        <ResourceLibraryModal
          onSelect={(text, source) => { setResourceText(text); setResourceSource(source); }}
          onClose={() => setLibraryOpen(false)}
        />
      )}
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

// "Align to curriculum" toggle card. When checked, expands into a small form
// with cascading dropdowns (country → curriculum → subject → strand) plus a
// grade selector. The picked values are forwarded to the AI as extra context.
// Country picker with flag images. Native <select> can't render <img> inside
// <option>, and emoji flags don't render on Windows — so this is a custom
// dropdown that fetches SVG flags from flagcdn.com (same pattern as the
// ── PillSelect ────────────────────────────────────────────────────────────────
// Inline pill button that opens a small dropdown list. Used in Step 1 for Year,
// Reading Level, and Slide Count — replacing the old 3-column grid of selects.

function PillSelect({
  icon,
  value,
  placeholder,
  options,
  onChange,
  disabled,
}: {
  icon?: React.ReactNode;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // The menu is portaled outside wrapperRef, so check it separately.
      if (wrapperRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  // Position the portaled menu directly under the button, and keep it pinned
  // there while the modal scrolls or the window resizes.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const update = () => {
      const r = buttonRef.current!.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, left: r.left, width: r.width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 rounded-full border text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50"
        style={{ borderColor: "#DAD8D0", color: "#1a1a1a", backgroundColor: open ? "#f5f4f0" : "#fff" }}
      >
        {icon && <span className="text-gray-500">{icon}</span>}
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown className="w-3 h-3 text-gray-400" />
      </button>
      {/* Portal to body + fixed positioning so the menu escapes the modal's
          overflow-y-auto (which otherwise grows a scrollbar) and isn't clipped
          by the modal's overflow-hidden. */}
      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[60] w-max max-w-[15rem] rounded-xl border bg-white shadow-lg py-1.5 max-h-64 overflow-y-auto"
          style={{ borderColor: "#DAD8D0", top: menuPos.top, left: menuPos.left, minWidth: menuPos.width }}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
              style={{
                color: o.value === value ? "#1a1a1a" : "#6b7280",
                fontWeight: o.value === value ? 600 : 400,
              }}
            >
              {o.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

// ── InlineUploadZone ──────────────────────────────────────────────────────────
// Always-visible upload zone for Step 1. Supports drag-and-drop, file picker,
// and URL paste. When a resource is attached, shows a success chip instead.

type ResourceInput =
  | { kind: "file"; file: File }
  | { kind: "url"; url: string };

function InlineUploadZone({
  busy,
  text,
  source,
  error,
  onAttach,
  onClear,
  onOpenLibrary,
  disabled,
}: {
  busy: boolean;
  text: string;
  source: string;
  error: string | null;
  onAttach: (input: ResourceInput) => Promise<void> | void;
  onClear: () => void;
  onOpenLibrary: () => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const hasResource = !!text;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !disabled && !busy) onAttach({ kind: "file", file });
  };

  return (
    <div className="space-y-2">
      {hasResource ? (
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border"
          style={{ backgroundColor: "#f0faf5", borderColor: "#A7F3D0" }}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-900 truncate">{source}</p>
            <p className="text-[10px] text-gray-500">
              {text.length.toLocaleString()} chars extracted — will be used as lesson material
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled || busy}
            className="flex items-center justify-center w-5 h-5 rounded-full hover:bg-emerald-100 transition-colors disabled:opacity-50"
          >
            <X className="w-3 h-3 text-gray-500" />
          </button>
        </div>
      ) : (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !disabled && !busy && fileRef.current?.click()}
            className="relative rounded-xl border-2 border-dashed cursor-pointer transition-colors"
            style={{
              borderColor: dragOver ? "#1a1a1a" : "#DAD8D0",
              backgroundColor: dragOver ? "#f5f4f0" : "#fff",
            }}
          >
            {busy ? (
              <div className="flex flex-col items-center gap-2 py-6">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                <p className="text-xs text-gray-500">Reading resource…</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-5 px-4">
                <div className="flex items-center gap-5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (!disabled && !busy) fileRef.current?.click(); }}
                    disabled={disabled || busy}
                    className="flex flex-col items-center gap-1 group disabled:opacity-50"
                    title="Upload a file"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center border transition-colors group-hover:bg-gray-50"
                      style={{ borderColor: "#DAD8D0" }}
                    >
                      <FileUp className="w-4.5 h-4.5 text-gray-500" />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (!disabled && !busy) onOpenLibrary(); }}
                    disabled={disabled || busy}
                    className="flex flex-col items-center gap-1 group disabled:opacity-50"
                    title="Use a previous tool output"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center border transition-colors group-hover:bg-gray-50"
                      style={{ borderColor: "#DAD8D0" }}
                    >
                      <FolderSymlink className="w-4.5 h-4.5 text-gray-500" />
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); if (!disabled && !busy) setUrlOpen((v) => !v); }}
                    disabled={disabled || busy}
                    className="flex flex-col items-center gap-1 group disabled:opacity-50"
                    title="Paste a URL"
                  >
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center border transition-colors group-hover:bg-gray-50"
                      style={{ borderColor: "#DAD8D0" }}
                    >
                      <LinkIcon className="w-4.5 h-4.5 text-gray-500" />
                    </div>
                  </button>
                </div>
                <div className="text-center pointer-events-none select-none">
                  <p className="text-sm font-medium text-gray-700">Drop files here or click to upload</p>
                  <p className="text-xs text-gray-400 mt-0.5">Add existing lesson presentations, plans or resources</p>
                </div>
              </div>
            )}
          </div>
          {urlOpen && (
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && urlInput.trim()) {
                    e.preventDefault();
                    onAttach({ kind: "url", url: urlInput.trim() });
                    setUrlOpen(false);
                    setUrlInput("");
                  }
                }}
                placeholder="https://en.wikipedia.org/wiki/..."
                disabled={disabled || busy}
                autoFocus
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                name="resource-url"
                className="flex-1 px-3 py-2 text-xs bg-white border rounded-xl focus:outline-none disabled:opacity-60"
                style={{ borderColor: "#DAD8D0" }}
              />
              <button
                type="button"
                onClick={() => { if (urlInput.trim()) { onAttach({ kind: "url", url: urlInput.trim() }); setUrlOpen(false); setUrlInput(""); } }}
                disabled={!urlInput.trim() || disabled || busy}
                className="px-3 py-2 text-xs font-semibold rounded-xl disabled:opacity-50"
                style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Fetch"}
              </button>
              <button
                type="button"
                onClick={() => { setUrlOpen(false); setUrlInput(""); }}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </>
      )}
      {error && <p className="text-[11px] text-red-600 px-0.5">{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onAttach({ kind: "file", file: f });
          e.target.value = "";
        }}
      />
    </div>
  );
}

// CountrySelect in /complete-profile). Used inside CurriculumAlignmentCard.
// Legacy ResourceAttachmentCard — currently unused but kept for potential reuse.
function ResourceAttachmentCard({
  checked,
  onChange,
  busy,
  text,
  source,
  error,
  onAttach,
  onClear,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  busy: boolean;
  text: string;
  source: string;
  error: string | null;
  onAttach: (input: ResourceInput) => Promise<void> | void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const hasResource = !!text;

  return (
    <div
      className="rounded-xl border transition-colors overflow-hidden"
      style={
        checked
          ? { backgroundColor: "#fff", borderColor: "#1a1a1a" }
          : { backgroundColor: "#fff", borderColor: "#DAD8D0" }
      }
    >
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className="w-full flex items-center gap-3 p-3 text-left disabled:opacity-60"
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-violet-100">
          <FileUp className="w-4 h-4 text-violet-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>Use existing resources in my lesson</p>
          <p className="text-xs text-gray-500 truncate">Paste in a URL or upload a file</p>
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
      {checked && (
        <div className="px-3 pb-3 pt-3 space-y-2" style={{ borderTop: "1px solid #F0EFE8" }}>
          {hasResource ? (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-emerald-50"
              style={{ borderColor: "#A7F3D0" }}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-900 truncate">{source}</p>
                <p className="text-[10px] text-gray-500">
                  {text.length.toLocaleString()} characters extracted — will be used as lesson material
                </p>
              </div>
              <button
                type="button"
                onClick={onClear}
                disabled={disabled || busy}
                className="text-[10px] font-semibold text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-white disabled:opacity-50"
              >
                Replace
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                <ResourceButton
                  icon={<FileUp className="w-5 h-5 text-emerald-700" />}
                  label="Upload a file"
                  busy={busy}
                  disabled={disabled || busy}
                  onClick={() => fileRef.current?.click()}
                />
                <ResourceButton
                  icon={<FolderSymlink className="w-5 h-5 text-emerald-700" />}
                  label="Import from Drive"
                  busy={false}
                  disabled
                  comingSoon
                />
                <ResourceButton
                  icon={<LinkIcon className="w-5 h-5 text-emerald-700" />}
                  label="Upload from URL"
                  busy={busy && urlOpen}
                  disabled={disabled || busy}
                  onClick={() => setUrlOpen((v) => !v)}
                />
              </div>
              {urlOpen && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && urlInput.trim()) {
                        e.preventDefault();
                        onAttach({ kind: "url", url: urlInput.trim() });
                      }
                    }}
                    placeholder="https://en.wikipedia.org/wiki/..."
                    disabled={disabled || busy}
                    autoFocus
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    name="resource-url"
                    className="flex-1 px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60"
                    style={{ borderColor: "#DAD8D0" }}
                  />
                  <button
                    type="button"
                    onClick={() => urlInput.trim() && onAttach({ kind: "url", url: urlInput.trim() })}
                    disabled={!urlInput.trim() || disabled || busy}
                    className="px-3 py-2 text-xs font-semibold rounded-lg disabled:opacity-50"
                    style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Fetch"}
                  </button>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAttach({ kind: "file", file: f });
                  e.target.value = "";
                }}
              />
            </>
          )}
          {error && <p className="text-[11px] text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

function ResourceButton({
  icon, label, onClick, busy, disabled, comingSoon,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  busy?: boolean;
  disabled?: boolean;
  comingSoon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="relative flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-xl border bg-white hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      style={{ borderColor: "#DAD8D0" }}
    >
      {busy ? <Loader2 className="w-5 h-5 animate-spin text-emerald-700" /> : icon}
      <span className="text-[11px] font-semibold text-gray-800 text-center leading-tight">{label}</span>
      {comingSoon && (
        <span className="absolute top-1 right-1 text-[8px] uppercase tracking-wide text-gray-400 font-semibold">
          Soon
        </span>
      )}
    </button>
  );
}

function CountryDropdown({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selected = COUNTRIES.find((c) => c.id === value) ?? COUNTRIES[0];

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none disabled:opacity-60"
        style={{ borderColor: "#DAD8D0" }}
      >
        <FlagImg code={selected.flagCode} className="w-4 h-3 shrink-0" />
        <span className="flex-1 text-left truncate">{selected.name}</span>
        <ChevronRight className="w-3 h-3 text-gray-500 rotate-90 shrink-0" />
      </button>
      {open && (
        <div
          className="absolute z-20 mt-1 left-0 w-full max-h-64 overflow-y-auto bg-white border rounded-lg shadow-lg py-1"
          style={{ borderColor: "#DAD8D0" }}
        >
          {COUNTRIES.map((c) => {
            const isSel = c.id === selected.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setOpen(false); }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-gray-50 text-left"
                style={isSel ? { backgroundColor: "#F1EFE3" } : undefined}
              >
                <FlagImg code={c.flagCode} className="w-4 h-3 shrink-0" />
                <span className="flex-1 truncate">{c.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Inline flagcdn.com image — matches the pattern used in /complete-profile.
// Renders an aspect-correct rectangular flag SVG so it works on Windows
// (which doesn't draw emoji flags) and the UK subdivisions.
function FlagImg({ code, className }: { code: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`https://flagcdn.com/${code}.svg`}
      alt=""
      aria-hidden="true"
      className={`inline-block object-cover rounded-sm ${className ?? ""}`}
    />
  );
}

function CurriculumAlignmentCard({
  checked,
  onChange,
  countryId, onCountryChange,
  curriculumId, onCurriculumChange,
  grade, onGradeChange,
  subject, onSubjectChange,
  strand, onStrandChange,
  disabled,
  suggesting,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  countryId: string;
  onCountryChange: (id: string) => void;
  curriculumId: string;
  onCurriculumChange: (id: string) => void;
  grade: string;
  onGradeChange: (g: string) => void;
  subject: string;
  onSubjectChange: (s: string) => void;
  strand: string;
  onStrandChange: (s: string) => void;
  disabled?: boolean;
  suggesting?: boolean;
}) {
  const [hintOpen, setHintOpen] = useState(false);
  const curricula = getCurriculaForCountry(countryId);
  const subjects = getSubjectsForCurriculum(curriculumId);
  const strands = getStrandsForSubject(curriculumId, subject);
  const selectCls =
    "w-full px-2.5 py-2 text-xs bg-white border rounded-lg focus:outline-none disabled:opacity-60 truncate";

  return (
    <div
      className="rounded-xl border transition-colors overflow-hidden"
      style={
        checked
          ? { backgroundColor: "#fff", borderColor: "#1a1a1a" }
          : { backgroundColor: "#fff", borderColor: "#DAD8D0" }
      }
    >
      <button
        type="button"
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className="w-full flex items-center gap-3 p-3 text-left disabled:opacity-60"
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-emerald-100">
          <BookOpen className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "#1a1a1a" }}>Align to curriculum</p>
          <p className="text-xs text-gray-500 truncate">Tailor the deck to a specific subject and strand</p>
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
      {checked && (
        <div className="px-3 pb-3 pt-3 space-y-2" style={{ borderTop: "1px solid #F0EFE8" }}>
          {/* Row 1: country · curriculum · grade */}
          <div className="grid grid-cols-3 gap-2">
            <CountryDropdown
              value={countryId}
              onChange={onCountryChange}
              disabled={disabled}
            />
            <select
              value={curriculumId}
              onChange={(e) => onCurriculumChange(e.target.value)}
              disabled={disabled || curricula.length === 0}
              className={selectCls}
              style={{ borderColor: "#DAD8D0" }}
            >
              {curricula.length === 0 ? (
                <option value="">No curriculum available</option>
              ) : (
                curricula.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))
              )}
            </select>
            <select
              value={grade}
              onChange={(e) => onGradeChange(e.target.value)}
              disabled={disabled}
              className={selectCls}
              style={{ borderColor: "#DAD8D0" }}
            >
              <option value="">Select grade</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Row 2: subject (full width) — auto-suggested from the topic */}
          <div className="relative">
            <select
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              disabled={disabled || subjects.length === 0}
              className={selectCls}
              style={{ borderColor: "#DAD8D0" }}
            >
              <option value="">{suggesting ? "Finding best subject…" : "Select subject"}</option>
              {subjects.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
            {suggesting && (
              <Loader2 className="w-4 h-4 text-gray-400 animate-spin absolute right-7 top-1/2 -translate-y-1/2 pointer-events-none" />
            )}
          </div>

          {/* Row 3: strand (full width, cascades off subject) */}
          <select
            value={strand}
            onChange={(e) => onStrandChange(e.target.value)}
            disabled={disabled || !subject || strands.length === 0}
            className={selectCls}
            style={{ borderColor: "#DAD8D0" }}
          >
            <option value="">{subject ? "Select strand" : "Pick a subject first"}</option>
            {strands.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Footer: "Can't see a standard?" tooltip — purely informational */}
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setHintOpen((v) => !v)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-60"
            >
              <HelpCircle className="w-3 h-3" />
              Can&apos;t see a standard?
            </button>
            {hintOpen && (
              <div
                className="absolute z-10 left-0 mt-1 w-72 p-3 bg-white rounded-xl border shadow-lg"
                style={{ borderColor: "#DAD8D0" }}
              >
                <p className="text-xs font-semibold text-gray-900 mb-1">Don&apos;t worry — this is optional</p>
                <p className="text-[11px] text-gray-600 leading-snug">
                  Jooma still designs accurate, classroom-ready decks without a curriculum strand attached.
                  Leave the toggle off if your topic doesn&apos;t fit a standard.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
