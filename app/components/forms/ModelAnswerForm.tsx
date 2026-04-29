"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { toTitleCase } from "@/app/lib/formOptions";
import { Loader2, Sparkles, Minus, Plus } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";

const REFINE_CHIPS = [
  "Translate to...",
  "Improve the answer to score more marks",
  "Make the answer simpler to score fewer marks",
  "Ensure the answer includes...",
  "Make the answer more detailed",
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function ModelAnswerForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [contentRequirements, setContentRequirements] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [totalMarks, setTotalMarks] = useState(10);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate = curriculum && (mixed || yearGroup) && subject.trim() && question.trim();

  const formSnapshot = JSON.stringify({ curriculum, yearGroup, mixed, subject, question, contentRequirements, guidelines, totalMarks });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleMarksChange = (delta: number) => {
    setTotalMarks((prev) => Math.min(50, Math.max(1, prev + delta)));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/model-answer-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          question,
          contentRequirements,
          guidelines,
          totalMarks,
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
                placeholder="e.g. Psychology"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Question to answer</label>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. Explain how the structure of DNA allows genetic information to be stored and copied. [6 marks]"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Content requirements <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={contentRequirements}
                onChange={(e) => setContentRequirements(e.target.value)}
                placeholder="e.g. Paste relevant mark scheme criteria, exam specification content, or subject-specific guidance here"
                rows={4}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Guidelines <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
                placeholder="e.g. Write approximately 300 words across 3 paragraphs, using subject-specific terminology throughout"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Total marks (max 50)</label>
              <div className="flex items-center gap-0 border border-gray-300 rounded-md overflow-hidden w-48">
                <span className="flex-1 px-3 py-2 text-sm text-gray-900">{totalMarks}</span>
                <button
                  type="button"
                  onClick={() => handleMarksChange(-1)}
                  disabled={totalMarks <= 1}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-l border-gray-300"
                  aria-label="Decrease marks"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMarksChange(1)}
                  disabled={totalMarks >= 50}
                  className="px-3 py-2 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-l border-gray-300"
                  aria-label="Increase marks"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-1">
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
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum("");
                  setYearGroup("");
                  setMixed(false);
                  setSubject("");
                  setQuestion("");
                  setContentRequirements("");
                  setGuidelines("");
                  setTotalMarks(10);
                  setResult(null);
                  setError(null);
                  setConfirmingReset(false);
                }}
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
        exportFilename={`model-answer-${subject || "export"}`}
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
