"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  CurriculumField,
  LearningWalkDateField,
  LearningWalkClassesField,
  LearningWalkFocusField,
  LearningWalkOptionsField,
  TopicField,
} from "@/app/components/fields";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import { useLocalStorage } from "@/app/lib/useLocalStorage";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "learning-walk-report";

const REFINE_CHIPS = [
  "Make the report more detailed",
  "Make the report more concise",
  "Expand the section on...",
  "Include reference to...",
];

const FOCUS_CATEGORIES = [
  {
    label: "Quality of Education",
    items: [
      "Curriculum intent and sequencing across subjects",
      "Quality of teaching, explanation and modelling",
      "Pupil understanding, retention and recall",
      "Literacy and reading across the curriculum",
      "Use of assessment to inform teaching",
    ],
  },
  {
    label: "Behaviour and Attitudes",
    items: [
      "Pupil conduct in lessons and around school",
      "On-task engagement and focus during independent work",
      "Attitudes to learning and resilience",
      "Pupil-teacher relationships and classroom climate",
      "Consistency in applying behaviour expectations",
    ],
  },
  {
    label: "Personal Development",
    items: [
      "Cultural capital and enrichment opportunities",
      "Student leadership and pupil voice",
      "PSHE and character education delivery",
      "Extracurricular and wider school life",
    ],
  },
  {
    label: "SEND and Inclusion",
    items: [
      "Adaptive teaching strategies in practice",
      "Deployment and impact of support staff",
      "Accessibility of resources and tasks",
      "Progress and engagement of pupils with SEND",
    ],
  },
  {
    label: "Early Years (EYFS)",
    items: [
      "Child-initiated learning and independence",
      "Quality of adult interactions during provision",
      "Learning environment indoors and outdoors",
      "Assessment and next steps in practice",
    ],
  },
  {
    label: "Safeguarding and Welfare",
    items: [
      "Safeguarding culture visible in classrooms",
      "Pupil wellbeing and pastoral visibility",
      "Pupils' sense of safety and belonging",
    ],
  },
];

function LearningWalkFocusPanel({ onSelect }: { onSelect: (v: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(open === -1 ? null : -1)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
      >
        Focus categories
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open !== null ? "rotate-180" : ""}`} />
      </button>
      {open !== null && (
        <div className="border-t border-gray-100">
          {FOCUS_CATEGORIES.map((cat, i) => (
            <div key={cat.label} className="border-b border-gray-100 last:border-0">
              <button
                type="button"
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {cat.label}
                <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open === i ? "rotate-180" : ""}`} />
              </button>
              {open === i && (
                <ul className="pb-2 px-4 space-y-1">
                  {cat.items.map((item) => (
                    <li key={item}>
                      <button
                        type="button"
                        onClick={() => onSelect(item)}
                        className="w-full text-left text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg px-2 py-1.5 transition-colors"
                      >
                        {item}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LearningWalkReportForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [curriculum, setCurriculum] = useLocalStorage("ll:curriculum", "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [classesVisited, setClassesVisited] = useState("");
  const [focus, setFocus] = useState("");
  const [strengths, setStrengths] = useState("");
  const [areasForDevelopment, setAreasForDevelopment] = useState("");
  const [includeRecommendations, setIncludeRecommendations] = useState(true);
  const [includeNextSteps, setIncludeNextSteps] = useState(true);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const canGenerate = curriculum && strengths.trim() && areasForDevelopment.trim();
  const formState = { curriculum, date, classesVisited, focus, strengths, areasForDevelopment, includeRecommendations, includeNextSteps };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setDate((i.date as string) ?? new Date().toISOString().slice(0, 10));
    setClassesVisited((i.classesVisited as string) ?? "");
    setFocus((i.focus as string) ?? "");
    setStrengths((i.strengths as string) ?? "");
    setAreasForDevelopment((i.areasForDevelopment as string) ?? "");
    setIncludeRecommendations(i.includeRecommendations === undefined ? true : Boolean(i.includeRecommendations));
    setIncludeNextSteps(i.includeNextSteps === undefined ? true : Boolean(i.includeNextSteps));
    setResult(run.output);
    setLastGenerated(JSON.stringify(i));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/learning-walk-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curriculum, date, classesVisited, focus, strengths, areasForDevelopment, includeRecommendations, includeNextSteps }),
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
        setResult((prev) => (prev ?? "") + decoder.decode(value, { stream: true }));
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
        <div className="lg:col-span-1 space-y-4">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
          <LearningWalkFocusPanel onSelect={setFocus} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CurriculumField value={curriculum} onChange={setCurriculum} />
              <LearningWalkDateField value={date} onChange={setDate} />
            </div>

            <LearningWalkClassesField value={classesVisited} onChange={setClassesVisited} />

            <LearningWalkFocusField value={focus} onChange={setFocus} />

            <TopicField
              label="Observed strengths"
              value={strengths}
              onChange={setStrengths}
              rows={4}
              placeholders={[
                "e.g. Direct instruction helped students' progress; work was appropriately pitched to different levels",
                "e.g. Positive relationships between staff and pupils were evident throughout",
                "e.g. Strong use of questioning to check understanding across all classes visited",
                "e.g. Consistent application of the behaviour policy and calm, purposeful classrooms",
              ]}
            />

            <TopicField
              label="Areas for development"
              value={areasForDevelopment}
              onChange={setAreasForDevelopment}
              rows={4}
              placeholders={[
                "e.g. Some students demonstrated off-task behaviour during independent work",
                "e.g. Displays and word mats were underused to support students' progress",
                "e.g. Opportunities for peer collaboration were missed in several lessons",
                "e.g. Differentiation for higher-attaining pupils was inconsistent across classes",
              ]}
            />

            <LearningWalkOptionsField
              includeRecommendations={includeRecommendations}
              includeNextSteps={includeNextSteps}
              onChangeRecommendations={setIncludeRecommendations}
              onChangeNextSteps={setIncludeNextSteps}
            />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setDate(new Date().toISOString().slice(0, 10));
                  setClassesVisited("");
                  setFocus("");
                  setStrengths("");
                  setAreasForDevelopment("");
                  setIncludeRecommendations(true);
                  setIncludeNextSteps(true);
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
        exportFilename="learning-walk-report"
        historyMeta={{ toolSlug: TOOL_SLUG, title: focus || classesVisited || null, input: formState }}
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
