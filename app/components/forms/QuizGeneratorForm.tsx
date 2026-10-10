"use client";

import { useRef, useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { SubjectField, TopicField, LessonCountField, AnswerTypeField } from "@/app/components/fields";
import { toTitleCase } from "@/app/lib/formOptions";
import { Loader2, Trash2, Download, ChevronDown, PlusCircle, FileText, FileDown } from "lucide-react";
import ConfirmModal from "@/app/components/ConfirmModal";
import RefinePanel from "@/app/components/RefinePanel";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import { exportToDocx, exportToPdf, PAGE_BREAK } from "@/app/lib/exportUtils";
import DropdownMenu, { type DropdownItem } from "@/app/components/ui/DropdownMenu";
import Card from "@/app/components/ui/Card";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import { saveToolRun, type ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useListJoPanel } from "@/app/components/jo/useListJoPanel";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";

const TOOL_SLUG = "quiz-generator";

interface QuizQuestion {
  question: string;
  options: [string, string, string, string];
  correctIndex: number;
}

const REFINE_CHIPS = [
  "Translate to...",
  "Make the questions less challenging for younger students",
  "Make the questions more challenging for older students",
  "Include questions on...",
  "Remove questions on...",
];

// ---- Download helpers ----

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(content: string, filename: string) {
  triggerDownload(new Blob([content], { type: "text/csv;charset=utf-8;" }), filename);
}

function csvRow(cells: string[]): string {
  return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
}

function downloadGenericCsv(questions: QuizQuestion[], subject: string) {
  const rows = [
    csvRow(["Question", "Option A", "Option B", "Option C", "Option D", "Correct Answer"]),
    ...questions.map((q) =>
      csvRow([
        q.question,
        q.options[0],
        q.options[1],
        q.options[2],
        q.options[3],
        q.options[q.correctIndex],
      ])
    ),
  ];
  downloadCsv(rows.join("\n"), `quiz-${subject || "export"}.csv`);
}

function downloadBlooketCsv(questions: QuizQuestion[], subject: string) {
  // Blooket: Question, Answer, Time Limit (seconds)
  const rows = [
    csvRow(["Question Text", "Correct Answer", "Incorrect Answer 1", "Incorrect Answer 2", "Incorrect Answer 3", "Time Limit (sec)"]),
    ...questions.map((q) => {
      const wrongs = q.options.filter((_, i) => i !== q.correctIndex);
      return csvRow([q.question, q.options[q.correctIndex], wrongs[0], wrongs[1], wrongs[2], "30"]);
    }),
  ];
  downloadCsv(rows.join("\n"), `blooket-${subject || "export"}.csv`);
}

function downloadGimkitCsv(questions: QuizQuestion[], subject: string) {
  // Gimkit: Question, Answer
  const rows = [
    csvRow(["Question", "Answer"]),
    ...questions.map((q) => csvRow([q.question, q.options[q.correctIndex]])),
  ];
  downloadCsv(rows.join("\n"), `gimkit-${subject || "export"}.csv`);
}

function downloadKahootCsv(questions: QuizQuestion[], subject: string) {
  // Kahoot CSV: Question, Answer 1, Answer 2, Answer 3, Answer 4, Time limit, Correct answer
  const rows = [
    csvRow(["Question - max 120 characters", "Answer 1", "Answer 2", "Answer 3", "Answer 4", "Time limit (sec) - 20, 40, 60, 90, 120, 240", "Correct answer(s) - 1, 2, 3 or 4"]),
    ...questions.map((q) =>
      csvRow([
        q.question,
        q.options[0],
        q.options[1],
        q.options[2],
        q.options[3],
        "20",
        String(q.correctIndex + 1),
      ])
    ),
  ];
  downloadCsv(rows.join("\n"), `kahoot-${subject || "export"}.csv`);
}

function downloadWaygroundCsv(questions: QuizQuestion[], subject: string) {
  const rows = [
    csvRow(["Question", "Option A", "Option B", "Option C", "Option D", "Correct"]),
    ...questions.map((q) =>
      csvRow([
        q.question,
        q.options[0],
        q.options[1],
        q.options[2],
        q.options[3],
        String.fromCharCode(65 + q.correctIndex),
      ])
    ),
  ];
  downloadCsv(rows.join("\n"), `wayground-${subject || "export"}.csv`);
}

function downloadMicrosoftFormsDocx(questions: QuizQuestion[], subject: string, topic: string) {
  // Microsoft Forms DOCX: structured Q&A formatted for easy manual entry into MS Forms
  //
  // Deliberately keeps answers inline, unlike quizToMarkdown which moves them
  // to their own page. Nobody hands this to a class — it is read side by side
  // with the Forms UI while typing each question in, so separating a question
  // from its answer would mean flipping back and forth. Not an oversight.
  const lines: string[] = [
    `# ${topic || subject} Quiz`,
    "",
    "Use this document to build your quiz in Microsoft Forms.",
    "Each question is formatted as a Choice question with 4 options.",
    "",
    "---",
    "",
  ];
  questions.forEach((q, i) => {
    lines.push(`## Question ${i + 1} (Multiple Choice)`);
    lines.push("");
    lines.push(q.question);
    lines.push("");
    q.options.forEach((opt, j) => {
      const label = String.fromCharCode(65 + j);
      const correct = j === q.correctIndex ? " ← Correct" : "";
      lines.push(`- ${label}) ${opt}${correct}`);
    });
    lines.push("");
    lines.push(`**Correct answer:** ${String.fromCharCode(65 + q.correctIndex)}) ${q.options[q.correctIndex]}`);
    lines.push("");
  });
  exportToDocx(lines.join("\n"), `ms-forms-${subject || "export"}`);
}

function downloadGoogleAppsScript(questions: QuizQuestion[], subject: string, topic: string) {
  const title = (topic || subject || "Quiz").replace(/'/g, "\\'");
  const questionsJs = questions
    .map((q) => {
      const opts = q.options.map((o) => `'${o.replace(/'/g, "\\'")}'`).join(", ");
      return `  addQuestion(form, '${q.question.replace(/'/g, "\\'")}', [${opts}], ${q.correctIndex});`;
    })
    .join("\n");

  const script = `// Google Apps Script — Quiz Generator
// Instructions:
// 1. Go to script.google.com and create a new project
// 2. Paste this entire script into the editor
// 3. Click Run → createQuiz
// 4. Authorise when prompted — your form will appear in Google Drive

function createQuiz() {
  var form = FormApp.create('${title}');
  form.setIsQuiz(true);
  form.setTitle('${title}');

${questionsJs}

  Logger.log('Form created: ' + form.getEditUrl());
}

function addQuestion(form, questionText, options, correctIndex) {
  var item = form.addMultipleChoiceItem();
  item.setTitle(questionText);
  item.setRequired(true);
  var choices = options.map(function(opt, i) {
    return item.createChoice(opt, i === correctIndex);
  });
  item.setChoices(choices);
  item.setPoints(1);
}
`;
  triggerDownload(
    new Blob([script], { type: "text/plain;charset=utf-8;" }),
    `google-forms-script-${subject || "export"}.gs`
  );
}

/**
 * The student-facing export: questions only, with the answer key on its own
 * page after them.
 *
 * Answers used to sit directly under each question (a ✓ on the correct option
 * plus a "Correct answer:" line), which made the export impossible to hand out.
 * Nothing here may reveal an answer before the PAGE_BREAK.
 */
function quizToMarkdown(questions: QuizQuestion[], subject: string, topic: string): string {
  const lines: string[] = [`# Quiz: ${topic || subject}`, ""];
  if (questions.length === 0) return lines.join("\n");

  questions.forEach((q, i) => {
    lines.push(`## Question ${i + 1}`);
    lines.push("");
    lines.push(q.question);
    lines.push("");
    q.options.forEach((opt, j) => {
      lines.push(`- ${String.fromCharCode(65 + j)}) ${opt}`);
    });
    lines.push("");
    // No rule after the last one: it would render as a stray line at the foot
    // of the page, immediately above the break.
    if (i < questions.length - 1) {
      lines.push("---");
      lines.push("");
    }
  });

  lines.push(PAGE_BREAK);
  lines.push("");
  lines.push("## Answer Key");
  lines.push("");
  questions.forEach((q, i) => {
    lines.push(
      `${i + 1}. ${String.fromCharCode(65 + q.correctIndex)}) ${q.options[q.correctIndex]}`,
    );
  });

  return lines.join("\n");
}

// ---- Quiz card component ----

function QuizCard({
  question,
  index,
  onChange,
  onRemove,
}: {
  question: QuizQuestion;
  index: number;
  onChange: (q: QuizQuestion) => void;
  onRemove: () => void;
}) {
  const setQuestion = (text: string) => onChange({ ...question, question: text });
  const setOption = (i: number, text: string) => {
    const options = [...question.options] as [string, string, string, string];
    options[i] = text;
    onChange({ ...question, options });
  };
  const setCorrect = (i: number) => onChange({ ...question, correctIndex: i });

  const optionInput =
    "flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:border-gray-300 bg-white";

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
      {/* Question header */}
      <div className="flex items-start gap-3">
        <span className="text-sm font-semibold text-gray-500 mt-2 shrink-0">{index + 1})</span>
        <div className="flex-1">
          <input
            type="text"
            value={question.question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full border-0 border-b border-gray-300 pb-1 text-sm font-medium text-gray-900 focus:outline-none focus:border-gray-500 bg-transparent"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-(--j-purple) hover:bg-(--j-deep) px-2.5 py-1.5 rounded transition-colors shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </button>
      </div>

      {/* Options grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
        {question.options.map((opt, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 border rounded-md px-3 py-2 ${
              i === question.correctIndex ? "border-gray-400 bg-gray-50" : "border-gray-200 bg-white"
            }`}
          >
            <input
              type="text"
              value={opt}
              onChange={(e) => setOption(i, e.target.value)}
              className={optionInput}
              style={{ background: "transparent" }}
            />
            <button
              type="button"
              onClick={() => setCorrect(i)}
              aria-label={`Mark option ${String.fromCharCode(65 + i)} as correct`}
              className="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
              style={{
                borderColor: i === question.correctIndex ? "#e05a2b" : "#d1d5db",
                background: "transparent",
              }}
            >
              {i === question.correctIndex && (
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: "#e05a2b" }}
                />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Download dropdown ----

function DownloadDropdown({ questions, subject, topic }: { questions: QuizQuestion[]; subject: string; topic: string }) {
  const [exporting, setExporting] = useState(false);

  const filename = `quiz-${subject || "export"}`;
  const markdown = () => quizToMarkdown(questions, subject, topic);

  // PDF is async and can take a moment on a long quiz, so the trigger reports
  // progress rather than appearing to do nothing.
  const withProgress = (fn: () => Promise<void>) => async () => {
    setExporting(true);
    try {
      await fn();
    } finally {
      setExporting(false);
    }
  };

  const items: DropdownItem[] = [
    {
      label: "Download PDF",
      icon: <FileDown className="w-3.5 h-3.5" />,
      onSelect: withProgress(() => exportToPdf(markdown(), filename)),
    },
    {
      label: "Download Word Doc (DOCX)",
      icon: <FileText className="w-3.5 h-3.5" />,
      onSelect: withProgress(() => exportToDocx(markdown(), filename)),
    },
    {
      label: "Save to Google Docs",
      icon: <Download className="w-3.5 h-3.5" />,
      disabled: true,
      note: "coming soon",
    },
    // The quiz-platform formats are the point of this tool, so they stay
    // together below the document formats rather than being reordered.
    {
      label: "Download Generic (CSV)",
      icon: <Download className="w-3.5 h-3.5" />,
      onSelect: () => downloadGenericCsv(questions, subject),
      separated: true,
    },
    { label: "Download Blooket (CSV)", icon: <Download className="w-3.5 h-3.5" />, onSelect: () => downloadBlooketCsv(questions, subject) },
    { label: "Download Gimkit (CSV)", icon: <Download className="w-3.5 h-3.5" />, onSelect: () => downloadGimkitCsv(questions, subject) },
    { label: "Download Kahoot (CSV)", icon: <Download className="w-3.5 h-3.5" />, onSelect: () => downloadKahootCsv(questions, subject) },
    { label: "Download Wayground (CSV)", icon: <Download className="w-3.5 h-3.5" />, onSelect: () => downloadWaygroundCsv(questions, subject) },
    {
      label: "Download Microsoft Forms (DOCX)",
      icon: <FileText className="w-3.5 h-3.5" />,
      onSelect: () => downloadMicrosoftFormsDocx(questions, subject, topic),
      separated: true,
    },
    {
      label: "Export to Google Forms",
      icon: <Download className="w-3.5 h-3.5" />,
      onSelect: () => downloadGoogleAppsScript(questions, subject, topic),
    },
  ];

  return (
    <DropdownMenu
      ariaLabel="Download options"
      disabled={exporting}
      triggerClassName="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-60 cursor-pointer"
      menuClassName="w-72"
      trigger={
        <>
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {exporting ? "Building…" : "Download"}
          <ChevronDown className="w-4 h-4" />
        </>
      }
      items={items}
    />
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

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const canGenerate = curriculum && (mixed || yearGroup) && subject.trim() && topic.trim();
  // Raw form state — saved as history input so a past run can refill the form.
  const formState = { curriculum, yearGroup, mixed, subject, topic, numQuestions, timeLimit, answerType };
  const formSnapshot = JSON.stringify({ curriculum, yearGroup, mixed, subject, topic, numQuestions, answerType });
  const unchangedSinceGeneration = questions.length > 0 && lastGenerated === formSnapshot;

  // Quiz output is a structured array, not markdown — store it as JSON text.
  const persist = (qs: QuizQuestion[]) => {
    if (!qs.length) return;
    saveToolRun({
      toolSlug: TOOL_SLUG,
      title: topic || subject || null,
      input: formState,
      output: JSON.stringify(qs),
    })
      .then(() => setHistoryKey((k) => k + 1))
      .catch(() => {});
  };

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setTopic((i.topic as string) ?? "");
    setNumQuestions((i.numQuestions as number) ?? 5);
    setTimeLimit((i.timeLimit as number) ?? 30);
    setAnswerType((i.answerType as string) ?? "single");
    try {
      setQuestions(JSON.parse(run.output) as QuizQuestion[]);
    } catch {
      setQuestions([]);
    }
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
    },
  });

  const updateQuestion = (i: number, q: QuizQuestion) => {
    setQuestions((prev) => prev.map((old, idx) => (idx === i ? q : old)));
  };

  const removeQuestion = (i: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  };

  // ── Ask Jo ──
  // Jo's turn is saved the way a refine is: as a new run in the history.
  const quizListRef = useRef<HTMLDivElement>(null);
  const [joOpenSignal, setJoOpenSignal] = useState(0);
  const [joWasGenerating, setJoWasGenerating] = useState(isGenerating);
  if (isGenerating !== joWasGenerating) {
    setJoWasGenerating(isGenerating);
    if (!isGenerating) setJoOpenSignal((n) => n + 1);
  }
  const jo = useListJoPanel<QuizQuestion>({
    tool: "quiz",
    values: questions,
    commit: (next) => {
      setQuestions(next);
      persist(next);
    },
    containerRef: quizListRef,
    disabled: isGenerating || isRefining || isAdding ? "Jo can help as soon as this is finished" : null,
    openSignal: joOpenSignal,
  });

  const handleGenerate = async () => {
    setError(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/quiz-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          topic,
          numQuestions,
          timeLimit,
          answerType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setQuestions(data.questions);
      persist(data.questions);
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
      const res = await fetch("/api/quiz-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add",
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          topic,
          answerType,
          existingQuestions: questions,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add question");
      setQuestions((prev) => {
        const next = [...prev, ...data.questions];
        persist(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddBlank = () => {
    setQuestions((prev) => [
      ...prev,
      { question: "", options: ["", "", "", ""], correctIndex: 0 },
    ]);
  };

  const handleRefine = async (instruction: string) => {
    if (!questions.length) return;
    setIsRefining(true);
    try {
      const res = await fetch("/api/quiz-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refine", existingQuestions: questions, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refinement failed");
      setQuestions(data.questions);
      persist(data.questions);
    } catch {
      // questions stay as-is
    } finally {
      setIsRefining(false);
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

            <SubjectField value={subject} onChange={setSubject} />

            <TopicField value={topic} onChange={setTopic} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <LessonCountField
                  value={numQuestions}
                  onChange={setNumQuestions}
                  min={1}
                  max={20}
                  label="Number of questions"
                  unit="questions"
                />
                <p className="text-xs text-gray-400">
                  You can choose to generate up to 20 initial questions and then add your own or generate additional AI questions.
                </p>
              </div>
              <LessonCountField
                value={timeLimit}
                onChange={setTimeLimit}
                min={5}
                max={300}
                step={5}
                label="Time limit per question (seconds)"
                unit="sec"
              />
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
                  setQuestions([]); setError(null); setConfirmingReset(false);
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
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Results panel */}
      {questions.length > 0 && (
        <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">My results</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                All of the fields in this quiz are editable — feel free to modify the questions, answers or correct answers simply by clicking in the text boxes and editing them.
              </p>
            </div>
            <DownloadDropdown questions={questions} subject={subject} topic={topic} />
          </div>

          <div ref={quizListRef} className={`relative space-y-4${jo.joBusy ? " pointer-events-none" : ""}`}>
            {jo.shown.map((q, i) => (
              <div key={i} data-jo-item={i}>
                <QuizCard
                  question={q}
                  index={i}
                  onChange={(updated) => updateQuestion(i, updated)}
                  onRemove={() => removeQuestion(i)}
                />
              </div>
            ))}
            {jo.overlay}
          </div>

          {/* Add buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleAddAI}
              disabled={isAdding}
              className="flex items-center gap-2 border border-gray-900 text-gray-900 text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {isAdding
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <PlusCircle className="w-4 h-4" />}
              {isAdding ? "Adding..." : "Add another AI generated question"}
            </button>
            <button
              type="button"
              onClick={handleAddBlank}
              className="flex items-center gap-2 border border-gray-300 text-gray-600 text-sm font-medium px-4 py-2 rounded-full hover:bg-gray-50 transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Add blank quiz question
            </button>
          </div>

          {/* Bottom download */}
          <div className="flex justify-end pt-2">
            <DownloadDropdown questions={questions} subject={subject} topic={topic} />
          </div>
        </div>
        {jo.panel}
        </div>
      )}

      {questions.length > 0 && (
        <RefinePanel
          isRefining={isRefining}
          chips={REFINE_CHIPS}
          onRefine={handleRefine}
        />
      )}
    </div>
  );
}
