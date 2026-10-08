"use client";

// Model lab — run one fixed input through several models and compare.
//
// WHY IT POSTS TO THE REAL TOOL ROUTE rather than a dedicated lab endpoint:
// each tool's prompt is built inside its own route handler. A lab that rebuilt
// those prompts would be comparing something subtly different from what
// teachers get, which is precisely the thing you cannot afford to be wrong
// about when deciding to switch a model. Instead the routes accept an
// admin-only `__labModel` override (app/lib/model-lab.ts), so this runs the
// genuine code path with the genuine prompt.
//
// Runs are real generations: they spend real money and write a real
// token_usage row, tagged step='model-lab' so lab spend stays visible in
// totals but separable from a tool's true per-run cost.

import { useState } from "react";
import { Play, RotateCcw } from "lucide-react";
import {
  MODELS,
  REASONING_EFFORTS,
  SELECTABLE_MODELS,
  cheapModelTone,
  isReasoning,
  type ModelId,
} from "@/app/lib/models";
import { nf, penceFromUsd } from "../format";
import {
  Btn,
  C,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  Note,
  PageHead,
  Tag,
  fieldClass,
  fieldStyle,
  inputClass,
  inputStyle,
  useToast,
} from "../ui";
import { LAB_TOOLS, labToolBySlug } from "./samples";
import { parsePartialJson } from "@/app/lib/sheets/stream";
import { normalizeDraft } from "@/app/lib/sheets/normalize";
import { sheetContext } from "@/app/lib/sheets/context";
import { sheetToMarkdown } from "@/app/lib/sheets/markdown";

/**
 * What to show for a run. Worksheet and Comprehension stream a sheet as JSON;
 * shown as the same markdown Copy gives a teacher, so candidates can be read
 * side by side. Partial JSON is read as far as it has got.
 */
function labText(slug: string, output: string): string {
  const tool = slug === "worksheet-generator" ? "worksheet" : slug === "comprehension-generator" ? "comprehension" : null;
  if (!tool) return output;
  const raw = parsePartialJson(output);
  if (!raw) return output;
  return sheetToMarkdown(normalizeDraft(raw, sheetContext(tool, {})), { answers: true });
}

/** One model under test, and whatever we know about its run so far. */
interface Candidate {
  id: string;
  model: ModelId;
  effort: string;
  output: string;
  /** Wall-clock from request to last token — includes reasoning time, which is
   *  why a "cheap" model can still feel slow at high effort. */
  ms: number | null;
  running: boolean;
  error: string | null;
}

let nextId = 1;
function makeCandidate(model: ModelId, effort = "low"): Candidate {
  return { id: `c${nextId++}`, model, effort, output: "", ms: null, running: false, error: null };
}

/**
 * Estimated cost of a completed run.
 *
 * HONEST LIMITATION: the browser never sees the token counts — usage lives in
 * the final stream chunk, which streamChat consumes server-side to write
 * token_usage. So this estimates from output length (~4 chars/token) and cannot
 * see reasoning tokens at all, which on a gpt-5.6 model can be a large share of
 * the real bill. Treat it as a rough floor for ranking candidates; the exact
 * figure appears on the Model routing card once the row lands.
 */
function estimateCostUsd(model: ModelId, chars: number): number {
  const outTok = chars / 4;
  return (outTok / 1_000_000) * MODELS[model].output;
}

