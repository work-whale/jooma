"use client";

import { useId, useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { SubjectField, TopicField, LessonCountField } from "@/app/components/fields";
import { toTitleCase } from "@/app/lib/formOptions";
import ToolResults from "@/app/components/ToolResults";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import { parseSheet } from "@/app/lib/sheets/normalize";
import { isQuestion } from "@/app/lib/sheets/types";
import { DEFAULT_EXAM_STYLE, EXAM_STYLES, examStyle, isExamStyle, offersTier, styleFromExamType } from "@/app/lib/sheets/exam-styles";

const TOOL_SLUG = "exam-question-generator";

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const GROUPS: { phase: string; label: string }[] = [
  { phase: "gcse", label: "GCSE" },
  { phase: "ks2", label: "Key Stage 2 (Year 6)" },
  { phase: "school", label: "Any year" },
];

export default function ExamQuestionGeneratorForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` / `?prefill=`, read on the server and passed down. */
  launch?: ToolLaunchParams;
}) {
  const fieldId = useId();
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [styleId, setStyleId] = useState(DEFAULT_EXAM_STYLE);
  const [tier, setTier] = useState<"foundation" | "higher">("higher");
  const [minutes, setMinutes] = useState(examStyle(DEFAULT_EXAM_STYLE).minutes);
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [numQuestions, setNumQuestions] = useState(5);
  const [minMarks, setMinMarks] = useState(2);
  const [maxMarks, setMaxMarks] = useState(6);
  const [includeMarkScheme, setIncludeMarkScheme] = useState(true);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  // The history run on screen, so edits to its paper save back into it.
  const [runId, setRunId] = useState<string | null>(null);

  const style = examStyle(styleId);
  // A KS2 paper's subject is part of the style.
  const paperSubject = style.subject ?? subject;
  const tiered = offersTier(style, paperSubject);

  const canGenerate = curriculum && (mixed || yearGroup) && paperSubject.trim() && topic.trim();

  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, yearGroup, mixed, subject, examStyle: styleId, tier, minutes, topic, content, numQuestions, minMarks, maxMarks, includeMarkScheme };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  /** Picking a style sets its usual time, and a KS2 style its year. */
  const pickStyle = (id: string) => {
    const next = examStyle(id);
    setStyleId(next.id);
    setMinutes(next.minutes);
    if (next.years.length === 1) { setYearGroup(next.years[0]); setMixed(false); }
  };

  const restore = (run: ToolRun) => {
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    // A paper saved before styles had a free text exam type: it reopens as
    // the closest style, its wording kept in the content box.
    const id = isExamStyle(i.examStyle) ? (i.examStyle as string) : styleFromExamType(i.examType);
    setStyleId(id);
    setTier(i.tier === "foundation" ? "foundation" : "higher");
    setMinutes(typeof i.minutes === "number" ? i.minutes : examStyle(id).minutes);
    setTopic((i.topic as string) ?? "");
    const oldType = !isExamStyle(i.examStyle) && typeof i.examType === "string" && i.examType.trim() ? `Exam type: ${i.examType.trim()}` : "";
    setContent([oldType, (i.content as string) ?? ""].filter(Boolean).join("\n"));
    setNumQuestions((i.numQuestions as number) ?? 5);
    setMinMarks((i.minMarks as number) ?? 2);
    setMaxMarks((i.maxMarks as number) ?? 6);
    setIncludeMarkScheme(i.includeMarkScheme === undefined ? true : Boolean(i.includeMarkScheme));
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
      topic: (v) => setTopic(v as string),
      examStyle: (v) => { if (isExamStyle(v)) pickStyle(v as string); },
      examType: (v) => pickStyle(styleFromExamType(v)),
      tier: (v) => setTier(v === "foundation" ? "foundation" : "higher"),
      numQuestions: (v) => setNumQuestions(v as number),
      includeMarkScheme: (v) => setIncludeMarkScheme(v as boolean),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setNotice(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = {
      yearGroup: mixed ? "Mixed" : yearGroup,
      subject: toTitleCase(paperSubject),
      examStyle: styleId,
      tier: tiered ? tier : "",
      minutes,
      includeAnswerKey: includeMarkScheme,
    };
    try {
      const res = await fetch("/api/exam-question-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          curriculum,
          yearGroup: info.yearGroup,
          subject: info.subject,
          examStyle: styleId,
          tier: info.tier,
          minutes,
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
      // The paper streams in as a sheet: cover, questions, then the mark scheme.
      const finished = await readSheetStream(res, "exam", info, setResult);
      if (!finished) throw new Error("The paper came back empty. Please try again.");
      // The schema asks for every question, but say so if any are missing.
      const got = parseSheet(finished)?.sections.filter((s) => s.blocks.some(isQuestion)).length ?? 0;
      if (got < numQuestions) setNotice(`The paper came back with ${got} of the ${numQuestions} questions asked for. Ask Jo to add the rest, or generate again.`);
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

            <div className="space-y-1.5">
              <label htmlFor={`${fieldId}-style`} className="block text-sm font-semibold text-gray-800">Paper style</label>
              <select id={`${fieldId}-style`} value={styleId} onChange={(e) => pickStyle(e.target.value)} className={inputClass} data-testid="exam-style">
                {GROUPS.map((g) => (
                  <optgroup key={g.phase} label={g.label}>
                    {EXAM_STYLES.filter((s) => s.phase === g.phase).map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-xs text-gray-500">
                {style.board
                  ? `Original questions set out the way ${style.board} papers are. It is a practice paper, not an official one.`
                  : style.phase === "ks2"
                    ? "Set out like the Year 6 national tests. A practice paper, not an official one."
                    : "A test for any year group, getting harder through the paper."}
              </p>
            </div>

            <CurriculumYearFields
              curriculum={curriculum} onCurriculumChange={setCurriculum}
              yearGroup={yearGroup} onYearGroupChange={setYearGroup}
              mixed={mixed} onMixedChange={setMixed}
              yearGroupNote
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            {style.subject ? (
              <p className="text-sm text-gray-700"><span className="font-semibold">Subject:</span> {style.subject}</p>
            ) : (
              <SubjectField value={subject} onChange={setSubject} />
            )}

            {tiered && (
              <fieldset className="space-y-2" data-testid="exam-tier">
                <legend className="block text-sm font-semibold text-gray-800">Tier</legend>
                <div className="flex gap-5">
                  {(["foundation", "higher"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name={`${fieldId}-tier`} checked={tier === t} onChange={() => setTier(t)} className="accent-stone-700 w-4 h-4" />
                      {t === "foundation" ? "Foundation" : "Higher"}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <TopicField value={topic} onChange={setTopic} />

            <div className="space-y-1.5">
              <label htmlFor={`${fieldId}-1`} className="block text-sm font-semibold text-gray-800">
                Knowledge, skills or content to cover
                <span className="ml-2 text-xs font-normal text-gray-400">optional</span>
              </label>
              <textarea
                id={`${fieldId}-1`}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Paste specification points, or list what the paper should cover. The more specific, the better."
                rows={4}
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <LessonCountField value={numQuestions} onChange={setNumQuestions} min={1} max={20} label="Number of questions" unit="questions" />
              <LessonCountField value={minutes} onChange={setMinutes} min={10} max={240} step={5} label="Time allowed (minutes)" unit="min" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <LessonCountField value={minMarks} onChange={(v) => { setMinMarks(v); if (v > maxMarks) setMaxMarks(v); }} min={1} max={20} label="Fewest marks a question" unit="marks" />
              <LessonCountField value={maxMarks} onChange={(v) => { setMaxMarks(v); if (v < minMarks) setMinMarks(v); }} min={1} max={20} label="Most marks a question" unit="marks" />
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={includeMarkScheme} onChange={(e) => setIncludeMarkScheme(e.target.checked)} className="accent-stone-700 w-4 h-4" />
              Include the mark scheme (on its own pages at the end)
            </label>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum(""); setYearGroup(""); setMixed(false);
                  setSubject(""); setStyleId(DEFAULT_EXAM_STYLE); setTier("higher"); setMinutes(examStyle(DEFAULT_EXAM_STYLE).minutes);
                  setTopic(""); setContent("");
                  setNumQuestions(5); setMinMarks(2); setMaxMarks(6);
                  setIncludeMarkScheme(true);
                  setResult(null); setRunId(null); setError(null); setConfirmingReset(false);
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
      {notice && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800" role="status" data-testid="exam-notice">{notice}</div>
      )}

      <ToolResults
        result={result}
        isGenerating={isGenerating}
        onChange={(md) => setResult(md)}
        exportFilename={`exam-${topic || paperSubject || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: topic || paperSubject || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
