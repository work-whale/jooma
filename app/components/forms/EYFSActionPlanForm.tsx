"use client";

import { useState } from "react";
import {
  CurriculumField,
  EyfsObjectiveField,
} from "@/app/components/fields";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import { useLocalStorage } from "@/app/lib/useLocalStorage";

const REFINE_CHIPS = [
  "Translate to...",
  "Make the action plan more detailed",
  "Simplify the language",
  "Add more specific resources",
  "Extend the timeline",
  "Focus more on staff development",
];

export default function EYFSActionPlanForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [curriculum, setCurriculum] = useLocalStorage("ll:curriculum", "");
  const [objective, setObjective] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate = curriculum && objective.trim();
  const formSnapshot = JSON.stringify({ curriculum, objective });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/eyfs-action-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculum, objective }),
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
        setResult((prev) => (prev ?? "") + decoder.decode(value, { stream: true }));
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

            <CurriculumField value={curriculum} onChange={setCurriculum} />

            <EyfsObjectiveField value={objective} onChange={setObjective} />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setObjective("");
                  setResult(null);
                  setError(null);
                  setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating || unchangedSinceGeneration}
                isGenerating={isGenerating}
                hasResult={result !== null}
              />
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
        exportFilename="eyfs-action-plan"
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
