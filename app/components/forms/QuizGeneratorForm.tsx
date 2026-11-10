"use client";

import { useExportLock } from "@/app/components/guest/useExportLock";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { SubjectField, TopicField, LessonCountField, AnswerTypeField } from "@/app/components/fields";
import { toTitleCase } from "@/app/lib/formOptions";
import { Loader2, Trash2, Download, ChevronDown, PlusCircle, FileText, FileDown, Printer, Presentation, Pencil, Plus, X } from "lucide-react";
import ConfirmModal from "@/app/components/ConfirmModal";
import RefinePanel from "@/app/components/RefinePanel";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import DropdownMenu, { type DropdownItem } from "@/app/components/ui/DropdownMenu";
import Card from "@/app/components/ui/Card";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import { saveToolRun, updateToolRunOutput, type ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useListJoPanel } from "@/app/components/jo/useListJoPanel";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";
import SheetDocument from "@/app/components/sheets/SheetDocument";
import SheetDesignPanel from "@/app/components/sheets/SheetDesignPanel";
import {
  isAnswerType,
  makeQuiz,
  MAX_OPTIONS,
  newQuizItem,
  parseQuiz,
  quizSubtitle,
  quizToSheet,
  retypeQuizItem,
  serializeQuiz,
  timeLimitOf,
  type QuizDoc,
  type QuizItem,
  type QuizQuestionType,
} from "@/app/lib/quiz/quiz";
import { blooketRows, genericRows, gimkitRows, googleFormsScript, kahootRows, msFormsMarkdown, toCsv, waygroundRows, type RowsExport } from "@/app/lib/quiz/exports";

const TOOL_SLUG = "quiz-generator";

// The board view is loaded only when a teacher presses Present.
const QuizPresenter = dynamic(() => import("@/app/components/quiz/QuizPresenter"), { ssr: false });

const REFINE_CHIPS = [
  "Translate to...",
  "Make the questions less challenging for younger students",
  "Make the questions more challenging for older students",
  "Include questions on...",
  "Remove questions on...",
];

type View = "edit" | "printable";
type SaveState = "idle" | "saving" | "saved" | "error";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** A filename part from the quiz: letters, digits and dashes only. */
function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "quiz";
}

// ---- One question, as the teacher edits it ----

const TYPE_LABEL: Record<QuizQuestionType, string> = { single: "One answer", multiple: "More than one", truefalse: "True or false" };

