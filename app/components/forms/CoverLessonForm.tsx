"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { toTitleCase } from "@/app/lib/formOptions";
import { Loader2, Sparkles } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";

const LESSON_LENGTHS = [
  "30 minutes",
  "45 minutes",
  "50 minutes",
  "60 minutes",
  "75 minutes",
];

const RESOURCES = [
  "No resources needed (verbal / discussion only)",
  "Basic stationery only (pen and paper)",
  "Printed worksheets provided",
  "Computers or tablets available",
  "Whiteboard / projector only",
];

const REFINE_CHIPS = [
  "Make instructions simpler",
  "Add more structured activities",
  "Make it more suitable for a challenging class",
  "Add a creative task",
  "Include more discussion activities",
  "Make it suitable for SEND learners",
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function CoverLessonForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [lessonLength, setLessonLength] = useState("");
  const [resources, setResources] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate =
    curriculum && (mixed || yearGroup) && subject.trim() && topic.trim() && lessonLength && resources;

  const formSnapshot = JSON.stringify({
    curriculum, yearGroup, mixed, subject, topic, lessonLength, resources, additionalContext,
  });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/cover-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          topic,
          lessonLength,
          resources,
          additionalContext: additionalContext.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true }).replace(/\u00A9/g, "(c)");
        setResult((prev) => (prev ?? "") + chunk);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!result) return;
    setIsRefining(true);
    try {
      const res = await fetch("/api/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentContent: result, instruction }),
      });
      if (!res.ok) throw new Error("Refinement failed");
      let refined = "";
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        refined += decoder.decode(value, { stream: true });
        setResult(refined);
      }
    } catch {
      // result stays as-is
    } finally {
      setIsRefining(false);
    }
  };

  const handleReset = () => {
    setCurriculum("");
    setYearGroup("");
    setMixed(false);
    setSubject("");
    setTopic("");
    setLessonLength("");
    setResources("");
    setAdditionalContext("");
    setResult(null);
    setError(null);
    setConfirmingReset(false);
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">{sidebar}</div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <CurriculumYearFields
              curriculum={curriculum} onCurriculumChange={setCurriculum}
              yearGroup={yearGroup} onYearGroupChange={setYearGroup}
              mixed={mixed} onMixedChange={setMixed}
              yearGroupNote
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Science, English, History"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Topic the class is currently studying</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. The Water Cycle, World War Two, Photosynthesis"
                className={inputClass}
              />
              <p className="text-xs text-gray-400">This helps the AI generate activities that connect to what pupils are already learning.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Lesson length</label>
                <select value={lessonLength} onChange={(e) => setLessonLength(e.target.value)} className={selectClass}>
                  <option value="" disabled>Select length</option>
                  {LESSON_LENGTHS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Resources available</label>
                <select value={resources} onChange={(e) => setResources(e.target.value)} className={selectClass}>
                  <option value="" disabled>Select resources</option>
                  {RESOURCES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Additional context <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder={`e.g. "This is a top set." / "The class can be challenging — keep activities short." / "Pupils have been revising for an upcoming test."`}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                disabled={!result}
                className="border border-gray-200 text-gray-600 py-3 px-5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Reset
              </button>
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current cover lesson and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={handleReset}
                onCancel={() => setConfirmingReset(false)}
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating || unchangedSinceGeneration}
                className="flex-1 bg-[#1a1a1a] text-white py-3 px-6 rounded-xl text-sm font-semibold hover:bg-gray-800 active:bg-gray-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isGenerating
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
                  : <><Sparkles className="w-4 h-4" />{result ? "Regenerate" : "Generate"}</>}
              </button>
            </div>
          </Card>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">{error}</div>
      )}

      {result !== null && (
        <div className="sticky top-0 z-20 h-8 -mx-10" style={{ backgroundColor: "#F1EFE3" }} />
      )}

      <ResultPanel
        result={result}
        isGenerating={isGenerating}
        isRefining={isRefining}
        onChange={(md) => setResult(md)}
        exportFilename={`cover-lesson-${subject || "export"}`}
      />

      {result && !isGenerating && (
        <RefinePanel
          isRefining={isRefining}
          chips={REFINE_CHIPS}
          onRefine={handleRefine}
        />
      )}
    </div>
  );
}
