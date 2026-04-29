"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import ResultPanel from "@/app/components/ResultPanel";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";

const REFINE_CHIPS = [
  "Translate to...",
  "Include the following risk...",
  "Make the risk assessment more detailed",
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function RiskAssessmentForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);

  const [activity, setActivity] = useState("");
  const [transport, setTransport] = useState("");
  const [location, setLocation] = useState("");
  const [resources, setResources] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const resolvedYearGroup = mixed ? "Mixed year group" : yearGroup;
  const canGenerate = curriculum.trim() && resolvedYearGroup.trim() && activity.trim();
  const formSnapshot = JSON.stringify({ curriculum, yearGroup, mixed, activity, transport, location, resources });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const streamResponse = async (body: object, onChunk: (c: string) => void) => {
    const res = await fetch("/api/risk-assessment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || "Request failed");
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      await streamResponse(
        { action: "generate", curriculum, yearGroup: resolvedYearGroup, activity, transport, location, resources },
        (chunk) => setResult((prev) => (prev ?? "") + chunk),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!result || !instruction.trim()) return;
    setIsRefining(true);
    setResult("");
    try {
      await streamResponse(
        { action: "refine", result, instruction },
        (chunk) => setResult((prev) => (prev ?? "") + chunk),
      );
    } catch {
      // silently ignore
    } finally {
      setIsRefining(false);
      setRefineInstruction("");
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">{sidebar}</div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <CurriculumYearFields
              curriculum={curriculum}
              onCurriculumChange={setCurriculum}
              yearGroup={yearGroup}
              onYearGroupChange={setYearGroup}
              mixed={mixed}
              onMixedChange={setMixed}
              yearGroupNote
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Activity or trip</label>
              <input
                type="text"
                value={activity}
                onChange={(e) => setActivity(e.target.value)}
                placeholder="e.g. Visit to the local zoo, science experiment with Bunsen burners"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Mode of transport for school trip</label>
                <input
                  type="text"
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  placeholder="e.g. Coach, walking, public transport"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Location if school based</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Science lab, school field, sports hall"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Resources if school based</label>
              <input
                type="text"
                value={resources}
                onChange={(e) => setResources(e.target.value)}
                placeholder="e.g. Scissors, Bunsen burners, climbing equipment"
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
                  setActivity(""); setTransport(""); setLocation(""); setResources("");
                  setResult(null); setError(null); setConfirmingReset(false);
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
        exportFilename={`risk-assessment-${activity.slice(0, 30).replace(/\s+/g, "-") || "activity"}`}
      />

      {result && !isGenerating && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-gray-900">Want to refine your results?</h3>
          <p className="text-sm font-medium text-gray-600">What would you like to change?</p>
          <textarea
            value={refineInstruction}
            onChange={(e) => setRefineInstruction(e.target.value)}
            placeholder="Type changes here"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent resize-none bg-white"
          />
          <div className="flex flex-wrap gap-2">
            {REFINE_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setRefineInstruction(chip)}
                className="text-xs text-gray-600 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-100 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => handleRefine(refineInstruction)}
            disabled={isRefining || !refineInstruction.trim()}
            className="bg-[#1a1a1a] text-white py-2 px-6 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isRefining ? <><Loader2 className="w-4 h-4 animate-spin" />Refining...</> : "Refine results"}
          </button>
        </div>
      )}
    </div>
  );
}
