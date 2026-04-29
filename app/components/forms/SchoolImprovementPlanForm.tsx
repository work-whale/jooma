"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";

const SCHOOL_TYPES = [
  "Primary",
  "Secondary",
  "All-through School",
  "Special School",
  "Alternative Provision",
  "Nursery",
  "Sixth Form / FE College",
];

const REFINE_CHIPS = [
  "Make the strategies and actions more detailed",
  "Include more specific reference to...",
  "Make the timeframes of targets shorter",
  "Include further suggestions for strategies to...",
  "Translate to...",
];

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function SchoolImprovementPlanForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [schoolType, setSchoolType] = useState("Primary");
  const [areasToImprove, setAreasToImprove] = useState("");
  const [schoolContext, setSchoolContext] = useState("");
  const [planTimeframe, setPlanTimeframe] = useState(1);
  const [outputFormat, setOutputFormat] = useState<"table" | "narrative">("table");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate = areasToImprove.trim();
  const formSnapshot = JSON.stringify({ schoolType, areasToImprove, schoolContext, planTimeframe, outputFormat });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/school-improvement-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schoolType, areasToImprove, schoolContext, planTimeframe, outputFormat }),
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

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">School type</label>
              <select value={schoolType} onChange={(e) => setSchoolType(e.target.value)} className={selectClass}>
                {SCHOOL_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Areas to improve</label>
              <textarea
                value={areasToImprove}
                onChange={(e) => setAreasToImprove(e.target.value)}
                placeholder="e.g. attendance, reading outcomes in KS2, behaviour and attitudes"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent resize-none bg-white"
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                School context <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={schoolContext}
                onChange={(e) => setSchoolContext(e.target.value)}
                placeholder="Key information about the school's size, demographics, and previous inspection outcomes"
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent resize-none bg-white"
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Plan timeframe (years)</label>
              <input
                type="number"
                min={1}
                max={5}
                value={planTimeframe}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) setPlanTimeframe(Math.max(1, Math.min(5, v)));
                }}
                className={`${inputClass} w-32`}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-800">Output format</label>
              <div className="flex flex-wrap gap-6">
                {[
                  { value: "table", label: "Table format", sub: "a briefer summary" },
                  { value: "narrative", label: "Narrative format", sub: "a more detailed plan" },
                ].map(({ value, label, sub }) => (
                  <label key={value} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="outputFormat"
                      value={value}
                      checked={outputFormat === value}
                      onChange={() => setOutputFormat(value as "table" | "narrative")}
                      className="mt-0.5 accent-gray-900"
                    />
                    <span className="text-sm text-gray-700">
                      {label} <span className="text-gray-400">({sub})</span>
                    </span>
                  </label>
                ))}
              </div>
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
                  setSchoolType("Primary");
                  setAreasToImprove("");
                  setSchoolContext("");
                  setPlanTimeframe(1);
                  setOutputFormat("table");
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
        exportFilename="school-improvement-plan"
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
