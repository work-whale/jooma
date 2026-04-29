"use client";

import { useState } from "react";
import { Loader2, Sparkles, Minus, Plus } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";

const REFINE_CHIPS = [
  "Translate to...",
  "Include more time on...",
  "Include less time on...",
  "Include more small group breakout sessions",
  "Include more opportunities for sharing ideas",
  "Make the meeting shorter",
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function MeetingPlannerForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [purpose, setPurpose] = useState("");
  const [duration, setDuration] = useState("60");
  const [participants, setParticipants] = useState("");
  const [topics, setTopics] = useState("");
  const [includeIcebreaker, setIncludeIcebreaker] = useState(false);
  const [includeActionItems, setIncludeActionItems] = useState(false);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const durationNum = parseInt(duration, 10);
  const canGenerate = purpose.trim() && participants.trim() && !isNaN(durationNum) && durationNum >= 5 && durationNum <= 480;
  const formSnapshot = JSON.stringify({ purpose, duration, participants, topics, includeIcebreaker, includeActionItems });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const adjustDuration = (delta: number) => {
    const current = parseInt(duration, 10) || 60;
    setDuration(String(Math.min(480, Math.max(5, current + delta))));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/meeting-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, duration: durationNum, participants, topics, includeIcebreaker, includeActionItems }),
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
              <label className="block text-sm font-semibold text-gray-800">Meeting purpose</label>
              <textarea
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. End-of-term staff review, Year 6 transition planning, whole-school behaviour policy update"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Meeting duration (minutes)</label>
                <div className="flex items-center gap-0">
                  <input
                    type="number"
                    min={5}
                    max={480}
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(duration, 10);
                      setDuration(String(isNaN(n) ? 60 : Math.min(480, Math.max(5, n))));
                    }}
                    className="w-20 border border-gray-200 rounded-l-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent text-center"
                  />
                  <button type="button" onClick={() => adjustDuration(-5)} disabled={durationNum <= 5} className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => adjustDuration(5)} disabled={durationNum >= 480} className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 rounded-r-md text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Participants</label>
                <input
                  type="text"
                  value={participants}
                  onChange={(e) => setParticipants(e.target.value)}
                  placeholder="e.g. Heads of department, whole staff, Year 6 team"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Topics to cover <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={topics}
                onChange={(e) => setTopics(e.target.value)}
                placeholder="e.g. Assessment data review, upcoming parents' evening, changes to the SEND referral process"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-800">Include icebreaker</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeIcebreaker}
                    onChange={(e) => setIncludeIcebreaker(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">Yes</span>
                </label>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-800">Include action items section</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeActionItems}
                    onChange={(e) => setIncludeActionItems(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 accent-gray-900"
                  />
                  <span className="text-sm text-gray-700">Yes</span>
                </label>
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
                  setPurpose("");
                  setDuration("60");
                  setParticipants("");
                  setTopics("");
                  setIncludeIcebreaker(false);
                  setIncludeActionItems(false);
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
        exportFilename="meeting-plan"
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