function QuizCard({
  question,
  index,
  onChange,
  onRemove,
}: {
  question: QuizItem;
  index: number;
  onChange: (q: QuizItem) => void;
  onRemove: () => void;
}) {
  const tf = question.type === "truefalse";
  const multi = question.type === "multiple";
  const setOption = (i: number, text: string) => onChange({ ...question, options: question.options.map((o, j) => (j === i ? text : o)) });
  const toggleAnswer = (i: number) => {
    if (!multi) return onChange({ ...question, answers: [i] });
    const has = question.answers.includes(i);
    // A multiple answer question keeps at least two right answers.
    if (has && question.answers.length <= 2) return;
    onChange({ ...question, answers: (has ? question.answers.filter((a) => a !== i) : [...question.answers, i]).sort((a, b) => a - b) });
  };
  const removeOption = (i: number) => {
    const min = multi ? 3 : 2;
    if (question.options.length <= min) return;
    const options = question.options.filter((_, j) => j !== i);
    let answers = question.answers.filter((a) => a !== i).map((a) => (a > i ? a - 1 : a));
    if (answers.length === 0) answers = [0];
    onChange({ ...question, options, answers });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4" data-testid="quiz-card">
      <div className="flex flex-wrap items-start gap-3">
        <span className="text-sm font-semibold text-gray-500 mt-2 shrink-0">{index + 1})</span>
        <input
          type="text"
          value={question.question}
          placeholder="Write the question"
          aria-label={`Question ${index + 1}`}
          onChange={(e) => onChange({ ...question, question: e.target.value })}
          className="flex-1 min-w-0 basis-48 border-0 border-b border-gray-300 pb-1 text-sm font-medium text-gray-900 focus:outline-none focus:border-gray-500 bg-transparent"
        />
        <select
          value={question.type}
          aria-label={`Question ${index + 1} type`}
          onChange={(e) => onChange(retypeQuizItem(question, e.target.value as QuizQuestionType))}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700"
        >
          {(Object.keys(TYPE_LABEL) as QuizQuestionType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove question ${index + 1}`}
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-(--j-purple) hover:bg-(--j-deep) px-2.5 py-1.5 rounded transition-colors shrink-0 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:pl-6">
        {question.options.map((opt, i) => {
          const right = question.answers.includes(i);
          return (
            <div key={i} className={`flex items-center gap-2 border rounded-md px-3 py-2 ${right ? "border-(--j-purple) bg-(--j-tint)" : "border-gray-200 bg-white"}`}>
              <span className="text-xs font-bold text-gray-500">{String.fromCharCode(65 + i)}</span>
              {tf ? (
                <span className="flex-1 text-sm text-gray-800">{opt}</span>
              ) : (
                <input
                  type="text"
                  value={opt}
                  aria-label={`Question ${index + 1} option ${String.fromCharCode(65 + i)}`}
                  onChange={(e) => setOption(i, e.target.value)}
                  className="flex-1 min-w-0 rounded px-1 py-1 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-300 bg-transparent"
                />
              )}
              <input
                type={multi ? "checkbox" : "radio"}
                name={`q${index}-answer`}
                checked={right}
                onChange={() => toggleAnswer(i)}
                aria-label={`Mark option ${String.fromCharCode(65 + i)} as ${multi ? "a right answer" : "the right answer"}`}
                className="w-4 h-4 accent-(--j-purple) cursor-pointer"
              />
              {!tf && question.options.length > (multi ? 3 : 2) && (
                <button type="button" onClick={() => removeOption(i)} aria-label={`Remove option ${String.fromCharCode(65 + i)}`} className="text-gray-400 hover:text-red-500 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
        {!tf && question.options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => onChange({ ...question, options: [...question.options, ""] })}
            className="flex items-center justify-center gap-1.5 border border-dashed border-gray-300 rounded-md px-3 py-2 text-xs font-semibold text-gray-500 hover:border-gray-400 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add an option
          </button>
        )}
      </div>

      <div className="sm:pl-6">
        <input
          type="text"
          value={question.explanation}
          placeholder="Why the answer is right (shown when you reveal it)"
          aria-label={`Question ${index + 1} explanation`}
          onChange={(e) => onChange({ ...question, explanation: e.target.value })}
          className="w-full text-xs text-gray-600 border border-gray-100 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-300"
        />
      </div>
    </div>
  );
}

// ---- Downloads ----

function DownloadDropdown({ quiz, onNotice }: { quiz: QuizDoc; onNotice: (text: string | null) => void }) {
  const [exporting, setExporting] = useState(false);
  const exportLock = useExportLock();
  const base = slug(quiz.title);

  const run = (fn: () => Promise<void> | void) => async () => {
    setExporting(true);
    onNotice(null);
    try {
      await fn();
    } finally {
      setExporting(false);
    }
  };

  /** A platform file, with a note when some questions could not go in. */
  const platform = (name: string, made: RowsExport, save: (rows: RowsExport) => Promise<void> | void) =>
    run(async () => {
      await save(made);
      const notes = [
        made.skipped ? `${made.skipped} question${made.skipped === 1 ? "" : "s"} left out: ${name} cannot hold ${made.skipped === 1 ? "it" : "them"} (more than four options, or more than one right answer where ${name} allows one).` : "",
        made.shortened ? `${made.shortened} piece${made.shortened === 1 ? "" : "s"} of text shortened to fit ${name}'s limits.` : "",
      ].filter(Boolean);
      onNotice(notes.length ? notes.join(" ") : null);
    });

  const csv = (rows: RowsExport, file: string) => triggerDownload(new Blob(["﻿" + toCsv(rows.rows)], { type: "text/csv;charset=utf-8;" }), file);
  const xlsx = async (rows: RowsExport, file: string) => {
    const { buildXlsx } = await import("@/app/lib/quiz/xlsx");
    triggerDownload(await buildXlsx(rows.rows, "Quiz"), file);
  };

  const items: DropdownItem[] = [
    {
      label: "Download PDF",
      icon: <FileDown className="w-3.5 h-3.5" />,
      onSelect: run(async () => {
        const { exportSheetPdf } = await import("@/app/components/sheets/sheetExport");
        await exportSheetPdf(quizToSheet(quiz), base);
      }),
    },
    {
      label: "Download Word (DOCX)",
      icon: <FileText className="w-3.5 h-3.5" />,
      onSelect: run(async () => {
        const { exportSheetDocx } = await import("@/app/components/sheets/sheetExport");
        await exportSheetDocx(quizToSheet(quiz), base);
      }),
    },
    {
      label: "Print",
      icon: <Printer className="w-3.5 h-3.5" />,
      onSelect: run(async () => {
        const { printSheet } = await import("@/app/components/sheets/sheetExport");
        await printSheet(quizToSheet(quiz), quiz.title || "Quiz");
      }),
    },
    { label: "Kahoot (Excel)", icon: <Download className="w-3.5 h-3.5" />, onSelect: platform("Kahoot", kahootRows(quiz), (r) => xlsx(r, `kahoot-${base}.xlsx`)), separated: true },
    { label: "Wayground (Excel)", icon: <Download className="w-3.5 h-3.5" />, onSelect: platform("Wayground", waygroundRows(quiz), (r) => xlsx(r, `wayground-${base}.xlsx`)) },
    { label: "Blooket (CSV)", icon: <Download className="w-3.5 h-3.5" />, onSelect: platform("Blooket", blooketRows(quiz), (r) => csv(r, `blooket-${base}.csv`)) },
    { label: "Gimkit (CSV)", icon: <Download className="w-3.5 h-3.5" />, onSelect: platform("Gimkit", gimkitRows(quiz), (r) => csv(r, `gimkit-${base}.csv`)) },
    { label: "Any other platform (CSV)", icon: <Download className="w-3.5 h-3.5" />, onSelect: platform("CSV", genericRows(quiz), (r) => csv(r, `quiz-${base}.csv`)) },
    {
      label: "Microsoft Forms (Word guide)",
      icon: <FileText className="w-3.5 h-3.5" />,
      separated: true,
      onSelect: run(async () => {
        const { exportToDocx } = await import("@/app/lib/exportUtils");
        await exportToDocx(msFormsMarkdown(quiz), `ms-forms-${base}`);
      }),
    },
    {
      label: "Google Forms (script)",
      icon: <Download className="w-3.5 h-3.5" />,
      onSelect: run(() => triggerDownload(new Blob([googleFormsScript(quiz)], { type: "text/plain;charset=utf-8;" }), `google-forms-${base}.gs`)),
    },
  ];

  return (
    <>
      {exportLock.modal}
      <DropdownMenu
        ariaLabel="Download options"
        disabled={exporting}
        triggerClassName="flex items-center gap-2 bg-(--j-purple) hover:bg-(--j-deep) text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-60 cursor-pointer"
        menuClassName="w-[min(18rem,calc(100vw-2rem))]"
        trigger={
          <>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {exporting ? "Building…" : "Download"}
            <ChevronDown className="w-4 h-4" />
          </>
        }
        items={exportLock.guardItems(items)}
      />
    </>
  );
}

