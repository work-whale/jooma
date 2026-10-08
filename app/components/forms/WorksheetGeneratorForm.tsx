"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import {
  SubjectField,
  LearningObjectiveField,
  OutputDetailField,
  DifferentiationField,
  QuestionTypesField,
  QuestionCountField,
  AdditionalContextField,
  type OutputDetail,
} from "@/app/components/fields";
import { restoreDifferentiation, type Differentiate } from "@/app/lib/differentiation";
import { toTitleCase } from "@/app/lib/formOptions";
import ToolResults from "@/app/components/ToolResults";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import type { ToolRun } from "@/app/lib/toolRuns";
import { readSheetStream } from "@/app/lib/sheets/client-stream";

const TOOL_SLUG = "worksheet-generator";

export default function WorksheetGeneratorForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  launch?: ToolLaunchParams;
}) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [learningObjective, setLearningObjective] = useState("");
  // Starts empty: the teacher ticks only the formats they want. Optional, so
  // an empty pick means "a mix that suits the subject" rather than a disabled
  // Generate, which is also what keeps a form Jo prefilled ready to go.
  const [questionTypes, setQuestionTypes] = useState<string[]>([]);
  const [questionCount, setQuestionCount] = useState(10);
  const [differentiate, setDifferentiate] = useState<Differentiate>("no");
  const [differentiationLevels, setDifferentiationLevels] = useState<string[]>([]);
  const [outputDetail, setOutputDetail] = useState<OutputDetail>("detailed");
  const [additionalInfo, setAdditionalInfo] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  // The history run on screen, so edits to its sheet save back into it.
  const [runId, setRunId] = useState<string | null>(null);

  const canGenerate =
    curriculum && (mixed || yearGroup) && subject.trim() && learningObjective.trim() &&
    (differentiate === "no" || differentiationLevels.length > 0);

  // Raw form state — saved as history input so a past run can refill the form.
  const formState = { curriculum, yearGroup, mixed, subject, learningObjective, questionTypes, questionCount, differentiate, differentiationLevels, outputDetail, additionalInfo };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setLearningObjective((i.learningObjective as string) ?? "");
    setQuestionTypes((i.questionTypes as string[]) ?? []);
    setQuestionCount((i.questionCount as number) ?? 10);
    const d = restoreDifferentiation(i);
    setDifferentiate(d.differentiate);
    setDifferentiationLevels(d.levels);
    setOutputDetail((i.outputDetail as OutputDetail) ?? "detailed");
    setAdditionalInfo((i.additionalInfo as string) ?? "");
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // NOTE: no `topic` key — this form genuinely has no topic field, and the
  // subject matter rides in learningObjective. assistant-tools.ts models it the
  // same way, so the two cannot drift.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      curriculum: (v) => setCurriculum(v as string),
      yearGroup: (v) => setYearGroup(v as string),
      subject: (v) => setSubject(v as string),
      learningObjective: (v) => setLearningObjective(v as string),
      questionCount: (v) => setQuestionCount(v as number),
      differentiate: (v) => setDifferentiate(v as Differentiate),
      differentiationLevels: (v) => setDifferentiationLevels(v as string[]),
      outputDetail: (v) => setOutputDetail(v as OutputDetail),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/worksheet-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          learningObjective,
          questionTypes,
          questionCount,
          differentiate,
          differentiationLevels,
          outputDetail,
          additionalInfo: additionalInfo.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      // The route streams the sheet as JSON; each update arrives here as a
      // whole, valid sheet, so the page fills in block by block.
      const finished = await readSheetStream(res, "worksheet", { yearGroup: mixed ? "Mixed" : yearGroup, subject: toTitleCase(subject) }, setResult);
      if (!finished) throw new Error("The worksheet came back empty. Please try again.");
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

            <SubjectField value={subject} onChange={setSubject} />
            <LearningObjectiveField value={learningObjective} onChange={setLearningObjective} />

            <QuestionTypesField value={questionTypes} onChange={setQuestionTypes} optional />
            <QuestionCountField value={questionCount} onChange={setQuestionCount} />

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
              placeholders={[
                "e.g. Add more fluency questions",
                "e.g. Include more reasoning questions",
                "e.g. Focus on word problems",
              ]}
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
                  setSubject(""); setLearningObjective("");
                  setQuestionTypes([]); setQuestionCount(10);
                  setDifferentiate("no"); setDifferentiationLevels([]); setOutputDetail("detailed");
                  setAdditionalInfo("");
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
        exportFilename={`worksheet-${subject || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: subject || learningObjective || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
