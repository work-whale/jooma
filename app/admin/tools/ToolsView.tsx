"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import { SELECTABLE_PLANS } from "@/app/lib/plans";
import {
  MODELS,
  REASONING_EFFORTS,
  SELECTABLE_MODELS,
  VERBOSITIES,
  cheapModelTone,
  isReasoning,
  modelLabel,
  type ModelId,
} from "@/app/lib/models";
import { fmtRelative, gbpFromUsd, nf, penceFromUsd } from "../format";
import ModelRoutingCard, { type ModelRow } from "../ModelRoutingCard";
import type { ImageSettings } from "@/app/lib/image-quality";
import ImageGenerationCard from "./ImageGenerationCard";
import {
  Btn,
  C,
  Card,
  CardFooter,
  EmptyState,
  Field,
  FilterBar,
  Modal,
  Note,
  PLAN_TONE,
  PageHead,
  Stat,
  Table,
  Tag,
  Td,
  Th,
  Toggle,
  Tr,
  fieldClass,
  fieldStyle,
  inputClass,
  inputStyle,
  useToast,
} from "../ui";

export interface ToolRow {
  slug: string;
  display_name: string;
  enabled: boolean;
  plans: string[];
  model_note: string | null;
  /** 'tool' = a teacher picks it from the grid. 'utility' = an internal AI
   *  route a tool calls (the slideshow's deck/audio/video generators, the
   *  editor helpers). Utilities spend real money and carry a model, but are
   *  not products — the filter below can separate them. */
  kind: string;
  /** The model this tool is CONFIGURED to use, from tool_settings. Distinct
   *  from `models`, which is what actually ran this month. */
  model: string | null;
  effort: string | null;
  verbosity: string | null;
  runs: number;
  total_tokens: number;
  cost_usd: number;
  cost_per_run: number;
  avg_tokens: number;
  avg_prompt_tokens: number;
  avg_completion_tokens: number;
  reasoning_tokens: number;
  models: string[];
  last_used: string | null;
}

export type { ModelRow };

/**
 * What one run of THIS tool would cost on a given model, using its own measured
 * average token split.
 *
 * Worth the arithmetic because the headline rates mislead: terra's input is
 * cheaper than gpt-4o's but its output is DEARER ($12 vs $10 per 1M), so on a
 * tool that writes 8k tokens of prose, switching to terra is a cost increase.
 * Showing the per-tool number stops that being a surprise.
 *
 * Returns null when the tool has no measured runs to project from.
 */
