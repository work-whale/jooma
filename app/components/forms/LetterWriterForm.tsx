"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { LetterRecipientField, LetterDateField, LetterToneField } from "@/app/components/fields";
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
import { aboutOneChild, factsForModel, isLetterType, LETTER_FIELDS, LETTER_TYPES, letterTone, type LetterFacts, type LetterInfo, type LetterType } from "@/app/lib/sheets/letter";

const TOOL_SLUG = "letter-writer";
/** The sender's name, role and school, kept on this device so they are typed
 *  once. Never sent to the model: they are printed by the page. */
const SENDER_KEY = "jooma-letter-sender";

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const PLACEHOLDERS: Record<string, string> = {
  group: "e.g. Year 5",
  destination: "e.g. the Natural History Museum",
  cost: "e.g. £12",
  payment: "e.g. ParentPay",
  kit: "e.g. a waterproof coat and comfortable shoes",
  lunch: "e.g. a packed lunch, or a school packed lunch if your child has free school meals",
  purpose: "e.g. to see the fossils as part of our Rocks and Soils topic",
  period: "e.g. this autumn term",
  attendance: "e.g. 88%",
  concern: "e.g. eight days missed, mostly Mondays",
  support: "e.g. a meeting with our attendance lead and a morning check-in",
  meeting: "e.g. Thursday 21 November at 3.30pm with Mrs Patel",
  account: "Only what happened, in your own words. Do not name other children.",
  action: "e.g. a reflection conversation at lunchtime",
  content: "The key information the letter must include",
};

const today = () => new Date().toISOString().slice(0, 10);

function readSender(): { senderName: string; senderRole: string; school: string } {
  try {
    const v = JSON.parse(localStorage.getItem(SENDER_KEY) ?? "{}") as Record<string, unknown>;
    const s = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : "");
    return { senderName: s("senderName"), senderRole: s("senderRole"), school: s("school") };
  } catch {
    return { senderName: "", senderRole: "", school: "" };
  }
}

