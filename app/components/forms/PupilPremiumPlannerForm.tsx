"use client";

import { useId, useState } from "react";
import { PupilPremiumChallengesField, EducationPhaseField } from "@/app/components/fields";
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
import { challengeLines } from "@/app/lib/sheets/pupil-premium";

const TOOL_SLUG = "pupil-premium-planner";

/** The school's details: printed on the statement by code, never sent. */
const DETAILS: { key: string; label: string; placeholder: string }[] = [
  { key: "pupils", label: "Number of pupils in school", placeholder: "e.g. 412" },
  { key: "proportion", label: "Pupil premium eligible (%)", placeholder: "e.g. 31%" },
  { key: "years", label: "Years the plan covers", placeholder: "e.g. 2025 to 2028" },
  { key: "lead", label: "Pupil premium lead", placeholder: "e.g. Deputy headteacher" },
  { key: "governor", label: "Governor or trustee lead", placeholder: "Optional" },
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

/*
 * A draft pupil premium strategy statement on the DfE template, as a designed
 * landscape document (app/lib/sheets/pupil-premium.ts). The challenges and
 * the phase are all the model is sent. The WBS to GDS bands this form used to
 * offer are gone: they are pupil attainment labels, and a statement is a plan
 * for the school, not a resource pitched at pupils.
 */
export default function PupilPremiumPlannerForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const fieldId = useId();
  const [challenges, setChallenges] = useState("");
  const [educationPhase, setEducationPhase] = useState("Primary");
  const [schoolName, setSchoolName] = useState("");
  const [facts, setFacts] = useState<Record<string, string>>({});

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  // Raw form state — saved as history input so a past run can refill the form.
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), challenges, educationPhase, schoolName, facts };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;
  const lines = challengeLines(challenges);
  const canGenerate = lines.length > 0;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setChallenges((i.challenges as string) ?? "");
    setEducationPhase((i.educationPhase as string) ?? "Primary");
    setSchoolName((i.schoolName as string) ?? "");
    setFacts(i.facts && typeof i.facts === "object" ? (i.facts as Record<string, string>) : {});
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics. An old
  // prefill carrying `differentiate` is ignored: there is no setter for it.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      challenges: (v) => setChallenges(v as string),
      educationPhase: (v) => setEducationPhase(v as string),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = { schoolName, schoolFacts: facts, ppChallenges: lines.length };
    try {
      const res = await fetch("/api/pupil-premium-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, challenges, educationPhase }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "pupilPremium", info, setResult);
      if (!finished) throw new Error("The statement came back empty. Please try again.");
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

            <PupilPremiumChallengesField value={challenges} onChange={setChallenges} />

            <EducationPhaseField value={educationPhase} onChange={setEducationPhase} />

            <fieldset className="space-y-3">
              <legend className="block text-sm font-semibold text-gray-800">Your school (optional)</legend>
              <p className="text-xs text-gray-500">Printed on the statement as you type it, never sent. Anything left blank stays blank for you to fill in, as do the funding and every cost.</p>
              <div className="space-y-1.5">
                <label htmlFor={`${fieldId}-school`} className="block text-sm text-gray-700">School name</label>
                <input id={`${fieldId}-school`} type="text" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="e.g. Oakfield Primary School" className={inputClass} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {DETAILS.map((d) => (
                  <div key={d.key} className="space-y-1.5">
                    <label htmlFor={`${fieldId}-${d.key}`} className="block text-sm text-gray-700">{d.label}</label>
                    <input
                      id={`${fieldId}-${d.key}`}
                      type="text"
                      value={facts[d.key] ?? ""}
                      onChange={(e) => setFacts((f) => ({ ...f, [d.key]: e.target.value }))}
                      placeholder={d.placeholder}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setChallenges("");
                  setEducationPhase("Primary");
                  setSchoolName("");
                  setFacts({});
                  setRunId(null);
                  setResult(null);
                  setError(null);
                  setConfirmingReset(false);
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
        exportFilename={`pupil-premium-statement${schoolName ? `-${schoolName}` : ""}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: schoolName ? `Pupil premium: ${schoolName}` : "Pupil premium statement", input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
