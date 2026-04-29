"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { toTitleCase } from "@/app/lib/formOptions";
import { Loader2, Sparkles } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";

const HOMEWORK_TYPES = [
  "Worksheet-style questions",
  "Short written task",
  "Creative task",
  "Practical investigation",
  "Research homework",
  "Reading comprehension",
  "Mixed tasks",
  "Exam-style practice",
];

const LENGTH_OPTIONS = [
  { label: "Quick task (10 minutes)", value: "Quick task (10 minutes)" },
  { label: "Standard task (20 minutes)", value: "Standard task (20 minutes)" },
  { label: "Extended task (30 minutes)", value: "Extended task (30 minutes)" },
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function HomeworkGeneratorForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [learningObjective, setLearningObjective] = useState("");
  const [homeworkType, setHomeworkType] = useState("");
  const [length, setLength] = useState("");
  const [includeAnswers, setIncludeAnswers] = useState<"yes" | "no">("no");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [lessonContent, setLessonContent] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate =
    curriculum &&
    (mixed || yearGroup) &&
    subject.trim() &&
    learningObjective.trim() &&
    homeworkType &&
    length;

  const formSnapshot = JSON.stringify({
    curriculum, yearGroup, mixed, subject, learningObjective,
    homeworkType, length, includeAnswers, additionalInstructions, lessonContent,
  });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/homework-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          learningObjective,
          homeworkType,
          length,
          includeAnswers: includeAnswers === "yes",
          additionalInstructions: additionalInstructions.trim() || undefined,
          lessonContent: lessonContent.trim() || undefined,
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

  const handleReset = () => {
    setCurriculum("");
    setYearGroup("");
    setMixed(false);
    setSubject("");
    setLearningObjective("");
    setHomeworkType("");
    setLength("");
    setIncludeAnswers("no");
    setAdditionalInstructions("");
    setLessonContent("");
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
                placeholder="e.g. Maths, Science, English Reading"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Learning Objective</label>
              <input
                type="text"
                value={learningObjective}
                onChange={(e) => setLearningObjective(e.target.value)}
                placeholder="e.g. Equivalent fractions, Life cycles, Fronted adverbials"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Homework Type</label>
                <select value={homeworkType} onChange={(e) => setHomeworkType(e.target.value)} className={selectClass}>
                  <option value="" disabled>Select type</option>
                  {HOMEWORK_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Length / Effort Level</label>
                <select value={length} onChange={(e) => setLength(e.target.value)} className={selectClass}>
                  <option value="" disabled>Select length</option>
                  {LENGTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-2">
              <label className="block text-sm font-semibold text-gray-800">Include Answers?</label>
              <div className="flex gap-6">
                {(["yes", "no"] as const).map((val) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input
                      type="radio"
                      name="includeAnswers"
                      value={val}
                      checked={includeAnswers === val}
                      onChange={() => setIncludeAnswers(val)}
                      className="accent-gray-900"
                    />
                    {val === "yes" ? "Yes — provide answers" : "No — student-only version"}
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Additional Instructions <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder={`e.g. "Include a challenge task." / "Suitable for SEND learners." / "Add a retrieval question at the start."`}
                rows={3}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Paste lesson plan / worksheet / slides <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={lessonContent}
                onChange={(e) => setLessonContent(e.target.value)}
                placeholder="Paste your lesson plan, worksheet, or slide notes here and the AI will use them to create the homework."
                rows={5}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
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
                message="This will clear your current homework and reset all form inputs."
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
        onChange={(md) => setResult(md)}
        exportFilename={`homework-${subject || "export"}`}
      />
    </div>
  );
}
