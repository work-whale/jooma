"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PresentationTopicField,
  PresentationSlidesField,
  PresentationToneField,
  PresentationNotesField,
} from "@/app/components/fields";
import Card from "@/app/components/ui/Card";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ConfirmModal from "@/app/components/ConfirmModal";

export default function PresentationGeneratorForm({ sidebar }: { sidebar: React.ReactNode }) {
  const router = useRouter();

  const [topic, setTopic] = useState("");
  const [nSlides, setNSlides] = useState(10);
  const [tone, setTone] = useState("educational");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const canGenerate = topic.trim();
  const formSnapshot = JSON.stringify({ topic, nSlides, tone, additionalNotes });
  const unchangedSinceGeneration = generated && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setGenerated(false);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/presentation-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, nSlides, tone, additionalNotes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const data = await res.json();
      if (data.presentationId) {
        router.push(`/presentation/${data.presentationId}`);
      } else {
        setGenerated(true);
        setIsGenerating(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setTopic("");
    setNSlides(10);
    setTone("educational");
    setAdditionalNotes("");
    setError(null);
    setGenerated(false);
    setLastGenerated(null);
    setConfirmingReset(false);
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">{sidebar}</div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <PresentationTopicField value={topic} onChange={setTopic} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <PresentationSlidesField value={nSlides} onChange={setNSlides} />
              <PresentationToneField value={tone} onChange={setTone} />
            </div>

            <PresentationNotesField value={additionalNotes} onChange={setAdditionalNotes} />

            {isGenerating && (
              <div className="bg-violet-50 border border-violet-100 rounded-xl px-5 py-4 text-sm text-violet-700">
                Generating your presentation — this can take up to a minute while images are created. Please wait.
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-4 text-sm text-red-700">{error}</div>
            )}

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!generated && !error} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={handleReset}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating || unchangedSinceGeneration}
                isGenerating={isGenerating}
                hasResult={generated}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
