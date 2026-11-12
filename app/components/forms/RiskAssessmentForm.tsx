"use client";

import { useId, useState } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { ActivityField, TransportField, ResourcesField } from "@/app/components/fields";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import ToolResults from "@/app/components/ToolResults";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";
import { readSheetStream } from "@/app/lib/sheets/client-stream";

const TOOL_SLUG = "risk-assessment";

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

/*
 * A risk assessment as a designed landscape document (app/lib/sheets/risk.ts):
 * hazards scored on a 5 x 5 matrix, the sums and bands done in code, with the
 * details, a rating key, emergency information and sign-off built in code.
 * The leader's name is printed on the page and never sent.
 */
export default function RiskAssessmentForm({
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

  const [activity, setActivity] = useState("");
  const [where, setWhere] = useState<"offsite" | "onsite">("offsite");
  const [transport, setTransport] = useState("");
  const [location, setLocation] = useState("");
  const [resources, setResources] = useState("");
  const [date, setDate] = useState("");
  const [pupils, setPupils] = useState("");
  const [staff, setStaff] = useState("");
  const [leader, setLeader] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  const offsite = where === "offsite";
  const resolvedYearGroup = mixed ? "Mixed year group" : yearGroup;
  const canGenerate = curriculum.trim() && resolvedYearGroup.trim() && activity.trim();
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, yearGroup, mixed, activity, where, transport, location, resources, date, pupils, staff, leader };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setActivity((i.activity as string) ?? "");
    setWhere(i.where === "onsite" ? "onsite" : i.where === "offsite" || i.transport ? "offsite" : "onsite");
    setTransport((i.transport as string) ?? "");
    setLocation((i.location as string) ?? "");
    setResources((i.resources as string) ?? "");
    setDate((i.date as string) ?? "");
    setPupils((i.pupils as string) ?? "");
    setStaff((i.staff as string) ?? "");
    setLeader((i.leader as string) ?? "");
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics. A
  // prefill with transport is a trip; one with only a place in school is not.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      curriculum: (v) => setCurriculum(v as string),
      yearGroup: (v) => setYearGroup(v as string),
      activity: (v) => setActivity(v as string),
      location: (v) => {
        setLocation(v as string);
        if (v) setWhere("onsite");
      },
      transport: (v) => {
        setTransport(v as string);
        if (v) setWhere("offsite");
      },
      resources: (v) => setResources(v as string),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = {
      curriculum,
      yearGroup: resolvedYearGroup,
      risk: { activity, yearGroup: resolvedYearGroup, date, place: location, transport: offsite ? transport : "", pupils, staff, leader, offsite },
    };
    try {
      const res = await fetch("/api/risk-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Never the leader's name or the date: the page prints those.
        body: JSON.stringify({ language, curriculum, yearGroup: resolvedYearGroup, activity, offsite, transport: offsite ? transport : "", location, resources, pupils, staff }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "riskAssessment", info, setResult);
      if (!finished) throw new Error("The risk assessment came back empty. Please try again.");
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
              curriculum={curriculum}
              onCurriculumChange={setCurriculum}
              yearGroup={yearGroup}
              onYearGroupChange={setYearGroup}
              mixed={mixed}
              onMixedChange={setMixed}
              yearGroupNote
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <ActivityField value={activity} onChange={setActivity} />

            <fieldset className="space-y-2">
              <legend className="block text-sm font-semibold text-gray-800">Where</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {[
                  { id: "offsite", label: "Off site (a trip or visit)" },
                  { id: "onsite", label: "On the school site" },
                ].map((o) => (
                  <label key={o.id} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input type="radio" name={`${fieldId}-where`} checked={where === o.id} onChange={() => setWhere(o.id as "offsite" | "onsite")} className="accent-gray-900 w-4 h-4" />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label htmlFor={`${fieldId}-place`} className="block text-sm font-semibold text-gray-800">
                  {offsite ? "Destination" : "Location"} <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input id={`${fieldId}-place`} type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={offsite ? "e.g. Natural History Museum, London" : "e.g. Science lab"} className={inputClass} />
              </div>
              {offsite && <TransportField value={transport} onChange={setTransport} />}
            </div>

            <ResourcesField value={resources} onChange={setResources} />

            <fieldset className="space-y-3">
              <legend className="block text-sm font-semibold text-gray-800">Details for the page (optional)</legend>
              <p className="text-xs text-gray-500">Printed on the risk assessment. The leader&apos;s name and the date are never sent.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor={`${fieldId}-date`} className="block text-sm text-gray-700">Date</label>
                  <input id={`${fieldId}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${fieldId}-leader`} className="block text-sm text-gray-700">{offsite ? "Trip leader" : "Activity leader"}</label>
                  <input id={`${fieldId}-leader`} type="text" value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="e.g. Ms Patel" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${fieldId}-pupils`} className="block text-sm text-gray-700">Number of pupils</label>
                  <input id={`${fieldId}-pupils`} type="text" inputMode="numeric" value={pupils} onChange={(e) => setPupils(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 30" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${fieldId}-staff`} className="block text-sm text-gray-700">Number of staff</label>
                  <input id={`${fieldId}-staff`} type="text" inputMode="numeric" value={staff} onChange={(e) => setStaff(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 4" className={inputClass} />
                </div>
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
                  setActivity(""); setTransport(""); setLocation(""); setResources("");
                  setDate(""); setPupils(""); setStaff(""); setLeader(""); setWhere("offsite");
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
        exportFilename={`risk-assessment-${activity.toLowerCase().replace(/\s+/g, "-").slice(0, 40) || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: activity || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
