"use client";

import { useRef, useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { toTitleCase } from "@/app/lib/formOptions";
import { Loader2, Sparkles, Minus, Plus, Trash2, Download, ChevronDown, PlusCircle } from "lucide-react";
import ConfirmModal from "@/app/components/ConfirmModal";
import RefinePanel from "@/app/components/RefinePanel";
import { exportToDocx } from "@/app/lib/exportUtils";
import Card from "@/app/components/ui/Card";

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

const ANSWER_TYPES = [
  { label: "Single correct answer", value: "single" },
  { label: "Multiple correct answers", value: "multiple" },
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

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

function quizToMarkdown(questions: QuizQuestion[], subject: string, topic: string): string {
  const lines: string[] = [`# Quiz: ${topic || subject}`, ""];
  questions.forEach((q, i) => {
    lines.push(`## Question ${i + 1}`);
    lines.push("");
    lines.push(q.question);
    lines.push("");
    q.options.forEach((opt, j) => {
      const label = String.fromCharCode(65 + j);
      const correct = j === q.correctIndex ? " ✓" : "";
      lines.push(`- ${label}) ${opt}${correct}`);
    });
    lines.push("");
    lines.push(`**Correct answer:** ${String.fromCharCode(65 + q.correctIndex)}) ${q.options[q.correctIndex]}`);
    lines.push("");
    lines.push("---");
    lines.push("");
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
          className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#1a1a1a] hover:bg-gray-800 px-2.5 py-1.5 rounded transition-colors shrink-0"
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handle = (fn: () => void) => {
    fn();
    setOpen(false);
  };

  const items: { label: string; action: () => void }[] = [
    { label: "Download Generic (CSV)", action: () => downloadGenericCsv(questions, subject) },
    { label: "Download Blooket (CSV)", action: () => downloadBlooketCsv(questions, subject) },
    { label: "Download Gimkit (CSV)", action: () => downloadGimkitCsv(questions, subject) },
    { label: "Download Kahoot (CSV)", action: () => downloadKahootCsv(questions, subject) },
    { label: "Download Wayground (CSV)", action: () => downloadWaygroundCsv(questions, subject) },
    {
      label: "Download Word Doc (DOCX)",
      action: () => exportToDocx(quizToMarkdown(questions, subject, topic), `quiz-${subject || "export"}`),
    },
    {
      label: "Download Microsoft Forms (DOCX)",
      action: () => downloadMicrosoftFormsDocx(questions, subject, topic),
    },
    {
      label: "Export to Google Forms",
      action: () => downloadGoogleAppsScript(questions, subject, topic),
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
      >
        <Download className="w-4 h-4" />
        Download
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 py-1">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handle(item.action)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
              >
                <Download className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---- Main component ----

export default function QuizGeneratorForm({ sidebar }: { sidebar: React.ReactNode }) {
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

  const canGenerate = curriculum && (mixed || yearGroup) && subject.trim() && topic.trim();
  const formSnapshot = JSON.stringify({ curriculum, yearGroup, mixed, subject, topic, numQuestions, answerType });
  const unchangedSinceGeneration = questions.length > 0 && lastGenerated === formSnapshot;

  const updateQuestion = (i: number, q: QuizQuestion) => {
    setQuestions((prev) => prev.map((old, idx) => (idx === i ? q : old)));
  };

  const removeQuestion = (i: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  };

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
      setQuestions((prev) => [...prev, ...data.questions]);
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
    } catch {
      // questions stay as-is
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">{sidebar}</div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <CurriculumYearFields
              curriculum={curriculum} onCurriculumChange={setCurriculum}
              yearGroup={yearGroup} onYearGroupChange={setYearGroup}
              mixed={mixed} onMixedChange={setMixed}
              yearGroupNote
            />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Science"
                className={inputClass}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. difference between solid, liquid, and gas"
                className={inputClass}
              />
            </div>

            {/* Number of questions + Time limit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Number of questions</label>
                <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                  <span className="flex-1 px-3 py-2 text-sm text-gray-900">{numQuestions}</span>
                  <button
                    type="button"
                    onClick={() => setNumQuestions((v) => Math.max(1, v - 1))}
                    disabled={numQuestions <= 1}
                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 border-l border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Decrease"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setNumQuestions((v) => Math.min(20, v + 1))}
                    disabled={numQuestions >= 20}
                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 border-l border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Increase"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-400">
                  You can choose to generate up to 20 initial questions and then add your own or generate additional AI questions.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Time limit per question (seconds)</label>
                <div className="flex items-center border border-gray-300 rounded-md overflow-hidden">
                  <span className="flex-1 px-3 py-2 text-sm text-gray-900">{timeLimit}</span>
                  <button
                    type="button"
                    onClick={() => setTimeLimit((v) => Math.max(5, v - 5))}
                    disabled={timeLimit <= 5}
                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 border-l border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Decrease"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeLimit((v) => Math.min(300, v + 5))}
                    disabled={timeLimit >= 300}
                    className="px-3 py-2 text-gray-600 hover:bg-gray-100 border-l border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Increase"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Single or multiple choice</label>
              <select value={answerType} onChange={(e) => setAnswerType(e.target.value)} className={selectClass}>
                {ANSWER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setConfirmingReset(true)}
                disabled={!questions.length}
                className="border border-gray-200 text-gray-600 py-3 px-5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Reset
              </button>
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
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating || unchangedSinceGeneration}
                className="flex-1 bg-[#1a1a1a] text-white py-3 px-6 rounded-xl text-sm font-semibold hover:bg-gray-800 active:bg-gray-900 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isGenerating
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
                  : <><Sparkles className="w-4 h-4" />{questions.length ? "Regenerate" : "Generate"}</>}
              </button>
            </div>
          </Card>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">{error}</div>
      )}

      {/* Results panel */}
      {questions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900">My results</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                All of the fields in this quiz are editable — feel free to modify the questions, answers or correct answers simply by clicking in the text boxes and editing them.
              </p>
            </div>
            <DownloadDropdown questions={questions} subject={subject} topic={topic} />
          </div>

          <div className="space-y-4">
            {questions.map((q, i) => (
              <QuizCard
                key={i}
                question={q}
                index={i}
                onChange={(updated) => updateQuestion(i, updated)}
                onRemove={() => removeQuestion(i)}
              />
            ))}
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
