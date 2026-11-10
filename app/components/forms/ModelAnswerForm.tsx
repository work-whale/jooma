"use client";

import { useEffect, useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { SubjectField } from "@/app/components/fields";
import { toTitleCase } from "@/app/lib/formOptions";
import ToolResults from "@/app/components/ToolResults";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import { getToolRun, type ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import { parseSheet } from "@/app/lib/sheets/normalize";
import { EXAM_STYLES, isExamStyle } from "@/app/lib/sheets/exam-styles";
import { EXEMPLAR_LEVELS, isExemplarLevel, type ExemplarLevel } from "@/app/lib/sheets/model-answers";
import { MAX_MODEL_QUESTIONS, paperQuestions, type ModelAnswerQuestion, type PaperQuestion } from "@/app/lib/model-answer-prompt";

const TOOL_SLUG = "model-answer-generator";

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function ModelAnswerForm({
  sidebar,
  launch,
  from,
}: {
  sidebar: React.ReactNode;
  launch?: ToolLaunchParams;
  /** `?from=`: a saved exam paper whose questions to offer. */
  from?: string;
}) {
  const fieldId = useId();
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [styleId, setStyleId] = useState("");
  const [questions, setQuestions] = useState<ModelAnswerQuestion[]>([{ question: "", marks: 6 }]);
  const [levels, setLevels] = useState<ExemplarLevel[]>(["full", "mid", "low"]);
  const [contentRequirements, setContentRequirements] = useState("");
  const [guidelines, setGuidelines] = useState("");
  const [paper, setPaper] = useState<PaperQuestion[] | null>(null);
  const [paperError, setPaperError] = useState<string | null>(null);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  const filled = questions.filter((q) => q.question.trim());
  const canGenerate = curriculum && (mixed || yearGroup) && subject.trim() && filled.length > 0 && levels.length > 0;

  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, yearGroup, mixed, subject, examStyle: styleId, questions, levels, contentRequirements, guidelines };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  // Opened from an exam paper: read it (the teacher's own, through their
  // access) and offer its questions.
  useEffect(() => {
    if (!from) return;
    let live = true;
    getToolRun(from)
      .then((run) => {
        if (!live) return;
        const qs = run ? paperQuestions(run.output) : [];
        if (!run || qs.length === 0) {
          setPaperError("That exam paper could not be opened, so add the questions yourself.");
          return;
        }
        setPaper(qs);
        const i = run.input ?? {};
        if (typeof i.curriculum === "string") setCurriculum(i.curriculum);
        if (typeof i.yearGroup === "string") setYearGroup(i.yearGroup);
        const doc = parseSheet(run.output);
        setSubject(doc?.exam?.subject || (typeof i.subject === "string" ? i.subject : ""));
        if (doc?.exam && isExamStyle(doc.exam.styleId) && doc.exam.styleId !== "school-test") setStyleId(doc.exam.styleId);
        setQuestions(qs.filter((q) => q.picked).map(({ question, marks }) => ({ question, marks })));
      })
      .catch(() => live && setPaperError("That exam paper could not be opened, so add the questions yourself."));
    return () => { live = false; };
    // Once per paper. The setters are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from]);

  const togglePaper = (i: number) => {
    if (!paper) return;
    const next = paper.map((q, j) => (j === i ? { ...q, picked: !q.picked } : q));
    if (next.filter((q) => q.picked).length > MAX_MODEL_QUESTIONS) return;
    setPaper(next);
    setQuestions(next.filter((q) => q.picked).map(({ question, marks }) => ({ question, marks })));
  };

  const restore = (run: ToolRun) => {
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setStyleId(isExamStyle(i.examStyle) ? (i.examStyle as string) : "");
    // A run from before batches held one question and its marks.
    const saved = Array.isArray(i.questions)
      ? (i.questions as ModelAnswerQuestion[])
      : [{ question: (i.question as string) ?? "", marks: (i.totalMarks as number) ?? 6 }];
    setQuestions(saved.length ? saved : [{ question: "", marks: 6 }]);
    setLevels(Array.isArray(i.levels) ? (i.levels as string[]).filter(isExemplarLevel) : ["full", "mid", "low"]);
    setContentRequirements((i.contentRequirements as string) ?? "");
    setGuidelines((i.guidelines as string) ?? "");
    setPaper(null);
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      curriculum: (v) => setCurriculum(v as string),
      yearGroup: (v) => setYearGroup(v as string),
      subject: (v) => setSubject(v as string),
      question: (v) => setQuestions((qs) => [{ ...(qs[0] ?? { marks: 6 }), question: v as string }, ...qs.slice(1)]),
      totalMarks: (v) => setQuestions((qs) => [{ ...(qs[0] ?? { question: "" }), marks: Number(v) || 6 }, ...qs.slice(1)]),
    },
  });

  const setQuestion = (i: number, patch: Partial<ModelAnswerQuestion>) => setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = { yearGroup: mixed ? "Mixed" : yearGroup, subject: toTitleCase(subject) };
    try {
      const res = await fetch("/api/model-answer-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          curriculum,
          yearGroup: info.yearGroup,
          subject: info.subject,
          questions: filled,
          levels,
          examStyle: styleId || undefined,
          content: contentRequirements.trim() || null,
          guidelines: guidelines.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "modelAnswer", info, setResult);
      if (!finished) throw new Error("The model answers came back empty. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
        <div className="lg:col-span-1">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">
            {prefilled && <PrefilledBadge />}

            <CurriculumYearFields
              curriculum={curriculum} onCurriculumChange={setCurriculum}
              yearGroup={yearGroup} onYearGroupChange={setYearGroup}
              mixed={mixed} onMixedChange={setMixed}
              yearGroupNote
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
              <div className="space-y-1.5">
                <label htmlFor={`${fieldId}-style`} className="block text-sm font-semibold text-gray-800">
                  Marked in the style of <span className="ml-1 text-xs font-normal text-gray-400">optional</span>
                </label>
                <select id={`${fieldId}-style`} value={styleId} onChange={(e) => setStyleId(e.target.value)} className={inputClass}>
                  <option value="">No particular paper</option>
                  {EXAM_STYLES.filter((s) => s.phase !== "school").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <SubjectField value={subject} onChange={setSubject} />

            {paper && (
              <fieldset className="space-y-2 rounded-xl border border-gray-200 p-4" data-testid="paper-questions">
                <legend className="px-1 text-sm font-semibold text-gray-800">Questions from your exam paper</legend>
                <p className="text-xs text-gray-500">Tick up to {MAX_MODEL_QUESTIONS}. The longer answers are ticked to start with.</p>
                {paper.map((q, i) => (
                  <label key={i} className="flex items-start gap-2.5 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={q.picked} onChange={() => togglePaper(i)} className="mt-0.5 accent-stone-700 w-4 h-4" />
                    <span><b>{q.label}</b> {q.question} <span className="text-gray-400">({q.marks} mark{q.marks === 1 ? "" : "s"})</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            {paperError && <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">{paperError}</p>}

            {!paper && (
              <div className="space-y-3" data-testid="model-questions">
                <p className="text-sm font-semibold text-gray-800">Questions <span className="ml-1 text-xs font-normal text-gray-400">up to {MAX_MODEL_QUESTIONS}</span></p>
                {questions.map((q, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <textarea
                      value={q.question}
                      onChange={(e) => setQuestion(i, { question: e.target.value })}
                      placeholder="Type or paste the exam question"
                      aria-label={`Question ${i + 1}`}
                      rows={2}
                      className={`${inputClass} resize-y flex-1`}
                    />
                    <div className="w-24 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={40}
                        value={q.marks}
                        onChange={(e) => setQuestion(i, { marks: Math.min(40, Math.max(1, Number(e.target.value) || 1)) })}
                        aria-label={`Question ${i + 1} marks`}
                        className={inputClass}
                      />
                      <span className="text-[11px] text-gray-400">marks</span>
                    </div>
                    {questions.length > 1 && (
                      <button type="button" onClick={() => setQuestions((qs) => qs.filter((_, j) => j !== i))} aria-label={`Remove question ${i + 1}`} className="mt-3 text-gray-400 hover:text-red-500 cursor-pointer">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {questions.length < MAX_MODEL_QUESTIONS && (
                  <button type="button" onClick={() => setQuestions((qs) => [...qs, { question: "", marks: 4 }])} className="flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 cursor-pointer">
                    <Plus className="w-4 h-4" /> Add another question
                  </button>
                )}
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="block text-sm font-semibold text-gray-800">Answers to write</legend>
              <div className="flex flex-wrap gap-4">
                {EXEMPLAR_LEVELS.map((l) => (
                  <label key={l.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={levels.includes(l.id)}
                      onChange={(e) => setLevels((ls) => (e.target.checked ? [...ls, l.id] : ls.filter((x) => x !== l.id)))}
                      className="accent-stone-700 w-4 h-4"
                    />
                    {l.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-1.5">
              <label htmlFor={`${fieldId}-content`} className="block text-sm font-semibold text-gray-800">Content the answers should use <span className="ml-1 text-xs font-normal text-gray-400">optional</span></label>
              <textarea id={`${fieldId}-content`} value={contentRequirements} onChange={(e) => setContentRequirements(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="Key facts, specification points or a source text" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${fieldId}-guide`} className="block text-sm font-semibold text-gray-800">Mark scheme or marking guidance <span className="ml-1 text-xs font-normal text-gray-400">optional</span></label>
              <textarea id={`${fieldId}-guide`} value={guidelines} onChange={(e) => setGuidelines(e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="Paste the mark scheme, or say how the marks are given" />
            </div>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum(""); setYearGroup(""); setMixed(false); setSubject(""); setStyleId("");
                  setQuestions([{ question: "", marks: 6 }]); setLevels(["full", "mid", "low"]);
                  setContentRequirements(""); setGuidelines(""); setPaper(null);
                  setResult(null); setRunId(null); setError(null); setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton onClick={handleGenerate} disabled={!canGenerate || isGenerating || unchangedSinceGeneration} isGenerating={isGenerating} hasResult={result !== null} />
            </div>
          </Card>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">{error}</div>}

      <ToolResults
        result={result}
        isGenerating={isGenerating}
        onChange={(md) => setResult(md)}
        exportFilename={`model-answers-${subject || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: filled[0]?.question.slice(0, 80) || subject || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
