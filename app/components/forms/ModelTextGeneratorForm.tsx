"use client";

import { useState, useId } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { DifferentiationField, WriteField, FeaturesField, WordCountField } from "@/app/components/fields";
import { orderedBands, restoreDifferentiation, type Differentiate } from "@/app/lib/differentiation";
import { runBands } from "@/app/lib/runBands";
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import ToolResults from "@/app/components/ToolResults";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";

const TOOL_SLUG = "model-text-generator";


export default function ModelTextGeneratorForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const fieldId = useId();
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [write, setWrite] = useState("");
  const [features, setFeatures] = useState("");
  const [keywords, setKeywords] = useState("");
  const [differentiate, setDifferentiate] = useState<Differentiate>("no");
  const [differentiationLevels, setDifferentiationLevels] = useState<string[]>([]);
  const [lengthWords, setLengthWords] = useState("500");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  // The history run on screen, so edits to its sheet save back into it.
  const [runId, setRunId] = useState<string | null>(null);

  const lengthNum = parseInt(lengthWords, 10);
  const canGenerate =
    curriculum && (mixed || yearGroup) && write.trim() &&
    !isNaN(lengthNum) && lengthNum >= 50 && lengthNum <= 5000 &&
    (differentiate === "no" || differentiationLevels.length > 0);

  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, yearGroup, mixed, write, features, keywords, differentiate, differentiationLevels, lengthWords };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setWrite((i.write as string) ?? "");
    setFeatures((i.features as string) ?? "");
    setKeywords((i.keywords as string) ?? "");
    const d = restoreDifferentiation(i);
    setDifferentiate(d.differentiate);
    setDifferentiationLevels(d.levels);
    setLengthWords(String(i.lengthWords ?? "500"));
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
      write: (v) => setWrite(v as string),
      features: (v) => setFeatures(v as string),
      keywords: (v) => setKeywords(v as string),
      differentiate: (v) => setDifferentiate(v as Differentiate),
      differentiationLevels: (v) => setDifferentiationLevels(v as string[]),
      lengthWords: (v) => setLengthWords(v as string),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = { curriculum, yearGroup: mixed ? "Mixed" : yearGroup, topic: write };
    const send = (extra: Record<string, unknown> = {}) =>
      fetch("/api/model-text-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          write,
          features,
          keywords: keywords.trim() || null,
          differentiate,
          differentiationLevels,
          lengthWords: lengthNum,
          ...extra,
        }),
      });
    try {
      // Differentiated: one model text per band, each in its own tab.
      if (differentiate === "yes") {
        await runBands({
          bands: orderedBands(differentiationLevels),
          start: (band, bandIndex) => send({ band, bandIndex }),
          read: (res, onOutput, band) => readSheetStream(res, "modelText", { ...info, band }, onOutput),
          onUpdate: setResult,
        });
        return;
      }
      const res = await send();
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      // The route streams the text as JSON; each update arrives here as a
      // whole, valid sheet, so the page fills in as the model writes.
      const finished = await readSheetStream(res, "modelText", info, setResult);
      if (!finished) throw new Error("The model text came back empty. Please try again.");
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

            <WriteField value={write} onChange={setWrite} />
            <FeaturesField value={features} onChange={setFeatures} />

            <div className="space-y-1.5">
              <label htmlFor={`${fieldId}-0`} className="block text-sm font-semibold text-gray-800">Keywords to include <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea id={`${fieldId}-0`}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. photosynthesis, chlorophyll, organism"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white resize-none"
              />
            </div>

            <DifferentiationField
              value={differentiate}
              onChange={setDifferentiate}
              levels={differentiationLevels}
              onLevelsChange={setDifferentiationLevels}
            />
            <WordCountField value={lengthWords} onChange={setLengthWords} />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => { setCurriculum(""); setYearGroup(""); setMixed(false); setWrite(""); setFeatures(""); setKeywords(""); setDifferentiate("no"); setDifferentiationLevels([]); setLengthWords("500"); setResult(null); setRunId(null); setError(null); setConfirmingReset(false); }}
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
        exportFilename={`model-text-${write.slice(0, 30).replace(/\s+/g, "-") || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: write || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />

    </div>
  );
}
