"use client";

import { useState, useRef } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { SubjectField, LearningObjectiveField, AbilityLevelField, QuestionTypesField, AdditionalContextField } from "@/app/components/fields";
import { toTitleCase } from "@/app/lib/formOptions";
import { Upload, X, Search, ImageIcon } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import RefinePanel from "@/app/components/RefinePanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "homework-generator";

const HOMEWORK_TYPES = [
  "Worksheet-style questions",
  "Short written task",
  "Creative task",
  "Practical investigation",
  "Research homework",
  "Reading comprehension",
  "Mixed tasks",
  "Exam-style practice",
];

const LENGTH_OPTIONS = [
  { label: "Quick task (10 minutes)", value: "Quick task (10 minutes)" },
  { label: "Standard task (20 minutes)", value: "Standard task (20 minutes)" },
  { label: "Extended task (30 minutes)", value: "Extended task (30 minutes)" },
];

const REFINE_CHIPS = [
  "Make more concise",
  "Make it more challenging",
  "Make it more accessible",
  "Add a challenge extension task",
  "Translate to French",
];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const selectClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

type ImageSource = "upload" | "search" | "";

export default function HomeworkGeneratorForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [subject, setSubject] = useState("");
  const [learningObjective, setLearningObjective] = useState("");
  const [abilityLevel, setAbilityLevel] = useState("EXS");
  const [questionTypes, setQuestionTypes] = useState<string[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [homeworkType, setHomeworkType] = useState("");
  const [length, setLength] = useState("");
  const [includeAnswers, setIncludeAnswers] = useState<"yes" | "no">("no");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [lessonContent, setLessonContent] = useState("");

  // Image
  const [imageSource, setImageSource] = useState<ImageSource>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMediaType, setImageMediaType] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const canGenerate =
    curriculum &&
    (mixed || yearGroup) &&
    subject.trim() &&
    learningObjective.trim() &&
    homeworkType &&
    length;

  const formState = {
    curriculum, yearGroup, mixed, subject, learningObjective, abilityLevel,
    questionTypes, questionCounts, homeworkType, length, includeAnswers,
    additionalInstructions, lessonContent, imageBase64,
  };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setSubject((i.subject as string) ?? "");
    setLearningObjective((i.learningObjective as string) ?? "");
    setAbilityLevel((i.abilityLevel as string) ?? "EXS");
    setQuestionTypes((i.questionTypes as string[]) ?? []);
    setQuestionCounts((i.questionCounts as Record<string, number>) ?? {});
    setHomeworkType((i.homeworkType as string) ?? "");
    setLength((i.length as string) ?? "");
    setIncludeAnswers((i.includeAnswers as "yes" | "no") ?? "no");
    setAdditionalInstructions((i.additionalInstructions as string) ?? "");
    setLessonContent((i.lessonContent as string) ?? "");
    setImageBase64((i.imageBase64 as string) ?? null);
    setResult(run.output);
    setLastGenerated(JSON.stringify(i));
  };

  const handleImageFile = (file: File) => {
    setImageFile(file);
    setImageMediaType(file.type);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      // Strip the data URL prefix to get raw base64
      setImageBase64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageBase64(null);
    setImageMediaType(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleLessonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setLessonContent((e.target?.result as string) || "");
    reader.readAsText(file);
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/homework-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          subject: toTitleCase(subject),
          learningObjective,
          abilityLevel,
          questionTypes: questionTypes.length > 0 ? questionTypes : undefined,
          questionCounts: questionTypes.length > 0 ? questionCounts : undefined,
          homeworkType,
          length,
          includeAnswers: includeAnswers === "yes",
          additionalInstructions: additionalInstructions.trim() || undefined,
          lessonContent: lessonContent.trim() || undefined,
          imageBase64: imageBase64 || undefined,
          imageMediaType: imageMediaType || undefined,
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
        const chunk = decoder.decode(value, { stream: true }).replace(/©/g, "(c)");
        setResult((prev) => (prev ?? "") + chunk);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    setCurriculum(""); setYearGroup(""); setMixed(false);
    setSubject(""); setLearningObjective(""); setAbilityLevel("EXS");
    setQuestionTypes([]); setQuestionCounts({}); setHomeworkType(""); setLength("");
    setIncludeAnswers("no"); setAdditionalInstructions(""); setLessonContent("");
    setImageSource(""); clearImage();
    setResult(null); setError(null); setConfirmingReset(false);
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
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

            <AbilityLevelField value={abilityLevel} onChange={setAbilityLevel} />

            <QuestionTypesField
              value={questionTypes}
              onChange={setQuestionTypes}
              optional
              showCounts
              counts={questionCounts}
              onCountChange={setQuestionCounts}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Homework Type</label>
                <select value={homeworkType} onChange={(e) => setHomeworkType(e.target.value)} className={selectClass}>
                  <option value="" disabled>Select type</option>
                  {HOMEWORK_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Length / Effort Level</label>
                <select value={length} onChange={(e) => setLength(e.target.value)} className={selectClass}>
                  <option value="" disabled>Select length</option>
                  {LENGTH_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-2">
              <label className="block text-sm font-semibold text-gray-800">Include Answers?</label>
              <div className="flex gap-6">
                {(["yes", "no"] as const).map((val) => (
                  <label key={val} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                    <input
                      type="radio"
                      name="includeAnswers"
                      value={val}
                      checked={includeAnswers === val}
                      onChange={() => setIncludeAnswers(val)}
                      className="accent-gray-900"
                    />
                    {val === "yes" ? "Yes — provide answers" : "No — student-only version"}
                  </label>
                ))}
              </div>
            </div>

            <AdditionalContextField
              value={additionalInstructions}
              onChange={setAdditionalInstructions}
              label="Additional instructions"
              rows={3}
              placeholders={[
                `e.g. Include a challenge task at the end`,
                `e.g. Suitable for SEND learners — keep language simple`,
                `e.g. Add a retrieval question at the start`,
                `e.g. Include a real-world application`,
              ]}
            />

            {/* Lesson plan */}
            <div className="space-y-1.5">
              <AdditionalContextField
                value={lessonContent}
                onChange={setLessonContent}
                label="Paste lesson plan / worksheet / slides"
                rows={5}
                placeholders={[
                  "e.g. Paste your lesson plan and the AI will build homework around it",
                  "e.g. Paste slide notes or a worksheet to use as the basis",
                  "e.g. Paste your learning objectives and key content here",
                ]}
                labelSlot={
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload file
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".txt,.md,.csv"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLessonFile(f); }}
                    />
                  </>
                }
              />
              <p className="text-xs text-gray-400">100,000 character maximum input text</p>
            </div>

            {/* Image prompt */}
            <div className="space-y-3">
              <label className="block text-sm font-semibold text-gray-800">
                Image <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setImageSource("upload"); setTimeout(() => imageInputRef.current?.click(), 0); }}
                  className={`flex-1 border rounded-xl p-4 flex flex-col items-center gap-2 text-sm font-medium cursor-pointer transition-colors ${
                    imageSource === "upload"
                      ? "border-stone-700 bg-stone-50 text-stone-800"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Upload className="w-5 h-5" />
                  Upload image
                </button>
                <button
                  type="button"
                  onClick={() => window.open("https://images.google.com", "_blank")}
                  className="flex-1 border border-gray-200 rounded-xl p-4 flex flex-col items-center gap-2 text-sm font-medium text-gray-500 hover:border-gray-300 cursor-pointer transition-colors"
                >
                  <Search className="w-5 h-5" />
                  Search web
                </button>
              </div>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }}
              />

              {imagePreview && (
                <div className="relative inline-block">
                  <img src={imagePreview} alt="Uploaded" className="max-h-48 rounded-xl border border-gray-200 object-contain" />
                  <button
                    type="button"
                    onClick={clearImage}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {imageSource === "upload" && !imagePreview && (
                <div
                  onClick={() => imageInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-8 flex flex-col items-center gap-2 text-gray-400 cursor-pointer hover:border-gray-300 transition-colors"
                >
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-sm">Click to choose an image</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current homework and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={handleReset}
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
        exportFilename={`homework-${subject || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: subject || learningObjective || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
      />

      {result && !isGenerating && (
        <RefinePanel
          isRefining={isRefining}
          chips={REFINE_CHIPS}
          onRefine={async (instruction) => {
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
          }}
        />
      )}
    </div>
  );
}
