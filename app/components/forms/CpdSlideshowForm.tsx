"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TopicField, LessonCountField, AdditionalContextField } from "@/app/components/fields";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { parseLanguage } from "@/app/lib/languages";
import { createPresentation } from "@/app/lib/presentations";
import { GENERATION_STORAGE_KEY, type GenerationParams } from "@/app/components/slideshow/GenerateModal";
import LegacyStaffSlides from "@/app/components/staff-slides/LegacyStaffSlides";
import type { SlideData } from "@/app/lib/legacy-staff-slides";

const TOOL_SLUG = "cpd-slideshow";

type PresentationFocus = "Practical application" | "Research and theory";

/*
 * Staff Slides: a staff training (CPD) deck made by the main Slides engine
 * (app/lib/staff-deck-prompt.ts) with speaker notes on every slide. This form
 * creates the presentation and opens it in the slide editor, where it can be
 * themed, edited, presented, exported and changed with Jo. Its run is saved
 * under this tool by the editor, so the history here reopens it there.
 *
 * Decks made before (a JSON array in the run's output) open read-only in
 * LegacyStaffSlides.
 */
export default function CpdSlideshowForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(6);
  const [additionalFocus, setAdditionalFocus] = useState("");
  const [presentationFocus, setPresentationFocus] = useState<PresentationFocus>("Practical application");

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [legacy, setLegacy] = useState<{ slides: SlideData[]; title: string } | null>(null);
  const [language, setLanguage] = useGenerationLanguage();

  const restore = (run: ToolRun) => {
    const i = run.input ?? {};
    // A deck made by the slide editor: open it there.
    if (typeof i.presentationId === "string" && i.presentationId) {
      router.push(`/editor/${i.presentationId}`);
      return;
    }
    // An old deck: refill the form and show it read-only.
    setLanguage(parseLanguage(i.language));
    setTopic((i.topic as string) ?? "");
    setSlideCount(Math.max(3, Math.min(15, Number(i.slideCount) || 6)));
    setAdditionalFocus((i.additionalFocus as string) ?? "");
    setPresentationFocus(i.presentationFocus === "Research and theory" ? "Research and theory" : "Practical application");
    try {
      const slides = JSON.parse(run.output) as SlideData[];
      setLegacy(Array.isArray(slides) && slides.length ? { slides, title: (i.topic as string) ?? "" } : null);
    } catch {
      setLegacy(null);
    }
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      topic: (v) => setTopic(v as string),
      slideCount: (v) => setSlideCount(Math.max(3, Math.min(15, Number(v) || 6))),
      presentationFocus: (v) => setPresentationFocus(v === "Research and theory" ? "Research and theory" : "Practical application"),
    },
  });

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setError(null);
    setIsGenerating(true);
    const params: GenerationParams = {
      topic: topic.trim(),
      deckKind: "staff",
      staffFocus: presentationFocus === "Research and theory" ? "research" : "practical",
      slideCount,
      additionalInstructions: additionalFocus.trim() || undefined,
      language,
      // Real photographs from the web: free, and right for adults.
      imageSource: "web",
    };
    try {
      const created = await createPresentation({
        title: "Generating…",
        slides: [],
        generationParams: params as unknown as Record<string, unknown>,
      });
      sessionStorage.setItem(`${GENERATION_STORAGE_KEY}:${created.id}`, JSON.stringify(params));
      router.push(`/editor/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
        <div className="lg:col-span-1">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} onRestore={restore} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">
            {prefilled && <PrefilledBadge />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <TopicField
              value={topic}
              onChange={setTopic}
              placeholders={[
                "e.g. Adaptive teaching strategies for mixed-ability classrooms",
                "e.g. Metacognition and self-regulated learning",
                "e.g. Effective feedback and marking strategies",
                "e.g. Supporting SEND pupils in mainstream classrooms",
              ]}
            />

            <LessonCountField
              value={slideCount}
              onChange={setSlideCount}
              label="Number of slides"
              unit="slides"
              min={3}
              max={15}
            />

            <AdditionalContextField
              value={additionalFocus}
              onChange={setAdditionalFocus}
              label="Additional focus areas"
              rows={3}
              placeholders={[
                "e.g. Include practical activities, focus on KS3 application",
                "e.g. Add time for group reflection and discussion",
                "e.g. Reference the Teachers' Standards throughout",
                "e.g. Include a slide on common misconceptions",
              ]}
            />

            <div className="space-y-1.5">
              <span className="block text-sm font-semibold text-gray-800">Presentation focus</span>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 pt-1">
                {(["Practical application", "Research and theory"] as PresentationFocus[]).map((val) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="presentationFocus" checked={presentationFocus === val}
                      onChange={() => setPresentationFocus(val)} className="accent-gray-900" />
                    <span className="text-sm text-gray-700">{val}</span>
                  </label>
                ))}
              </div>
            </div>

            <p className="text-xs text-gray-500">
              Opens in the slide editor with a discussion task, pictures and speaker notes on every slide. Change the theme, edit, present, ask Jo or download it for PowerPoint (with the notes) from there.
            </p>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!topic && !legacy} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setTopic(""); setSlideCount(6); setAdditionalFocus("");
                  setPresentationFocus("Practical application");
                  setLegacy(null); setError(null); setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton
                onClick={handleGenerate}
                disabled={!topic.trim() || isGenerating}
                isGenerating={isGenerating}
                hasResult={false}
              />
            </div>
          </Card>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">{error}</div>
      )}

      {legacy && (
        <LegacyStaffSlides slides={legacy.slides} filename={`cpd-${legacy.title.slice(0, 30).replace(/\s+/g, "-") || "slideshow"}`} />
      )}
    </div>
  );
}
