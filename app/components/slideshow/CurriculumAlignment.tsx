"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, HelpCircle, Loader2, Search, X } from "lucide-react";
import { COUNTRIES } from "@/app/lib/curriculum";
import {
  CURRICULUM_YEARS,
  STAGE_LABEL,
  curriculumNameFor,
  isCurriculumYear,
  loadStatements,
  stageForYear,
  statementsIn,
  strandsIn,
  subjectsIn,
  type CurriculumYear,
  type NcStatement,
} from "@/app/lib/national-curriculum";

/**
 * "Align to curriculum" on the slideshow wizard's second step.
 *
 * Replaces a picker that offered GCSE strands for every year and no
 * statements at all. This one lists the real statements for the year (see
 * app/lib/national-curriculum), lets the teacher tick the ones the deck should
 * teach, and pre-ticks the best matches for the topic, the way Chalkie does.
 * The ticked statements go to the deck prompt verbatim.
 *
 * Covers Nursery to Year 6. Any later year shows a short note instead of the
 * dropdowns: an empty or wrong list would be worse than an honest "not yet".
 */

export interface CurriculumSelection {
  /** "" follows the year chosen on step one. */
  year: string;
  subject: string;
  /** "" is every strand of the subject. */
  strand: string;
  statementIds: string[];
}

export const EMPTY_SELECTION: CurriculumSelection = { year: "", subject: "", strand: "", statementIds: [] };

interface Props {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  topic: string;
  /** The year from step one. */
  stepYear: string;
  value: CurriculumSelection;
  /** The selection, and the ticked statements in full so the wizard can send
   *  their text without loading the data itself. */
  onChange: (next: CurriculumSelection, selected: NcStatement[]) => void;
  disabled?: boolean;
}

const selectCls =
  "w-full appearance-none pl-2.5 pr-7 py-2 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60 truncate";

