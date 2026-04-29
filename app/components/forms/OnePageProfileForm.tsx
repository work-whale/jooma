"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import ResultPanel from "@/app/components/ResultPanel";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";

const REFINE_CHIPS = [
  "Translate to...",
  "Make the language simpler for a younger student to read",
  "Make the language more detailed for an older student",
  "Include the following...",
  "Suggest support strategies which...",
];

export default function OnePageProfileForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);

  const [name, setName] = useState("");
  const [likes, setLikes] = useState("");
  const [happy, setHappy] = useState("");
  const [supportNeeds, setSupportNeeds] = useState("");
  const [supportStyle, setSupportStyle] = useState("");
  const [hopes, setHopes] = useState("");
  const [interventionGroups, setInterventionGroups] = useState("");
  const [outsideAgency, setOutsideAgency] = useState("");
  const [includeAdditionalSupport, setIncludeAdditionalSupport] = useState(true);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const resolvedYearGroup = mixed ? "Mixed year group" : yearGroup;
  const canGenerate = curriculum.trim() && resolvedYearGroup.trim() && name.trim() && likes.trim() && supportNeeds.trim();
  const formSnapshot = JSON.stringify({ curriculum, yearGroup, mixed, name, likes, happy, supportNeeds, supportStyle, hopes, interventionGroups, outsideAgency, includeAdditionalSupport });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const inputClass =
    "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

  const streamResponse = async (body: object, onChunk: (c: string) => void) => {
    const res = await fetch("/api/one-page-profile", {
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
        { action: "generate", curriculum, yearGroup: resolvedYearGroup, name, likes, happy, supportNeeds, supportStyle, hopes, interventionGroups, outsideAgency, includeAdditionalSupport },
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
              <label className="block text-sm font-semibold text-gray-800">Name <span className="text-gray-400 font-normal">(first name only)</span></label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                className={`${inputClass} resize-none`}
              />
            </div>

            {[
              { label: "What people like and admire about the student", value: likes, onChange: setLikes, placeholder: "e.g. Kind and caring, always willing to help others, great sense of humour, works hard in practical lessons" },
              { label: "What makes the student happy", value: happy, onChange: setHappy, placeholder: "e.g. Working with friends, art projects, football, being given responsibility, using a computer" },
              { label: "What the student needs support with", value: supportNeeds, onChange: setSupportNeeds, placeholder: "e.g. Managing transitions, processing written instructions, staying focused during long tasks" },
              { label: "How the student likes to be supported", value: supportStyle, onChange: setSupportStyle, placeholder: "e.g. Prefers quiet 1:1 check-ins, likes verbal instructions broken into steps, responds well to visual prompts" },
              { label: "The student's hopes and wishes for the future", value: hopes, onChange: setHopes, placeholder: "e.g. Would like to work with animals, wants to improve reading, hopes to make more friends" },
            ].map(({ label, value, onChange, placeholder }) => (
              <div key={label} className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">{label}</label>
                <textarea
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={placeholder}
                  rows={3}
                  className={`${inputClass} resize-none`}
                />
                <p className="text-xs text-gray-400">100,000 character maximum input text</p>
              </div>
            ))}

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Intervention groups <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={interventionGroups}
                onChange={(e) => setInterventionGroups(e.target.value)}
                placeholder="e.g. Reading intervention, Speech and Language group, Social Skills group"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Outside agency input <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={outsideAgency}
                onChange={(e) => setOutsideAgency(e.target.value)}
                placeholder="e.g. CAMHS, Educational Psychologist, Speech and Language Therapy, Occupational Therapy"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Include additional support suggestions</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAdditionalSupport}
                  onChange={(e) => setIncludeAdditionalSupport(e.target.checked)}
                  className="accent-gray-900 w-4 h-4"
                />
                <span className="text-sm text-gray-700">Include additional support suggestions</span>
              </label>
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
                  setName(""); setLikes(""); setHappy(""); setSupportNeeds("");
                  setSupportStyle(""); setHopes(""); setInterventionGroups("");
                  setOutsideAgency(""); setIncludeAdditionalSupport(true);
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
        exportFilename={`support-profile-${name.toLowerCase().replace(/\s+/g, "-") || "student"}`}
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
