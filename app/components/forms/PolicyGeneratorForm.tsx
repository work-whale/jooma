"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TopicField, AdditionalContextField, CurriculumField, OutputTypeField } from "@/app/components/fields";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import ToolResults from "@/app/components/ToolResults";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import { useLocalStorage } from "@/app/lib/useLocalStorage";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";
import { readSheetStream } from "@/app/lib/sheets/client-stream";
import { findPolicy, policyStatusText, POLICY_GROUPS } from "@/app/lib/policy-catalogue";
import { isEnglandCurriculum } from "@/app/lib/sheets/policy";

const TOOL_SLUG = "policy-generator";

/*
 * A school policy as a designed document (app/lib/sheets/policy.ts):
 * numbered sections and clauses, roles, references under a check note, and a
 * details box whose status, review cycle and approver come from
 * app/lib/policy-catalogue.ts, never from the model. Refine is gone: Ask Jo
 * edits the policy. Old markdown runs open in their old view.
 */

function PolicyCategoriesPanel({ onSelect }: { onSelect: (name: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Policy Categories</h2>
        <p className="text-xs text-gray-400 mt-0.5">Click a policy to fill in the form</p>
      </div>
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {POLICY_GROUPS.map((cat) => (
          <div key={cat.label}>
            <button
              type="button"
              onClick={() => setOpen(open === cat.label ? null : cat.label)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors text-left"
            >
              {cat.label}
              <ChevronDown
                className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform duration-200 ${open === cat.label ? "rotate-180" : ""}`}
              />
            </button>
            {open === cat.label && (
              <div className="px-5 pb-3 flex flex-col gap-0.5 bg-gray-50">
                {cat.policies.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => { onSelect(p); setOpen(null); }}
                    className="text-left text-xs text-gray-600 hover:text-gray-900 py-1.5 hover:underline transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function PolicyGeneratorForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const [curriculum, setCurriculum] = useLocalStorage("ll:curriculum", "");
  const [policy, setPolicy] = useState("");
  const [additionalRequirements, setAdditionalRequirements] = useState("");
  const [outputType, setOutputType] = useState<"full" | "structure">("full");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  const canGenerate = curriculum.trim() && policy.trim();
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, policy, additionalRequirements, outputType };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;
  const entry = isEnglandCurriculum(curriculum) ? findPolicy(policy) : null;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setPolicy((i.policy as string) ?? "");
    setAdditionalRequirements((i.additionalRequirements as string) ?? "");
    setOutputType(i.outputType === "structure" ? "structure" : "full");
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
      policy: (v) => setPolicy(v as string),
      outputType: (v) => setOutputType(v === "structure" ? "structure" : "full"),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = { policy: { policy, curriculum, outputType } };
    try {
      const res = await fetch("/api/policy-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, curriculum, policy, additionalRequirements, outputType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "policy", info, setResult);
      if (!finished) throw new Error("The policy came back empty. Please try again.");
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
        <div className="lg:col-span-1 space-y-4">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
          <PolicyCategoriesPanel onSelect={setPolicy} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">
            {prefilled && <PrefilledBadge />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <CurriculumField value={curriculum} onChange={setCurriculum} />

            <div className="space-y-1.5">
              <TopicField
                label="Policy"
                value={policy}
                onChange={setPolicy}
                placeholders={[
                  "e.g. Anti-Bullying Policy",
                  "e.g. Online Safety (E-Safety) Policy",
                  "e.g. SEND Policy",
                  "e.g. Behaviour Policy",
                ]}
              />
              {policy.trim() && (
                <p className="text-xs text-gray-500" data-testid="policy-status">
                  {entry
                    ? `${policyStatusText(entry)}. Review: ${entry.review.toLowerCase()}.`
                    : "Not in our list of policies, or outside England: the policy will say to check whether it is statutory for your school."}
                </p>
              )}
            </div>

            <AdditionalContextField
              label="Additional requirements"
              value={additionalRequirements}
              onChange={setAdditionalRequirements}
              rows={3}
              placeholders={[
                "e.g. Include reporting procedures and staff responsibilities",
                "e.g. Reference the Keeping Children Safe in Education guidance",
                "e.g. Our DSL is the deputy head; we have a nurture room",
                "e.g. We are a church school with a breakfast club",
              ]}
            />
            <p className="-mt-4 text-xs text-gray-500">Use roles, not names. &quot;Mrs Khan&quot; style names are replaced with &quot;a colleague&quot; before sending; first names alone are not caught.</p>

            <OutputTypeField value={outputType} onChange={setOutputType} />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setPolicy("");
                  setAdditionalRequirements("");
                  setOutputType("full");
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
        exportFilename={`policy-${policy.slice(0, 30).replace(/\s+/g, "-") || "document"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: policy || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
