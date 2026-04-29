"use client";

import { useState } from "react";
import { CURRICULA } from "@/app/lib/formOptions";
import { useLocalStorage } from "@/app/lib/useLocalStorage";
import { Loader2, Sparkles, Minus, Plus } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";

const REFINE_CHIPS = [
  "Provide more words",
  "Provide simpler words that use this phoneme",
  "Provide more complex words that use this phoneme",
  "Make the activities more interactive",
  "Add more pseudo-words",
  "Simplify the decodable text",
];

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function PhonicsForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [curriculum, setCurriculum] = useLocalStorage("ll:curriculum", "");
  const [age, setAge] = useState(5);
  const [grapheme, setGrapheme] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate = curriculum && grapheme.trim();

  const formSnapshot = JSON.stringify({ curriculum, age, grapheme });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleAgeChange = (delta: number) => {
    setAge((prev) => Math.min(18, Math.max(3, prev + delta)));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/phonics-support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculum, age, grapheme: grapheme.trim() }),
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

            {/* Curriculum + Age row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Curriculum</label>
                <select value={curriculum} onChange={(e) => setCurriculum(e.target.value)} className={selectClass}>
                  <option value="" disabled>Select curriculum</option>
                  {CURRICULA.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Age of students</label>
                <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => handleAgeChange(-1)}
                    disabled={age <= 3}
                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-r border-gray-300"
                    aria-label="Decrease age"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="flex-1 text-center text-sm font-medium text-gray-900 py-2">
                    {age}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAgeChange(1)}
                    disabled={age >= 18}
                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-l border-gray-300"
                    aria-label="Increase age"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Grapheme input */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Grapheme representing the target phoneme/sound
              </label>
              <input
                type="text"
                value={grapheme}
                onChange={(e) => setGrapheme(e.target.value)}
                placeholder="e.g. sh, ch, oo, th"
                className={inputClass}
              />
              <p className="text-xs text-gray-400">
                Enter the grapheme you want to teach, e.g. &apos;sh&apos;, &apos;ch&apos;, &apos;oo&apos;, &apos;ay&apos;
              </p>
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
                  setCurriculum("");
                  setAge(5);
                  setGrapheme("");
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
        exportFilename={`phonics-support-${grapheme || "export"}`}
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
