"use client";

import { useId, useState } from "react";
import {
  CurriculumField,
  SchoolTypeField,
  StaffMemberField,
  PayScaleField,
  ResponsibilitiesField,
} from "@/app/components/fields";
import ToolResults from "@/app/components/ToolResults";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import { useLocalStorage } from "@/app/lib/useLocalStorage";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import { DEFAULT_OBJECTIVES, objectiveCount } from "@/app/lib/sheets/appraisal";

const TOOL_SLUG = "performance-management";

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

/*
 * Appraisal objectives as a designed landscape document
 * (app/lib/sheets/appraisal.ts): the objectives table with blank mid-year and
 * end-of-year review columns, and sign-off, so one document lasts the cycle.
 * The model hears the role, never a name.
 */
export default function PerformanceManagementForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const fieldId = useId();
  const [curriculum, setCurriculum] = useLocalStorage("ll:curriculum", "");
  const [schoolType, setSchoolType] = useState("");
  const [staffMember, setStaffMember] = useState("");
  const [payScale, setPayScale] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [priorities, setPriorities] = useState("");
  const [count, setCount] = useState(DEFAULT_OBJECTIVES);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  const canGenerate = curriculum && staffMember.trim() && responsibilities.trim();
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, schoolType, staffMember, payScale, responsibilities, priorities, objectiveCount: count };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setSchoolType((i.schoolType as string) ?? "");
    setStaffMember((i.staffMember as string) ?? "");
    setPayScale((i.payScale as string) ?? "");
    setResponsibilities((i.responsibilities as string) ?? "");
    setPriorities((i.priorities as string) ?? "");
    setCount(objectiveCount(i.objectiveCount));
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
      staffMember: (v) => setStaffMember(v as string),
      responsibilities: (v) => setResponsibilities(v as string),
      schoolType: (v) => setSchoolType(v as string),
      payScale: (v) => setPayScale(v as string),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = { curriculum, appraisal: { role: staffMember, payScale, count } };
    try {
      const res = await fetch("/api/performance-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, curriculum, schoolType, staffMember, payScale, responsibilities, priorities, objectiveCount: count }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "appraisal", info, setResult);
      if (!finished) throw new Error("The objectives came back empty. Please try again.");
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CurriculumField value={curriculum} onChange={setCurriculum} />
              <SchoolTypeField value={schoolType} onChange={setSchoolType} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StaffMemberField value={staffMember} onChange={setStaffMember} />
              <PayScaleField value={payScale} onChange={setPayScale} />
            </div>

            <ResponsibilitiesField value={responsibilities} onChange={setResponsibilities} />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor={`${fieldId}-priorities`} className="block text-sm font-semibold text-gray-800">
                  School priorities <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input id={`${fieldId}-priorities`} type="text" value={priorities} onChange={(e) => setPriorities(e.target.value)} placeholder="e.g. Reading fluency in KS2; attendance of disadvantaged pupils" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${fieldId}-count`} className="block text-sm font-semibold text-gray-800">Number of objectives</label>
                <select id={`${fieldId}-count`} value={count} onChange={(e) => setCount(objectiveCount(e.target.value))} className={inputClass}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setSchoolType(""); setStaffMember(""); setPayScale(""); setResponsibilities("");
                  setPriorities(""); setCount(DEFAULT_OBJECTIVES);
                  setRunId(null); setResult(null); setError(null); setConfirmingReset(false);
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
        exportFilename={`appraisal-objectives-${staffMember.toLowerCase().replace(/\s+/g, "-").slice(0, 40) || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: staffMember || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
