"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTypingPlaceholder } from "@/app/lib/useTypingPlaceholder";
import PlaceholderOverlay from "@/app/components/fields/PlaceholderOverlay";
import { PupilNameField, GenderField, WordCountField, IncludeTargetsField, ToneField } from "@/app/components/fields";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "report-writer";

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

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

interface SubjectFocusCardProps {
  subject: SubjectFocus;
  index: number;
  showRemove: boolean;
  includeTargets: boolean;
  onChange: (field: keyof SubjectFocus, value: string) => void;
  onRemove: () => void;
}

function SubjectFocusCard({ subject, index, showRemove, includeTargets, onChange, onRemove }: SubjectFocusCardProps) {
  const subjectPlaceholder = useTypingPlaceholder(["e.g. Mathematics", "e.g. English", "e.g. Science", "e.g. History"]);
  const strengthsPlaceholder = useTypingPlaceholder([
    "e.g. Demonstrates strong number sense and applies methods accurately",
    "e.g. Reads with confidence and contributes thoughtfully to discussions",
    "e.g. Shows great curiosity and produces detailed written explanations",
  ]);
  const areasPlaceholder = useTypingPlaceholder([
    "e.g. Would benefit from showing working out more clearly",
    "e.g. Could develop greater consistency when writing at length",
    "e.g. Would benefit from checking answers before submitting",
  ]);
  const targetsPlaceholder = useTypingPlaceholder([
    "e.g. Practise reading longer texts to build fluency and stamina",
    "e.g. Focus on presenting written work in a structured way",
    "e.g. Work on times tables to improve calculation speed",
  ]);

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Subject / focus {index + 1}</h3>
        {showRemove && (
          <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors" aria-label="Remove subject">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-gray-800">Subject or Focus</label>
        <div className="relative">
          <input type="text" value={subject.subject} onChange={(e) => onChange("subject", e.target.value)} placeholder="" className={inputClass} />
          {!subject.subject && <PlaceholderOverlay text={subjectPlaceholder} />}
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-gray-800">Strengths</label>
        <div className="relative">
          <textarea value={subject.strengths} onChange={(e) => onChange("strengths", e.target.value)} placeholder="" rows={3} className={`${inputClass} resize-none`} />
          {!subject.strengths && <PlaceholderOverlay text={strengthsPlaceholder} area />}
        </div>
        <p className="text-xs text-gray-400">100,000 character maximum input text</p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-semibold text-gray-800">Areas for development</label>
        <div className="relative">
          <textarea value={subject.areasForDevelopment} onChange={(e) => onChange("areasForDevelopment", e.target.value)} placeholder="" rows={3} className={`${inputClass} resize-none`} />
          {!subject.areasForDevelopment && <PlaceholderOverlay text={areasPlaceholder} area />}
        </div>
        <p className="text-xs text-gray-400">100,000 character maximum input text</p>
      </div>

      {includeTargets && (
        <div className="space-y-1.5">
          <label className="block text-sm font-semibold text-gray-800">Targets</label>
          <div className="relative">
            <textarea value={subject.targets} onChange={(e) => onChange("targets", e.target.value)} placeholder="" rows={3} className={`${inputClass} resize-none`} />
            {!subject.targets && <PlaceholderOverlay text={targetsPlaceholder} area />}
          </div>
          <p className="text-xs text-gray-400">100,000 character maximum input text</p>
        </div>
      )}
    </Card>
  );
}

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
  const [gender, setGender] = useState("");
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
  const [historyKey, setHistoryKey] = useState(0);

  const wordCountNum = parseInt(wordCount, 10);
  const hasValidSubject = subjects.some((s) => s.subject.trim());
  const canGenerate =
    name.trim() && gender && hasValidSubject &&
    !isNaN(wordCountNum) && wordCountNum >= 50 && wordCountNum <= 1000;

  // Raw form state — saved as history input so a past run can refill the form.
  const formState = { name, gender, wordCount, includeTargets, tone, subjects };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setName((i.name as string) ?? "");
    setGender((i.gender as string) ?? "");
    setWordCount((i.wordCount as string) ?? "150");
    setIncludeTargets(i.includeTargets === undefined ? true : Boolean(i.includeTargets));
    setTone((i.tone as string) ?? "formal");
    setSubjects((i.subjects as SubjectFocus[]) ?? [emptySubject()]);
    setResult(run.output);
    setLastGenerated(JSON.stringify(i));
  };

  const updateSubject = (index: number, field: keyof SubjectFocus, value: string) => {
    setSubjects((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  const addSubject = () => {
    if (subjects.length < 10) setSubjects((prev) => [...prev, emptySubject()]);
  };

  const removeSubject = (index: number) => {
    if (subjects.length > 1) setSubjects((prev) => prev.filter((_, i) => i !== index));
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

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="space-y-6">

            <div className="grid grid-cols-2 gap-4">
              <PupilNameField value={name} onChange={setName} />
              <GenderField value={gender} onChange={setGender} />
            </div>

            <div className="grid grid-cols-2 gap-4 items-start">
              <WordCountField
                value={wordCount}
                onChange={setWordCount}
                label="Word count (approximate)"
                min={50}
                max={1000}
                step={10}
                defaultValue={150}
              />
              <IncludeTargetsField value={includeTargets} onChange={setIncludeTargets} />
            </div>

            <ToneField value={tone} onChange={setTone} />
          </Card>

          {subjects.map((s, i) => (
            <SubjectFocusCard
              key={i}
              subject={s}
              index={i}
              showRemove={subjects.length > 1}
              includeTargets={includeTargets}
              onChange={(field, value) => updateSubject(i, field, value)}
              onRemove={() => removeSubject(i)}
            />
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

          <div className="flex gap-3">
            <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
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
            <GenerateButton
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating || unchangedSinceGeneration}
              isGenerating={isGenerating}
              hasResult={result !== null}
            />
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
        historyMeta={{ toolSlug: TOOL_SLUG, title: name || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
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
