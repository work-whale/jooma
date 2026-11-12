"use client";

import { useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { TargetsField, PupilNameField, PlanStartDateField, ReviewDateField } from "@/app/components/fields";
import PronounsField, { PupilPrivacyNote } from "@/app/components/fields/PronounsField";
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
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import { parseSheet } from "@/app/lib/sheets/normalize";
import { isPupilPronouns, pronounsFromInput, scrubPupilText } from "@/app/lib/sheets/pupil";
import { factDate } from "@/app/lib/sheets/behaviour";
import type { PupilPronouns } from "@/app/lib/sheets/types";

const TOOL_SLUG = "smart-targets";

export default function SmartTargetsForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [targets, setTargets] = useState("");
  // The child's first name stays in the browser and the saved run: the
  // request carries "[PUPIL]" in its place (app/lib/sheets/pupil.ts).
  const [studentName, setStudentName] = useState("");
  const [pronouns, setPronouns] = useState<PupilPronouns>("they");
  const [setDate, setSetDate] = useState("");
  const [reviewDate, setReviewDate] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  const canGenerate = curriculum && (mixed || yearGroup) && targets.trim();

  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, yearGroup, mixed, targets, studentName, pronouns, setDate, reviewDate };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setTargets((i.targets as string) ?? "");
    setStudentName((i.studentName as string) ?? "");
    setPronouns(pronounsFromInput(i));
    setSetDate((i.setDate as string) ?? "");
    setReviewDate((i.reviewDate as string) ?? "");
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
      targets: (v) => setTargets(v as string),
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
    const resolvedYear = mixed ? "Mixed" : yearGroup;
    // On the page, never sent: the name and the dates.
    const info = {
      curriculum,
      yearGroup: resolvedYear,
      ...(name ? { pupil: { name, pronouns } } : {}),
      pupilFacts: [
        { label: "Year group", value: resolvedYear === "Mixed" ? "" : resolvedYear },
        { label: "Targets set", value: factDate(setDate) },
        { label: "Review date", value: factDate(reviewDate) },
      ],
    };
    try {
      const res = await fetch("/api/smart-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          curriculum,
          yearGroup: resolvedYear,
          targets: scrubPupilText(targets, name),
          named: !!name,
          pronouns,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "targets", info, setResult);
      // The details table is built from the form, so a run the model wrote
      // nothing into still has a page: count it as failed, never save it.
      if (!finished || !parseSheet(finished)?.sections.some((s) => s.role === "targets")) throw new Error("The targets came back empty. Please try again.");
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <PupilNameField value={studentName} onChange={setStudentName} />
                <PronounsField value={pronouns} onChange={setPronouns} />
              </div>
              <PupilPrivacyNote doc="targets" optional />
            </div>

            <TargetsField value={targets} onChange={setTargets} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <PlanStartDateField value={setDate} onChange={setSetDate} label="Date set" />
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
                  setCurriculum("");
                  setYearGroup("");
                  setMixed(false);
                  setTargets("");
                  setStudentName("");
                  setPronouns("they");
                  setSetDate("");
                  setReviewDate("");
                  setResult(null);
                  setRunId(null);
                  setError(null);
                  setConfirmingReset(false);
                }}
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
        exportFilename="smart-targets"
        historyMeta={{ toolSlug: TOOL_SLUG, title: studentName.trim() ? `${studentName.trim()}: SMART targets` : "SMART targets", input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
