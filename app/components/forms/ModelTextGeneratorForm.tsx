"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { AbilityLevelField, WriteField, FeaturesField, WordCountField } from "@/app/components/fields";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";

const REFINE_CHIPS = [
  "Make more concise",
  "Make longer",
  "Increase the complexity",
  "Reduce the complexity",
  "Add more examples",
  "Translate to French",
];

export default function ModelTextGeneratorForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [write, setWrite] = useState("");
  const [features, setFeatures] = useState("");
  const [keywords, setKeywords] = useState("");
  const [abilityLevel, setAbilityLevel] = useState("EXS");
  const [lengthWords, setLengthWords] = useState("500");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const lengthNum = parseInt(lengthWords, 10);
  const canGenerate =
    curriculum && (mixed || yearGroup) && write.trim() &&
    !isNaN(lengthNum) && lengthNum >= 50 && lengthNum <= 5000;

  const formSnapshot = JSON.stringify({ curriculum, yearGroup, mixed, write, features, keywords, abilityLevel, lengthWords });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/model-text-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          write,
          features,
          keywords: keywords.trim() || null,
          abilityLevel,
          lengthWords: lengthNum,
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

            <WriteField value={write} onChange={setWrite} />
            <FeaturesField value={features} onChange={setFeatures} />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Keywords to include <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. photosynthesis, chlorophyll, organism"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white resize-none"
              />
            </div>

            <AbilityLevelField value={abilityLevel} onChange={setAbilityLevel} />
            <WordCountField value={lengthWords} onChange={setLengthWords} />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => { setCurriculum(""); setYearGroup(""); setMixed(false); setWrite(""); setFeatures(""); setKeywords(""); setAbilityLevel("EXS"); setLengthWords("500"); setResult(null); setError(null); setConfirmingReset(false); }}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton onClick={handleGenerate} disabled={!canGenerate || isGenerating || unchangedSinceGeneration} isGenerating={isGenerating} hasResult={result !== null} />
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
        exportFilename={`model-text-${write.slice(0, 30).replace(/\s+/g, "-") || "export"}`}
      />

      {result && !isGenerating && (
        <RefinePanel
          isRefining={isRefining}
          chips={REFINE_CHIPS}
          onRefine={async (instruction) => {
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
              // silently fail — result stays as-is
            } finally {
              setIsRefining(false);
            }
          }}
        />
      )}
    </div>
  );
}