// ---- Main component ----

export default function QuizGeneratorForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  launch?: ToolLaunchParams;
}) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [numQuestions, setNumQuestions] = useState(5);
  const [timeLimit, setTimeLimit] = useState(30);
  const [answerType, setAnswerType] = useState("single");

  const [quiz, setQuiz] = useState<QuizDoc | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [view, setView] = useState<View>("edit");
  const [presenting, setPresenting] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);

  // One run per quiz: created when it is first generated (or opened from
  // history), then updated in place as it is edited, added to, refined or
  // changed by Jo. Before, every one of those saved a new run.
  const [runId, setRunId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedRef = useRef<string | null>(null);

  const questions = quiz?.questions ?? [];
  const canGenerate = curriculum && (mixed || yearGroup) && subject.trim() && topic.trim();
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, yearGroup, mixed, subject, topic, numQuestions, timeLimit, answerType };
  const formSnapshot = JSON.stringify({ curriculum, yearGroup, mixed, subject, topic, numQuestions, answerType });
  const unchangedSinceGeneration = questions.length > 0 && lastGenerated === formSnapshot;

  const serialized = useMemo(() => (quiz ? serializeQuiz(quiz) : null), [quiz]);

  // Autosave, 800 ms after the last change, into the one run.
  useEffect(() => {
    if (!runId || !serialized || serialized === savedRef.current) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      updateToolRunOutput(runId, serialized)
        .then(() => {
          savedRef.current = serialized;
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 800);
    return () => clearTimeout(t);
  }, [runId, serialized]);

  const update = (fn: (q: QuizDoc) => QuizDoc) => setQuiz((prev) => (prev ? fn(prev) : prev));
  const setQuestions = (next: QuizItem[]) => update((q) => ({ ...q, questions: next }));

  const restore = (run: ToolRun) => {
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setTopic((i.topic as string) ?? "");
    setNumQuestions((i.numQuestions as number) ?? 5);
    setTimeLimit((i.timeLimit as number) ?? 30);
    setAnswerType(isAnswerType(i.answerType) ? i.answerType : "single");
    // A quiz saved before this one opens converted; it is written back in the
    // new shape only once it is edited.
    const parsed = parseQuiz(run.output, i);
    savedRef.current = parsed ? serializeQuiz(parsed) : null;
    setQuiz(parsed);
    setRunId(run.id);
    setSaveState("idle");
    setView("edit");
    setLastGenerated(JSON.stringify({ curriculum: i.curriculum, yearGroup: i.yearGroup, mixed: i.mixed, subject: i.subject, topic: i.topic, numQuestions: i.numQuestions, answerType: i.answerType }));
  };

  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      curriculum: (v) => setCurriculum(v as string),
      yearGroup: (v) => setYearGroup(v as string),
      subject: (v) => setSubject(v as string),
      topic: (v) => setTopic(v as string),
      numQuestions: (v) => setNumQuestions(v as number),
      answerType: (v) => { if (isAnswerType(v)) setAnswerType(v); },
      timeLimit: (v) => setTimeLimit(timeLimitOf(v) ?? 30),
    },
  });

  // ── Ask Jo ──
  const quizListRef = useRef<HTMLDivElement>(null);
  const [joOpenSignal, setJoOpenSignal] = useState(0);
  const [joWasGenerating, setJoWasGenerating] = useState(isGenerating);
  if (isGenerating !== joWasGenerating) {
    setJoWasGenerating(isGenerating);
    if (!isGenerating) setJoOpenSignal((n) => n + 1);
  }
  const jo = useListJoPanel<QuizItem>({
    tool: "quiz",
    values: questions,
    commit: (next) => setQuestions(next),
    containerRef: quizListRef,
    disabled: isGenerating || isRefining || isAdding ? "Jo can help as soon as this is finished" : null,
    openSignal: joOpenSignal,
  });

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/quiz-generator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, curriculum, yearGroup: mixed ? "Mixed" : yearGroup, subject: toTitleCase(subject), topic, answerType, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; title?: string; questions?: QuizItem[] };
    if (!res.ok || !data.questions) throw new Error(data.error || "Something went wrong. Please try again.");
    return data as { title: string; questions: QuizItem[] };
  };

  const handleGenerate = async () => {
    setError(null);
    setNotice(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const data = await post({ action: "generate", numQuestions });
      const doc = makeQuiz({
        title: data.title || topic.trim() || subject.trim() || "Quiz",
        subtitle: quizSubtitle({ yearGroup: mixed ? "Mixed" : yearGroup, subject: toTitleCase(subject) }),
        timeLimit: timeLimitOf(timeLimit),
        questions: data.questions,
      });
      setQuiz(doc);
      setView("edit");
      const s = serializeQuiz(doc);
      const run = await saveToolRun({ toolSlug: TOOL_SLUG, title: doc.title, input: formState, output: s });
      savedRef.current = s;
      setRunId(run.id);
      setSaveState("saved");
      setHistoryKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddAI = async () => {
    setIsAdding(true);
    setError(null);
    try {
      const data = await post({ action: "add", existingQuestions: questions });
      setQuestions([...questions, ...data.questions.slice(0, 1)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!questions.length) return;
    setIsRefining(true);
    setError(null);
    try {
      const data = await post({ action: "refine", existingQuestions: questions, instruction });
      update((q) => ({ ...q, title: data.title || q.title, questions: data.questions }));
    } catch (err) {
      // Said out loud: a refine that silently did nothing looked like a broken button.
      setError(err instanceof Error ? `That change did not work: ${err.message}` : "That change did not work. Please try again.");
    } finally {
      setIsRefining(false);
    }
  };

  const status = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : null;
  const sheet = useMemo(() => (quiz && view === "printable" ? quizToSheet(quiz) : null), [quiz, view]);

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
            </div>

            <SubjectField value={subject} onChange={setSubject} />
            <TopicField value={topic} onChange={setTopic} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <LessonCountField value={numQuestions} onChange={setNumQuestions} min={1} max={20} label="Number of questions" unit="questions" />
                <p className="text-xs text-gray-400">Up to 20 to start with. You can add more afterwards, by hand or generated.</p>
              </div>
              <div className="space-y-2">
                <LessonCountField value={timeLimit} onChange={setTimeLimit} min={5} max={300} step={5} label="Time limit per question (seconds)" unit="sec" />
                <p className="text-xs text-gray-400">Used for the countdown when you present the quiz, and in the Kahoot, Blooket and Wayground files.</p>
              </div>
            </div>

            <AnswerTypeField value={answerType} onChange={setAnswerType} />

            <div className="flex gap-3 pt-1">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!questions.length} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current quiz and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum(""); setYearGroup(""); setMixed(false);
                  setSubject(""); setTopic("");
                  setNumQuestions(5); setTimeLimit(30); setAnswerType("single");
                  setQuiz(null); setRunId(null); savedRef.current = null; setSaveState("idle");
                  setError(null); setNotice(null); setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating || unchangedSinceGeneration}
                isGenerating={isGenerating}
                hasResult={questions.length > 0}
              />
            </div>
          </Card>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700" role="alert" data-testid="quiz-error">{error}</div>
      )}

      {quiz && questions.length > 0 && (
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-6" data-testid="quiz-results">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <input
                  type="text"
                  value={quiz.title}
                  aria-label="Quiz title"
                  onChange={(e) => update((q) => ({ ...q, title: e.target.value }))}
                  className="w-full text-lg font-bold text-gray-900 border-0 border-b border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none bg-transparent"
                />
                <p className="text-sm text-gray-500 mt-0.5">
                  {questions.length} question{questions.length === 1 ? "" : "s"}
                  {status && <span className="ml-2" data-testid="quiz-save-state">· {status}</span>}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div role="tablist" aria-label="Quiz view" className="flex p-1 bg-gray-100 rounded-lg">
                  {(["edit", "printable"] as View[]).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="tab"
                      aria-selected={view === v}
                      onClick={() => setView(v)}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md cursor-pointer ${view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-800"}`}
                    >
                      {v === "edit" ? <Pencil className="w-3.5 h-3.5" /> : <Printer className="w-3.5 h-3.5" />}
                      {v === "edit" ? "Edit" : "Printable"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPresenting(true)}
                  className="flex items-center gap-2 border border-gray-900 text-gray-900 text-sm font-medium px-4 py-2 rounded-md hover:bg-gray-50 cursor-pointer"
                  data-testid="quiz-present"
                >
                  <Presentation className="w-4 h-4" /> Present
                </button>
                <DownloadDropdown quiz={quiz} onNotice={setNotice} />
              </div>
            </div>

            {notice && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-4 py-2" role="status" data-testid="quiz-export-notice">{notice}</p>
            )}

            {view === "edit" ? (
              <>
                <div ref={quizListRef} className={`relative space-y-4${jo.joBusy ? " pointer-events-none" : ""}`}>
                  {jo.shown.map((q, i) => (
                    <div key={i} data-jo-item={i}>
                      <QuizCard
                        question={q}
                        index={i}
                        onChange={(updated) => setQuestions(questions.map((old, j) => (j === i ? updated : old)))}
                        onRemove={() => setQuestions(questions.filter((_, j) => j !== i))}
                      />
                    </div>
                  ))}
                  {jo.overlay}
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleAddAI}
                    disabled={isAdding}
                    className="flex items-center gap-2 border border-gray-900 text-gray-900 text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                    {isAdding ? "Adding..." : "Add a generated question"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuestions([...questions, newQuizItem(answerType === "multiple" || answerType === "truefalse" ? answerType : "single")])}
                    className="flex items-center gap-2 border border-gray-300 text-gray-600 text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" /> Add a blank question
                  </button>
                </div>
              </>
            ) : (
              sheet && (
                <div className="flex gap-4 bg-stone-100 rounded-xl px-3 py-6" data-testid="quiz-printable">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-end mb-3">
                      <button type="button" onClick={() => setDesignOpen((o) => !o)} className="text-xs font-semibold px-3 py-1.5 rounded-md border border-gray-300 bg-white cursor-pointer">
                        {designOpen ? "Hide design" : "Design"}
                      </button>
                    </div>
                    <SheetDocument doc={sheet} anchors={false} />
                  </div>
                  {designOpen && (
                    <div className="w-80 shrink-0">
                      <SheetDesignPanel doc={sheet} onDesign={(patch) => update((q) => ({ ...q, design: { ...q.design, ...patch } }))} onClose={() => setDesignOpen(false)} />
                    </div>
                  )}
                </div>
              )
            )}
          </div>
          {view === "edit" && jo.panel}
        </div>
      )}

      {questions.length > 0 && view === "edit" && <RefinePanel isRefining={isRefining} chips={REFINE_CHIPS} onRefine={handleRefine} />}

      {presenting && quiz && <QuizPresenter quiz={quiz} onClose={() => setPresenting(false)} />}
    </div>
  );
}
