"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { SubjectField, TopicField, LearningObjectiveField, AdditionalContextField, OutputDetailField, DifferentiationField, type OutputDetail } from "@/app/components/fields";
import { restoreDifferentiation, type Differentiate } from "@/app/lib/differentiation";
import GenerateOutlineButton from "@/app/components/ui/GenerateOutlineButton";
import { toTitleCase } from "@/app/lib/formOptions";
import ToolResults from "@/app/components/ToolResults";
import Card from "@/app/components/ui/Card";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import type { ToolRun } from "@/app/lib/toolRuns";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";
import LessonLayoutField from "@/app/components/fields/LessonLayoutField";
import LessonMinutesField from "@/app/components/fields/LessonMinutesField";
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import { DEFAULT_LESSON_LAYOUT, DEFAULT_LESSON_MINUTES, isLessonLayout, lessonMinutes } from "@/app/lib/sheets/lesson";
import type { LessonLayout } from "@/app/lib/sheets/types";

const TOOL_SLUG = "lesson-planner";

export default function LessonPlannerForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` / `?prefill=`, read on the server and passed down. */
  launch?: ToolLaunchParams;
}) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [learningObjective, setLearningObjective] = useState("");
  const [differentiate, setDifferentiate] = useState<Differentiate>("no");
  const [differentiationLevels, setDifferentiationLevels] = useState<string[]>([]);
  const [outputDetail, setOutputDetail] = useState<OutputDetail>("detailed");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [layout, setLayout] = useState<LessonLayout>(DEFAULT_LESSON_LAYOUT);
  const [lessonLength, setLessonLength] = useState(DEFAULT_LESSON_MINUTES);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  // The history run on screen, so edits to its plan save back into it.
  const [runId, setRunId] = useState<string | null>(null);

  const canGenerate =
    curriculum && (mixed || yearGroup) && subject.trim() && topic.trim() && learningObjective.trim() &&
    (differentiate === "no" || differentiationLevels.length > 0);

  // Raw form state — saved as history input so a past run can refill the form.
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, yearGroup, mixed, subject, topic, learningObjective, differentiate, differentiationLevels, outputDetail, additionalInfo, layout, lessonLength };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setTopic((i.topic as string) ?? "");
    setLearningObjective((i.learningObjective as string) ?? "");
    const d = restoreDifferentiation(i);
    setDifferentiate(d.differentiate);
    setDifferentiationLevels(d.levels);
    setOutputDetail((i.outputDetail as OutputDetail) ?? "detailed");
    setAdditionalInfo((i.additionalInfo as string) ?? "");
    // Runs saved before layouts existed were plain documents; their form
    // comes back as a 60 minute three-part plan.
    setLayout(isLessonLayout(i.layout) ? i.layout : DEFAULT_LESSON_LAYOUT);
    setLessonLength(i.lessonLength === undefined ? DEFAULT_LESSON_MINUTES : lessonMinutes(i.lessonLength));
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // ?run= reopens a saved run; ?prefill= fills the form from the assistant.
  // The setter map is the form-state shape — the same keys `formState` above
  // persists, which is what /folders reads its Subject and Year facets from.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      curriculum: (v) => setCurriculum(v as string),
      yearGroup: (v) => setYearGroup(v as string),
      subject: (v) => setSubject(v as string),
      topic: (v) => setTopic(v as string),
      learningObjective: (v) => setLearningObjective(v as string),
      differentiate: (v) => setDifferentiate(v as Differentiate),
      differentiationLevels: (v) => setDifferentiationLevels(v as string[]),
      outputDetail: (v) => setOutputDetail(v as OutputDetail),
      layout: (v) => { if (isLessonLayout(v)) setLayout(v); },
      lessonLength: (v) => setLessonLength(lessonMinutes(v)),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = { curriculum, yearGroup: mixed ? "Mixed" : yearGroup, subject: toTitleCase(subject), topic, layout, lessonLength };
    try {
      const res = await fetch("/api/lesson-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          topic,
          learningObjective,
          differentiate,
          differentiationLevels,
          outputDetail,
          additionalInfo: additionalInfo.trim() || null,
          layout,
          lessonLength,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      // The route streams the plan as JSON; each update arrives here as a
      // whole, valid sheet in the chosen layout, so the pages fill in as the
      // model writes.
      const finished = await readSheetStream(res, "lesson", info, setResult);
      if (!finished) throw new Error("The lesson plan came back empty. Please try again.");
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
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <SubjectField value={subject} onChange={setSubject} />
            <TopicField value={topic} onChange={setTopic} />
            <LearningObjectiveField value={learningObjective} onChange={setLearningObjective} />

            <LessonLayoutField value={layout} onChange={setLayout} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LessonMinutesField value={lessonLength} onChange={setLessonLength} />
            </div>

            <OutputDetailField value={outputDetail} onChange={setOutputDetail} />
            <DifferentiationField
              value={differentiate}
              onChange={setDifferentiate}
              levels={differentiationLevels}
              onLevelsChange={setDifferentiationLevels}
            />

            <AdditionalContextField
              value={additionalInfo}
              onChange={setAdditionalInfo}
              rows={4}
              labelSlot={
                <GenerateOutlineButton
                  topic={topic}
                  subject={subject}
                  yearGroup={mixed ? "Mixed" : yearGroup}
                  onGenerate={setAdditionalInfo}
                />
              }
            />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum(""); setYearGroup(""); setMixed(false);
                  setSubject(""); setTopic(""); setLearningObjective("");
                  setDifferentiate("no"); setDifferentiationLevels([]);
                  setOutputDetail("detailed");
                  setAdditionalInfo("");
                  setLayout(DEFAULT_LESSON_LAYOUT); setLessonLength(DEFAULT_LESSON_MINUTES);
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

      <ToolResults
        result={result}
        isGenerating={isGenerating}
        onChange={(md) => setResult(md)}
        exportFilename={`lesson-plan-${topic || subject || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: topic || subject || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
