"use client";

import { useState } from "react";
import { Loader2, Sparkles, Plus, Trash2, Minus } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";

const GENDER_OPTIONS = ["Male", "Female", "Non-Binary"] as const;
type Gender = (typeof GENDER_OPTIONS)[number];

interface SubjectFocus {
  subject: string;
  strengths: string;
  areasForDevelopment: string;
  targets: string;
}

const emptySubject = (): SubjectFocus => ({
  subject: "",
  strengths: "",
  areasForDevelopment: "",
  targets: "",
});

const REFINE_CHIPS = [
  "Make more concise",
  "Make each paragraph longer",
  "Make the tone more formal",
  "Make the tone more warm",
  "Remove any reference to targets",
  "Translate to French",
];

export default function ReportWriterForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [wordCount, setWordCount] = useState("150");
  const [includeTargets, setIncludeTargets] = useState(true);
  const [tone, setTone] = useState("formal");
  const [subjects, setSubjects] = useState<SubjectFocus[]>([emptySubject()]);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const wordCountNum = parseInt(wordCount, 10);
  const hasValidSubject = subjects.some((s) => s.subject.trim());
  const canGenerate =
    name.trim() && gender && hasValidSubject &&
    !isNaN(wordCountNum) && wordCountNum >= 50 && wordCountNum <= 1000;

  const formSnapshot = JSON.stringify({ name, gender, wordCount, includeTargets, tone, subjects });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const updateSubject = (index: number, field: keyof SubjectFocus, value: string) => {
    setSubjects((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addSubject = () => {
    if (subjects.length < 10) setSubjects((prev) => [...prev, emptySubject()]);
  };

  const removeSubject = (index: number) => {
    if (subjects.length > 1) setSubjects((prev) => prev.filter((_, i) => i !== index));
  };

  const adjustWordCount = (delta: number) => {
    const current = parseInt(wordCount, 10) || 150;
    setWordCount(String(Math.min(1000, Math.max(50, current + delta))));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/report-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, gender, wordCount: wordCountNum, includeTargets, tone, subjects }),
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

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">{sidebar}</div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="space-y-6">

            {/* Name + Gender */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Name (first name only)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Emily"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender)}
                  className={inputClass}
                >
                  <option value="">Please select an option</option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Word count + Include targets */}
            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Word count (approximate)</label>
                <div className="flex items-center gap-0">
                  <input
                    type="number"
                    min={50}
                    max={1000}
                    value={wordCount}
                    onChange={(e) => setWordCount(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(wordCount, 10);
                      setWordCount(String(isNaN(n) ? 150 : Math.min(1000, Math.max(50, n))));
                    }}
                    className="w-20 border border-gray-200 rounded-l-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent text-center"
                  />
                  <button
                    type="button"
                    onClick={() => adjustWordCount(-10)}
                    disabled={wordCountNum <= 50}
                    className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => adjustWordCount(10)}
                    disabled={wordCountNum >= 1000}
                    className="h-9 w-9 flex items-center justify-center border border-l-0 border-gray-300 rounded-r-md text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Include targets?</label>
                <div className="flex gap-6 pt-2">
                  {[true, false].map((val) => (
                    <label key={String(val)} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="includeTargets"
                        checked={includeTargets === val}
                        onChange={() => setIncludeTargets(val)}
                        className="accent-gray-900"
                      />
                      <span className="text-sm text-gray-700">{val ? "Yes" : "No"}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Tone */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Tone</label>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                placeholder="e.g. formal, encouraging, positive"
                className={inputClass}
              />
            </div>
          </Card>

          {/* Subject sections */}
          {subjects.map((s, i) => (
            <Card key={i} className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Subject / focus {i + 1}</h3>
                {subjects.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSubject(i)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    aria-label="Remove subject"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Subject or Focus</label>
                <input
                  type="text"
                  value={s.subject}
                  onChange={(e) => updateSubject(i, "subject", e.target.value)}
                  placeholder="e.g. Mathematics"
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Strengths</label>
                <textarea
                  value={s.strengths}
                  onChange={(e) => updateSubject(i, "strengths", e.target.value)}
                  placeholder="e.g. Demonstrates strong number sense, applies methods accurately, and contributes confidently to class discussions"
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
                <p className="text-xs text-gray-400">100,000 character maximum input text</p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Areas for development</label>
                <textarea
                  value={s.areasForDevelopment}
                  onChange={(e) => updateSubject(i, "areasForDevelopment", e.target.value)}
                  placeholder="e.g. Would benefit from showing working out more clearly and checking answers before submitting"
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
                <p className="text-xs text-gray-400">100,000 character maximum input text</p>
              </div>

              {includeTargets && (
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-800">Targets</label>
                  <textarea
                    value={s.targets}
                    onChange={(e) => updateSubject(i, "targets", e.target.value)}
                    placeholder="e.g. Practise reading longer texts independently to build fluency and comprehension stamina"
                    rows={3}
                    className={`${inputClass} resize-none`}
                  />
                  <p className="text-xs text-gray-400">100,000 character maximum input text</p>
                </div>
              )}
            </Card>
          ))}

          {subjects.length < 10 && (
            <button
              type="button"
              onClick={addSubject}
              className="flex items-center gap-2 text-sm text-gray-800 font-medium hover:text-gray-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add another subject
            </button>
          )}

          {/* Actions */}
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
                setName("");
                setGender("");
                setWordCount("150");
                setIncludeTargets(true);
                setTone("formal");
                setSubjects([emptySubject()]);
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
        exportFilename={`report-${name || "pupil"}`}
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
