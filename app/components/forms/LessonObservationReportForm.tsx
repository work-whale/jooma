"use client";

import { useId, useState } from "react";
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
import { OBSERVER_PLACEHOLDER, scrubStaff, TEACHER_PLACEHOLDER, type StaffName } from "@/app/lib/staff-privacy";
import { readSheetStream } from "@/app/lib/sheets/client-stream";

const TOOL_SLUG = "lesson-observation-report";

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

export default function LessonObservationReportForm({
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
  const [subject, setSubject] = useState("");
  const [learningObjective, setLearningObjective] = useState("");
  const [observationFocus, setObservationFocus] = useState("");
  const [strengths, setStrengths] = useState("");
  const [areasForDevelopment, setAreasForDevelopment] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [includeActionPlan, setIncludeActionPlan] = useState(false);
  const [includeFollowUpSupport, setIncludeFollowUpSupport] = useState(false);
  // Printed on the report, never sent: the text carries [TEACHER] and [OBSERVER].
  const [teacherName, setTeacherName] = useState("");
  const [observerName, setObserverName] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  const canGenerate = curriculum && (mixed || yearGroup) && strengths.trim() && areasForDevelopment.trim();
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), curriculum, yearGroup, mixed, subject, learningObjective, observationFocus, strengths, areasForDevelopment, date, includeActionPlan, includeFollowUpSupport, teacherName, observerName };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setLearningObjective((i.learningObjective as string) ?? "");
    setObservationFocus((i.observationFocus as string) ?? "");
    setStrengths((i.strengths as string) ?? "");
    setAreasForDevelopment((i.areasForDevelopment as string) ?? "");
    setDate((i.date as string) ?? new Date().toISOString().slice(0, 10));
    setIncludeActionPlan(Boolean(i.includeActionPlan));
    setIncludeFollowUpSupport(Boolean(i.includeFollowUpSupport));
    setTeacherName((i.teacherName as string) ?? "");
    setObserverName((i.observerName as string) ?? "");
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
      subject: (v) => setSubject(v as string),
      learningObjective: (v) => setLearningObjective(v as string),
      observationFocus: (v) => setObservationFocus(v as string),
      includeActionPlan: (v) => setIncludeActionPlan(v as boolean),
      includeFollowUpSupport: (v) => setIncludeFollowUpSupport(v as boolean),
    },
  });

  const staff: StaffName[] = [
    { placeholder: TEACHER_PLACEHOLDER, name: teacherName },
    { placeholder: OBSERVER_PLACEHOLDER, name: observerName },
  ];
  const scrub = (text: string) => scrubStaff(text, staff.filter((p) => p.name.trim()));

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const resolvedYear = mixed ? "Mixed" : yearGroup;
    const info = {
      curriculum,
      yearGroup: resolvedYear,
      staff,
      observation: {
        date,
        yearGroup: mixed ? "Mixed years" : yearGroup,
        subject,
        learningObjective,
        focus: observationFocus,
        teacherNamed: !!teacherName.trim(),
        observerNamed: !!observerName.trim(),
      },
    };
    try {
      const res = await fetch("/api/lesson-observation-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Never the names: [TEACHER] and [OBSERVER] stand in for them.
        body: JSON.stringify({
          language,
          curriculum,
          yearGroup: resolvedYear,
          subject: scrub(subject),
          learningObjective: scrub(learningObjective),
          observationFocus: scrub(observationFocus),
          strengths: scrub(strengths),
          areasForDevelopment: scrub(areasForDevelopment),
          includeActionPlan,
          includeFollowUpSupport,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "lessonObservation", info, setResult);
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
        <div className="lg:col-span-1 space-y-4">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
          <LessonObservationFocusPanel onSelect={setObservationFocus} />
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

            <fieldset className="space-y-3">
              <legend className="block text-sm font-semibold text-gray-800">Names for the report (optional)</legend>
              <p className="text-xs text-gray-500">Printed on the report only. Names are added in your browser and never sent. Refer to anyone else by role in your notes.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor={`${fieldId}-teacher`} className="block text-sm text-gray-700">Teacher observed</label>
                  <input id={`${fieldId}-teacher`} type="text" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="e.g. Sarah Johnson" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white" />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${fieldId}-observer`} className="block text-sm text-gray-700">Observer</label>
                  <input id={`${fieldId}-observer`} type="text" value={observerName} onChange={(e) => setObserverName(e.target.value)} placeholder="e.g. David Okafor" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white" />
                </div>
              </div>
            </fieldset>

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
                  setTeacherName("");
                  setObserverName("");
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
        exportFilename={`lesson-observation-${(teacherName.trim() || subject).slice(0, 30).replace(/\s+/g, "-").toLowerCase() || "report"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: [teacherName.trim(), subject].filter(Boolean).join(", ") || observationFocus || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
