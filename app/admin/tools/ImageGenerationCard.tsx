"use client";

// ── Image generation ─────────────────────────────────────────────────────────
// AI images are billed per image, not per token, so they cannot sit in the
// tools table above (which is keyed by text model). This card is their row:
// the quality each kind of image is made at, and the price each image is
// recorded at, both stored in app_settings.image_generation.
//
// The test generator posts to the real /api/generate-image route with an
// admin-only __labQuality, so it runs the genuine prompt and the genuine model.
// Each test image spends real money and writes an asset_cost row tagged
// step='model-lab'.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/app/lib/auth/client";
import {
  IMAGE_QUALITIES,
  IMAGE_SETTINGS_KEY,
  IMAGE_SIZES,
  deckImageCostUsd,
  type ImageQuality,
  type ImageSettings,
  type ImageSize,
} from "@/app/lib/image-quality";
import { penceFromUsd } from "../format";
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
  Tag,
  fieldClass,
  fieldStyle,
  inputClass,
  inputStyle,
  useToast,
} from "../ui";

const USE_ROWS: { key: "title" | "slide" | "single"; label: string; help: string }[] = [
  { key: "title", label: "Slideshow title image", help: "The opening slide, the first thing on screen." },
  {
    key: "slide",
    label: "Other slideshow images",
    help: "Every other slide, including the vocab grid and two-image cells.",
  },
  { key: "single", label: "Single images", help: "Editor AI tab and right-click Regenerate." },
];

const SIZE_LABEL: Record<ImageSize, string> = {
  "1024x1024": "Square 1024²",
  "1536x1024": "Landscape 1536×1024",
  "1024x1536": "Portrait 1024×1536",
};

const ORIENTATION_FOR_SIZE: Record<ImageSize, "square" | "landscape" | "portrait"> = {
  "1024x1024": "square",
  "1536x1024": "landscape",
  "1024x1536": "portrait",
};

const STYLES = ["photographic", "illustration", "storybook", "painted", "line-drawing", "comic-book"];

interface TestResult {
  quality: ImageQuality;
  url: string | null;
  costUsd: number | null;
  ms: number | null;
  running: boolean;
  error: string | null;
}

