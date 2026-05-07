"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import {
  SubjectField,
  LearningObjectiveField,
  LessonObservationFocusField,
  LessonObservationDateField,
  LessonObservationOptionsField,
  TopicField,
} from "@/app/components/fields";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";

const REFINE_CHIPS = [
  "Make the lesson observation report more detailed",
  "Expand the section on...",
  "Do not include...",
  "Make the tone more...",
  "Make the lesson observation report more concise",
];

const OBSERVATION_CATEGORIES = [
  {
    label: "Teaching and Instruction",
    items: [
      "Quality of explanation, modelling and scaffolding",
      "Use of questioning to check and deepen understanding",
      "Pace, structure and flow of the lesson",
      "Teacher subject knowledge and confidence",
      "Use of examples, analogies and worked models",
    ],
  },
  {
    label: "Curriculum and Planning",
    items: [
      "Clarity and appropriateness of learning objectives",
      "Curriculum sequencing and building on prior knowledge",
      "Quality and suitability of resources and tasks",
      "Lesson planning, structure and timing",
    ],
  },
  {
    label: "Pupil Learning and Progress",
    items: [
      "Pupil understanding and recall during the lesson",
      "Quality of pupil responses, discussion and written work",
      "Evidence of progress within the lesson",
      "Pupil participation and contribution",
    ],
  },
  {
    label: "Behaviour and Classroom Management",
    items: [
      "Classroom routines, transitions and expectations",
      "Management of low-level disruption",
      "Pupil conduct and attitudes to learning",
      "Establishing and maintaining a positive learning environment",
    ],
  },
  {
    label: "SEND and Adaptive Teaching",
    items: [
      "Differentiation and scaffolding for different learners",
      "Deployment and impact of teaching assistants",
      "Accessibility of tasks for pupils with SEND",
      "Use of adaptive teaching strategies in practice",
    ],
  },
  {
    label: "Assessment and Feedback",
    items: [
      "Use of formative assessment during the lesson",
      "Quality and timeliness of verbal and written feedback",
      "Pupil self-assessment and peer assessment",
      "Use of assessment to adjust teaching in the moment",
    ],
  },
];

function LessonObservationFocusPanel({ onSelect }: { onSelect: (v: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(open === -1 ? null : -1)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
      >
        Observation categories
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open !== null ? "rotate-180" : ""}`} />
      </button>
      {open !== null && (
        <div className="border-t border-gray-100">
          {OBSERVATION_CATEGORIES.map((cat, i) => (
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

export default function LessonObservationReportForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [learningObjective, setLearningObjective] = useState("");
  const [observationFocus, setObservationFocus] = useState("");
  const [strengths, setStrengths] = useState("");
  const [areasForDevelopment, setAreasForDevelopment] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [includeActionPlan, setIncludeActionPlan] = useState(false);
  const [includeFollowUpSupport, setIncludeFollowUpSupport] = useState(false);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate = curriculum && (mixed || yearGroup) && strengths.trim() && areasForDevelopment.trim();
  const formSnapshot = JSON.stringify({ curriculum, yearGroup, mixed, subject, learningObjective, observationFocus, strengths, areasForDevelopment, date, includeActionPlan, includeFollowUpSupport });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/lesson-observation-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject,
          learningObjective,
          observationFocus,
          strengths,
          areasForDevelopment,
          date,
          includeActionPlan,
          includeFollowUpSupport,
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
          <LessonObservationFocusPanel onSelect={setObservationFocus} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <CurriculumYearFields
              curriculum={curriculum} onCurriculumChange={setCurriculum}
              yearGroup={yearGroup} onYearGroupChange={setYearGroup}
              mixed={mixed} onMixedChange={setMixed}
              yearGroupNote
            />

            <SubjectField value={subject} onChange={setSubject} />

            <LearningObjectiveField value={learningObjective} onChange={setLearningObjective} />

            <LessonObservationFocusField value={observationFocus} onChange={setObservationFocus} />

            <TopicField
              label="Strengths"
              value={strengths}
              onChange={setStrengths}
              rows={4}
              placeholders={[
                "e.g. Subject knowledge was secure and accurate; well-designed practical activities engaged pupils",
                "e.g. Effective use of questioning to check understanding; pupils responded with confidence",
                "e.g. Strong classroom relationships; pupils were settled and on task throughout",
                "e.g. Clear modelling and scaffolding helped less confident learners access the task",
              ]}
            />

            <TopicField
              label="Areas for development"
              value={areasForDevelopment}
              onChange={setAreasForDevelopment}
              rows={4}
              placeholders={[
                "e.g. Adapting tasks for less confident pupils; reducing teacher-talk to allow more independent work",
                "e.g. Embedding success criteria so pupils can self-assess their progress",
                "e.g. Managing low-level disruption more consistently during independent work",
                "e.g. Extending higher-attaining pupils with additional challenge tasks",
              ]}
            />

            <LessonObservationDateField value={date} onChange={setDate} />

            <LessonObservationOptionsField
              includeActionPlan={includeActionPlan}
              includeFollowUpSupport={includeFollowUpSupport}
              onChangeActionPlan={setIncludeActionPlan}
              onChangeFollowUpSupport={setIncludeFollowUpSupport}
            />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum("");
                  setYearGroup("");
                  setMixed(false);
                  setSubject("");
                  setLearningObjective("");
                  setObservationFocus("");
                  setStrengths("");
                  setAreasForDevelopment("");
                  setDate(new Date().toISOString().slice(0, 10));
                  setIncludeActionPlan(false);
                  setIncludeFollowUpSupport(false);
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
        exportFilename={`lesson-observation-${subject.slice(0, 20).replace(/\s+/g, "-") || "report"}`}
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
