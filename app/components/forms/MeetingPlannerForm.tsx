"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  MeetingPurposeField,
  MeetingDurationField,
  MeetingParticipantsField,
  MeetingTopicsField,
  MeetingOptionsField,
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
import { scrubPupilText } from "@/app/lib/sheets/pupil";
import { scrubStaffTitles } from "@/app/lib/staff-privacy";

const TOOL_SLUG = "meeting-planner";

/*
 * A meeting plan as a designed document (app/lib/sheets/meeting.ts): a timed
 * agenda that adds up to the length, facilitator notes (switchable in Design
 * so the agenda can be sent alone), minutes boxes and a blank action log.
 * A pupil the meeting is about is named on the page only: the model sees
 * [PUPIL]. "Mr Patel" style names become "a colleague" before sending.
 * Refine is gone: Ask Jo edits the plan. Old markdown runs open as before.
 */

const MEETING_CATEGORIES = [
  {
    label: "Staff Meetings",
    items: [
      "Whole-staff weekly briefing",
      "End-of-term staff review",
      "New staff induction session",
      "Whole-school CPD and professional development",
      "Staff wellbeing and workload review",
    ],
  },
  {
    label: "Curriculum and Teaching",
    items: [
      "Heads of department / subject leads meeting",
      "Curriculum planning and sequencing session",
      "Assessment data review",
      "Marking moderation and standardisation",
      "Lesson study and professional learning community",
    ],
  },
  {
    label: "Pupil Progress and Welfare",
    items: [
      "Pupil progress review",
      "SEND review and provision mapping",
      "Attendance and punctuality review",
      "Safeguarding and welfare update",
      "Looked-after children review",
    ],
  },
  {
    label: "Pastoral and Behaviour",
    items: [
      "Tutor team / form group review",
      "Behaviour and exclusions review",
      "Year group pastoral team meeting",
      "Anti-bullying and student conduct review",
    ],
  },
  {
    label: "Leadership and Strategy",
    items: [
      "Senior leadership team (SLT) meeting",
      "School improvement planning session",
      "Budget and resources review",
      "Governors / governing body meeting",
      "Ofsted preparation and self-evaluation",
    ],
  },
  {
    label: "Transitions",
    items: [
      "Year 6 to Year 7 transition planning",
      "EYFS to KS1 transition meeting",
      "Sixth form entry and options evening planning",
      "New intake induction planning",
    ],
  },
];

function MeetingTypesPanel({ onSelect }: { onSelect: (v: string) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(open === -1 ? null : -1)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
      >
        Meeting types
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open !== null ? "rotate-180" : ""}`} />
      </button>
      {open !== null && (
        <div className="border-t border-gray-100">
          {MEETING_CATEGORIES.map((cat, i) => (
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

export default function MeetingPlannerForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const [purpose, setPurpose] = useState("");
  const [duration, setDuration] = useState("60");
  const [participants, setParticipants] = useState("");
  const [topics, setTopics] = useState("");
  const [includeIcebreaker, setIncludeIcebreaker] = useState(false);
  const [includeActionItems, setIncludeActionItems] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [pupilName, setPupilName] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  const durationNum = parseInt(duration, 10);
  const canGenerate = purpose.trim() && participants.trim() && !isNaN(durationNum) && durationNum >= 5 && durationNum <= 480;
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), purpose, duration, participants, topics, includeIcebreaker, includeActionItems, startTime, pupilName };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setPurpose((i.purpose as string) ?? "");
    setDuration((i.duration as string) ?? "60");
    setParticipants((i.participants as string) ?? "");
    setTopics((i.topics as string) ?? "");
    setIncludeIcebreaker(Boolean(i.includeIcebreaker));
    setIncludeActionItems(Boolean(i.includeActionItems));
    setStartTime((i.startTime as string) ?? "");
    setPupilName((i.pupilName as string) ?? "");
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      purpose: (v) => setPurpose(v as string),
      participants: (v) => setParticipants(v as string),
      topics: (v) => setTopics(v as string),
      duration: (v) => setDuration(v as string),
      includeIcebreaker: (v) => setIncludeIcebreaker(v as boolean),
      includeActionItems: (v) => setIncludeActionItems(v as boolean),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const name = pupilName.trim();
    // The pupil as [PUPIL] and titled colleagues as "a colleague", before
    // anything leaves the browser. The route refuses a name key and scrubs
    // titles again.
    const clean = (t: string) => scrubStaffTitles(scrubPupilText(t, name), "colleague");
    const sent = { purpose: clean(purpose), participants: clean(participants), topics: clean(topics) };
    const info = {
      meeting: { duration: durationNum, startTime, participants: sent.participants, pupilNamed: !!name, includeActionItems },
      ...(name ? { pupil: { name, pronouns: "they" as const } } : {}),
    };
    try {
      const res = await fetch("/api/meeting-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, ...sent, duration: durationNum, includeIcebreaker, includeActionItems }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "meeting", info, setResult);
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
        <div className="lg:col-span-1 space-y-4">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
          <MeetingTypesPanel onSelect={setPurpose} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">
            {prefilled && <PrefilledBadge />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <MeetingPurposeField value={purpose} onChange={setPurpose} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MeetingDurationField value={duration} onChange={setDuration} />
              <MeetingParticipantsField value={participants} onChange={setParticipants} />
            </div>

            <MeetingTopicsField value={topics} onChange={setTopics} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="meeting-start" className="block text-sm font-semibold text-gray-800">Start time (optional)</label>
                <input id="meeting-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white" />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="meeting-pupil" className="block text-sm font-semibold text-gray-800">Pupil (optional, page only)</label>
                <input id="meeting-pupil" type="text" value={pupilName} onChange={(e) => setPupilName(e.target.value)} placeholder="For a review about one pupil" className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white" />
              </div>
            </div>
            <p className="-mt-3 text-xs text-gray-500" data-testid="meeting-privacy">The pupil&apos;s name is shown on the plan but never sent. Use roles for staff: &quot;Mr Patel&quot; style names become &quot;a colleague&quot; before sending, but first names alone are not caught.</p>

            <MeetingOptionsField
              includeIcebreaker={includeIcebreaker}
              includeActionItems={includeActionItems}
              onChangeIcebreaker={setIncludeIcebreaker}
              onChangeActionItems={setIncludeActionItems}
            />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setPurpose("");
                  setDuration("60");
                  setParticipants("");
                  setTopics("");
                  setIncludeIcebreaker(false);
                  setIncludeActionItems(false);
                  setStartTime("");
                  setPupilName("");
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
        exportFilename="meeting-plan"
        historyMeta={{ toolSlug: TOOL_SLUG, title: scrubStaffTitles(purpose, "colleague").slice(0, 80) || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