export default function ImageGenerationCard({
  settings,
  saved,
  className,
}: {
  settings: ImageSettings;
  /** False until the migration has added the row: saving would have nowhere to go. */
  saved: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [toastNode, fire] = useToast();
  const [draft, setDraft] = useState<ImageSettings>(settings);
  const [saving, setSaving] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  const setQuality = (key: "title" | "slide" | "single", q: ImageQuality) =>
    setDraft((d) => ({ ...d, [key]: q }));

  const setPrice = (size: ImageSize, q: ImageQuality, value: string) => {
    const n = Number(value);
    setDraft((d) => ({
      ...d,
      costUsd: { ...d.costUsd, [size]: { ...d.costUsd[size], [q]: Number.isFinite(n) ? n : 0 } },
    }));
  };

  const save = async () => {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("admin_set_setting", {
      p_key: IMAGE_SETTINGS_KEY,
      p_value: draft,
    });
    setSaving(false);
    if (error) {
      fire(error.message);
      return;
    }
    fire("Image settings saved. Takes effect within a minute.");
    router.refresh();
  };

  // ── Test generator ──
  const [prompt, setPrompt] = useState("A heron standing in a misty river at dawn");
  const [style, setStyle] = useState("photographic");
  const [size, setSize] = useState<ImageSize>("1024x1024");
  const [picked, setPicked] = useState<ImageQuality[]>(["low", "medium"]);
  const [results, setResults] = useState<TestResult[]>([]);

  const togglePicked = (q: ImageQuality) =>
    setPicked((p) => (p.includes(q) ? p.filter((x) => x !== q) : [...p, q]));

  const runTest = async () => {
    const order = IMAGE_QUALITIES.filter((q) => picked.includes(q));
    setResults(
      order.map((quality) => ({ quality, url: null, costUsd: null, ms: null, running: true, error: null })),
    );
    await Promise.all(
      order.map(async (quality) => {
        const started = performance.now();
        let patch: Partial<TestResult>;
        try {
          const res = await fetch("/api/generate-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt,
              style,
              orientation: ORIENTATION_FOR_SIZE[size],
              __labQuality: quality,
            }),
          });
          const data = await res.json();
          patch = res.ok
            ? { url: data.dataUrl, costUsd: data.costUsd ?? null, error: null }
            : { error: data.error ?? `HTTP ${res.status}` };
        } catch (err) {
          patch = { error: err instanceof Error ? err.message : "Request failed" };
        }
        const ms = Math.round(performance.now() - started);
        setResults((rs) =>
          rs.map((r) => (r.quality === quality ? { ...r, ...patch, ms, running: false } : r)),
        );
      }),
    );
  };

  const testing = results.some((r) => r.running);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Image generation</CardTitle>
        <Tag>gpt-image-1</Tag>
      </CardHeader>
      <CardBody>
        {!saved && (
          <div className="mb-4">
            <Note tone="warn">
              <b>Running on defaults.</b> The image_generation setting hasn&apos;t been added to this
              database yet, so changes here can&apos;t be saved until that migration is pushed.
            </Note>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3" data-testid="image-quality-pickers">
          {USE_ROWS.map((u) => (
            <Field key={u.key} label={u.label} help={u.help}>
              <select
                aria-label={u.label}
                value={draft[u.key]}
                onChange={(e) => setQuality(u.key, e.target.value as ImageQuality)}
                className={fieldClass}
                style={fieldStyle}
              >
                {IMAGE_QUALITIES.map((q) => (
                  <option key={q} value={q}>
                    {q} ({penceFromUsd(draft.costUsd["1024x1024"][q])} square)
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </div>

        <p className="text-xs mb-4" style={{ color: C.muted }}>
          An all-AI slideshow (1 title image + 10 others, square) comes to about{" "}
          <b style={{ color: C.ink }} data-testid="deck-image-cost">
            {penceFromUsd(deckImageCostUsd(draft))}
          </b>{" "}
          of images at these settings.
        </p>

        <div className="text-xs font-semibold mb-1.5" style={{ color: C.ink2 }}>
          Price per image (USD), recorded on every image
        </div>
        <div className="overflow-x-auto mb-2">
          <table className="text-sm" data-testid="image-price-grid">
            <thead>
              <tr className="text-left text-xs" style={{ color: C.muted }}>
                <th className="pr-4 py-1 font-semibold">Quality</th>
                {IMAGE_SIZES.map((s) => (
                  <th key={s} className="pr-4 py-1 font-semibold">
                    {SIZE_LABEL[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {IMAGE_QUALITIES.map((q) => (
                <tr key={q}>
                  <td className="pr-4 py-1 font-semibold">{q}</td>
                  {IMAGE_SIZES.map((s) => (
                    <td key={s} className="pr-4 py-1">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max="0.999"
                        aria-label={`${q} ${s} price`}
                        value={draft.costUsd[s][q]}
                        onChange={(e) => setPrice(s, q, e.target.value)}
                        className={inputClass}
                        style={{ ...inputStyle, width: 96 }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs mb-4" style={{ color: C.muted }}>
          Medium is calibrated against the OpenAI console. Low and high start as that figure scaled by
          OpenAI&apos;s token ratio, so check them against the console after a test run. A price is
          frozen onto each image when it is made, so changing it here does not rewrite past spend.
        </p>

        <div className="flex items-center gap-2">
          <Btn variant="primary" onClick={save} disabled={!dirty || saving || !saved}>
            {saving ? "Saving..." : "Save image settings"}
          </Btn>
          {dirty && (
            <Btn variant="ghost" onClick={() => setDraft(settings)}>
              Discard
            </Btn>
          )}
        </div>

        <div className="border-t mt-6 pt-5" style={{ borderColor: C.divider }}>
          <div className="text-sm font-semibold mb-1">Test side by side</div>
          <p className="text-xs mb-3" style={{ color: C.muted }}>
            Makes one real image per quality from the same prompt, priced at the saved settings.
            Each costs real money and is logged as a lab run, separate from teacher spend.
          </p>
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <Field label="Prompt">
              <input
                aria-label="Test prompt"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className={fieldClass}
                style={fieldStyle}
              />
            </Field>
            <Field label="Style">
              <select
                aria-label="Test style"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className={fieldClass}
                style={fieldStyle}
              >
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Size">
              <select
                aria-label="Test size"
                value={size}
                onChange={(e) => setSize(e.target.value as ImageSize)}
                className={fieldClass}
                style={fieldStyle}
              >
                {IMAGE_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {SIZE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-4 mb-4">
            {IMAGE_QUALITIES.map((q) => (
              <label key={q} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={picked.includes(q)} onChange={() => togglePicked(q)} />
                {q}
              </label>
            ))}
            <Btn onClick={runTest} disabled={testing || picked.length === 0 || !prompt.trim()}>
              {testing ? "Generating..." : `Generate ${picked.length} image${picked.length === 1 ? "" : "s"}`}
            </Btn>
          </div>

          {results.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="image-test-results">
              {results.map((r) => (
                <div key={r.quality} className="rounded-lg border overflow-hidden" style={{ borderColor: C.border }}>
                  <div
                    className="aspect-square flex items-center justify-center text-xs"
                    style={{ backgroundColor: C.divider, color: C.muted }}
                  >
                    {r.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.url} alt={`${r.quality} quality test`} className="w-full h-full object-contain" />
                    ) : r.running ? (
                      "Generating..."
                    ) : (
                      (r.error ?? "No image")
                    )}
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 text-xs">
                    <b>{r.quality}</b>
                    <span style={{ color: C.muted }}>
                      {r.costUsd != null ? penceFromUsd(r.costUsd) : "..."}
                      {r.ms != null ? ` · ${(r.ms / 1000).toFixed(1)}s` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardBody>
      <CardFooter>
        Stored in app_settings.image_generation · read by every AI image within a minute of saving
      </CardFooter>
      {toastNode}
    </Card>
  );
}
