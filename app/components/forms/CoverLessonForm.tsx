"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import {
  SubjectField,
  CoverTopicField,
  LessonLengthField,
  CoverResourcesField,
  AdditionalContextField,
  DifferentiationField,
} from "@/app/components/fields";
import { restoreDifferentiation, type Differentiate } from "@/app/lib/differentiation";
import { toTitleCase } from "@/app/lib/formOptions";
import ToolResults from "@/app/components/ToolResults";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import GenerateOutlineButton from "@/app/components/ui/GenerateOutlineButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import { coverMinutes } from "@/app/lib/sheets/cover";
import { lessonMinutes } from "@/app/lib/sheets/lesson";

const TOOL_SLUG = "cover-lesson";

export default function CoverLessonForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [lessonLength, setLessonLength] = useState("");
  const [resources, setResources] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [differentiate, setDifferentiate] = useState<Differentiate>("no");
  const [differentiationLevels, setDifferentiationLevels] = useState<string[]>([]);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  // The history run on screen, so edits to its plan save back into it.
  const [runId, setRunId] = useState<string | null>(null);

  // Raw form state — saved as history input so a past run can refill the form.
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, yearGroup, mixed, subject, topic, lessonLength, resources, additionalContext, differentiate, differentiationLevels };

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setTopic((i.topic as string) ?? "");
    setLessonLength((i.lessonLength as string) ?? "");
    setResources((i.resources as string) ?? "");
    setAdditionalContext((i.additionalContext as string) ?? "");
    const d = restoreDifferentiation(i);
    setDifferentiate(d.differentiate);
    setDifferentiationLevels(d.levels);
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      curriculum: (v) => setCurriculum(v as string),
      yearGroup: (v) => setYearGroup(v as string),
      subject: (v) => setSubject(v as string),
      topic: (v) => setTopic(v as string),
      lessonLength: (v) => setLessonLength(v as string),
      resources: (v) => setResources(v as string),
      differentiate: (v) => setDifferentiate(v as Differentiate),
      differentiationLevels: (v) => setDifferentiationLevels(v as string[]),
    },
  });

  const canGenerate = curriculum && (mixed || yearGroup) && subject.trim() && topic.trim() && lessonLength && resources &&
    (differentiate === "no" || differentiationLevels.length > 0);

  const formSnapshot = JSON.stringify({
    curriculum, yearGroup, mixed, subject, topic, lessonLength, resources, additionalContext, differentiate, differentiationLevels,
  });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    // The length as minutes, for the timings and the subtitle.
    const info = { curriculum, yearGroup: mixed ? "Mixed" : yearGroup, subject: toTitleCase(subject), topic, lessonLength: lessonMinutes(coverMinutes(lessonLength) ?? undefined) };
    try {
      const res = await fetch("/api/cover-lesson", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          topic,
          lessonLength,
          resources,
          differentiate,
          differentiationLevels,
          additionalContext: additionalContext.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      // The route streams the lesson as JSON; each update arrives here as a
      // whole, valid sheet, so the pages fill in as the model writes.
      const finished = await readSheetStream(res, "cover", info, setResult);
      if (!finished) throw new Error("The cover lesson came back empty. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setCurriculum("");
    setYearGroup("");
    setMixed(false);
    setSubject("");
    setTopic("");
    setLessonLength("");
    setResources("");
    setAdditionalContext("");
    setDifferentiate("no");
    setDifferentiationLevels([]);
    setResult(null);
    setRunId(null);
    setError(null);
    setConfirmingReset(false);
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
        <div className="lg:col-span-1">{sidebar}<ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} /></div>

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

            <CoverTopicField value={topic} onChange={setTopic} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <LessonLengthField value={lessonLength} onChange={setLessonLength} />
              <CoverResourcesField value={resources} onChange={setResources} />
            </div>

            <DifferentiationField
              value={differentiate}
              onChange={setDifferentiate}
              levels={differentiationLevels}
              onLevelsChange={setDifferentiationLevels}
            />

            <AdditionalContextField
              value={additionalContext}
              onChange={setAdditionalContext}
              rows={4}
              placeholders={[
                `e.g. "This is a top set."`,
                `e.g. "The class can be challenging, so keep activities short."`,
                `e.g. "Pupils have been revising for an upcoming test."`,
                `e.g. "There are several SEND pupils, so please keep instructions clear."`,
              ]}
              labelSlot={
                <GenerateOutlineButton
                  topic={topic}
                  subject={subject}
                  yearGroup={mixed ? "Mixed" : yearGroup}
                  onGenerate={setAdditionalContext}
                />
              }
            />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current cover lesson and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={handleReset}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating || unchangedSinceGeneration}
                isGenerating={isGenerating}
                hasResult={result !== null}
              />
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
        exportFilename={`cover-lesson-${subject || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: topic || subject || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
