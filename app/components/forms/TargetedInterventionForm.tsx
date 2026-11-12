"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import {
  SubjectField,
  AttitudinalDataField,
  AptitudinalDataField,
  AttainmentDataField,
  OtherDataField,
  DifferentiationField,
  PupilNameField,
} from "@/app/components/fields";
import PronounsField, { PupilPrivacyNote } from "@/app/components/fields/PronounsField";
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import { parseSheet } from "@/app/lib/sheets/normalize";
import { isPupilPronouns, pronounsFromInput, scrubPupilText } from "@/app/lib/sheets/pupil";
import type { PupilPronouns } from "@/app/lib/sheets/types";
import { restoreDifferentiation, type Differentiate } from "@/app/lib/differentiation";
import { toTitleCase } from "@/app/lib/formOptions";
import ToolResults from "@/app/components/ToolResults";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";

const TOOL_SLUG = "targeted-intervention";

export default function TargetedInterventionForm({
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
  const [attitudinalData, setAttitudinalData] = useState("");
  const [aptitudinalData, setAptitudinalData] = useState("");
  const [attainmentData, setAttainmentData] = useState("");
  const [otherData, setOtherData] = useState("");
  const [differentiate, setDifferentiate] = useState<Differentiate>("no");
  const [differentiationLevels, setDifferentiationLevels] = useState<string[]>([]);
  // The child's first name stays in the browser and the saved run: every box
  // is sent with "[PUPIL]" in its place (app/lib/sheets/pupil.ts).
  const [studentName, setStudentName] = useState("");
  const [pronouns, setPronouns] = useState<PupilPronouns>("they");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const canGenerate = curriculum && (mixed || yearGroup) && subject.trim() && attitudinalData.trim() &&
    (differentiate === "no" || differentiationLevels.length > 0);

  const [language, setLanguage] = useGenerationLanguage();
  const formState = {
    ...languageFormState(language),
    curriculum, yearGroup, mixed, subject,
    attitudinalData, aptitudinalData, attainmentData, otherData,
    differentiate, differentiationLevels, studentName, pronouns,
  };
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
    setAttitudinalData((i.attitudinalData as string) ?? "");
    setAptitudinalData((i.aptitudinalData as string) ?? "");
    setAttainmentData((i.attainmentData as string) ?? "");
    setOtherData((i.otherData as string) ?? "");
    const d = restoreDifferentiation(i);
    setDifferentiate(d.differentiate);
    setDifferentiationLevels(d.levels);
    setStudentName((i.studentName as string) ?? "");
    setPronouns(pronounsFromInput(i));
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
      differentiate: (v) => setDifferentiate(v as Differentiate),
      differentiationLevels: (v) => setDifferentiationLevels(v as string[]),
      pronouns: (v) => { if (isPupilPronouns(v)) setPronouns(v); },
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const name = studentName.trim();
    const scrub = (t: string) => scrubPupilText(t, name);
    const resolvedYear = mixed ? "Mixed" : yearGroup;
    // On the page, never sent: the name. The year and subject also carry
    // over to the "Make a worksheet" link.
    const info = {
      curriculum,
      yearGroup: resolvedYear,
      subject: toTitleCase(subject),
      topic: toTitleCase(subject),
      ...(name ? { pupil: { name, pronouns } } : {}),
      pupilFacts: [
        { label: "Year group", value: resolvedYear === "Mixed" ? "" : resolvedYear },
        { label: "Subject", value: toTitleCase(subject) },
      ],
    };
    try {
      const res = await fetch("/api/targeted-intervention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          attitudinalData: scrub(attitudinalData),
          aptitudinalData: scrub(aptitudinalData).trim() || undefined,
          attainmentData: scrub(attainmentData).trim() || undefined,
          otherData: scrub(otherData).trim() || undefined,
          differentiate,
          differentiationLevels,
          named: !!name,
          pronouns,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "intervention", info, setResult);
      // The details table is built from the form, so a run the model wrote
      // nothing into still has a page: count it as failed, never save it.
      if (!finished || !parseSheet(finished)?.sections.some((s) => s.role === "strategy")) throw new Error("The strategies came back empty. Please try again.");
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
    setAttitudinalData("");
    setAptitudinalData("");
    setAttainmentData("");
    setOtherData("");
    setDifferentiate("no");
    setDifferentiationLevels([]);
    setStudentName("");
    setPronouns("they");
    setResult(null);
    setRunId(null);
    setError(null);
    setConfirmingReset(false);
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <PupilNameField value={studentName} onChange={setStudentName} />
                <PronounsField value={pronouns} onChange={setPronouns} />
              </div>
              <PupilPrivacyNote doc="strategies" optional />
            </div>

            <SubjectField value={subject} onChange={setSubject} />

            <AttitudinalDataField value={attitudinalData} onChange={setAttitudinalData} />

            <AptitudinalDataField value={aptitudinalData} onChange={setAptitudinalData} />

            <AttainmentDataField value={attainmentData} onChange={setAttainmentData} />

            <OtherDataField value={otherData} onChange={setOtherData} />

            <DifferentiationField
              value={differentiate}
              onChange={setDifferentiate}
              levels={differentiationLevels}
              onLevelsChange={setDifferentiationLevels}
            />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
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
        exportFilename={`intervention-${subject || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: studentName.trim() ? `${studentName.trim()}: ${subject || "interventions"}` : subject || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
