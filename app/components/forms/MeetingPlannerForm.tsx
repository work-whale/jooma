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
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "meeting-planner";

const REFINE_CHIPS = [
  "Translate to...",
  "Include more time on...",
  "Include less time on...",
  "Include more small group breakout sessions",
  "Include more opportunities for sharing ideas",
  "Make the meeting shorter",
];

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

export default function MeetingPlannerForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [purpose, setPurpose] = useState("");
  const [duration, setDuration] = useState("60");
  const [participants, setParticipants] = useState("");
  const [topics, setTopics] = useState("");
  const [includeIcebreaker, setIncludeIcebreaker] = useState(false);
  const [includeActionItems, setIncludeActionItems] = useState(false);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const durationNum = parseInt(duration, 10);
  const canGenerate = purpose.trim() && participants.trim() && !isNaN(durationNum) && durationNum >= 5 && durationNum <= 480;
  const formState = { purpose, duration, participants, topics, includeIcebreaker, includeActionItems };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setPurpose((i.purpose as string) ?? "");
    setDuration((i.duration as string) ?? "60");
    setParticipants((i.participants as string) ?? "");
    setTopics((i.topics as string) ?? "");
    setIncludeIcebreaker(Boolean(i.includeIcebreaker));
    setIncludeActionItems(Boolean(i.includeActionItems));
    setResult(run.output);
    setLastGenerated(JSON.stringify(i));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/meeting-planner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, duration: durationNum, participants, topics, includeIcebreaker, includeActionItems }),
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
          <MeetingTypesPanel onSelect={setPurpose} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <MeetingPurposeField value={purpose} onChange={setPurpose} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <MeetingDurationField value={duration} onChange={setDuration} />
              <MeetingParticipantsField value={participants} onChange={setParticipants} />
            </div>

            <MeetingTopicsField value={topics} onChange={setTopics} />

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
        exportFilename="meeting-plan"
        historyMeta={{ toolSlug: TOOL_SLUG, title: purpose || null, input: formState }}
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
