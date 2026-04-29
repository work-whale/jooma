"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import ResultPanel from "@/app/components/ResultPanel";
import { CURRICULA } from "@/app/lib/formOptions";
import { useLocalStorage } from "@/app/lib/useLocalStorage";

type OutputType = "full" | "structure";

const REFINE_CHIPS = [
  "Translate to...",
  "Expand this framework by drafting the text for each of these sections:",
  "Include the following sections:",
  "Remove the following sections:",
  "Include more of a focus on...",
  "Change the tone to be more...",
];

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function PolicyGeneratorForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [curriculum, setCurriculum] = useLocalStorage("ll:curriculum", "");
  const [policy, setPolicy] = useState("");
  const [additionalRequirements, setAdditionalRequirements] = useState("");
  const [outputType, setOutputType] = useState<OutputType>("full");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate = curriculum.trim() && policy.trim();
  const formSnapshot = JSON.stringify({ curriculum, policy, additionalRequirements, outputType });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

  const streamResponse = async (url: string, body: object, onChunk: (chunk: string) => void) => {
    const res = await fetch(url, {
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
        "/api/policy-generator",
        { action: "generate", curriculum, policy, additionalRequirements, outputType },
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
        "/api/policy-generator",
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
              <label className="block text-sm font-semibold text-gray-800">Policy</label>
              <textarea
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
                placeholder="Enter the name of the policy, e.g. Anti-Bullying Policy"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Additional requirements <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={additionalRequirements}
                onChange={(e) => setAdditionalRequirements(e.target.value)}
                placeholder="e.g. Include reporting procedures, staff responsibilities, links to statutory guidance, and a review schedule"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Output type</label>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                {([
                  { value: "full", label: "Draft full policy" },
                  { value: "structure", label: "Draft policy section structure" },
                ] as { value: OutputType; label: string }[]).map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="outputType"
                      checked={outputType === value}
                      onChange={() => setOutputType(value)}
                      className="accent-gray-900"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
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
                  setPolicy("");
                  setAdditionalRequirements("");
                  setOutputType("full");
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
        exportFilename={`policy-${policy.slice(0, 30).replace(/\s+/g, "-") || "document"}`}
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
