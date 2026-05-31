"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { SubjectField, TopicField, LessonCountField } from "@/app/components/fields";
import { toTitleCase } from "@/app/lib/formOptions";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "exam-question-generator";

const REFINE_CHIPS = [
  "Translate to...",
  "Make the questions more challenging",
  "Make the questions less challenging",
  "Include more higher mark questions",
  "Include more closed lower mark questions",
  "Include the following content in the questions...",
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function ExamQuestionGeneratorForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [examType, setExamType] = useState("");
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [numQuestions, setNumQuestions] = useState(5);
  const [minMarks, setMinMarks] = useState(2);
  const [maxMarks, setMaxMarks] = useState(5);
  const [includeMarkScheme, setIncludeMarkScheme] = useState(true);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const canGenerate =
    curriculum && (mixed || yearGroup) && subject.trim() && topic.trim();

  const formState = { curriculum, yearGroup, mixed, subject, examType, topic, content, numQuestions, minMarks, maxMarks, includeMarkScheme };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setExamType((i.examType as string) ?? "");
    setTopic((i.topic as string) ?? "");
    setContent((i.content as string) ?? "");
    setNumQuestions((i.numQuestions as number) ?? 5);
    setMinMarks((i.minMarks as number) ?? 2);
    setMaxMarks((i.maxMarks as number) ?? 5);
    setIncludeMarkScheme(i.includeMarkScheme === undefined ? true : Boolean(i.includeMarkScheme));
    setResult(run.output);
    setLastGenerated(JSON.stringify(i));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/exam-question-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          examType,
          topic,
          content: content.trim() || null,
          numQuestions,
          minMarks,
          maxMarks: Math.max(minMarks, maxMarks),
          includeMarkScheme,
        }),
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
        const chunk = decoder.decode(value, { stream: true }).replace(/©/g, "(c)");
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
        <div className="lg:col-span-1">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <CurriculumYearFields
              curriculum={curriculum} onCurriculumChange={setCurriculum}
              yearGroup={yearGroup} onYearGroupChange={setYearGroup}
              mixed={mixed} onMixedChange={setMixed}
              yearGroupNote
            />

            <SubjectField value={subject} onChange={setSubject} />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Exam type</label>
              <input
                type="text"
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                placeholder="e.g. GCSE, A-level, Functional Skills"
                className={inputClass}
              />
            </div>

            <TopicField value={topic} onChange={setTopic} />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">
                Knowledge, skills or content to cover
                <span className="ml-2 text-xs font-normal text-gray-400">optional</span>
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste exam specification content here, or list bullet points — the more specific, the better the output."
                rows={4}
                className={`${inputClass} resize-none`}
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            <LessonCountField
              value={numQuestions}
              onChange={setNumQuestions}
              min={1}
              max={20}
              label="Number of questions"
              unit="questions"
            />

            <div className="grid grid-cols-2 gap-5">
              <LessonCountField
                value={minMarks}
                onChange={(v) => { setMinMarks(v); if (v > maxMarks) setMaxMarks(v); }}
                min={1}
                max={20}
                label="Min marks per question"
                unit="marks"
              />
              <LessonCountField
                value={maxMarks}
                onChange={(v) => { setMaxMarks(v); if (v < minMarks) setMinMarks(v); }}
                min={1}
                max={20}
                label="Max marks per question"
                unit="marks"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-800">Mark scheme</label>
              <div className="flex flex-col gap-2">
                {[
                  { value: true, label: "Include mark scheme" },
                  { value: false, label: "Exclude mark scheme" },
                ].map(({ value, label }) => (
                  <label key={String(value)} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={includeMarkScheme === value}
                      onChange={() => setIncludeMarkScheme(value)}
                      className="accent-stone-700 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
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
                  setCurriculum(""); setYearGroup(""); setMixed(false);
                  setSubject(""); setExamType(""); setTopic(""); setContent("");
                  setNumQuestions(5); setMinMarks(2); setMaxMarks(5);
                  setIncludeMarkScheme(true);
                  setResult(null); setError(null); setConfirmingReset(false);
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

      <ResultPanel
        result={result}
        isGenerating={isGenerating}
        isRefining={isRefining}
        onChange={(md) => setResult(md)}
        exportFilename={`exam-${topic || subject || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: topic || subject || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
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
