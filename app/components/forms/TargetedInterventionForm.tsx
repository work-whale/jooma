"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { toTitleCase } from "@/app/lib/formOptions";
import { Loader2, Sparkles } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";

const REFINE_CHIPS = [
  "Add more strategies",
  "Make strategies more specific",
  "Focus on pastoral support",
  "Focus on academic support",
  "Make strategies more suitable for SEND learners",
  "Include strategies for parental engagement",
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function TargetedInterventionForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [attitudinalData, setAttitudinalData] = useState("");
  const [aptitudinalData, setAptitudinalData] = useState("");
  const [attainmentData, setAttainmentData] = useState("");
  const [otherData, setOtherData] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate =
    curriculum && (mixed || yearGroup) && subject.trim() && attitudinalData.trim();

  const formSnapshot = JSON.stringify({
    curriculum, yearGroup, mixed, subject,
    attitudinalData, aptitudinalData, attainmentData, otherData,
  });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/targeted-intervention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          attitudinalData,
          aptitudinalData: aptitudinalData.trim() || undefined,
          attainmentData: attainmentData.trim() || undefined,
          otherData: otherData.trim() || undefined,
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
    setAttitudinalData("");
    setAptitudinalData("");
    setAttainmentData("");
    setOtherData("");
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
                placeholder="e.g. Science, Maths, English"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Attitudinal data</label>
              <textarea
                value={attitudinalData}
                onChange={(e) => setAttitudinalData(e.target.value)}
                placeholder="Describe what you know about their attitude to themselves, school and their studies. e.g. low self-regard as a learner, positive attitude to attending school, good peer relationships, or Scores out of 100: learner self-regard 50, attitude to curriculum 90"
                rows={4}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">
                If you include numerical survey data here, explain what the scores are for and what they are out of.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Aptitudinal data <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={aptitudinalData}
                onChange={(e) => setAptitudinalData(e.target.value)}
                placeholder="Describe what you know of their aptitude and general skills, abilities and potential here. e.g. Scores out of 100: verbal reasoning 70, spatial reasoning 90, numerical reasoning 50, non-verbal reasoning 25, or Target grade A*"
                rows={4}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">
                If you include numerical survey data here, explain what the scores are for and what they are out of.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Attainment data <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={attainmentData}
                onChange={(e) => setAttainmentData(e.target.value)}
                placeholder="Describe what you know of their work in your subject so far. You may want to use comments from a report here. e.g. struggles with evaluation work, strong at recording their reasoning, struggles with complex theories, working at grade D"
                rows={4}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Other relevant data <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea
                value={otherData}
                onChange={(e) => setOtherData(e.target.value)}
                placeholder="Any other relevant information — e.g. SEND needs, EAL status, attendance, pastoral notes, family context"
                rows={3}
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
                message="This will clear your current results and reset all form inputs."
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
        exportFilename={`intervention-${subject || "export"}`}
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
