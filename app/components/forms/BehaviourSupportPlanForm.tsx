"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import {
  PupilNameField,
  GenderField,
  StudentClassField,
  SupportNeedsField,
  KeyStaffField,
  BehaviourDescriptionField,
  BehaviouralTriggersField,
  TopicField,
  PlanStartDateField,
  ReviewDateField,
} from "@/app/components/fields";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "behaviour-support-plan";

const REFINE_CHIPS = [
  "Translate to...",
  "Provide more strategies for...",
  "Remove the section on...",
  "Add more detail on...",
  "Make the plan more concise...",
  "Add in the following strategy:",
];

export default function BehaviourSupportPlanForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);

  const [studentName, setStudentName] = useState("");
  const [studentGender, setStudentGender] = useState("Male");
  const [studentClass, setStudentClass] = useState("");
  const [supportNeeds, setSupportNeeds] = useState("");
  const [keyStaff, setKeyStaff] = useState("");
  const [behaviourDescription, setBehaviourDescription] = useState("");
  const [behaviouralTriggers, setBehaviouralTriggers] = useState("");
  const [behaviouralPatterns, setBehaviouralPatterns] = useState("");
  const [strengths, setStrengths] = useState("");
  const [dislikes, setDislikes] = useState("");
  const [previousInterventions, setPreviousInterventions] = useState("");
  const [planStartDate, setPlanStartDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const resolvedYearGroup = mixed ? "Mixed year group" : yearGroup;
  const canGenerate = curriculum.trim() && resolvedYearGroup.trim() && studentName.trim() &&
    behaviourDescription.trim() && behaviouralTriggers.trim();
  const formState = { curriculum, yearGroup, mixed, studentName, studentGender, studentClass, supportNeeds, keyStaff, behaviourDescription, behaviouralTriggers, behaviouralPatterns, strengths, dislikes, previousInterventions, planStartDate, reviewDate };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setStudentName((i.studentName as string) ?? "");
    setStudentGender((i.studentGender as string) ?? "Male");
    setStudentClass((i.studentClass as string) ?? "");
    setSupportNeeds((i.supportNeeds as string) ?? "");
    setKeyStaff((i.keyStaff as string) ?? "");
    setBehaviourDescription((i.behaviourDescription as string) ?? "");
    setBehaviouralTriggers((i.behaviouralTriggers as string) ?? "");
    setBehaviouralPatterns((i.behaviouralPatterns as string) ?? "");
    setStrengths((i.strengths as string) ?? "");
    setDislikes((i.dislikes as string) ?? "");
    setPreviousInterventions((i.previousInterventions as string) ?? "");
    setPlanStartDate((i.planStartDate as string) ?? "");
    setReviewDate((i.reviewDate as string) ?? "");
    setResult(run.output);
    setLastGenerated(JSON.stringify(i));
  };

  const streamResponse = async (body: object, onChunk: (c: string) => void) => {
    const res = await fetch("/api/behaviour-support-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || "Request failed");
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  };

  const handleGenerate = async () => {
    setTouched(true);
    if (!canGenerate) return;
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      await streamResponse(
        { action: "generate", curriculum, yearGroup: resolvedYearGroup, studentName, studentGender, studentClass, supportNeeds, keyStaff, behaviourDescription, behaviouralTriggers, behaviouralPatterns, strengths, dislikes, previousInterventions, planStartDate, reviewDate },
        (chunk) => setResult((prev) => (prev ?? "") + chunk),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!result || !instruction.trim()) return;
    setIsRefining(true);
    setResult("");
    try {
      await streamResponse(
        { action: "refine", result, instruction },
        (chunk) => setResult((prev) => (prev ?? "") + chunk),
      );
    } catch {
      // silently ignore
    } finally {
      setIsRefining(false);
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
              curriculum={curriculum}
              onCurriculumChange={setCurriculum}
              yearGroup={yearGroup}
              onYearGroupChange={setYearGroup}
              mixed={mixed}
              onMixedChange={setMixed}
              yearGroupNote
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <PupilNameField value={studentName} onChange={setStudentName} />
              <GenderField value={studentGender} onChange={setStudentGender} label="Student gender" />
            </div>

            <StudentClassField value={studentClass} onChange={setStudentClass} />

            <SupportNeedsField value={supportNeeds} onChange={setSupportNeeds} />

            <KeyStaffField value={keyStaff} onChange={setKeyStaff} />

            <BehaviourDescriptionField
              value={behaviourDescription}
              onChange={setBehaviourDescription}
              invalid={touched && !behaviourDescription.trim()}
            />

            <BehaviouralTriggersField
              value={behaviouralTriggers}
              onChange={setBehaviouralTriggers}
              invalid={touched && !behaviouralTriggers.trim()}
            />

            <TopicField
              label="Behavioural patterns and context"
              value={behaviouralPatterns}
              onChange={setBehaviouralPatterns}
              placeholders={[
                "e.g. Most frequent before lunch and in larger class settings",
                "e.g. Significantly reduced in 1:1 or small group work",
                "e.g. Escalates quickly if not de-escalated within 2 minutes",
                "e.g. Better in practical lessons than in written tasks",
              ]}
            />

            <TopicField
              label="Student strengths and interests"
              value={strengths}
              onChange={setStrengths}
              placeholders={[
                "e.g. Strong verbal communicator, enthusiastic about art",
                "e.g. Builds positive relationships with staff when given responsibility",
                "e.g. Excels in PE and practical subjects",
                "e.g. Creative, kind to younger students, good sense of humour",
              ]}
            />

            <TopicField
              label="Student dislikes"
              value={dislikes}
              onChange={setDislikes}
              placeholders={[
                "e.g. Extended written tasks, reading aloud in class",
                "e.g. Sitting still for long periods, feeling singled out",
                "e.g. Sudden changes to routine, crowded spaces",
                "e.g. Open-ended tasks without a clear structure",
              ]}
            />

            <TopicField
              label="Previous interventions"
              value={previousInterventions}
              onChange={setPreviousInterventions}
              placeholders={[
                "e.g. Daily check-in/check-out, seating plan adjustment",
                "e.g. Reward chart (discontinued after 4 weeks)",
                "e.g. Referral to school counsellor, nurture group placement",
                "e.g. Restorative conversations, reduced timetable trialled",
              ]}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <PlanStartDateField value={planStartDate} onChange={setPlanStartDate} />
              <ReviewDateField value={reviewDate} onChange={setReviewDate} />
            </div>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setStudentName(""); setStudentClass(""); setSupportNeeds(""); setKeyStaff("");
                  setBehaviourDescription(""); setBehaviouralTriggers(""); setBehaviouralPatterns("");
                  setStrengths(""); setDislikes(""); setPreviousInterventions("");
                  setPlanStartDate(""); setReviewDate(""); setTouched(false);
                  setResult(null); setError(null); setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton
                onClick={handleGenerate}
                disabled={isGenerating || unchangedSinceGeneration}
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

      {result !== null && (
        <div className="sticky top-0 z-20 h-8 -mx-10" style={{ backgroundColor: "#F1EFE3" }} />
      )}

      <ResultPanel
        result={result}
        isGenerating={isGenerating}
        isRefining={isRefining}
        onChange={(md) => setResult(md)}
        exportFilename={`bsp-${studentName.toLowerCase().replace(/\s+/g, "-") || "student"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: studentName || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
      />

      {result && !isGenerating && (
        <RefinePanel
          isRefining={isRefining}
          chips={REFINE_CHIPS}
          onRefine={handleRefine}
        />
      )}
    </div>
  );
}
