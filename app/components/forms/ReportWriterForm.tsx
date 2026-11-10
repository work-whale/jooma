"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import ToolResults from "@/app/components/ToolResults";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";
import ToolHistoryPanel from "@/app/components/ToolHistoryPanel";
import { saveToolRun, updateToolRunOutput, type ToolRun } from "@/app/lib/toolRuns";
import PrefilledBadge from "@/app/components/assistant/PrefilledBadge";
import { useToolLaunch, type ToolLaunchParams } from "@/app/lib/useToolLaunch";
import LanguageField, { useGenerationLanguage } from "@/app/components/LanguageField";
import { languageFormState, parseLanguage } from "@/app/lib/languages";
import { YEAR_GROUPS } from "@/app/lib/formOptions";
import { parsePartialJson } from "@/app/lib/sheets/stream";
import ReportGrid from "@/app/components/reports/ReportGrid";
import ReportCards from "@/app/components/reports/ReportCards";
import {
  activeSubjects,
  applyAnswer,
  chunk,
  defaultSettings,
  LENGTH_WORDS,
  makeReports,
  newPupil,
  parseReports,
  phaseFor,
  PRIMARY_SUBJECTS,
  runLimited,
  SCALES,
  serializeReports,
  type PupilRow,
  type ReportLength,
  type ReportSettings,
  type ReportTone,
  type ScaleId,
} from "@/app/lib/reports/reports";
import { scrubForModel } from "@/app/lib/reports/privacy";
import { legacyReportSeed } from "@/app/lib/reports/legacy";

const TOOL_SLUG = "report-writer";

const inputClass =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent bg-white";

const TONES: { id: ReportTone; label: string }[] = [
  { id: "warm", label: "Warm" },
  { id: "formal", label: "Formal" },
  { id: "encouraging", label: "Encouraging" },
  { id: "concise", label: "Concise" },
];

