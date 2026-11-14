"use client";

import { useState } from "react";
import {
  InspectionBodyField,
  InspectionFocusField,
  InspectionOptionsField,
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
import { resolveInspectionBody } from "@/app/lib/sheets/inspection";

const TOOL_SLUG = "inspection-prep";

/*
 * Inspection preparation as a designed document (app/lib/sheets/inspection.ts):
 * per area, questions, a prep action table, optional evidence and success
 * criteria, and for Ofsted a blank "Where are we now?" tick row. The body is
 * a dropdown; an old run or prefill with a typed body ("Ofsted", "KHDA") is
 * mapped onto it. Old markdown runs open in their old view.
 */
export default function InspectionPrepForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const [inspectionBody, setInspectionBody] = useState("ofsted");
  const [otherBody, setOtherBody] = useState("");
  const [inspectionFocus, setInspectionFocus] = useState("");
  const [includeEvidence, setIncludeEvidence] = useState(false);
  const [includeSuccessCriteria, setIncludeSuccessCriteria] = useState(false);
  const [earlyYears, setEarlyYears] = useState(false);
  const [postSixteen, setPostSixteen] = useState(false);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  const body = resolveInspectionBody(inspectionBody, otherBody);
  const ofsted = body?.id === "ofsted";
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), inspectionBody, otherBody, inspectionFocus, includeEvidence, includeSuccessCriteria, earlyYears, postSixteen };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  /** A body id, or an old typed body mapped onto the dropdown. */
  const setBody = (v: unknown, other?: unknown) => {
    const r = resolveInspectionBody(v, other);
    setInspectionBody(r?.id ?? "ofsted");
    setOtherBody(r?.id === "other" ? r.name : "");
  };

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setBody(i.inspectionBody, i.otherBody);
    setInspectionFocus((i.inspectionFocus as string) ?? "");
    setIncludeEvidence(Boolean(i.includeEvidence));
    setIncludeSuccessCriteria(Boolean(i.includeSuccessCriteria));
    setEarlyYears(Boolean(i.earlyYears));
    setPostSixteen(Boolean(i.postSixteen));
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      inspectionBody: (v) => setBody(v),
      inspectionFocus: (v) => setInspectionFocus(v as string),
      includeEvidence: (v) => setIncludeEvidence(v as boolean),
      includeSuccessCriteria: (v) => setIncludeSuccessCriteria(v as boolean),
      earlyYears: (v) => setEarlyYears(v as boolean),
      postSixteen: (v) => setPostSixteen(v as boolean),
    },
  });

  const handleGenerate = async () => {
    if (!body) return;
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = {
      inspection: { bodyId: body.id, bodyName: body.name, focus: inspectionFocus, includeEvidence, includeSuccessCriteria, earlyYears: ofsted && earlyYears, postSixteen: ofsted && postSixteen },
    };
    try {
      const res = await fetch("/api/inspection-prep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language, inspectionBody, otherBody, inspectionFocus, includeEvidence, includeSuccessCriteria,
          earlyYears: ofsted && earlyYears, postSixteen: ofsted && postSixteen,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "inspection", info, setResult);
      if (!finished) throw new Error("The guide came back empty. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const reset = () => {
    setInspectionBody("ofsted"); setOtherBody(""); setInspectionFocus("");
    setIncludeEvidence(false); setIncludeSuccessCriteria(false); setEarlyYears(false); setPostSixteen(false);
    setRunId(null); setResult(null); setError(null); setConfirmingReset(false);
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

            <InspectionBodyField value={inspectionBody} onChange={setInspectionBody} other={otherBody} onChangeOther={setOtherBody} />

            <InspectionFocusField value={inspectionFocus} onChange={setInspectionFocus} />

            <InspectionOptionsField
              includeEvidence={includeEvidence}
              includeSuccessCriteria={includeSuccessCriteria}
              onChangeEvidence={setIncludeEvidence}
              onChangeSuccessCriteria={setIncludeSuccessCriteria}
              showProvision={ofsted}
              earlyYears={earlyYears}
              postSixteen={postSixteen}
              onChangeEarlyYears={setEarlyYears}
              onChangePostSixteen={setPostSixteen}
            />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={reset}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton
                onClick={handleGenerate}
                disabled={!body || isGenerating || unchangedSinceGeneration}
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
        exportFilename={`inspection-prep-${(body?.name ?? "guide").slice(0, 20).replace(/\s+/g, "-")}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: [body?.name, inspectionFocus.trim()].filter(Boolean).join(": ") || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
