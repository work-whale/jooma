"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import {
  SubjectField,
  LearningObjectiveField,
  OutputDetailField,
  AbilityLevelField,
  QuestionTypesField,
  QuestionCountField,
  AdditionalContextField,
  type OutputDetail,
} from "@/app/components/fields";
import { QUESTION_TYPES } from "@/app/components/fields/QuestionTypesField";
import { toTitleCase } from "@/app/lib/formOptions";
import ResultPanel from "@/app/components/ResultPanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import WorksheetNav from "@/app/components/WorksheetNav";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "worksheet-generator";

export default function WorksheetGeneratorForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [learningObjective, setLearningObjective] = useState("");
  const [questionTypes, setQuestionTypes] = useState<string[]>([...QUESTION_TYPES]);
  const [questionCount, setQuestionCount] = useState(10);
  const [abilityLevel, setAbilityLevel] = useState("EXS");
  const [outputDetail, setOutputDetail] = useState<OutputDetail>("detailed");
  const [additionalInfo, setAdditionalInfo] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const canGenerate =
    curriculum && (mixed || yearGroup) && subject.trim() && learningObjective.trim() && questionTypes.length > 0;

  // Raw form state — saved as history input so a past run can refill the form.
  const formState = { curriculum, yearGroup, mixed, subject, learningObjective, questionTypes, questionCount, abilityLevel, outputDetail, additionalInfo };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setLearningObjective((i.learningObjective as string) ?? "");
    setQuestionTypes((i.questionTypes as string[]) ?? [...QUESTION_TYPES]);
    setQuestionCount((i.questionCount as number) ?? 10);
    setAbilityLevel((i.abilityLevel as string) ?? "EXS");
    setOutputDetail((i.outputDetail as OutputDetail) ?? "detailed");
    setAdditionalInfo((i.additionalInfo as string) ?? "");
    setResult(run.output);
    setLastGenerated(JSON.stringify(i));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
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
          abilityLevel,
          outputDetail,
          additionalInfo: additionalInfo.trim() || null,
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
            <LearningObjectiveField value={learningObjective} onChange={setLearningObjective} />

            <QuestionTypesField value={questionTypes} onChange={setQuestionTypes} />
            <QuestionCountField value={questionCount} onChange={setQuestionCount} />

            <OutputDetailField value={outputDetail} onChange={setOutputDetail} />
            <AbilityLevelField value={abilityLevel} onChange={setAbilityLevel} />

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
                  setQuestionTypes([...QUESTION_TYPES]); setQuestionCount(10);
                  setAbilityLevel("EXS"); setOutputDetail("detailed");
                  setAdditionalInfo("");
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

      <div className={result !== null ? "flex gap-8" : ""}>
        {result !== null && (
          <div className="w-md shrink-0">
            <div className="sticky top-8">
              <WorksheetNav />
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <ResultPanel
            result={result}
            isGenerating={isGenerating}
            onChange={(md) => setResult(md)}
            exportFilename={`worksheet-${subject || "export"}`}
            maxWidth={false}
            historyMeta={{ toolSlug: TOOL_SLUG, title: subject || learningObjective || null, input: formState }}
            onSaved={() => setHistoryKey((k) => k + 1)}
          />
        </div>
      </div>
    </div>
  );
}
