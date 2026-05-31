"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TopicField, AdditionalContextField, CurriculumField, OutputTypeField } from "@/app/components/fields";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import { useLocalStorage } from "@/app/lib/useLocalStorage";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "policy-generator";

const REFINE_CHIPS = [
  "Translate to...",
  "Expand this framework by drafting the text for each of these sections:",
  "Include the following sections:",
  "Remove the following sections:",
  "Include more of a focus on...",
  "Change the tone to be more...",
];

const POLICY_CATEGORIES = [
  {
    label: "Safeguarding & Welfare",
    policies: [
      "Child Protection & Safeguarding Policy",
      "Anti-Bullying Policy",
      "Online Safety (E-Safety) Policy",
      "Attendance Policy",
      "Mental Health & Wellbeing Policy",
    ],
  },
  {
    label: "Curriculum & Learning",
    policies: [
      "Teaching & Learning Policy",
      "Assessment, Marking & Feedback Policy",
      "Curriculum Policy",
      "Homework Policy",
      "Reading Policy",
    ],
  },
  {
    label: "SEND & Inclusion",
    policies: [
      "SEND Policy",
      "Equality & Inclusion Policy",
      "English as an Additional Language (EAL) Policy",
      "Accessibility Plan",
    ],
  },
  {
    label: "Behaviour & Pastoral",
    policies: [
      "Behaviour Policy",
      "Exclusions Policy",
      "Relationships & Sex Education (RSE) Policy",
      "Personal, Social & Health Education (PSHE) Policy",
      "Anti-Racism Policy",
    ],
  },
  {
    label: "Health & Safety",
    policies: [
      "Health & Safety Policy",
      "First Aid Policy",
      "Medicines in School Policy",
      "Educational Visits Policy",
    ],
  },
  {
    label: "Staff & HR",
    policies: [
      "Staff Code of Conduct",
      "Performance Management Policy",
      "Whistleblowing Policy",
      "Safer Recruitment Policy",
      "Staff Wellbeing Policy",
    ],
  },
  {
    label: "Data & Privacy",
    policies: [
      "Data Protection Policy (GDPR)",
      "Freedom of Information Policy",
      "CCTV Policy",
    ],
  },
  {
    label: "Governance & Administration",
    policies: [
      "Admissions Policy",
      "Complaints Policy",
      "Pay Policy",
      "Financial Regulations Policy",
    ],
  },
];

function PolicyCategoriesPanel({ onSelect }: { onSelect: (name: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">Policy Categories</h2>
        <p className="text-xs text-gray-400 mt-0.5">Click a policy to fill in the form</p>
      </div>
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {POLICY_CATEGORIES.map((cat) => (
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

export default function PolicyGeneratorForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [curriculum, setCurriculum] = useLocalStorage("ll:curriculum", "");
  const [policy, setPolicy] = useState("");
  const [additionalRequirements, setAdditionalRequirements] = useState("");
  const [outputType, setOutputType] = useState<"full" | "structure">("full");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const canGenerate = curriculum.trim() && policy.trim();
  const formState = { curriculum, policy, additionalRequirements, outputType };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setPolicy((i.policy as string) ?? "");
    setAdditionalRequirements((i.additionalRequirements as string) ?? "");
    setOutputType((i.outputType as "full" | "structure") ?? "full");
    setResult(run.output);
    setLastGenerated(JSON.stringify(i));
  };

  const streamResponse = async (url: string, body: object, onChunk: (chunk: string) => void) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error || "Request failed");
    }
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      await streamResponse(
        "/api/policy-generator",
        { action: "generate", curriculum, policy, additionalRequirements, outputType },
        (chunk) => setResult((prev) => (prev ?? "") + chunk),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!result || !instruction.trim()) return;
    setIsRefining(true);
    setResult("");
    try {
      await streamResponse(
        "/api/policy-generator",
        { action: "refine", result, instruction },
        (chunk) => setResult((prev) => (prev ?? "") + chunk),
      );
    } catch {
      // silently ignore
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
          <PolicyCategoriesPanel onSelect={setPolicy} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <CurriculumField value={curriculum} onChange={setCurriculum} />

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

            <AdditionalContextField
              label="Additional requirements"
              value={additionalRequirements}
              onChange={setAdditionalRequirements}
              rows={3}
              placeholders={[
                "e.g. Include reporting procedures and staff responsibilities",
                "e.g. Reference the Keeping Children Safe in Education guidance",
                "e.g. Include a review schedule and links to statutory guidance",
                "e.g. Add school-specific details and named roles",
              ]}
            />

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

      {result !== null && (
        <div className="sticky top-0 z-20 h-8 -mx-10" style={{ backgroundColor: "#F1EFE3" }} />
      )}

      <ResultPanel
        result={result}
        isGenerating={isGenerating}
        isRefining={isRefining}
        onChange={(md) => setResult(md)}
        exportFilename={`policy-${policy.slice(0, 30).replace(/\s+/g, "-") || "document"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: policy || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
      />

      {result && !isGenerating && (
        <RefinePanel
          isRefining={isRefining}
          chips={REFINE_CHIPS}
          onRefine={handleRefine}
        />
      )}
    </div>
  );
}
