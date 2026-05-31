"use client";

import { useState, useRef, useEffect } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { WordCountField } from "@/app/components/fields";
import { Wand2, Upload, Check } from "lucide-react";
import ResultPanel from "@/app/components/ResultPanel";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";

const TOOL_SLUG = "comprehension-generator";

const KS1_DOMAINS = [
  { code: "1a", label: "Word meaning", description: "Draw on knowledge of vocabulary to understand texts" },
  { code: "1b", label: "Key aspects", description: "Identify and explain key aspects of fiction and non-fiction texts, such as characters, events, titles and information" },
  { code: "1c", label: "Sequence of events", description: "Identify and explain the sequence of events in texts" },
  { code: "1d", label: "Inference", description: "Make inferences from the text" },
  { code: "1e", label: "Prediction", description: "Predict what might happen on the basis of what has been read so far" },
];

const KS2_DOMAINS = [
  { code: "2a", label: "Word meaning", description: "Give and explain the meaning of words in context" },
  { code: "2b", label: "Retrieval", description: "Retrieve and record information, and identify key details from fiction and non-fiction" },
  { code: "2c", label: "Summarising", description: "Summarise main ideas from more than one paragraph" },
  { code: "2d", label: "Inference", description: "Make inferences from the text and explain and justify inferences with evidence from the text" },
  { code: "2e", label: "Prediction", description: "Predict what might happen from details stated and implied" },
  { code: "2f", label: "Structure", description: "Identify and explain how information and narrative content is related and contributes to meaning as a whole" },
  { code: "2g", label: "Language choices", description: "Identify and explain how meaning is enhanced through choice of words and phrases" },
  { code: "2h", label: "Comparison", description: "Make comparisons within the text" },
];

const QUESTION_TYPES = [
  "Multiple choice",
  "Short answer",
  "Extended writing",
  "True / False",
  "Gap fill",
  "Vocabulary in context",
];

const COMPLEXITY_LEVELS = ["Simple", "Standard", "Challenging"] as const;
type Complexity = typeof COMPLEXITY_LEVELS[number];

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

