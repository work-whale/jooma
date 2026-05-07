"use client";

import { useState } from "react";
import {
  CurriculumField,
  EctNameField,
  SubjectField,
  TopicField,
  IncludePdpField,
} from "@/app/components/fields";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";

const REFINE_CHIPS = [
  "Make more concise",
  "Add more detail to the strengths",
  "Add more detail to the areas for development",
  "Make the language more formal",
  "Translate to French",
];

export default function ECTReportWriterForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [curriculum, setCurriculum] = useState("2014 National Curriculum");
  const [ectName, setEctName] = useState("");
  const [subject, setSubject] = useState("");
  const [strengths, setStrengths] = useState("");
  const [areasForDevelopment, setAreasForDevelopment] = useState("");
  const [includePDP, setIncludePDP] = useState(false);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate = curriculum && ectName.trim() && strengths.trim() && areasForDevelopment.trim();
  const formSnapshot = JSON.stringify({ curriculum, ectName, subject, strengths, areasForDevelopment, includePDP });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/ect-report-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          ectName,
          subject,
          strengths,
          areasForDevelopment,
          includeProfessionalDevelopmentPlan: includePDP,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setResult((prev) => (prev ?? "") + decoder.decode(value, { stream: true }).replace(/©/g, "(c)"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!result) return;
    setIsRefining(true);
    try {
      const res = await fetch("/api/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentContent: result, instruction }),
      });
      if (!res.ok) throw new Error("Refinement failed");
      let refined = "";
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        refined += decoder.decode(value, { stream: true });
        setResult(refined);
      }
    } catch {
      // result stays as-is
    } finally {
      setIsRefining(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">{sidebar}</div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <CurriculumField value={curriculum} onChange={setCurriculum} />
              <EctNameField value={ectName} onChange={setEctName} />
            </div>

            <SubjectField value={subject} onChange={setSubject} />

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

            <IncludePdpField value={includePDP} onChange={setIncludePDP} />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum("2014 National Curriculum"); setEctName(""); setSubject("");
                  setStrengths(""); setAreasForDevelopment(""); setIncludePDP(false);
                  setResult(null); setError(null); setConfirmingReset(false);
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
        exportFilename={`ect-report-${ectName.toLowerCase().replace(/\s+/g, "-") || "export"}`}
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
