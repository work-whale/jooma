"use client";

import { useId, useState } from "react";
import { CurriculumField, EyfsObjectiveField } from "@/app/components/fields";
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
import { EYFS_TIMESCALES, eyfsTimescale } from "@/app/lib/sheets/eyfs-action-plan";

const TOOL_SLUG = "eyfs-action-plan";

/*
 * An EYFS action plan as a designed landscape document
 * (app/lib/sheets/eyfs-action-plan.ts): four phases of actions, each a table
 * with RAG and evidence columns for the school to fill in. The WBS to GDS
 * bands this form used to offer are gone: they are KS1 and KS2 attainment
 * labels, and a plan for a setting is not pitched at pupils.
 */
export default function EYFSActionPlanForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const fieldId = useId();
  const [curriculum, setCurriculum] = useLocalStorage("ll:curriculum", "");
  const [objective, setObjective] = useState("");
  const [timescale, setTimescale] = useState<string>("One year");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  const canGenerate = curriculum && objective.trim();
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, objective, timescale };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setObjective((i.objective as string) ?? "");
    setTimescale(eyfsTimescale(i.timescale));
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
      curriculum: (v) => setCurriculum(v as string),
      objective: (v) => setObjective(v as string),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/eyfs-action-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, curriculum, objective, timescale }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "eyfsActionPlan", { curriculum, timescale }, setResult);
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <CurriculumField value={curriculum} onChange={setCurriculum} />

            <EyfsObjectiveField value={objective} onChange={setObjective} />

            <fieldset className="space-y-2">
              <legend className="block text-sm font-semibold text-gray-800">How long the plan runs</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {EYFS_TIMESCALES.map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="radio" name={`${fieldId}-timescale`} value={t} checked={timescale === t} onChange={() => setTimescale(t)} className="accent-gray-900 w-4 h-4" />
                    {t}
                  </label>
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
                  setObjective("");
                  setTimescale("One year");
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
        exportFilename="eyfs-action-plan"
        historyMeta={{ toolSlug: TOOL_SLUG, title: objective.slice(0, 80) || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