export default function CurriculumAlignment({
  checked,
  onCheckedChange,
  topic,
  stepYear,
  value,
  onChange,
  disabled,
}: Props) {
  const year = value.year || stepYear;
  const covered = isCurriculumYear(year);
  const stage = stageForYear(year);

  const [statements, setStatements] = useState<NcStatement[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [query, setQuery] = useState("");
  const [hintOpen, setHintOpen] = useState(false);

  // Load the year's statements when the card is open. Keyed on the year, so a
  // change of year on step one swaps the list rather than leaving the old one.
  useEffect(() => {
    if (!checked || !covered) {
      setStatements(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadStatements(year as CurriculumYear)
      .then((list) => { if (!cancelled) setStatements(list); })
      .catch(() => { if (!cancelled) setStatements([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [checked, covered, year]);

  // A new year invalidates the subject and ticks, which belong to the old one.
  const lastYear = useRef(year);
  useEffect(() => {
    if (lastYear.current === year) return;
    lastYear.current = year;
    if (value.subject || value.statementIds.length) {
      onChange({ ...value, subject: "", strand: "", statementIds: [] }, []);
    }
    // onChange is a prop callback; the reset is about the year alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // Pre-tick the best match for the topic, once per topic and year, and only
  // while the teacher has not chosen anything themselves.
  const suggestedFor = useRef("");
  useEffect(() => {
    if (!checked || !covered || !statements?.length || !topic.trim()) return;
    if (value.subject || value.statementIds.length) return;
    const key = `${year}::${topic.trim().toLowerCase()}`;
    if (suggestedFor.current === key) return;
    suggestedFor.current = key;
    let cancelled = false;
    setSuggesting(true);
    (async () => {
      try {
        const res = await fetch("/api/suggest-subject", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: topic.trim(), year }),
        });
        if (!res.ok || cancelled) return;
        const pick = (await res.json()) as { subject: string; strand: string; statementIds: string[] };
        if (cancelled || !pick.subject) return;
        const ids = (pick.statementIds ?? []).filter((id) => statements.some((s) => s.id === id));
        onChange(
          { ...value, subject: pick.subject, strand: pick.strand ?? "", statementIds: ids },
          statements.filter((s) => ids.includes(s.id)),
        );
      } catch {
        /* best effort: the dropdowns are still there */
      } finally {
        if (!cancelled) setSuggesting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checked, covered, statements, topic, year]);

  const subjects = useMemo(() => (statements ? subjectsIn(statements) : []), [statements]);
  const strands = useMemo(
    () => (statements && value.subject ? strandsIn(statements, value.subject) : []),
    [statements, value.subject],
  );
  const listed = useMemo(() => {
    if (!statements || !value.subject) return [];
    const inStrand = statementsIn(statements, value.subject, value.strand || null);
    const q = query.trim().toLowerCase();
    return q ? inStrand.filter((s) => s.text.toLowerCase().includes(q) || s.strand.toLowerCase().includes(q)) : inStrand;
  }, [statements, value.subject, value.strand, query]);
  const selected = useMemo(
    () => (statements ? statements.filter((s) => value.statementIds.includes(s.id)) : []),
    [statements, value.statementIds],
  );

  const set = (next: Partial<CurriculumSelection>) => {
    const merged = { ...value, ...next };
    onChange(merged, statements ? statements.filter((s) => merged.statementIds.includes(s.id)) : []);
  };
  const toggle = (id: string) =>
    set({ statementIds: value.statementIds.includes(id) ? value.statementIds.filter((x) => x !== id) : [...value.statementIds, id] });

  return (
    <div
      data-testid="curriculum-alignment"
      className="rounded-xl border transition-colors overflow-hidden"
      style={{ backgroundColor: "#fff", borderColor: checked ? "var(--j-purple)" : "var(--j-line)" }}
    >
      <button
        type="button"
        onClick={() => onCheckedChange(!checked)}
        disabled={disabled}
        aria-expanded={checked}
        className="w-full flex items-center gap-3 p-3 text-left disabled:opacity-60"
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-emerald-100">
          <BookOpen className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--j-purple)" }}>Align to curriculum</p>
          <p className="text-xs text-gray-500 truncate">Pick the exact curriculum statements this deck should teach</p>
        </div>
        <div
          className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0"
          style={checked ? { backgroundColor: "var(--j-purple)", borderColor: "var(--j-purple)" } : { borderColor: "var(--j-line)" }}
        >
          {checked && (
            <svg viewBox="0 0 20 20" className="w-3 h-3 text-white fill-current">
              <path d="M7.6 13.6 4 10l1.4-1.4 2.2 2.2 7-7L16 5.2z" />
            </svg>
          )}
        </div>
      </button>

      {checked && (
        <div className="px-3 pb-3 pt-3 space-y-2.5" style={{ borderTop: "1px solid #F0EFE8" }}>
          {/* Country, curriculum and year */}
          <div className="grid grid-cols-3 gap-2">
            <Select label="Country" value="england" onChange={() => {}} disabled={disabled}>
              {COUNTRIES.map((c) => (
                <option key={c.id} value={c.id} disabled={c.id !== "england"}>
                  {c.id === "england" ? c.name : `${c.name} (coming soon)`}
                </option>
              ))}
            </Select>
            <div
              className="px-2.5 py-2 text-xs rounded-lg border truncate"
              style={{ borderColor: "var(--j-line)", backgroundColor: "var(--j-tint)", color: "var(--j-body)" }}
              title={covered ? curriculumNameFor(year as CurriculumYear) : "National Curriculum in England"}
            >
              {covered ? curriculumNameFor(year as CurriculumYear) : "National Curriculum in England"}
            </div>
            <Select
              label="Year"
              value={covered ? year : ""}
              onChange={(y) => set({ year: y, subject: "", strand: "", statementIds: [] })}
              disabled={disabled}
            >
              <option value="">Select year</option>
              {CURRICULUM_YEARS.map((y) => (
                <option key={y} value={y}>
                  {`${STAGE_LABEL[stageForYear(y)!]} · ${y}`}
                </option>
              ))}
            </Select>
          </div>

          {!covered ? (
            <p
              data-testid="curriculum-not-covered"
              className="text-xs leading-relaxed rounded-lg px-3 py-2.5"
              style={{ backgroundColor: "var(--j-tint)", color: "var(--j-body)" }}
            >
              {year
                ? `Curriculum alignment covers Nursery to Year 6. ${year} is not covered yet, so this deck will follow the topic and year you chose.`
                : "Pick a year from Nursery to Year 6 to see its curriculum statements."}
            </p>
          ) : loading || !statements ? (
            <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading the {year} curriculum
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select
                  label="Subject"
                  value={value.subject}
                  onChange={(s) => set({ subject: s, strand: "", statementIds: [] })}
                  disabled={disabled}
                  busy={suggesting}
                >
                  <option value="">{suggesting ? "Finding the best match" : "Select subject"}</option>
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
                <Select
                  label="Strand"
                  value={value.strand}
                  onChange={(s) => set({ strand: s })}
                  disabled={disabled || !value.subject}
                >
                  <option value="">{value.subject ? "All strands" : "Pick a subject first"}</option>
                  {strands.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </div>

              {/* The year selector already says "Key Stage 1 · Year 3". Year 3
                  alone gets a word, because the curriculum documents put it in
                  key stage 2 and a teacher who knows that will wonder. */}
              {stage && year === "Year 3" && (
                <p className="text-[11px] text-gray-500">
                  Year 3 statements come from the curriculum&apos;s Year 3 programmes of study.
                </p>
              )}

              {selected.length > 0 && (
                <div className="rounded-lg p-2.5 space-y-2" style={{ backgroundColor: "var(--j-tint)" }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-800">
                      {selected.length} selected statement{selected.length === 1 ? "" : "s"}
                    </p>
                    <button
                      type="button"
                      onClick={() => set({ statementIds: [] })}
                      disabled={disabled}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-60"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 max-w-full pl-2 pr-1 py-0.5 rounded-full bg-white border text-[11px] text-gray-700"
                        style={{ borderColor: "var(--j-line)" }}
                        title={s.text}
                      >
                        <span className="truncate max-w-[16rem]">{s.text}</span>
                        <button
                          type="button"
                          onClick={() => toggle(s.id)}
                          disabled={disabled}
                          aria-label={`Remove: ${s.text}`}
                          className="w-4 h-4 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {value.subject && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-700">
                      Statements ({listed.length})
                    </p>
                    <label className="relative flex-1 max-w-56">
                      <span className="sr-only">Search statements</span>
                      <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search"
                        className="w-full pl-7 pr-2 py-1.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-200"
                        style={{ borderColor: "var(--j-line)" }}
                      />
                    </label>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1.5 pr-0.5">
                    {listed.map((s) => {
                      const on = value.statementIds.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          onClick={() => toggle(s.id)}
                          disabled={disabled}
                          className="w-full flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-colors hover:bg-gray-50 disabled:opacity-60"
                          style={{ borderColor: on ? "var(--j-purple)" : "var(--j-line)", backgroundColor: on ? "#FBFAFE" : "#fff" }}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{s.strand}</span>
                            <span className="block text-xs text-gray-800 leading-snug">{s.text}</span>
                          </span>
                          <span
                            className="mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0"
                            style={on ? { backgroundColor: "var(--j-purple)", borderColor: "var(--j-purple)" } : { borderColor: "var(--j-line-2)" }}
                          >
                            {on && (
                              <svg viewBox="0 0 20 20" className="w-2.5 h-2.5 text-white fill-current">
                                <path d="M7.6 13.6 4 10l1.4-1.4 2.2 2.2 7-7L16 5.2z" />
                              </svg>
                            )}
                          </span>
                        </button>
                      );
                    })}
                    {listed.length === 0 && (
                      <p className="text-xs text-gray-400 py-2">No statements match that search.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => setHintOpen((v) => !v)}
              disabled={disabled}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 disabled:opacity-60"
            >
              <HelpCircle className="w-3 h-3" />
              Can&apos;t see a statement?
            </button>
            {hintOpen && (
              <div
                className="absolute z-10 left-0 mt-1 w-72 p-3 bg-white rounded-xl border shadow-lg"
                style={{ borderColor: "var(--j-line)" }}
              >
                <p className="text-xs font-semibold text-gray-900 mb-1">This is optional</p>
                <p className="text-[11px] text-gray-600 leading-snug">
                  The statements come straight from the National Curriculum in England and the EYFS. If none fits
                  your topic, untick Align to curriculum and Jooma still builds an accurate deck for your year group.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  disabled,
  busy,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={selectCls}
        style={{ borderColor: "var(--j-line)" }}
      >
        {children}
      </select>
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      )}
    </label>
  );
}