export default function LetterWriterForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  launch?: ToolLaunchParams;
}) {
  const [type, setType] = useState<LetterType>("general");
  const [recipient, setRecipient] = useState("Parents and carers");
  const [recipientName, setRecipientName] = useState("");
  const [pupil, setPupil] = useState("");
  const [date, setDate] = useState(today);
  const [tone, setTone] = useState("Semi-formal");
  const [facts, setFacts] = useState<LetterFacts>({});
  const [senderName, setSenderName] = useState("");
  const [senderRole, setSenderRole] = useState("");
  const [school, setSchool] = useState("");

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  // The sender, from this device, once on load.
  useEffect(() => {
    const s = readSender();
    if (s.senderName) setSenderName(s.senderName);
    if (s.senderRole) setSenderRole(s.senderRole);
    if (s.school) setSchool(s.school);
  }, []);

  const oneChild = aboutOneChild(type);
  const set = (key: string, value: string) => setFacts((f) => ({ ...f, [key]: value }));
  const has = (key: string) => !!facts[key]?.trim();
  const required: Record<LetterType, boolean> = {
    trip: has("destination") && has("tripDate"),
    attendance: !!pupil.trim() && (has("attendance") || has("concern")),
    behaviour: !!pupil.trim() && has("account"),
    general: has("content"),
  };
  const canGenerate = required[type] && (oneChild || !!recipient.trim());

  const [language, setLanguage] = useGenerationLanguage();
  // Only this type's facts are kept, so a run reopens as the letter it was.
  const ownFacts = Object.fromEntries(LETTER_FIELDS[type].map((f) => [f.key, facts[f.key] ?? ""]).filter(([, v]) => v));
  const formState = { ...languageFormState(language), type, recipient, recipientName, pupil: oneChild ? pupil : "", date, tone, facts: ownFacts, senderName, senderRole, school };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;

  const restore = (run: ToolRun) => {
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input ?? {};
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    // A letter saved before the types existed was free text: it comes back as
    // a general letter with its notes.
    setType(isLetterType(i.type) ? i.type : "general");
    setRecipient(str(i.recipient) || "Parents and carers");
    setRecipientName(str(i.recipientName));
    setPupil(str(i.pupil));
    setDate(str(i.date) || today());
    setTone(letterTone(i.tone));
    setFacts(i.facts && typeof i.facts === "object" ? (i.facts as LetterFacts) : str(i.content) ? { content: str(i.content) } : {});
    if (str(i.senderName)) setSenderName(str(i.senderName));
    if (str(i.senderRole)) setSenderRole(str(i.senderRole));
    if (str(i.school)) setSchool(str(i.school));
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `date` is not prefillable: today is right for nearly every letter, and a
  // date inferred from a sentence is a good way to send one dated wrongly.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      recipient: (v) => setRecipient(v as string),
      content: (v) => {
        setType("general");
        set("content", v as string);
        // A trip letter (letterType comes after this) says why in "purpose".
        set("purpose", v as string);
      },
      tone: (v) => setTone(letterTone(v)),
      letterType: (v) => {
        if (v === "trip" || v === "general") setType(v);
      },
      group: (v) => set("group", v as string),
      destination: (v) => set("destination", v as string),
      tripDate: (v) => set("tripDate", /^\d{4}-\d{2}-\d{2}$/.test(v as string) ? (v as string) : ""),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      localStorage.setItem(SENDER_KEY, JSON.stringify({ senderName, senderRole, school }));
    } catch {
      // A private window: the sender is typed again next time.
    }
    const info: LetterInfo = { type, date, recipient, recipientName, tone: letterTone(tone), senderName, senderRole, school, pupil: oneChild ? pupil : "", facts: ownFacts };
    try {
      const res = await fetch("/api/letter-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // No names: not the child's, the recipient's or the sender's.
        body: JSON.stringify({ language, type, recipient: oneChild ? "" : recipient, tone, date, facts: factsForModel(type, ownFacts, oneChild ? pupil : "") }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "letter", { letter: info }, setResult);
      if (!finished) throw new Error("The letter came back empty. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const field = (key: string, label: string, kind?: "date" | "time" | "long") => {
    const id = `letter-${key}`;
    return (
      <div key={key} className={`space-y-1.5 ${kind === "long" ? "sm:col-span-2" : ""}`}>
        <label htmlFor={id} className="block text-sm font-semibold text-gray-800">{label}</label>
        {kind === "long" ? (
          <textarea id={id} value={facts[key] ?? ""} onChange={(e) => set(key, e.target.value)} rows={key === "content" ? 6 : 3} placeholder={PLACEHOLDERS[key]} className={`${inputClass} resize-y`} />
        ) : (
          <input id={id} type={kind ?? "text"} value={facts[key] ?? ""} onChange={(e) => set(key, e.target.value)} placeholder={PLACEHOLDERS[key]} className={inputClass} />
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
        <div className="lg:col-span-1">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
        </div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">
            {prefilled && <PrefilledBadge />}

            <fieldset className="space-y-2">
              <legend className="block text-sm font-semibold text-gray-800 mb-1.5">What kind of letter?</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="letter-type">
                {LETTER_TYPES.map((t) => (
                  <label key={t.id} className={`cursor-pointer rounded-xl border px-3 py-2.5 ${type === t.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 text-gray-800 hover:bg-gray-50"}`}>
                    <input type="radio" name="letter-type" value={t.id} checked={type === t.id} onChange={() => setType(t.id)} className="sr-only" />
                    <span className="block text-sm font-semibold">{t.label}</span>
                    <span className={`block text-xs ${type === t.id ? "text-gray-300" : "text-gray-500"}`}>{t.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            {oneChild ? (
              <>
                <p className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3" data-testid="letter-privacy">
                  <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-green-700" />
                  <span>The child&apos;s name stays in your browser: the letter is written with a placeholder and the name is put back on your page. Do not name other children.</span>
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label htmlFor="letter-pupil" className="block text-sm font-semibold text-gray-800">Child&apos;s first name</label>
                    <input id="letter-pupil" value={pupil} onChange={(e) => setPupil(e.target.value)} className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="letter-recipient-name" className="block text-sm font-semibold text-gray-800">Parent or carer&apos;s name (optional)</label>
                    <input id="letter-recipient-name" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="e.g. Mrs Khan. Blank: Dear Parent/Carer" className={inputClass} />
                  </div>
                </div>
              </>
            ) : (
              <LetterRecipientField value={recipient} onChange={setRecipient} />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{LETTER_FIELDS[type].map((f) => field(f.key, f.label, f.kind))}</div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <LetterDateField value={date} onChange={setDate} />
              <LetterToneField value={tone} onChange={setTone} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="letter-sender" className="block text-sm font-semibold text-gray-800">Your name</label>
                <input id="letter-sender" value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="e.g. Mrs J Patel" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="letter-role" className="block text-sm font-semibold text-gray-800">Your role</label>
                <input id="letter-role" value={senderRole} onChange={(e) => setSenderRole(e.target.value)} placeholder="e.g. Year 5 teacher" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="letter-school" className="block text-sm font-semibold text-gray-800">School name</label>
                <input id="letter-school" value={school} onChange={(e) => setSchool(e.target.value)} className={inputClass} />
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
                  setType("general");
                  setRecipient("Parents and carers");
                  setRecipientName("");
                  setPupil("");
                  setDate(today());
                  setTone("Semi-formal");
                  setFacts({});
                  setResult(null);
                  setRunId(null);
                  setError(null);
                  setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton onClick={handleGenerate} disabled={!canGenerate || isGenerating || unchangedSinceGeneration} isGenerating={isGenerating} hasResult={result !== null} />
            </div>
          </Card>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">{error}</div>}

      <ToolResults
        result={result}
        isGenerating={isGenerating}
        onChange={(md) => setResult(md)}
        exportFilename={`letter-${(facts.destination || recipient).slice(0, 30).replace(/\s+/g, "-") || "draft"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: facts.destination?.trim() || (oneChild ? `${LETTER_TYPES.find((t) => t.id === type)!.label} letter` : recipient) || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