const LENGTHS: { id: ReportLength; label: string }[] = [
  { id: "short", label: "Short" },
  { id: "standard", label: "Standard" },
  { id: "long", label: "Long" },
];

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  name,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="block text-sm font-semibold text-gray-800 mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.id}
            className={`cursor-pointer text-sm px-3 py-1.5 rounded-lg border ${value === o.id ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
          >
            <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ReportWriterForm({
  sidebar,
  launch,
}: {
  sidebar: React.ReactNode;
  /** `?run=` reopens a saved run. */
  launch?: ToolLaunchParams;
}) {
  const [settings, setSettings] = useState<ReportSettings>(() => defaultSettings(""));
  const [pupils, setPupils] = useState<PupilRow[]>(() => [newPupil()]);
  const [customSubject, setCustomSubject] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const [runId, setRunId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedRef = useRef<string | null>(null);
  /** A single pupil report saved before the class grid: shown as it was. */
  const [legacy, setLegacy] = useState<{ id: string; output: string } | null>(null);

  const [language, setLanguage] = useGenerationLanguage();
  const subjects = activeSubjects(settings);
  const named = pupils.filter((p) => p.name.trim());
  const written = pupils.some((p) => p.comment || p.status !== "pending");
  const writing = pupils.some((p) => p.status === "writing");
  const canGenerate = Boolean(settings.yearGroup) && subjects.length > 0 && named.length > 0;
  const formState = { ...languageFormState(language), settings };

  const serialized = useMemo(() => serializeReports(makeReports(settings, pupils)), [settings, pupils]);

  // Autosave edits and rewrites into the one run, 800 ms after the last
  // change. Never mid-way through a generation: that saves when it ends.
  useEffect(() => {
    if (!runId || isGenerating || writing || serialized === savedRef.current) return;
    setSaveState("saving");
    const t = setTimeout(() => {
      updateToolRunOutput(runId, serialized)
        .then(() => {
          savedRef.current = serialized;
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 800);
    return () => clearTimeout(t);
  }, [runId, serialized, isGenerating, writing]);

  const setYearGroup = (yearGroup: string) => {
    setSettings((s) =>
      phaseFor(yearGroup) === s.phase
        ? { ...s, yearGroup }
        : {
            ...defaultSettings(yearGroup),
            length: s.length,
            tone: s.tone,
            nextSteps: s.nextSteps,
          },
    );
  };

  const setScale = (scale: ScaleId) => {
    setSettings((s) => ({ ...s, scale }));
    // A judgement on the old scale means nothing on the new one.
    setPupils((ps) => ps.map((p) => ({ ...p, attainment: {} })));
  };

  const toggleSubject = (subject: string) =>
    setSettings((s) => ({
      ...s,
      subjects: s.subjects.includes(subject) ? s.subjects.filter((x) => x !== subject) : [...s.subjects.filter(Boolean), subject],
    }));

  const restore = (run: ToolRun) => {
    setLanguage(parseLanguage(run.input?.language));
    setError(null);
    const doc = parseReports(run.output);
    if (doc) {
      setLegacy(null);
      setSettings(doc.settings);
      setPupils(doc.pupils.map((p) => (p.status === "writing" ? { ...p, status: p.comment ? "done" : "error" } : p)));
      savedRef.current = run.output;
      setRunId(run.id);
      setSaveState("idle");
      return;
    }
    // Saved before the grid: one pupil's markdown report. It opens as it was,
    // and the grid is seeded with that pupil so a new class can start from it.
    const seed = legacyReportSeed(run.input ?? {});
    setSettings(seed.settings);
    setPupils([seed.pupil]);
    setRunId(null);
    savedRef.current = null;
    setLegacy({ id: run.id, output: run.output });
  };

  const { prefilled } = useToolLaunch({
    params: launch,
    onRestore: restore,
    prefill: {
      yearGroup: (v) => setYearGroup(v as string),
      subject: (v) => {
        const s = String(v ?? "").trim();
        if (!s) return;
        setSettings((prev) => ({
          ...prev,
          subjects: prev.phase === "secondary" ? [s] : Array.from(new Set([...prev.subjects.filter(Boolean), s])),
        }));
      },
      tone: (v) => {
        if (TONES.some((t) => t.id === v)) setSettings((s) => ({ ...s, tone: v as ReportTone }));
      },
      length: (v) => {
        if (v === "short" || v === "standard" || v === "long") setSettings((s) => ({ ...s, length: v }));
      },
    },
  });

  /** One request: writes `group`, streaming each report into its card. */
  const writeGroup = async (group: PupilRow[], roster: string[], chunkIndex: number, redo = false) => {
    const refs = group.map((p) => p.id);
    try {
      const res = await fetch("/api/report-writer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          yearGroup: settings.yearGroup,
          subjects,
          scale: settings.scale,
          length: settings.length,
          tone: settings.tone,
          nextSteps: settings.nextSteps,
          pupils: scrubForModel(group, roster),
          chunkIndex,
          ...(redo ? { redo: true } : {}),
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        const partial = parsePartialJson(text);
        if (partial) setPupils((ps) => applyAnswer(ps, refs, partial));
      }
      const final = parsePartialJson(text);
      setPupils((ps) => {
        const next = applyAnswer(ps, refs, final);
        return next.map((p) => (refs.includes(p.id) ? { ...p, status: p.comment.trim() ? "done" : "error" } : p));
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPupils((ps) => ps.map((p) => (refs.includes(p.id) ? { ...p, status: "error" } : p)));
    }
  };

  /**
   * Writes `targets` five at a time, two requests at once. A fresh class is a
   * new run; adding the pupils still missing keeps the run, and those
   * requests are part of it rather than a new generation.
   */
  const handleGenerate = async (targets: PupilRow[], keepRun: boolean) => {
    if (!targets.length) return;
    setError(null);
    setLegacy(null);
    setIsGenerating(true);
    const ids = new Set(targets.map((p) => p.id));
    const roster = named.map((p) => p.name);
    setPupils((ps) => ps.filter((p) => p.name.trim()).map((p) => (ids.has(p.id) ? { ...p, comment: "", target: "", status: "writing" } : p)));
    const groups = chunk(targets);
    await runLimited(
      groups.map((g, i) => () => writeGroup(g, roster, keepRun ? i + 1 : i)),
      2,
    );
    setIsGenerating(false);
    // A fresh class is saved once, when it is written (the effect below);
    // edits and the pupils still to do then update that run in place.
    if (!keepRun || !runId) {
      setRunId(null);
      setFirstSave(true);
    }
  };

  const [firstSave, setFirstSave] = useState(false);
  const savingFirst = useRef(false);
  useEffect(() => {
    if (!firstSave || isGenerating || writing || savingFirst.current) return;
    setFirstSave(false);
    if (!pupils.some((p) => p.comment)) return;
    savingFirst.current = true;
    saveToolRun({
      toolSlug: TOOL_SLUG,
      title: `${settings.yearGroup} reports`,
      input: formState,
      output: serialized,
    })
      .then((run) => {
        savedRef.current = serialized;
        setRunId(run.id);
        setSaveState("saved");
        setHistoryKey((k) => k + 1);
      })
      .catch(() => setSaveState("error"))
      .finally(() => {
        savingFirst.current = false;
      });
    // formState is derived from settings and language, both in `serialized`'s
    // inputs or stable for the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstSave, isGenerating, writing, serialized]);

  const rewrite = async (id: string) => {
    const p = pupils.find((x) => x.id === id);
    if (!p) return;
    setError(null);
    setPupils((ps) => ps.map((x) => (x.id === id ? { ...x, comment: "", target: "", status: "writing" } : x)));
    await writeGroup(
      [p],
      named.map((x) => x.name),
      0,
      true,
    );
  };

  const missing = written ? named.filter((p) => !p.comment && p.status !== "writing") : [];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
        <div className="lg:col-span-1">
          {sidebar}
          <ToolHistoryPanel toolSlug={TOOL_SLUG} reloadSignal={historyKey} onRestore={restore} />
        </div>

        <div className="lg:col-span-2 space-y-4">
          <Card className="space-y-6">
            {prefilled && <PrefilledBadge />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label htmlFor="report-year" className="block text-sm font-semibold text-gray-800">
                  Year group
                </label>
                <select id="report-year" value={settings.yearGroup} onChange={(e) => setYearGroup(e.target.value)} disabled={isGenerating} className={inputClass}>
                  <option value="">Choose a year group</option>
                  {YEAR_GROUPS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <LanguageField value={language} onChange={setLanguage} />
            </div>

            {settings.yearGroup && settings.phase === "primary" && (
              <fieldset className="space-y-2">
                <legend className="block text-sm font-semibold text-gray-800 mb-1.5">Subjects to report on</legend>
                <div className="flex flex-wrap gap-2">
                  {Array.from(new Set([...PRIMARY_SUBJECTS, ...settings.subjects.filter(Boolean)])).map((s) => (
                    <label
                      key={s}
                      className={`cursor-pointer text-sm px-3 py-1.5 rounded-lg border ${settings.subjects.includes(s) ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                    >
                      <input type="checkbox" checked={settings.subjects.includes(s)} onChange={() => toggleSubject(s)} className="sr-only" />
                      {s}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="Another subject"
                    aria-label="Another subject"
                    className={`${inputClass} py-2`}
                  />
                  <button
                    type="button"
                    disabled={!customSubject.trim()}
                    onClick={() => {
                      toggleSubject(customSubject.trim());
                      setCustomSubject("");
                    }}
                    className="text-sm font-semibold px-3 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </fieldset>
            )}

            {settings.yearGroup && settings.phase === "secondary" && (
              <div className="space-y-1.5">
                <label htmlFor="report-subject" className="block text-sm font-semibold text-gray-800">
                  Subject
                </label>
                <input
                  id="report-subject"
                  value={settings.subjects[0] ?? ""}
                  onChange={(e) => setSettings((s) => ({ ...s, subjects: [e.target.value] }))}
                  placeholder="e.g. Geography"
                  className={inputClass}
                />
              </div>
            )}

            {settings.yearGroup && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label htmlFor="report-scale" className="block text-sm font-semibold text-gray-800">
                    Attainment scale
                  </label>
                  <select id="report-scale" value={settings.scale} onChange={(e) => setScale(e.target.value as ScaleId)} className={inputClass}>
                    {(settings.phase === "primary" ? (["primary", "target"] as ScaleId[]) : (["gcse", "target"] as ScaleId[])).map((id) => (
                      <option key={id} value={id}>
                        {SCALES[id].label}
                      </option>
                    ))}
                  </select>
                </div>
                <Choice
                  name="report-length"
                  label="Length"
                  value={settings.length}
                  options={LENGTHS.map((l) => ({
                    ...l,
                    label: `${l.label} (about ${LENGTH_WORDS[l.id]} words)`,
                  }))}
                  onChange={(length) => setSettings((s) => ({ ...s, length }))}
                />
                <Choice name="report-tone" label="Tone" value={settings.tone} options={TONES} onChange={(tone) => setSettings((s) => ({ ...s, tone }))} />
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 self-end cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.nextSteps}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        nextSteps: e.target.checked,
                      }))
                    }
                    className="w-4 h-4"
                  />
                  Include a next step for each pupil
                </label>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* The class gets the page's full width: a row per pupil with a column
          per subject does not fit beside the sidebar. */}
      <div className="space-y-4">
        {settings.yearGroup && (
          <Card className="space-y-4">
            <p className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3" data-testid="report-privacy">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-green-700" />
              <span>
                Names stay in your browser. Each pupil is sent as a number, and any first name from this class in a note is taken out before anything is sent. Use first names only,
                and do not type surnames, siblings or other details that identify a child.
              </span>
            </p>
            <ReportGrid settings={settings} pupils={pupils} onChange={setPupils} disabled={isGenerating} />
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          <ResetButton onClick={() => setConfirmingReset(true)} disabled={!written && !legacy} />
          <ConfirmModal
            open={confirmingReset}
            title="Start a new class?"
            message="This clears the class and its reports from the page. Saved reports stay in your history."
            confirmLabel="Yes, start again"
            onConfirm={() => {
              setSettings(defaultSettings(""));
              setPupils([newPupil()]);
              setRunId(null);
              savedRef.current = null;
              setLegacy(null);
              setError(null);
              setSaveState("idle");
              setConfirmingReset(false);
            }}
            onCancel={() => setConfirmingReset(false)}
          />
          <GenerateButton onClick={() => handleGenerate(named, false)} disabled={!canGenerate || isGenerating || writing} isGenerating={isGenerating} hasResult={written} />
          {missing.length > 0 && runId && !isGenerating && (
            <button
              type="button"
              onClick={() => handleGenerate(missing, true)}
              className="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer"
            >
              Write the {missing.length} still to do
            </button>
          )}
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">{error}</div>}

      {written && (
        <ReportCards
          doc={makeReports(settings, pupils)}
          busy={isGenerating || writing}
          saveState={runId ? (saveState === "saving" ? "Saving" : saveState === "saved" ? "Saved" : saveState === "error" ? "Not saved" : null) : null}
          onEdit={(id, patch) => setPupils((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)))}
          onRewrite={rewrite}
        />
      )}

      {legacy && (
        <ToolResults
          result={legacy.output}
          isGenerating={false}
          onChange={(md) => setLegacy((l) => (l ? { ...l, output: md } : l))}
          exportFilename="report"
          historyMeta={{ toolSlug: TOOL_SLUG, title: null, input: formState }}
          onSaved={() => setHistoryKey((k) => k + 1)}
          runId={legacy.id}
        />
      )}
    </div>
  );
}
