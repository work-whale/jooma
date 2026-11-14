"use client";

import { useId, useState } from "react";
import { CurriculumField, EctNameField, SubjectField, TopicField } from "@/app/components/fields";
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
import { ECT_PLACEHOLDER, scrubStaffName, staffNamePrivacy } from "@/app/lib/staff-privacy";
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import { ectOutcomes, ectPeriod, ectPeriods, ectReportType, type EctReportType } from "@/app/lib/sheets/ect";

const TOOL_SLUG = "ect-report-writer";

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

/*
 * An ECT's induction progress review or formal assessment as a designed
 * document (app/lib/sheets/ect.ts), laid out by Teachers' Standard, with the
 * targets, the ECT's comments and the sign-off built in code.
 *
 * The ECT's name stays in the browser: everything sent has "[ECT]" in its
 * place, and the saved document keeps the name beside the text (doc.staff).
 * The outcome is the induction tutor's: picked here, printed by code, never
 * sent to the model.
 */
export default function ECTReportWriterForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const fieldId = useId();
  const [curriculum, setCurriculum] = useState("2014 National Curriculum");
  const [ectName, setEctName] = useState("");
  const [subject, setSubject] = useState("");
  const [reportType, setReportType] = useState<EctReportType>("review");
  const [period, setPeriod] = useState("t1");
  const [outcome, setOutcome] = useState("");
  const [strengths, setStrengths] = useState("");
  const [areasForDevelopment, setAreasForDevelopment] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  const periodId = ectPeriod(reportType, period).id;
  const outcomes = ectOutcomes(reportType, periodId);
  const outcomeId = outcomes.some((o) => o.id === outcome) ? outcome : "";

  const canGenerate = curriculum && strengths.trim() && areasForDevelopment.trim();
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, ectName, subject, reportType, period: periodId, outcome: outcomeId, strengths, areasForDevelopment };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const changeType = (t: EctReportType) => {
    setReportType(t);
    setPeriod(ectPeriods(t)[0].id);
    setOutcome("");
  };

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    const t = ectReportType(i.reportType);
    setCurriculum((i.curriculum as string) ?? "2014 National Curriculum");
    setEctName((i.ectName as string) ?? "");
    setSubject((i.subject as string) ?? "");
    setReportType(t);
    setPeriod(ectPeriod(t, i.period).id);
    setOutcome((i.outcome as string) ?? "");
    setStrengths((i.strengths as string) ?? "");
    setAreasForDevelopment((i.areasForDevelopment as string) ?? "");
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics. An old
  // prefill's includePDP is ignored: targets are always part of the record.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      ectName: (v) => setEctName(v as string),
      subject: (v) => setSubject(v as string),
      reportType: (v) => changeType(ectReportType(v)),
    },
  });

  // Old markdown runs: Ask Jo works on "[ECT]" and swaps the name back.
  const privacy = staffNamePrivacy(ectName);
  const scrub = (text: string) => scrubStaffName(text, ectName);

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = {
      curriculum,
      staff: [{ placeholder: ECT_PLACEHOLDER, name: ectName }],
      ect: { reportType, period: periodId, outcome: outcomeId, subject, named: !!ectName.trim() },
    };
    try {
      const res = await fetch("/api/ect-report-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Never the name and never the outcome: the page prints those.
        body: JSON.stringify({
          language,
          curriculum,
          subject: scrub(subject),
          reportType,
          period: periodId,
          strengths: scrub(strengths),
          areasForDevelopment: scrub(areasForDevelopment),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "ectReport", info, setResult);
      if (!finished) throw new Error("The report came back empty. Please try again.");
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <CurriculumField value={curriculum} onChange={setCurriculum} />
              <EctNameField value={ectName} onChange={setEctName} />
            </div>

            <SubjectField value={subject} onChange={setSubject} />

            <fieldset className="space-y-2">
              <legend className="block text-sm font-semibold text-gray-800">Report</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {[
                  { id: "review", label: "Termly progress review" },
                  { id: "assessment", label: "Formal assessment (draft)" },
                ].map((o) => (
                  <label key={o.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="radio" name={`${fieldId}-type`} checked={reportType === o.id} onChange={() => changeType(o.id as EctReportType)} className="accent-gray-900 w-4 h-4" />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label htmlFor={`${fieldId}-period`} className="block text-sm font-semibold text-gray-800">Point in induction</label>
                <select id={`${fieldId}-period`} value={periodId} onChange={(e) => { setPeriod(e.target.value); setOutcome(""); }} className={selectClass}>
                  {ectPeriods(reportType).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${fieldId}-outcome`} className="block text-sm font-semibold text-gray-800">
                  Outcome <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <select id={`${fieldId}-outcome`} value={outcomeId} onChange={(e) => setOutcome(e.target.value)} className={selectClass}>
                  <option value="">Leave blank to fill in by hand</option>
                  {outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <p className="text-xs text-gray-500">Your judgement as induction tutor. Printed on the report, never sent: Jooma only writes up the evidence.</p>
              </div>
            </div>

            <TopicField
              label="Strengths"
              value={strengths}
              onChange={setStrengths}
              rows={4}
              placeholders={[
                "e.g. Strong subject knowledge, effective use of assessment to inform planning",
                "e.g. Positive classroom environment, pupils respond well to instructions",
                "e.g. Clear explanations, good use of questioning to check understanding",
                "e.g. Builds strong relationships with pupils and parents",
              ]}
            />

            <TopicField
              label="Areas for development"
              value={areasForDevelopment}
              onChange={setAreasForDevelopment}
              rows={4}
              placeholders={[
                "e.g. Differentiation strategies for SEND pupils",
                "e.g. Use of formative assessment during lessons",
                "e.g. Managing low-level disruption more consistently",
                "e.g. Extending higher-attaining pupils with challenge tasks",
              ]}
            />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum("2014 National Curriculum"); setEctName(""); setSubject("");
                  setReportType("review"); setPeriod("t1"); setOutcome("");
                  setStrengths(""); setAreasForDevelopment("");
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
        exportFilename={`ect-report-${ectName.toLowerCase().replace(/\s+/g, "-") || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: ectName || subject || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
        privacy={privacy}
      />
    </div>
  );
}
