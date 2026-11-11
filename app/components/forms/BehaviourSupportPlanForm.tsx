"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import {
  PupilNameField,
  StudentClassField,
  SupportNeedsField,
  KeyStaffField,
  BehaviourDescriptionField,
  BehaviouralTriggersField,
  TopicField,
  PlanStartDateField,
  ReviewDateField,
} from "@/app/components/fields";
import PronounsField, { PupilPrivacyNote } from "@/app/components/fields/PronounsField";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import ToolResults from "@/app/components/ToolResults";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import { isPupilPronouns, pronounsFromInput, scrubPupilText } from "@/app/lib/sheets/pupil";
import { factDate } from "@/app/lib/sheets/behaviour";
import type { PupilPronouns } from "@/app/lib/sheets/types";

const TOOL_SLUG = "behaviour-support-plan";

/*
 * Behaviour Support Plan. The pupil's name stays in this browser and the
 * teacher's saved copy: everything sent has it replaced by "[PUPIL]"
 * (scrubPupilText), and the class, staff and dates are never sent at all, the
 * page builds the details table from them. The plan comes back as JSON and is
 * drawn as the familiar two-column plan (app/lib/sheets/behaviour.ts), edited
 * on the page or with Jo.
 */
export default function BehaviourSupportPlanForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);

  const [studentName, setStudentName] = useState("");
  const [pronouns, setPronouns] = useState<PupilPronouns>("they");
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
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  // The history run on screen, so edits to its plan save back into it.
  const [runId, setRunId] = useState<string | null>(null);

  const resolvedYearGroup = mixed ? "Mixed year group" : yearGroup;
  const canGenerate = curriculum.trim() && resolvedYearGroup.trim() && studentName.trim() &&
    behaviourDescription.trim() && behaviouralTriggers.trim();
  const [language, setLanguage] = useGenerationLanguage();
  // Saved as the run's input (in the teacher's own history, never sent to a
  // model) so a past plan can refill the form.
  const formState = { ...languageFormState(language), curriculum, yearGroup, mixed, studentName, pronouns, studentClass, supportNeeds, keyStaff, behaviourDescription, behaviouralTriggers, behaviouralPatterns, strengths, dislikes, previousInterventions, planStartDate, reviewDate };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setStudentName((i.studentName as string) ?? "");
    // Runs saved before pronouns had a gender: Male he, Female she, else they.
    setPronouns(pronounsFromInput(i));
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
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics. The
  // assistant never prefills the name (app/lib/assistant-tools.ts).
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      curriculum: (v) => setCurriculum(v as string),
      yearGroup: (v) => setYearGroup(v as string),
      studentClass: (v) => setStudentClass(v as string),
      pronouns: (v) => { if (isPupilPronouns(v)) setPronouns(v); },
      supportNeeds: (v) => setSupportNeeds(v as string),
    },
  });

  const handleGenerate = async () => {
    setTouched(true);
    if (!canGenerate) return;
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const name = studentName.trim();
    const scrub = (t: string) => scrubPupilText(t, name);
    // On the page, never sent: the details table and the child's name.
    const info = {
      yearGroup: resolvedYearGroup,
      pupil: { name, pronouns },
      pupilFacts: [
        { label: "Year group", value: resolvedYearGroup },
        { label: "Class", value: studentClass.trim() },
        { label: "Additional needs", value: supportNeeds.trim() },
        { label: "Staff working with [PUPIL]", value: keyStaff.trim() },
        { label: "Plan starts", value: factDate(planStartDate) },
        { label: "Next review", value: factDate(reviewDate) },
      ],
    };
    try {
      const res = await fetch("/api/behaviour-support-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          yearGroup: resolvedYearGroup,
          pronouns,
          supportNeeds: scrub(supportNeeds),
          behaviourDescription: scrub(behaviourDescription),
          behaviouralTriggers: scrub(behaviouralTriggers),
          behaviouralPatterns: scrub(behaviouralPatterns),
          strengths: scrub(strengths),
          dislikes: scrub(dislikes),
          previousInterventions: scrub(previousInterventions),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "behaviourPlan", info, setResult);
      if (!finished) throw new Error("The plan came back empty. Please try again.");
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
              curriculum={curriculum}
              onCurriculumChange={setCurriculum}
              yearGroup={yearGroup}
              onYearGroupChange={setYearGroup}
              mixed={mixed}
              onMixedChange={setMixed}
              yearGroupNote
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <PupilNameField value={studentName} onChange={setStudentName} />
                <PronounsField value={pronouns} onChange={setPronouns} />
              </div>
              <PupilPrivacyNote />
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
                  setStudentName(""); setPronouns("they"); setStudentClass(""); setSupportNeeds(""); setKeyStaff("");
                  setBehaviourDescription(""); setBehaviouralTriggers(""); setBehaviouralPatterns("");
                  setStrengths(""); setDislikes(""); setPreviousInterventions("");
                  setPlanStartDate(""); setReviewDate(""); setTouched(false);
                  setResult(null); setRunId(null); setError(null); setConfirmingReset(false);
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

      <ToolResults
        result={result}
        isGenerating={isGenerating}
        onChange={(md) => setResult(md)}
        exportFilename={`behaviour-plan-${studentName.trim().toLowerCase().replace(/\s+/g, "-") || "pupil"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: studentName.trim() || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
