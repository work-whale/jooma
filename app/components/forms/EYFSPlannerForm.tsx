"use client";

import { useState } from "react";
import { CURRICULA } from "@/app/lib/formOptions";
import { Minus, Plus } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import EYFSNav from "@/app/components/EYFSNav";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "eyfs-planner";

export default function EYFSPlannerForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [curriculum, setCurriculum] = useState("Early Years Foundation Stage (EYFS)");
  const [topic, setTopic] = useState("");
  const [numberOfWeeks, setNumberOfWeeks] = useState("2");
  const [includeBookList, setIncludeBookList] = useState(false);
  const [includeHomeLearning, setIncludeHomeLearning] = useState(false);
  const [includeWeeklyOverview, setIncludeWeeklyOverview] = useState(false);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const weeksNum = parseInt(numberOfWeeks, 10);
  const canGenerate = curriculum && topic.trim() && !isNaN(weeksNum) && weeksNum >= 1 && weeksNum <= 12;

  // Raw form state — saved as history input so a past run can refill the form.
  const formState = { curriculum, topic, numberOfWeeks, includeBookList, includeHomeLearning, includeWeeklyOverview };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "Early Years Foundation Stage (EYFS)");
    setTopic((i.topic as string) ?? "");
    setNumberOfWeeks((i.numberOfWeeks as string) ?? "2");
    setIncludeBookList(Boolean(i.includeBookList));
    setIncludeHomeLearning(Boolean(i.includeHomeLearning));
    setIncludeWeeklyOverview(Boolean(i.includeWeeklyOverview));
    setResult(run.output);
    setLastGenerated(JSON.stringify(i));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/eyfs-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculum, topic, numberOfWeeks: weeksNum, includeBookList, includeHomeLearning, includeWeeklyOverview }),
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

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";


  const adjustWeeks = (delta: number) => {
    const current = parseInt(numberOfWeeks, 10) || 1;
    setNumberOfWeeks(String(Math.min(12, Math.max(1, current + delta))));
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Curriculum</label>
                <select value={curriculum} onChange={(e) => setCurriculum(e.target.value)} className={inputClass}>
                  {CURRICULA.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Topic</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g. Autumn, mini beasts, my community"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Number of weeks</label>
              <div className="flex items-center gap-0">
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={numberOfWeeks}
                  onChange={(e) => setNumberOfWeeks(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(numberOfWeeks, 10);
                    setNumberOfWeeks(String(isNaN(n) ? 1 : Math.min(12, Math.max(1, n))));
                  }}
                  className="w-24 border border-gray-200 rounded-l-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent text-center"
                />
                <button
                  type="button"
                  onClick={() => adjustWeeks(-1)}
                  disabled={weeksNum <= 1}
                  className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => adjustWeeks(1)}
                  disabled={weeksNum >= 12}
                  className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 rounded-r-md text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-gray-400">Between 1 and 12 weeks</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-800">Additional content</label>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {[
                  { label: "Include Book List", value: includeBookList, set: setIncludeBookList },
                  { label: "Include Home Learning Ideas", value: includeHomeLearning, set: setIncludeHomeLearning },
                  { label: "Include Weekly Overview", value: includeWeeklyOverview, set: setIncludeWeeklyOverview },
                ].map(({ label, value, set }) => (
                  <label key={label} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={value}
                      onChange={(e) => set(e.target.checked)}
                      className="accent-gray-900 w-4 h-4"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum("Early Years Foundation Stage (EYFS)");
                  setTopic("");
                  setNumberOfWeeks("2");
                  setIncludeBookList(false);
                  setIncludeHomeLearning(false);
                  setIncludeWeeklyOverview(false);
                  setResult(null);
                  setError(null);
                  setConfirmingReset(false);
                }}
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

      <div className={result !== null ? "flex gap-8" : ""}>
        {result !== null && (
          <div className="w-md shrink-0">
            <div className="sticky top-8">
              <EYFSNav
                includeBookList={includeBookList}
                includeHomeLearning={includeHomeLearning}
                includeWeeklyOverview={includeWeeklyOverview}
              />
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <ResultPanel
            result={result}
            isGenerating={isGenerating}
            onChange={(md) => setResult(md)}
            exportFilename={`eyfs-plan-${topic || "export"}`}
            maxWidth={false}
            historyMeta={{ toolSlug: TOOL_SLUG, title: topic || null, input: formState }}
            onSaved={() => setHistoryKey((k) => k + 1)}
          />
        </div>
      </div>
    </div>
  );
}