export default function ComprehensionForm({ sidebar }: { sidebar: React.ReactNode }) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [textSource, setTextSource] = useState<"generate" | "own" | "">("");
  const [complexity, setComplexity] = useState<Complexity>("Standard");
  const [contentDomains, setContentDomains] = useState<string[]>([]);
  const [questionTypes, setQuestionTypes] = useState<string[]>([]);
  const [numQuestions, setNumQuestions] = useState(5);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [topic, setTopic] = useState("");
  const [passageWordCount, setPassageWordCount] = useState("300");
  const topicInputRef = useRef<HTMLInputElement>(null);
  const [ownText, setOwnText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);

  const ks = (!mixed && (yearGroup === "Year 1" || yearGroup === "Year 2")) ? "ks1" : "ks2";
  const currentDomains = ks === "ks1" ? KS1_DOMAINS : KS2_DOMAINS;

  const prevKsRef = useRef(ks);
  useEffect(() => {
    if (prevKsRef.current !== ks) {
      setContentDomains([]);
      prevKsRef.current = ks;
    }
  }, [ks]);

  const toggleDomain = (code: string) =>
    setContentDomains((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);

  const toggleQuestionType = (type: string) =>
    setQuestionTypes((prev) => prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]);

  const formState = { curriculum, yearGroup, mixed, textSource, topic, ownText, passageWordCount, complexity, contentDomains, questionTypes, numQuestions, includeAnswerKey };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    const i = run.input;
    setCurriculum((i.curriculum as string) ?? "");
    setYearGroup((i.yearGroup as string) ?? "");
    setMixed(Boolean(i.mixed));
    setTextSource((i.textSource as "generate" | "own" | "") ?? "");
    setTopic((i.topic as string) ?? "");
    setOwnText((i.ownText as string) ?? "");
    setPassageWordCount((i.passageWordCount as string) ?? "300");
    setComplexity((i.complexity as Complexity) ?? "Standard");
    setContentDomains((i.contentDomains as string[]) ?? []);
    setQuestionTypes((i.questionTypes as string[]) ?? []);
    setNumQuestions((i.numQuestions as number) ?? 5);
    setIncludeAnswerKey(i.includeAnswerKey === undefined ? true : Boolean(i.includeAnswerKey));
    setResult(run.output);
    setLastGenerated(JSON.stringify(i));
  };

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/comprehension-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          curriculum,
          yearGroup: mixed ? "Mixed" : yearGroup,
          textSource,
          topic: textSource === "generate" ? topic : undefined,
          ownText: textSource === "own" ? ownText : undefined,
          passageWordCount: textSource === "generate" ? parseInt(passageWordCount, 10) : undefined,
          contentDomains: contentDomains.map((code) => {
            const d = currentDomains.find((d) => d.code === code);
            return d ? `${d.code} – ${d.description}` : code;
          }),
          questionTypes,
          numQuestions,
          complexity,
          includeAnswerKey,
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

  const canGenerate =
    curriculum &&
    (mixed || yearGroup) &&
    textSource &&
    (textSource === "own" ? ownText.trim() : topic.trim()) &&
    contentDomains.length > 0;

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
            />

            {/* Text Source */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Text source</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    // Toggle: clicking the active card again hides its fields.
                    const next = textSource === "generate" ? "" : "generate";
                    setTextSource(next);
                    if (next === "generate") setTimeout(() => topicInputRef.current?.focus(), 0);
                  }}
                  className={`border rounded-md p-4 flex flex-col items-center gap-2 text-sm font-medium cursor-pointer transition-colors ${
                    textSource === "generate"
                      ? "border-stone-700 bg-stone-50 text-stone-800"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Wand2 className="w-5 h-5" />
                  Generate for me
                </button>
                <button
                  type="button"
                  onClick={() => setTextSource((prev) => (prev === "own" ? "" : "own"))}
                  className={`border rounded-md p-4 flex flex-col items-center gap-2 text-sm font-medium cursor-pointer transition-colors ${
                    textSource === "own"
                      ? "border-stone-700 bg-stone-50 text-stone-800"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  }`}
                >
                  <Upload className="w-5 h-5" />
                  Use my own text
                </button>
              </div>
            </div>

            {textSource === "generate" && (
              <>
                <div className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-800">Topic or prompt</label>
                  <input
                    ref={topicInputRef}
                    type="text"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder='e.g. "The life cycle of a monarch butterfly"'
                    className={inputClass}
                  />
                </div>
                <WordCountField
                  value={passageWordCount}
                  onChange={setPassageWordCount}
                  label="Passage length (approx. words)"
                  min={100}
                  max={800}
                  step={50}
                  defaultValue={300}
                />
              </>
            )}

            {textSource === "own" && (
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Your text</label>
                <textarea
                  value={ownText}
                  onChange={(e) => setOwnText(e.target.value)}
                  placeholder="Paste your text here..."
                  rows={6}
                  className={`${inputClass} resize-none`}
                />
              </div>
            )}

            {/* Complexity */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-800">Complexity</label>
              <div className="flex gap-2">
                {COMPLEXITY_LEVELS.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setComplexity(level)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-colors ${
                      complexity === level
                        ? "bg-stone-700 text-white border border-stone-700"
                        : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Content Domain */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-800">
                Content domain
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {ks === "ks1" ? "KS1 (1a–1e)" : "KS2 (2a–2h)"}
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                {currentDomains.map(({ code, label }) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleDomain(code)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border cursor-pointer transition-colors ${
                      contentDomains.includes(code)
                        ? "bg-stone-700 text-white border-stone-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span className="font-semibold">{code}</span>
                    <span>{label}</span>
                    {contentDomains.includes(code) && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Question Types */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-800">
                Question types
                <span className="ml-2 text-xs font-normal text-gray-400">optional</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {QUESTION_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleQuestionType(type)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border cursor-pointer transition-colors ${
                      questionTypes.includes(type)
                        ? "bg-stone-700 text-white border-stone-700"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {type}
                    {questionTypes.includes(type) && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Questions per domain + Answer Key */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">Questions per domain</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setNumQuestions((p) => Math.max(1, p - 1))}
                    className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100 transition-colors text-lg cursor-pointer"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-sm font-medium text-gray-900 tabular-nums">{numQuestions}</span>
                  <button
                    type="button"
                    onClick={() => setNumQuestions((p) => p + 1)}
                    className="w-8 h-8 flex items-center justify-center border border-gray-300 rounded-md text-gray-600 hover:bg-gray-100 transition-colors text-lg cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label htmlFor="answer-key" className="text-sm font-semibold text-gray-800 cursor-pointer">
                  Include answer key
                </label>
                <input
                  id="answer-key"
                  type="checkbox"
                  checked={includeAnswerKey}
                  onChange={(e) => setIncludeAnswerKey(e.target.checked)}
                  className="rounded accent-gray-900 w-4 h-4 cursor-pointer"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setCurriculum(""); setYearGroup(""); setMixed(false);
                  setTextSource(""); setComplexity("Standard");
                  setContentDomains([]); setQuestionTypes([]);
                  setNumQuestions(5); setIncludeAnswerKey(true);
                  setTopic(""); setPassageWordCount("300"); setOwnText("");
                  setResult(null); setError(null); setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton onClick={handleGenerate} disabled={!canGenerate || isGenerating || unchangedSinceGeneration} isGenerating={isGenerating} hasResult={result !== null} />
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
        onChange={(md) => setResult(md)}
        exportFilename="comprehension-activity"
        historyMeta={{ toolSlug: TOOL_SLUG, title: topic || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
      />
    </div>
  );
}
