"use client";

import { useState, useRef, useEffect } from "react";
import CurriculumYearFields, { useCurriculumYear } from "@/app/components/CurriculumYearFields";
import { WordCountField, DifferentiationField } from "@/app/components/fields";
import { orderedBands, restoreDifferentiation, type Differentiate } from "@/app/lib/differentiation";
import { runBands } from "@/app/lib/runBands";
import { Wand2, Upload, Check } from "lucide-react";
import ToolResults from "@/app/components/ToolResults";
import ConfirmModal from "@/app/components/ConfirmModal";
import Card from "@/app/components/ui/Card";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import type { ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import { defaultDomainCodes, domainsFor, keyStageFor } from "@/app/lib/comprehension-domains";
import { readSheetStream } from "@/app/lib/sheets/client-stream";

/**
 * How the form runs on /create for a signed out visitor. Same fields, same
 * request; it posts to the guest route and hands the result to the page
 * instead of saving it to a library the visitor does not have yet.
 */
export interface ComprehensionGuestMode {
  endpoint: string;
  /** Merged into the request body. Carries the honeypot. */
  extraBody?: () => Record<string, unknown>;
  /** A refusal (429 limit, 403 paused). The page shows the sign up modal. */
  onRefused: (status: number, data: { error?: string; reason?: string }) => void;
  /** The trial row id the guest route returned in its header. */
  onStarted?: (trialId: string | null) => void;
  /** Every change to the form, so Ask Jo knows what it currently says. */
  onSnapshot?: (state: Record<string, unknown>) => void;
  /** Rendered where the signed in form shows ToolResults. */
  renderResult: (r: {
    result: string | null;
    isGenerating: boolean;
    input: Record<string, unknown>;
  }) => React.ReactNode;
}

const TOOL_SLUG = "comprehension-generator";

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

export default function ComprehensionForm({
  sidebar,
  launch,
  guest,
}: {
  sidebar: React.ReactNode;
  launch?: ToolLaunchParams;
  guest?: ComprehensionGuestMode;
}) {
  const { curriculum, setCurriculum, yearGroup, setYearGroup } = useCurriculumYear();
  const [mixed, setMixed] = useState(false);
  const [textSource, setTextSource] = useState<"generate" | "own" | "">("");
  const [complexity, setComplexity] = useState<Complexity>("Standard");
  const [contentDomains, setContentDomains] = useState<string[]>([]);
  const [questionTypes, setQuestionTypes] = useState<string[]>([]);
  const [numQuestions, setNumQuestions] = useState(5);
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [differentiate, setDifferentiate] = useState<Differentiate>("no");
  const [differentiationLevels, setDifferentiationLevels] = useState<string[]>([]);
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
  // The history run on screen, so edits to its sheet save back into it.
  const [runId, setRunId] = useState<string | null>(null);

  const ks = keyStageFor(yearGroup, mixed);
  const currentDomains = domainsFor(ks);

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

  const formState = { curriculum, yearGroup, mixed, textSource, topic, ownText, passageWordCount, complexity, contentDomains, questionTypes, numQuestions, includeAnswerKey, differentiate, differentiationLevels };
  const formSnapshot = JSON.stringify(formState);

  // Tell the guest page what the form says, for Ask Jo. A callback into a ref
  // on the page, so it causes no render here or there.
  const onSnapshot = guest?.onSnapshot;
  useEffect(() => {
    onSnapshot?.(JSON.parse(formSnapshot) as Record<string, unknown>);
  }, [formSnapshot, onSnapshot]);
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
    const d = restoreDifferentiation(i);
    setDifferentiate(d.differentiate);
    setDifferentiationLevels(d.levels);
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      curriculum: (v) => setCurriculum(v as string),
      yearGroup: (v) => setYearGroup(v as string),
      // Setting the topic without this leaves the form in a state it can never
      // reach by hand: a topic filled in while no text source is chosen, so the
      // passage fields stay hidden and Generate stays disabled. The assistant
      // only ever prefills a topic, which always means "generate the passage".
      topic: (v) => {
        setTopic(v as string);
        setTextSource("generate");
      },
      numQuestions: (v) => setNumQuestions(v as number),
      // Snapped to the control's 50 word steps, within its 100 to 800 range.
      passageWordCount: (v) =>
        setPassageWordCount(String(Math.min(800, Math.max(100, Math.round(Number(v) / 50) * 50)))),
      complexity: (v) => setComplexity(v as Complexity),
      differentiate: (v) => setDifferentiate(v as Differentiate),
      differentiationLevels: (v) => setDifferentiationLevels(v as string[]),
    },
  });

  // A form Jo filled starts with every domain for its key stage selected. Runs
  // after the key stage reset above (effects run in order), and once per key
  // stage, so a teacher who unticks them all is not overruled. See
  // defaultDomainCodes for why this is needed at all.
  const autoDomainsFor = useRef<string | null>(null);
  useEffect(() => {
    if (!prefilled) return;
    if (!yearGroup && !mixed) return;
    if (autoDomainsFor.current === ks) return;
    autoDomainsFor.current = ks;
    if (contentDomains.length === 0) setContentDomains(defaultDomainCodes(yearGroup, mixed));
  }, [prefilled, ks, yearGroup, mixed, contentDomains.length]);

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = { yearGroup: mixed ? "Mixed" : yearGroup, includeAnswerKey, textSource, ownText: textSource === "own" ? ownText : undefined };
    const send = (extra: Record<string, unknown> = {}) =>
      fetch(guest?.endpoint ?? "/api/comprehension-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The guest route keeps the raw form so a claimed run restores into
          // this form exactly as the visitor left it.
          ...(guest ? { ...(guest.extraBody?.() ?? {}), formState } : {}),
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
          differentiate,
          differentiationLevels,
          ...extra,
        }),
      });
    try {
      // Differentiated: one whole comprehension per band, each in its own tab.
      // Signed in only: on /create each band would spend one of a guest's
      // daily tries, so a guest keeps the single sheet with its blended note.
      if (!guest && differentiate === "yes") {
        await runBands({
          bands: orderedBands(differentiationLevels),
          start: (band, bandIndex) => send({ band, bandIndex }),
          read: (res, onOutput) => readSheetStream(res, "comprehension", info, onOutput),
          onUpdate: setResult,
        });
        return;
      }
      const res = await send();
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
        if (guest && (res.status === 429 || res.status === 403)) {
          guest.onRefused(res.status, data);
          setResult(null);
          setLastGenerated(null);
          return;
        }
        throw new Error(data.error || "Generation failed");
      }
      guest?.onStarted?.(res.headers.get("x-trial-id"));
      // The route streams the sheet as JSON; each update arrives here as a
      // whole, valid sheet. The teacher's own text is placed back in here,
      // exactly as they wrote it: it is never sent back through the model.
      const finished = await readSheetStream(res, "comprehension", info, setResult);
      if (!finished) throw new Error("The comprehension came back empty. Please try again.");
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
    contentDomains.length > 0 &&
    (differentiate === "no" || differentiationLevels.length > 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
        {/* A guest with no sidebar has nothing for the side column, so the
            form takes the full width rather than leaving a blank third. */}
        {(sidebar || !guest) && (
          <div className="lg:col-span-1">
            {sidebar}
            {!guest && (
              <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
            )}
          </div>
        )}

        <div className={sidebar || !guest ? "lg:col-span-2" : "lg:col-span-3"}>
          <Card className="space-y-6">
            {prefilled && <PrefilledBadge />}

            <CurriculumYearFields
              curriculum={curriculum} onCurriculumChange={setCurriculum}
              yearGroup={yearGroup} onYearGroupChange={setYearGroup}
              mixed={mixed} onMixedChange={setMixed}
            />

            {/* Text Source */}
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Text source</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            <DifferentiationField
              value={differentiate}
              onChange={setDifferentiate}
              levels={differentiationLevels}
              onLevelsChange={setDifferentiationLevels}
            />

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
                  setDifferentiate("no"); setDifferentiationLevels([]);
                  setTopic(""); setPassageWordCount("300"); setOwnText("");
                  setResult(null); setRunId(null); setError(null); setConfirmingReset(false);
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

      {guest ? (
        guest.renderResult({ result, isGenerating, input: formState })
      ) : (
        <ToolResults
          result={result}
          isGenerating={isGenerating}
          onChange={(md) => setResult(md)}
          exportFilename="comprehension-activity"
          historyMeta={{ toolSlug: TOOL_SLUG, title: topic || null, input: formState }}
          onSaved={() => setHistoryKey((k) => k + 1)}
          runId={runId}
        />
      )}
    </div>
  );
}
