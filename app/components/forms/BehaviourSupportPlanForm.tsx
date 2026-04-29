"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import ResultPanel from "@/app/components/ResultPanel";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";

type Gender = "Male" | "Female" | "Non-Binary/Other";

const REFINE_CHIPS = [
  "Translate to...",
  "Provide more strategies for...",
  "Remove the section on...",
  "Add more detail on...",
  "Make the plan more concise...",
  "Add in the following strategy:",
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

function RequiredTextarea({
  label, value, onChange, placeholder, touched,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; touched: boolean;
}) {
  const invalid = touched && !value.trim();
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-800">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={`${inputClass} resize-none ${invalid ? "border-red-400 focus:ring-red-400" : ""}`}
      />
      {invalid && <p className="text-xs text-red-500">{label} is required</p>}
      <p className="text-xs text-gray-400">100,000 character maximum input text</p>
    </div>
  );
}

export default function BehaviourSupportPlanForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);

  const [studentName, setStudentName] = useState("");
  const [studentGender, setStudentGender] = useState<Gender>("Male");
  const [studentClass, setStudentClass] = useState("");
  const [supportNeeds, setSupportNeeds] = useState("");
  const [keyStaff, setKeyStaff] = useState("");
  const [behaviourDescription, setBehaviourDescription] = useState("");
  const [behaviouralTriggers, setBehaviouralTriggers] = useState("");
  const [behaviouralPatterns, setBehaviouralPatterns] = useState("");
  const [strengths, setStrengths] = useState("");
  const [dislikes, setDislikes] = useState("");
  const [previousInterventions, setPreviousInterventions] = useState("");
  const [planStartDate, setPlanStartDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const resolvedYearGroup = mixed ? "Mixed year group" : yearGroup;
  const canGenerate = curriculum.trim() && resolvedYearGroup.trim() && studentName.trim() &&
    behaviourDescription.trim() && behaviouralTriggers.trim();
  const formSnapshot = JSON.stringify({ curriculum, yearGroup, mixed, studentName, studentGender, studentClass, supportNeeds, keyStaff, behaviourDescription, behaviouralTriggers, behaviouralPatterns, strengths, dislikes, previousInterventions, planStartDate, reviewDate });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const streamResponse = async (body: object, onChunk: (c: string) => void) => {
    const res = await fetch("/api/behaviour-support-plan", {
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
    setTouched(true);
    if (!canGenerate) return;
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      await streamResponse(
        { action: "generate", curriculum, yearGroup: resolvedYearGroup, studentName, studentGender, studentClass, supportNeeds, keyStaff, behaviourDescription, behaviouralTriggers, behaviouralPatterns, strengths, dislikes, previousInterventions, planStartDate, reviewDate },
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Student name</label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="e.g. Jamie"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Student gender</label>
                <select value={studentGender} onChange={(e) => setStudentGender(e.target.value as Gender)} className={selectClass}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-Binary/Other">Non-Binary/Other</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Student's class</label>
              <input
                type="text"
                value={studentClass}
                onChange={(e) => setStudentClass(e.target.value)}
                placeholder="e.g. Class 4, 7B"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Additional support needs</label>
              <textarea
                value={supportNeeds}
                onChange={(e) => setSupportNeeds(e.target.value)}
                placeholder="e.g. ADHD, ASD, sensory processing difficulties"
                rows={3}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Key staff working with student</label>
              <input
                type="text"
                value={keyStaff}
                onChange={(e) => setKeyStaff(e.target.value)}
                placeholder="e.g. Mrs Smith (Form Tutor), Mr Patel (SENCO), Ms Brown (LSA)"
                className={inputClass}
              />
            </div>

            <RequiredTextarea
              label="Challenging behaviour description"
              value={behaviourDescription}
              onChange={setBehaviourDescription}
              placeholder="e.g. Frequently calls out without permission, leaves seat during whole-class teaching, and makes disruptive comments towards peers — occurring 3–4 times per lesson"
              touched={touched}
            />

            <RequiredTextarea
              label="Behavioural triggers"
              value={behaviouralTriggers}
              onChange={setBehaviouralTriggers}
              placeholder="e.g. Unstructured tasks, extended writing activities, transitions between lessons, seating near certain peers, perceived criticism from staff"
              touched={touched}
            />

            {[
              { label: "Behavioural patterns/context", value: behaviouralPatterns, onChange: setBehaviouralPatterns, placeholder: "e.g. Behaviour is most frequent before lunch and in larger class settings; significantly reduced in 1:1 or small group work" },
              { label: "Student strengths and interests", value: strengths, onChange: setStrengths, placeholder: "e.g. Strong verbal communicator, enthusiastic about art and practical activities, builds positive relationships with staff when given responsibility" },
              { label: "Student dislikes", value: dislikes, onChange: setDislikes, placeholder: "e.g. Extended written tasks, reading aloud in class, sitting still for long periods, feeling singled out in front of peers" },
              { label: "Previous interventions", value: previousInterventions, onChange: setPreviousInterventions, placeholder: "e.g. Daily check-in/check-out, seating plan adjustment, reward chart (discontinued after 4 weeks), referral to school counsellor" },
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Plan start date</label>
                <input
                  type="date"
                  value={planStartDate}
                  onChange={(e) => setPlanStartDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Next review date</label>
                <input
                  type="date"
                  value={reviewDate}
                  onChange={(e) => setReviewDate(e.target.value)}
                  className={inputClass}
                />
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
                  setStudentName(""); setStudentClass(""); setSupportNeeds(""); setKeyStaff("");
                  setBehaviourDescription(""); setBehaviouralTriggers(""); setBehaviouralPatterns("");
                  setStrengths(""); setDislikes(""); setPreviousInterventions("");
                  setPlanStartDate(""); setReviewDate(""); setTouched(false);
                  setResult(null); setError(null); setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || unchangedSinceGeneration}
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
        exportFilename={`bsp-${studentName.toLowerCase().replace(/\s+/g, "-") || "student"}`}
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
