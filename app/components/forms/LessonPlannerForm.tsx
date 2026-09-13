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

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const canGenerate =
    curriculum && (mixed || yearGroup) && subject.trim() && topic.trim() && learningObjective.trim() &&
    (differentiate === "no" || differentiationLevels.length > 0);

  // Raw form state — saved as history input so a past run can refill the form.
  const formState = { curriculum, yearGroup, mixed, subject, topic, learningObjective, differentiate, differentiationLevels, outputDetail, additionalInfo };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
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
    setResult(run.output);
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
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/lesson-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          topic,
          learningObjective,
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

            <SubjectField value={subject} onChange={setSubject} />
            <TopicField value={topic} onChange={setTopic} />
            <LearningObjectiveField value={learningObjective} onChange={setLearningObjective} />

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

      <ToolResults
        result={result}
        isGenerating={isGenerating}
        onChange={(md) => setResult(md)}
        exportFilename={`lesson-plan-${topic || subject || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: topic || subject || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
      />
    </div>
  );
}
