"use client";

import { useState, useId } from "react";
import { Plus, X } from "lucide-react";
import { NewsletterTitleField, SchoolNameField, NewsletterToneField } from "@/app/components/fields";
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
import { celebrated, newsletterRoster, type Celebration, type DiaryDate } from "@/app/lib/sheets/newsletter";
import { scrubRoster } from "@/app/lib/sheets/roster";

const TOOL_SLUG = "newsletter-writer";

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";
const sectionInputClass = `${inputClass} resize-none pr-8`;

const emptyCelebration = (): Celebration => ({ name: "", className: "", reason: "" });
const emptyDate = (): DiaryDate => ({ date: "", event: "" });

/*
 * A newsletter as a designed document (app/lib/sheets/newsletter.ts). The
 * model writes from the section notes. The celebrations and the dates for
 * the diary are tables built on the page and never sent; each celebrated
 * pupil's name is sent in the notes as "[PUPIL 1]" and so on, and put back on
 * the page.
 */
export default function NewsletterWriterForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` — reopen a saved run. */
  launch?: ToolLaunchParams;
}) {
  const fieldId = useId();
  const [newsletterTitle, setNewsletterTitle] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [tone, setTone] = useState("");
  const [date, setDate] = useState("");
  const [sections, setSections] = useState<string[]>([""]);
  const [celebrations, setCelebrations] = useState<Celebration[]>([emptyCelebration()]);
  const [diary, setDiary] = useState<DiaryDate[]>([emptyDate()]);

  const [result, setResult] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);

  // Raw form state — saved as history input so a past run can refill the form.
  const [language, setLanguage] = useGenerationLanguage();
  const formState = { ...languageFormState(language), newsletterTitle, schoolName, tone, date, sections, celebrations, diary };
  const formSnapshot = JSON.stringify(formState);
  const unchangedSinceGeneration = result !== null && lastGenerated === formSnapshot;
  const canGenerate = sections.some((s) => s.trim()) && tone;

  const restore = (run: ToolRun) => {
    // The run's own language: English (UK) for runs saved before languages existed.
    setLanguage(parseLanguage(run.input?.language));
    const i = run.input;
    setNewsletterTitle((i.newsletterTitle as string) ?? "");
    setSchoolName((i.schoolName as string) ?? "");
    setTone((i.tone as string) ?? "");
    setDate((i.date as string) ?? "");
    setSections(Array.isArray(i.sections) && i.sections.length ? (i.sections as string[]) : [""]);
    setCelebrations(Array.isArray(i.celebrations) && i.celebrations.length ? (i.celebrations as Celebration[]) : [emptyCelebration()]);
    setDiary(Array.isArray(i.diary) && i.diary.length ? (i.diary as DiaryDate[]) : [emptyDate()]);
    setResult(run.output);
    setRunId(run.id);
    setLastGenerated(JSON.stringify(i));
  };

  // `?run=` reopens a saved run from Dashboard, Folders or Analytics.
  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      newsletterTitle: (v) => setNewsletterTitle(v as string),
      schoolName: (v) => setSchoolName(v as string),
      tone: (v) => setTone(v as string),
      // A prefill carries scalars only, so the assistant sends the first
      // section on its own; the teacher adds the rest.
      firstSection: (v) => setSections([v as string]),
    },
  });

  const handleGenerate = async () => {
    setError(null);
    setResult("");
    setRunId(null);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    const info = { newsletter: { title: newsletterTitle, schoolName, date, celebrations, diary } };
    const roster = newsletterRoster(info.newsletter);
    try {
      const res = await fetch("/api/newsletter-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The notes with each celebrated pupil as [PUPIL n]; never the
        // celebrations or the dates themselves.
        body: JSON.stringify({
          language,
          newsletterTitle: scrubRoster(newsletterTitle, roster),
          schoolName,
          tone,
          sections: sections.map((s) => scrubRoster(s, roster)).filter((s) => s.trim()),
          celebrated: celebrated(info.newsletter).length,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }
      const finished = await readSheetStream(res, "newsletter", info, setResult);
      if (!finished) throw new Error("The newsletter came back empty. Please try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setResult(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const setCelebration = (i: number, patch: Partial<Celebration>) => setCelebrations((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setDiaryDate = (i: number, patch: Partial<DiaryDate>) => setDiary((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <NewsletterTitleField value={newsletterTitle} onChange={setNewsletterTitle} />
              <SchoolNameField value={schoolName} onChange={setSchoolName} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <NewsletterToneField value={tone} onChange={setTone} />
              <div className="space-y-1.5">
                <label htmlFor={`${fieldId}-date`} className="block text-sm font-semibold text-gray-800">Date <span className="font-normal text-gray-400">(optional)</span></label>
                <input id={`${fieldId}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </div>
            </div>

            <div className="space-y-3">
              <label htmlFor={`${fieldId}-s0`} className="block text-sm font-semibold text-gray-800">Sections</label>
              {sections.map((section, index) => (
                <div key={index} className="relative">
                  <textarea
                    id={`${fieldId}-s${index}`}
                    aria-label={index === 0 ? undefined : `Section ${index + 1}`}
                    value={section}
                    onChange={(e) => setSections((prev) => prev.map((s, i) => (i === index ? e.target.value : s)))}
                    placeholder={index === 0 ? "What the first section should say, e.g. Harvest festival: thank you for 212 food donations" : `What section ${index + 1} should say`}
                    rows={3}
                    className={sectionInputClass}
                  />
                  {sections.length > 1 && (
                    <button type="button" onClick={() => setSections((prev) => prev.filter((_, i) => i !== index))} className="absolute top-2 right-2 text-gray-400 hover:text-gray-600" aria-label={`Remove section ${index + 1}`}>
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setSections((prev) => [...prev, ""])} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 font-medium">
                <Plus className="w-4 h-4" />
                Add another section
              </button>
            </div>

            <fieldset className="space-y-3">
              <legend className="block text-sm font-semibold text-gray-800">Celebrations (optional)</legend>
              <p className="text-xs text-gray-500">
                Printed as a table on the newsletter and never sent. If you mention these pupils in a section, their names are sent as placeholders and put back on the page. Surnames and names that are not in this table are not caught, so leave them out of the sections.
              </p>
              {celebrations.map((c, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_2fr_auto] gap-2 items-center" data-testid="celebration-row">
                  <input aria-label={`Pupil ${i + 1} name`} type="text" value={c.name} onChange={(e) => setCelebration(i, { name: e.target.value })} placeholder="First name" className={inputClass} />
                  <input aria-label={`Pupil ${i + 1} class`} type="text" value={c.className} onChange={(e) => setCelebration(i, { className: e.target.value })} placeholder="Class" className={inputClass} />
                  <input aria-label={`Pupil ${i + 1} reason`} type="text" value={c.reason} onChange={(e) => setCelebration(i, { reason: e.target.value })} placeholder="Why, e.g. kindness to a new classmate" className={inputClass} />
                  <button type="button" onClick={() => setCelebrations((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : [emptyCelebration()]))} className="text-gray-400 hover:text-gray-600 justify-self-start" aria-label={`Remove pupil ${i + 1}`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setCelebrations((rows) => [...rows, emptyCelebration()])} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 font-medium">
                <Plus className="w-4 h-4" />
                Add a pupil
              </button>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="block text-sm font-semibold text-gray-800">Dates for the diary (optional)</legend>
              {diary.map((d, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[11rem_1fr_auto] gap-2 items-center">
                  <input aria-label={`Date ${i + 1}`} type="date" value={d.date} onChange={(e) => setDiaryDate(i, { date: e.target.value })} className={inputClass} />
                  <input aria-label={`Event ${i + 1}`} type="text" value={d.event} onChange={(e) => setDiaryDate(i, { event: e.target.value })} placeholder="e.g. Year 2 nativity, 2pm" className={inputClass} />
                  <button type="button" onClick={() => setDiary((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : [emptyDate()]))} className="text-gray-400 hover:text-gray-600 justify-self-start" aria-label={`Remove date ${i + 1}`}>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setDiary((rows) => [...rows, emptyDate()])} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 font-medium">
                <Plus className="w-4 h-4" />
                Add a date
              </button>
            </fieldset>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!result} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setNewsletterTitle(""); setSchoolName(""); setTone(""); setDate("");
                  setSections([""]); setCelebrations([emptyCelebration()]); setDiary([emptyDate()]);
                  setRunId(null); setResult(null); setError(null); setConfirmingReset(false);
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

      <ToolResults
        result={result}
        isGenerating={isGenerating}
        onChange={(md) => setResult(md)}
        exportFilename={`newsletter-${newsletterTitle.toLowerCase().replace(/\s+/g, "-") || "export"}`}
        historyMeta={{ toolSlug: TOOL_SLUG, title: newsletterTitle || schoolName || null, input: formState }}
        onSaved={() => setHistoryKey((k) => k + 1)}
        runId={runId}
      />
    </div>
  );
}
