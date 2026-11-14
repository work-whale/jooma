"use client";

import { useState } from "react";
import {
  SIPSchoolTypeField,
  SIPAreasField,
  SIPContextField,
  SIPTimeframeField,
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
import { sipYears } from "@/app/lib/sheets/sip";

const TOOL_SLUG = "school-improvement-plan";

/*
 * A school improvement plan as a designed landscape document
 * (app/lib/sheets/sip.ts): an action table per priority with blank Cost and
 * RAG columns, a baseline line per priority and a monitoring calendar. The
 * narrative parts can be switched off in Design. The old table and narrative
 * formats are gone; an old prefill's outputFormat is ignored.
 */
export default function SchoolImprovementPlanForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const [schoolType, setSchoolType] = useState("Primary");
  const [areasToImprove, setAreasToImprove] = useState("");
  const [schoolContext, setSchoolContext] = useState("");
  const [planTimeframe, setPlanTimeframe] = useState(1);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  // Raw form state — saved as history input so a past run can refill the form.
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), schoolType, areasToImprove, schoolContext, planTimeframe };

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setSchoolType((i.schoolType as string) ?? "Primary");
    setAreasToImprove((i.areasToImprove as string) ?? "");
    setSchoolContext((i.schoolContext as string) ?? "");
    setPlanTimeframe(sipYears(i.planTimeframe));
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      areasToImprove: (v) => setAreasToImprove(v as string),
      schoolType: (v) => setSchoolType(v as string),
      planTimeframe: (v) => setPlanTimeframe(sipYears(v)),
    },
  });

  const canGenerate = areasToImprove.trim();
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = { sip: { schoolType, timeframe: planTimeframe } };
    try {
      const res = await fetch("/api/school-improvement-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, schoolType, areasToImprove, schoolContext, planTimeframe }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "sip", info, setResult);
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
        <div className="lg:col-span-1">{sidebar}<ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} /></div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">
            {prefilled && <PrefilledBadge />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <SIPSchoolTypeField value={schoolType} onChange={setSchoolType} />

            <SIPAreasField value={areasToImprove} onChange={setAreasToImprove} />

            <SIPContextField value={schoolContext} onChange={setSchoolContext} />

            <SIPTimeframeField value={planTimeframe} onChange={setPlanTimeframe} />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setSchoolType("Primary"); setAreasToImprove(""); setSchoolContext(""); setPlanTimeframe(1);
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
        exportFilename="school-improvement-plan"
        historyMeta={{ toolSlug: TOOL_SLUG, title: areasToImprove.split(/\r?\n/)[0]?.replace(/^\s*\d+[.)]\s*/, "").trim() || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