function projectedCostUsd(tool: ToolRow, model: ModelId): number | null {
  const inTok = Number(tool.avg_prompt_tokens);
  const outTok = Number(tool.avg_completion_tokens);
  if (!(inTok > 0 || outTok > 0)) return null;
  const p = MODELS[model];
  // Deliberately prices all input at the uncached rate: cache hit rates differ
  // per model and per prompt, so assuming them would flatter the estimate.
  // Reasoning tokens are likewise not modelled — see the warning in the modal.
  return (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;
}

// Only the plans that can actually be sold — currently free, pro and max.
// `school` is unbuilt (no seats, no pooled allowances), so offering it here
// would let an admin scope a tool to a plan nobody can be on. SELECTABLE_PLANS
// is the same filter the teacher-facing plan pickers use, so the two cannot
// drift — and a plan going on or off sale updates this list with it.
// Widened to string[] deliberately: tool_settings.plans is a free text[] in the
// database and can hold values outside the PlanId union (the seed still lists
// 'school'), so comparisons against it must not assume otherwise.
const ALL_PLANS: string[] = SELECTABLE_PLANS.map((p) => p.id);

export default function ToolsView({
  rows,
  models,
  listedSlugs,
  imageSettings,
  imageSettingsSaved,
}: {
  rows: ToolRow[];
  models: ModelRow[];
  listedSlugs: string[];
  imageSettings: ImageSettings;
  imageSettingsSaved: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [state, setState] = useState("");
  const [editing, setEditing] = useState<ToolRow | null>(null);
  const [toastNode, fire] = useToast();

  const listed = useMemo(() => new Set(listedSlugs), [listedSlugs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((t) => {
      if (needle && !`${t.display_name} ${t.slug}`.toLowerCase().includes(needle)) return false;
      if (planFilter && !t.plans.includes(planFilter)) return false;
      if (state === "on" && !t.enabled) return false;
      if (state === "off" && t.enabled) return false;
      if (state === "unlisted" && listed.has(t.slug)) return false;
      if (state === "used" && Number(t.runs) === 0) return false;
      if (state === "utility" && t.kind !== "utility") return false;
      if (state === "tools" && t.kind !== "tool") return false;
      return true;
    });
  }, [rows, q, planFilter, state, listed]);

  const totalCost = rows.reduce((a, t) => a + Number(t.cost_usd), 0);
  const totalRuns = rows.reduce((a, t) => a + Number(t.runs), 0);
  const disabled = rows.filter((t) => !t.enabled).length;
  // Utilities are internal AI routes and are MEANT to be absent from the
  // teacher grid, so counting them here would turn a real signal ("a product
  // tool is invisible") into permanent noise.
  const unlisted = rows.filter((t) => t.kind !== "utility" && !listed.has(t.slug)).length;
  const utilities = rows.filter((t) => t.kind === "utility").length;

  const toggleTool = async (slug: string, enabled: boolean, name: string) => {
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_update_tool", {
      p_slug: slug,
      payload: { enabled },
    });
    if (error) {
      fire(error.message);
      return;
    }
    fire(`${name} ${enabled ? "enabled" : "turned off"}.`);
    router.refresh();
  };

  /**
   * Switch one tool's model from the table, without opening the modal.
   *
   * This is the revert path as much as the try-it path: if a model misbehaves
   * mid-test, getting back to the previous one has to be one click.
   *
   * Effort/verbosity are sent explicitly on every switch — null when moving to
   * a gpt-4o model (which takes neither) and the tool's current setting or the
   * default when moving to gpt-5.6. Omitting them would leave stale reasoning
   * settings attached to a model that ignores them.
   */
  const switchModel = async (tool: ToolRow, model: ModelId) => {
    const supabase = createClient();
    const reasoning = isReasoning(model);
    const { error } = await supabase.rpc("admin_update_tool", {
      p_slug: tool.slug,
      payload: {
        model,
        effort: reasoning ? (tool.effort ?? "low") : null,
        verbosity: reasoning ? (tool.verbosity ?? "medium") : null,
      },
    });
    if (error) {
      fire(error.message);
      return;
    }
    fire(`${tool.display_name} → ${modelLabel(model)}. Takes effect within a minute.`);
    router.refresh();
  };

  return (
    <>
      <PageHead
        title="Tools"
        sub={`All ${nf.format(rows.length)}, with their measured cost this month. Turn one off or change who gets it — without a deploy.`}
      />

      <div className="grid gap-3.5 mb-6 grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Tools configured"
          value={nf.format(rows.length - utilities)}
          foot={`${disabled} off · ${utilities} internal routes`}
        />
        <Stat label="Runs this month" value={nf.format(totalRuns)} foot="across all tools" />
        <Stat
          label="Measured cost"
          value={gbpFromUsd(totalCost)}
          foot="this month, from logged usage"
        />
        <Stat
          label="Cost per run"
          value={totalRuns > 0 ? penceFromUsd(totalCost / totalRuns) : "—"}
          foot="blended average"
        />
      </div>

      {unlisted > 0 && (
        <div className="mb-4">
          <Note tone="warn">
            <b>
              {nf.format(unlisted)} tool{unlisted === 1 ? "" : "s"} not in the teacher-facing
              list.
            </b>{" "}
            The route exists and can record cost, but it doesn&apos;t appear in the tool grid —
            so nobody can find it, and nobody is watching it. Filter to{" "}
            <i>Not listed to teachers</i> to see which.
          </Note>
        </div>
      )}

      <Card>
        <FilterBar>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tool name or slug"
            className={inputClass}
            style={{ ...inputStyle, minWidth: 220 }}
          />
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            <option value="">All plans</option>
            {ALL_PLANS.map((p) => (
              <option key={p} value={p}>
                Available on {p}
              </option>
            ))}
          </select>
          <select
            value={state}
            onChange={(e) => setState(e.target.value)}
            className={inputClass}
            style={inputStyle}
          >
            <option value="">Any state</option>
            <option value="on">Enabled</option>
            <option value="off">Turned off</option>
            <option value="used">Used this month</option>
            <option value="unlisted">Not listed to teachers</option>
            <option value="tools">Teacher-facing only</option>
            <option value="utility">Internal routes only</option>
          </select>
          <div className="flex-1" />
          <Tag>{nf.format(filtered.length)} shown</Tag>
        </FilterBar>

        {filtered.length === 0 ? (
          <EmptyState title="No tools match that" body="Try clearing a filter." />
        ) : (
          <Table>
            <thead>
              <tr className="text-left">
                <Th>Tool</Th>
                <Th align="right">Cost / run</Th>
                <Th align="right">Avg tokens</Th>
                <Th align="right">Runs</Th>
                <Th align="right">Cost this month</Th>
                <Th>Model</Th>
                <Th>Ran on</Th>
                <Th>Plans</Th>
                <Th align="center">Live</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const perRun = Number(t.cost_per_run);
                // Anything an order of magnitude above the blended average is
                // worth a second look — that's where margin goes.
                const expensive = perRun > 0.03;
                return (
                  <Tr key={t.slug}>
                    <Td>
                      <button
                        type="button"
                        className="text-left"
                        onClick={() => setEditing(t)}
                      >
                        <div className="font-semibold hover:underline" style={{ color: C.ink }}>
                          {t.display_name}
                        </div>
                        <div className="font-mono text-xs" style={{ color: C.muted }}>
                          {t.slug}
                          {/* Utilities are internal routes a tool calls, so
                              their absence from the teacher grid is correct,
                              not a warning. Marked, not flagged. */}
                          {t.kind === "utility" ? (
                            <span style={{ color: C.muted }}> · internal route</span>
                          ) : (
                            !listed.has(t.slug) && (
                              <span style={{ color: C.warn }}> · not listed</span>
                            )
                          )}
                        </div>
                      </button>
                    </Td>
                    <Td align="right">
                      <span
                        className="tabular-nums font-semibold"
                        style={{ color: expensive ? C.img : C.ink }}
                      >
                        {perRun > 0 ? penceFromUsd(perRun) : "—"}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="tabular-nums" style={{ color: C.ink2 }}>
                        {Number(t.avg_tokens) > 0 ? nf.format(Number(t.avg_tokens)) : "—"}
                      </span>
                    </Td>
                    <Td align="right" mono>
                      {nf.format(Number(t.runs))}
                    </Td>
                    <Td align="right" mono>
                      {Number(t.cost_usd) > 0 ? gbpFromUsd(Number(t.cost_usd)) : "—"}
                    </Td>
                    <Td>
                      {/* The configured model — switch or revert without a
                          deploy. Raw <select> is the house style here; the
                          admin console has no Select component. */}
                      <select
                        value={t.model ?? "gpt-4o"}
                        onChange={(e) => switchModel(t, e.target.value as ModelId)}
                        className={inputClass}
                        style={inputStyle}
                        aria-label={`Model for ${t.display_name}`}
                      >
                        {SELECTABLE_MODELS.map((m) => (
                          <option key={m} value={m}>
                            {MODELS[m].label}
                          </option>
                        ))}
                      </select>
                      {t.model && isReasoning(t.model) && (
                        <div className="font-mono text-xs mt-1" style={{ color: C.muted }}>
                          {t.effort ?? "low"} · {t.verbosity ?? "medium"}
                        </div>
                      )}
                    </Td>
                    <Td>
                      {/* What actually ran this month. Kept separate from the
                          setting above: mid-rollout the two legitimately
                          differ, and that gap is the thing worth seeing. */}
                      {t.models.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {t.models.map((m) => (
                            <Tag key={m} tone={cheapModelTone(m)}>
                              {m}
                            </Tag>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: C.muted }}>
                          not run yet
                        </span>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {t.kind === "utility" ? (
                          // Reached through a parent tool, so it inherits that
                          // tool's availability. Showing plans here would imply
                          // a control that doesn't exist.
                          <span className="text-xs" style={{ color: C.muted }}>
                            via parent tool
                          </span>
                        ) : t.plans.length === 0 ? (
                          <Tag
                            tone="warn"
                            title="Recorded only — plan restrictions are not enforced. The tool is still available to everyone."
                          >
                            nobody
                          </Tag>
                        ) : ALL_PLANS.every((p) => t.plans.includes(p)) ? (
                          // Covers every SELLABLE plan — tested by coverage, not
                          // by count. The seeded rows still list unbuilt plans
                          // too, so comparing lengths would never match.
                          <Tag>all plans</Tag>
                        ) : (
                          // Only show plans that can actually be sold; a
                          // lingering 'school' entry is noise, not a
                          // restriction anyone can act on.
                          t.plans
                            .filter((p) => ALL_PLANS.includes(p))
                            .map((p) => (
                              <Tag key={p} tone={PLAN_TONE[p] ?? "plain"}>
                                {p}
                              </Tag>
                            ))
                        )}
                      </div>
                    </Td>
                    <Td align="center">
                      {/* No kill switch on a utility: switching one off would
                          break the tool that calls it rather than withdraw a
                          teacher-facing feature. Use the parent tool's toggle. */}
                      {t.kind === "utility" ? (
                        <span className="text-xs" style={{ color: C.muted }}>
                          —
                        </span>
                      ) : (
                        <div className="flex justify-center">
                          <Toggle
                            on={t.enabled}
                            onChange={(next) => toggleTool(t.slug, next, t.display_name)}
                            label={t.display_name}
                          />
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <CardFooter>
          {nf.format(rows.length)} tools · {gbpFromUsd(totalCost)} measured this month · costs
          read from token_usage and asset_cost, not estimated
        </CardFooter>
      </Card>

      <ImageGenerationCard settings={imageSettings} saved={imageSettingsSaved} className="mt-4" />

      <ModelRoutingCard models={models} className="mt-4" />

      {editing && (
        <EditToolModal
          tool={editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            fire(msg);
            router.refresh();
          }}
        />
      )}
      {toastNode}
    </>
  );
}

function EditToolModal({
  tool,
  onClose,
  onSaved,
}: {
  tool: ToolRow;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [plans, setPlans] = useState<string[]>(tool.plans);
  const [enabled, setEnabled] = useState(tool.enabled);
  const [modelNote, setModelNote] = useState(tool.model_note ?? "");
  const [model, setModel] = useState<ModelId>((tool.model as ModelId) ?? "gpt-4o");
  const [effort, setEffort] = useState(tool.effort ?? "low");
  const [verbosity, setVerbosity] = useState(tool.verbosity ?? "medium");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reasoning = isReasoning(model);
  const currentModel = (tool.model as ModelId) ?? "gpt-4o";
  const baseline = projectedCostUsd(tool, currentModel);

  // Only the sellable plans get a button, but `plans` is seeded from the row as
  // it is — so any lingering 'school' entry is carried through a save untouched
  // rather than being silently dropped by an edit that never showed it. Don't
  // "simplify" this to rebuild the array from ALL_PLANS.
  const togglePlan = (plan: string) =>
    setPlans((prev) =>
      prev.includes(plan) ? prev.filter((p) => p !== plan) : [...prev, plan],
    );

  const submit = async () => {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: e } = await supabase.rpc("admin_update_tool", {
      p_slug: tool.slug,
      payload: {
        enabled,
        plans,
        model_note: modelNote,
        model,
        // Explicit null on a gpt-4o model so a previous gpt-5.6 setting is
        // cleared rather than left dangling on a model that ignores it.
        effort: reasoning ? effort : null,
        verbosity: reasoning ? verbosity : null,
      },
    });
    setSaving(false);
    if (e) {
      setError(e.message);
      return;
    }
    onSaved(`${tool.display_name} saved.`);
    onClose();
  };

  return (
    <Modal
      title={tool.display_name}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save tool"}
          </Btn>
        </>
      }
    >
      <div
        className="rounded-xl border px-3.5 py-3 mb-4 text-sm"
        style={{ borderColor: C.border, backgroundColor: C.white }}
      >
        {[
          ["Slug", tool.slug],
          ["Runs this month", nf.format(Number(tool.runs))],
          [
            "Cost per run",
            Number(tool.cost_per_run) > 0 ? penceFromUsd(Number(tool.cost_per_run)) : "—",
          ],
          [
            "Avg tokens (in / out)",
            Number(tool.avg_tokens) > 0
              ? `${nf.format(Number(tool.avg_prompt_tokens))} / ${nf.format(Number(tool.avg_completion_tokens))}`
              : "—",
          ],
          // Only meaningful once something has run on a reasoning model, so it
          // is hidden rather than shown as a permanent zero on gpt-4o tools.
          ...(Number(tool.reasoning_tokens) > 0
            ? [["Reasoning tokens", nf.format(Number(tool.reasoning_tokens))] as const]
            : []),
          ["Last used", fmtRelative(tool.last_used)],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between py-0.5">
            <span style={{ color: C.muted }}>{k}</span>
            <span className="font-mono text-xs" style={{ color: C.ink }}>
              {v}
            </span>
          </div>
        ))}
      </div>

      {tool.kind === "utility" && (
        <Note>
          An internal route, not a tool teachers pick. It runs when its parent tool does, and
          inherits that tool&apos;s availability — so only the model settings below apply here.
        </Note>
      )}

      {tool.kind !== "utility" && (
      <Field
        label="Available to"
        help="Recorded for review — plan restrictions are NOT enforced yet. Use the Enabled switch below to actually stop a tool."
      >
        <div className="flex flex-wrap gap-2">
          {ALL_PLANS.map((p) => {
            const on = plans.includes(p);
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePlan(p)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors capitalize"
                style={
                  on
                    ? { backgroundColor: C.ink, borderColor: C.ink, color: "#fff" }
                    : { backgroundColor: "transparent", borderColor: C.border, color: C.muted }
                }
              >
                {p}
              </button>
            );
          })}
        </div>
      </Field>
      )}

      {tool.kind !== "utility" && plans.length === 0 && (
        <Note tone="warn">
          No plans selected. This is recorded but not enforced — the tool stays available to
          everyone until you switch it off below.
        </Note>
      )}

      <div className="mt-3">
        <Field
          label="Model"
          help={
            baseline === null
              ? "Takes effect within a minute. No measured runs yet, so no cost projection."
              : "Projected cost per run, from this tool's own average token split."
          }
        >
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ModelId)}
            className={fieldClass}
            style={fieldStyle}
          >
            {SELECTABLE_MODELS.map((m) => {
              const proj = projectedCostUsd(tool, m);
              const delta =
                proj !== null && baseline !== null && baseline > 0
                  ? Math.round(((proj - baseline) / baseline) * 100)
                  : null;
              const bits = [MODELS[m].label];
              if (proj !== null) bits.push(penceFromUsd(proj) + "/run");
              if (m === currentModel) bits.push("current");
              else if (delta !== null) bits.push(`${delta > 0 ? "+" : ""}${delta}%`);
              return (
                <option key={m} value={m}>
                  {bits.join("  ·  ")}
                </option>
              );
            })}
          </select>
        </Field>
        <p className="text-xs mt-1.5" style={{ color: C.muted }}>
          {MODELS[model].note}
        </p>
      </div>

      {reasoning && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Reasoning effort" help="Higher costs more.">
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                className={fieldClass}
                style={fieldStyle}
              >
                {REASONING_EFFORTS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Verbosity" help="Default level of detail.">
              <select
                value={verbosity}
                onChange={(e) => setVerbosity(e.target.value)}
                className={fieldClass}
                style={fieldStyle}
              >
                {VERBOSITIES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Note tone="warn">
            Reasoning tokens are billed as output tokens, and the projection above cannot
            include them — it is a floor, not a forecast. Raising effort raises real cost by
            an amount only a live run will show. Start at <strong>low</strong> and check the
            measured figure before going higher.
          </Note>
        </>
      )}

      <div className="mt-3">
        <Field
          label="Model note"
          help="Free text for review. Does not affect routing — the Model dropdown above does that."
        >
          <input
            value={modelNote}
            onChange={(e) => setModelNote(e.target.value)}
            placeholder="e.g. Candidate for luna — short structured output"
            className={fieldClass}
            style={fieldStyle}
          />
        </Field>
      </div>

      {/* Utilities have no kill switch of their own — turning one off would
          break the tool that calls it, not withdraw a teacher-facing feature. */}
      {tool.kind !== "utility" && (
        <div
          className="flex items-center gap-3 py-3 border-t mt-1"
          style={{ borderColor: C.divider }}
        >
          <div className="flex-1">
            <div className="text-sm font-medium" style={{ color: C.ink }}>
              Enabled
            </div>
            <div className="text-xs" style={{ color: C.muted }}>
              Removes it from the teacher tool grid, blocks the tool page, and refuses new
              generations at the API. Takes effect within a minute.
            </div>
          </div>
          <Toggle on={enabled} onChange={setEnabled} label="Enabled" />
        </div>
      )}

      {error && (
        <p className="text-sm mt-2" style={{ color: C.danger }}>
          {error}
        </p>
      )}
    </Modal>
  );
}
