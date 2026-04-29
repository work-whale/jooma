"use client";

import { useState } from "react";
import { Loader2, Sparkles, Minus, Plus } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";

const STAGE_OPTIONS = [
  "Early Years",
  "KS1",
  "KS2",
  "Primary",
  "KS3",
  "KS4",
  "Secondary",
  "All-through School",
  "Special School",
  "Alternative Provision",
];

const REFINE_CHIPS = [
  "Make the assembly longer",
  "Make the assembly shorter",
  "Make the assembly more suitable for older students",
  "Make it more suitable for younger students",
  "Include more...",
  "Link the story to...",
];

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function AssemblyPlannerForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [theme, setTheme] = useState("");
  const [stageOfSchool, setStageOfSchool] = useState("Primary");
  const [lengthMinutes, setLengthMinutes] = useState(20);
  const [additionalNotes, setAdditionalNotes] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate = theme.trim();
  const formSnapshot = JSON.stringify({ theme, stageOfSchool, lengthMinutes, additionalNotes });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const adjustLength = (delta: number) => {
    setLengthMinutes((prev) => Math.max(5, Math.min(120, prev + delta)));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/assembly-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, stageOfSchool, lengthMinutes, additionalNotes }),
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

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">{sidebar}</div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Stage of school</label>
                <select value={stageOfSchool} onChange={(e) => setStageOfSchool(e.target.value)} className={selectClass}>
                  {STAGE_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Length of assembly (minutes)</label>
                <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => adjustLength(-5)}
                    disabled={lengthMinutes <= 5}
                    className="px-3 py-2 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 border-r border-gray-300"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={lengthMinutes}
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setLengthMinutes(Math.max(5, Math.min(120, v)));
                    }}
                    className="flex-1 text-center text-sm text-gray-900 py-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-gray-300"
                  />
                  <button
                    type="button"
                    onClick={() => adjustLength(5)}
                    disabled={lengthMinutes >= 120}
                    className="px-3 py-2 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40 border-l border-gray-300"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Theme</label>
              <textarea
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="e.g. Treating people with respect in schools, anti-bullying or using social media responsibly"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Additional Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="e.g. include a reference to our school motto, link to Black History Month"
                className={inputClass}
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
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setTheme("");
                  setStageOfSchool("Primary");
                  setLengthMinutes(20);
                  setAdditionalNotes("");
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
        exportFilename="assembly-plan"
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
              // silently fail
            } finally {
              setIsRefining(false);
            }
          }}
        />
      )}
    </div>
  );
}
