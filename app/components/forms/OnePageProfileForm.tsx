"use client";

import { useState } from "react";
import {
  PupilNameField,
  TopicField,
  AdditionalContextField,
  IncludeAdditionalSupportField,
} from "@/app/components/fields";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";

const REFINE_CHIPS = [
  "Translate to...",
  "Make the language simpler for a younger student to read",
  "Make the language more detailed for an older student",
  "Include the following...",
  "Suggest support strategies which...",
];

export default function OnePageProfileForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);

  const [name, setName] = useState("");
  const [likes, setLikes] = useState("");
  const [happy, setHappy] = useState("");
  const [supportNeeds, setSupportNeeds] = useState("");
  const [supportStyle, setSupportStyle] = useState("");
  const [hopes, setHopes] = useState("");
  const [interventionGroups, setInterventionGroups] = useState("");
  const [outsideAgency, setOutsideAgency] = useState("");
  const [includeAdditionalSupport, setIncludeAdditionalSupport] = useState(true);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const resolvedYearGroup = mixed ? "Mixed year group" : yearGroup;
  const canGenerate = curriculum.trim() && resolvedYearGroup.trim() && name.trim() && likes.trim() && supportNeeds.trim();
  const formSnapshot = JSON.stringify({ curriculum, yearGroup, mixed, name, likes, happy, supportNeeds, supportStyle, hopes, interventionGroups, outsideAgency, includeAdditionalSupport });
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const streamResponse = async (body: object, onChunk: (c: string) => void) => {
    const res = await fetch("/api/one-page-profile", {
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
        { action: "generate", curriculum, yearGroup: resolvedYearGroup, name, likes, happy, supportNeeds, supportStyle, hopes, interventionGroups, outsideAgency, includeAdditionalSupport },
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
        <div className="lg:col-span-1">{sidebar}</div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <CurriculumYearFields
              curriculum={curriculum}
              onCurriculumChange={setCurriculum}
              yearGroup={yearGroup}
              onYearGroupChange={setYearGroup}
              mixed={mixed}
              onMixedChange={setMixed}
              yearGroupNote
            />

            <PupilNameField value={name} onChange={setName} />

            <TopicField
              label="What people like and admire about the student"
              value={likes}
              onChange={setLikes}
              placeholders={[
                "e.g. Kind and caring, always willing to help others",
                "e.g. Great sense of humour, works hard in practical lessons",
                "e.g. Creative thinker, brilliant with younger children",
                "e.g. Enthusiastic about science, very resilient",
              ]}
            />

            <TopicField
              label="What makes the student happy"
              value={happy}
              onChange={setHappy}
              placeholders={[
                "e.g. Working with friends, art projects, football",
                "e.g. Being given responsibility, using a computer",
                "e.g. Listening to music, hands-on activities",
                "e.g. Reading, animals, spending time outdoors",
              ]}
            />

            <TopicField
              label="What the student needs support with"
              value={supportNeeds}
              onChange={setSupportNeeds}
              placeholders={[
                "e.g. Managing transitions, processing written instructions",
                "e.g. Staying focused during long tasks, asking for help",
                "e.g. Working in busy or noisy environments",
                "e.g. Organising work and managing time in lessons",
              ]}
            />

            <TopicField
              label="How the student likes to be supported"
              value={supportStyle}
              onChange={setSupportStyle}
              placeholders={[
                "e.g. Prefers quiet 1:1 check-ins, likes verbal instructions broken into steps",
                "e.g. Responds well to visual prompts and advance warnings of change",
                "e.g. Likes to sit near the front, away from distractions",
                "e.g. Benefits from a calm, predictable routine",
              ]}
            />

            <TopicField
              label="The student's hopes and wishes for the future"
              value={hopes}
              onChange={setHopes}
              placeholders={[
                "e.g. Would like to work with animals, wants to improve reading",
                "e.g. Hopes to make more friends, wants to feel more confident",
                "e.g. Interested in becoming an artist or working with computers",
                "e.g. Wants to be able to manage independently in secondary school",
              ]}
            />

            <AdditionalContextField
              label="Intervention groups"
              value={interventionGroups}
              onChange={setInterventionGroups}
              rows={3}
              placeholders={[
                "e.g. Reading intervention, Speech and Language group",
                "e.g. Social Skills group, Maths catch-up programme",
                "e.g. Nurture group, Emotional Literacy Support",
                "e.g. Fine motor skills group, Phonics intervention",
              ]}
            />

            <AdditionalContextField
              label="Outside agency input"
              value={outsideAgency}
              onChange={setOutsideAgency}
              rows={3}
              placeholders={[
                "e.g. CAMHS, Educational Psychologist",
                "e.g. Speech and Language Therapy, Occupational Therapy",
                "e.g. Visual impairment team, Hearing support service",
                "e.g. Early Help, Children and Families team",
              ]}
            />

            <IncludeAdditionalSupportField
              value={includeAdditionalSupport}
              onChange={setIncludeAdditionalSupport}
            />

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setName(""); setLikes(""); setHappy(""); setSupportNeeds("");
                  setSupportStyle(""); setHopes(""); setInterventionGroups("");
                  setOutsideAgency(""); setIncludeAdditionalSupport(true);
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
        exportFilename={`support-profile-${name.toLowerCase().replace(/\s+/g, "-") || "student"}`}
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
