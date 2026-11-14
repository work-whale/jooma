"use client";

import { useState } from "react";
import {
  AssemblyStageField,
  AssemblyLengthField,
  AssemblyThemeField,
  AssemblyNotesField,
  AssemblyReflectionField,
} from "@/app/components/fields";
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
import { assemblyMinutes, assemblyReflection } from "@/app/lib/sheets/assembly";

const TOOL_SLUG = "assembly-planner";

/*
 * An assembly as a designed script (app/lib/sheets/assembly.ts): a running
 * order that adds up to the length, each part with what to say and delivery
 * tips, and a closing that follows the picker (a reflection, collective
 * worship, or a faith school prayer). Once saved, "Make assembly slides"
 * builds a deck with speaker notes. Refine is gone: Ask Jo edits the script.
 * Old markdown runs open in their old view.
 */
export default function AssemblyPlannerForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const [theme, setTheme] = useState("");
  const [stageOfSchool, setStageOfSchool] = useState("Primary");
  const [lengthMinutes, setLengthMinutes] = useState(20);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [reflection, setReflection] = useState("reflection");
  const [faith, setFaith] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  // Raw form state — saved as history input so a past run can refill the form.
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), theme, stageOfSchool, lengthMinutes, additionalNotes, reflection, faith };

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setTheme((i.theme as string) ?? "");
    setStageOfSchool((i.stageOfSchool as string) ?? "Primary");
    setLengthMinutes((i.lengthMinutes as number) ?? 20);
    setAdditionalNotes((i.additionalNotes as string) ?? "");
    setReflection(assemblyReflection(i.reflection));
    setFaith((i.faith as string) ?? "");
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      theme: (v) => setTheme(v as string),
      stageOfSchool: (v) => setStageOfSchool(v as string),
      lengthMinutes: (v) => setLengthMinutes(v as number),
      reflection: (v) => setReflection(assemblyReflection(v)),
      faith: (v) => setFaith(v as string),
    },
  });

  const canGenerate = theme.trim() && (reflection !== "faith" || faith.trim());
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = { assembly: { stage: stageOfSchool, lengthMinutes: assemblyMinutes(lengthMinutes), reflection, faith } };
    try {
      const res = await fetch("/api/assembly-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, theme, stageOfSchool, lengthMinutes, additionalNotes, reflection, faith }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "assembly", info, setResult);
      if (!finished) throw new Error("The script came back empty. Please try again.");
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
        <div className="lg:col-span-1">{sidebar}<ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} /></div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">
            {prefilled && <PrefilledBadge />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <AssemblyStageField value={stageOfSchool} onChange={setStageOfSchool} />
              <AssemblyLengthField value={lengthMinutes} onChange={setLengthMinutes} />
            </div>

            <AssemblyThemeField value={theme} onChange={setTheme} />

            <AssemblyReflectionField value={reflection} onChange={setReflection} faith={faith} onChangeFaith={setFaith} />

            <AssemblyNotesField value={additionalNotes} onChange={setAdditionalNotes} />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setTheme("");
                  setStageOfSchool("Primary");
                  setLengthMinutes(20);
                  setAdditionalNotes("");
                  setReflection("reflection");
                  setFaith("");
                  setRunId(null);
                  setResult(null);
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
        exportFilename="assembly-plan"
        historyMeta={{ toolSlug: TOOL_SLUG, title: theme || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