export default function ModelLabView() {
  const [slug, setSlug] = useState(LAB_TOOLS[0].slug);
  const [input, setInput] = useState(() => JSON.stringify(LAB_TOOLS[0].body, null, 2));
  const [candidates, setCandidates] = useState<Candidate[]>([
    makeCandidate("gpt-4o"),
    makeCandidate("gpt-5.6-luna"),
  ]);
  const [toastNode, fire] = useToast();

  const tool = labToolBySlug(slug)!;
  const anyRunning = candidates.some((c) => c.running);

  const pickTool = (next: string) => {
    setSlug(next);
    // Reset the input to that tool's sample: a body from another tool would
    // just 400, and silently keeping it would look like a model failure.
    setInput(JSON.stringify(labToolBySlug(next)!.body, null, 2));
    setCandidates((prev) => prev.map((c) => ({ ...c, output: "", ms: null, error: null })));
  };

  const runOne = async (c: Candidate, body: Record<string, unknown>) => {
    const started = performance.now();
    setCandidates((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, running: true, output: "", error: null, ms: null } : x)),
    );

    try {
      const res = await fetch(`/api/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          __labModel: c.model,
          ...(isReasoning(c.model) ? { __labEffort: c.effort } : {}),
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      // Same streaming read the teacher-facing forms use, so what renders here
      // is what a teacher would see.
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true }).replace(/©/g, "(c)");
        setCandidates((prev) =>
          prev.map((x) => (x.id === c.id ? { ...x, output: x.output + chunk } : x)),
        );
      }
      setCandidates((prev) =>
        prev.map((x) =>
          x.id === c.id ? { ...x, running: false, ms: Math.round(performance.now() - started) } : x,
        ),
      );
    } catch (err) {
      setCandidates((prev) =>
        prev.map((x) =>
          x.id === c.id
            ? { ...x, running: false, error: err instanceof Error ? err.message : "Failed" }
            : x,
        ),
      );
    }
  };

  const runAll = async () => {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(input);
    } catch {
      fire("Input is not valid JSON.");
      return;
    }
    // Fired together, not sequentially: comparing latency only means anything
    // if both hit the same API conditions.
    await Promise.all(candidates.map((c) => runOne(c, body)));
  };

  const addCandidate = () => setCandidates((prev) => [...prev, makeCandidate("gpt-5.6-terra")]);
  const removeCandidate = (id: string) =>
    setCandidates((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  const updateCandidate = (id: string, patch: Partial<Candidate>) =>
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <>
      <PageHead
        title="Model lab"
        sub="Run one fixed input through several models and compare the output, side by side."
      >
        <Btn onClick={runAll} variant="primary" disabled={anyRunning}>
          <Play className="w-4 h-4" />
          {anyRunning ? "Running…" : "Run all"}
        </Btn>
      </PageHead>

      <Note>
        These are real generations on the live tool route, so they cost real money and are
        recorded — tagged <b style={{ color: C.ink }}>model-lab</b> so they stay out of a
        tool&apos;s true per-run cost. Changing a model here does <b style={{ color: C.ink }}>not</b>{" "}
        change what teachers get; that is the Tools page.
      </Note>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Input</CardTitle>
          <Tag>{nf.format(tool.maxTokens)} max output tokens</Tag>
        </CardHeader>
        <CardBody>
          <div className="grid gap-3 md:grid-cols-[260px_1fr]">
            <Field label="Tool" help={tool.note}>
              <select
                value={slug}
                onChange={(e) => pickTool(e.target.value)}
                className={fieldClass}
                style={fieldStyle}
              >
                {LAB_TOOLS.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Request body (JSON)"
              help="Edit to test a different case. Reset by re-picking the tool."
            >
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={10}
                spellCheck={false}
                className={`${fieldClass} font-mono text-xs`}
                style={fieldStyle}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Models</CardTitle>
          <Btn onClick={addCandidate} disabled={candidates.length >= 4}>
            Add model
          </Btn>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-3">
            {candidates.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border p-3 flex items-end gap-2"
                style={{ borderColor: C.border, backgroundColor: C.white }}
              >
                <Field label="Model">
                  <select
                    value={c.model}
                    onChange={(e) => updateCandidate(c.id, { model: e.target.value as ModelId })}
                    className={fieldClass}
                    style={fieldStyle}
                  >
                    {SELECTABLE_MODELS.map((m) => (
                      <option key={m} value={m}>
                        {MODELS[m].label}
                      </option>
                    ))}
                  </select>
                </Field>
                {isReasoning(c.model) && (
                  <Field label="Effort">
                    <select
                      value={c.effort}
                      onChange={(e) => updateCandidate(c.id, { effort: e.target.value })}
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
                )}
                {candidates.length > 1 && (
                  <Btn onClick={() => removeCandidate(c.id)}>
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Btn>
                )}
              </div>
            ))}
          </div>
        </CardBody>
        <CardFooter>
          The same model can appear twice at different efforts — that is the cleanest way to see
          what raising effort actually costs.
        </CardFooter>
      </Card>

      <div
        className="grid gap-4 mt-4"
        style={{ gridTemplateColumns: `repeat(${Math.min(candidates.length, 2)}, minmax(0, 1fr))` }}
      >
        {candidates.map((c) => {
          const chars = c.output.length;
          return (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  <Tag tone={cheapModelTone(c.model)}>{c.model}</Tag>
                  {isReasoning(c.model) && (
                    <span className="font-mono text-xs" style={{ color: C.muted }}>
                      {c.effort}
                    </span>
                  )}
                </div>
                {c.ms !== null && (
                  <span className="font-mono text-xs" style={{ color: C.muted }}>
                    {(c.ms / 1000).toFixed(1)}s · ~{penceFromUsd(estimateCostUsd(c.model, chars))}
                  </span>
                )}
              </CardHeader>
              <CardBody>
                {c.error ? (
                  <p className="text-sm" style={{ color: C.danger }}>
                    {c.error}
                  </p>
                ) : c.output ? (
                  <pre
                    className="whitespace-pre-wrap text-sm leading-relaxed max-h-[28rem] overflow-y-auto"
                    style={{ color: C.ink2, fontFamily: "inherit" }}
                  >
                    {labText(slug, c.output)}
                  </pre>
                ) : (
                  <p className="text-sm" style={{ color: C.muted }}>
                    {c.running ? "Generating…" : "Not run yet."}
                  </p>
                )}
              </CardBody>
              {chars > 0 && (
                <CardFooter>
                  {nf.format(chars)} characters · cost is estimated from output length and
                  excludes reasoning tokens — see the Model routing card for the exact figure.
                </CardFooter>
              )}
            </Card>
          );
        })}
      </div>

      {toastNode}
    </>
  );
}
