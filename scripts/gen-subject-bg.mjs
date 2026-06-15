// One-time generator for the subject-theme background art (math / science /
// history / english). Run once; the PNGs are committed to /public/scenes and
// reused on every deck — NEVER generated per-deck. Mirrors the scenic themes.
//
//   node scripts/gen-subject-bg.mjs            # all four
//   node scripts/gen-subject-bg.mjs math       # just one
//
// Tries gpt-image-1 (better), falls back to dall-e-3 if the org isn't verified.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "scenes");

// Load OPENAI_API_KEY from .env.local / .env (no dotenv dep).
function loadKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  for (const f of [".env.local", ".env"]) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*OPENAI_API_KEY\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  }
  throw new Error("OPENAI_API_KEY not found in env or .env.local");
}
const KEY = loadKey();

// Shared style: soft flat-vector illustration, light & airy, motifs pushed to
// the edges so the centre stays clear for dark text. No text/letters/numbers
// (AI renders them as gibberish). Palette tuned to each theme.
const STYLE =
  "Soft flat-vector editorial illustration, gentle muted pastel palette, clean and calm. " +
  "Arrange the motifs around the edges and corners as a light border, leaving the central area bright, " +
  "airy and uncluttered so dark text placed on top stays perfectly legible. " +
  "Subtle paper-grain texture, smooth gradients, no harsh contrast, no outlines too dark. " +
  "Absolutely no text, no words, no letters, no numbers. Full-bleed, seamless, no frame, no border lines.";

// Brighter, saturated, playful style for the subject VARIATIONS — still keeps a
// light, clear centre so dark text stays legible.
const STYLE_VIBRANT =
  "Bright, vibrant, playful flat-vector illustration, bold saturated colours, cheerful and energetic, fun modern classroom feel. " +
  "Arrange the colourful motifs around the edges and corners as a lively border, leaving the central area light, " +
  "bright and uncluttered so dark text placed on top stays perfectly legible. " +
  "Smooth gradients, clean rounded shapes, no harsh dark outlines across the centre. " +
  "Absolutely no text, no words, no letters, no numbers. Full-bleed, seamless, no frame, no border lines.";

const SUBJECTS = {
  math: {
    file: "math.png",
    prompt:
      "A mathematics classroom theme background. Motifs: geometric shapes (triangles, circles, " +
      "hexagons), a ruler and protractor, a drawing compass, faint graph-paper grid lines, gentle " +
      "abstract geometric diagrams. Indigo, periwinkle and soft blue palette on a very light cool-white background.",
  },
  science: {
    file: "science.png",
    prompt:
      "A science classroom theme background. Motifs: atoms with orbiting electrons, simple molecule " +
      "diagrams, laboratory beakers and a round-bottom flask, a DNA double helix, a leaf and a few bubbles. " +
      "Teal, sea-green and aqua palette on a very light mint-white background.",
  },
  history: {
    file: "history.png",
    prompt:
      "A history classroom theme background. Motifs: classical Greek columns and a temple pediment, an " +
      "unrolled parchment scroll, an amphora vase, an antique compass rose, a feather and a sundial. " +
      "Warm sepia, parchment tan and bronze palette on a very light cream background.",
  },
  english: {
    file: "english.png",
    prompt:
      "An English literature classroom theme background. Motifs: open books, stacked books, a quill pen " +
      "with an inkwell, drifting feathers and pages, a bookmark ribbon and gentle swirling ink flourishes. " +
      "Warm cream, soft burgundy and dusty rose palette on a very light ivory background.",
  },

  // ── Vibrant subject variations (3 per subject) ───────────────────────────
  "math-pop": {
    file: "math-pop.png", style: STYLE_VIBRANT,
    prompt: "A fun, vibrant mathematics theme background. Motifs: playful geometric confetti — triangles, circles and squares — plus bold plus, minus, multiply and divide symbols scattered around the edges. Bright coral-red, sunshine yellow and teal palette on a very light peach background.",
  },
  "math-neon": {
    file: "math-neon.png", style: STYLE_VIBRANT,
    prompt: "A vibrant, energetic mathematics theme background. Motifs: bold geometric shapes, a glowing graph grid, a protractor and a compass arranged around the edges. Electric violet, bright cyan and magenta palette on a very light cool-white background.",
  },
  "math-citrus": {
    file: "math-citrus.png", style: STYLE_VIBRANT,
    prompt: "A bright, cheerful mathematics theme background. Motifs: rulers, a drawing compass, a protractor and bold geometric shapes around the edges. Zesty orange, lime green and teal palette on a very light cream-green background.",
  },
  "science-pop": {
    file: "science-pop.png", style: STYLE_VIBRANT,
    prompt: "A fun, vibrant science theme background. Motifs: laboratory beakers and flasks filled with bright colourful liquids, bubbles, and atoms with orbiting electrons around the edges. Bright teal-green, hot magenta and cyan palette on a very light mint background.",
  },
  "science-cosmic": {
    file: "science-cosmic.png", style: STYLE_VIBRANT,
    prompt: "A vibrant cosmic science theme background. Motifs: atoms with orbits, planets, stars and a small rocket scattered around the edges. Bold purple, bright pink and electric blue palette on a very light lavender background.",
  },
  "science-botanic": {
    file: "science-botanic.png", style: STYLE_VIBRANT,
    prompt: "A bright, fresh biology theme background. Motifs: leaves, a DNA double helix, a microscope and blooming flowers around the edges. Vivid leaf-green, coral and aqua palette on a very light leaf-cream background.",
  },
  "history-pop": {
    file: "history-pop.png", style: STYLE_VIBRANT,
    prompt: "A fun, vibrant history theme background. Motifs: classical columns, an amphora vase, a scroll and a sundial in bold flat colours around the edges. Bright terracotta-orange, teal and gold palette on a warm light cream background.",
  },
  "history-explorer": {
    file: "history-explorer.png", style: STYLE_VIBRANT,
    prompt: "A vibrant adventure history theme background. Motifs: an old treasure map, a compass rose, a sailing ship and a treasure chest around the edges. Bright turquoise, coral and warm sand palette on a very light parchment background.",
  },
  "history-royal": {
    file: "history-royal.png", style: STYLE_VIBRANT,
    prompt: "A vibrant regal history theme background. Motifs: crowns, a castle, royal shields and scrolls around the edges. Rich royal purple, bright gold and crimson palette on a very light cream background.",
  },
  "english-storybook": {
    file: "english-storybook.png", style: STYLE_VIBRANT,
    prompt: "A whimsical, vibrant English storytelling theme background. Motifs: open storybooks, a quill pen, speech bubbles and little stars around the edges. Warm coral, sky blue and sunny yellow palette on a soft light cream background.",
  },
  "english-comic": {
    file: "english-comic.png", style: STYLE_VIBRANT,
    prompt: "A bold comic-book English theme background. Motifs: comic speech bubbles, big playful book shapes and small action bursts with bold rounded outlines around the edges. Comic red, bright blue and yellow palette on a very light background.",
  },
  "english-poetry": {
    file: "english-poetry.png", style: STYLE_VIBRANT,
    prompt: "A whimsical, vibrant English poetry theme background. Motifs: quills, drifting feathers, flowing ink swirls and open books around the edges. Soft lavender-purple, mint green and pink palette on a very light lilac-cream background.",
  },
};

async function genGptImage(prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024",
      quality: "medium",
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`gpt-image-1 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return Buffer.from(json.data[0].b64_json, "base64");
}

async function genDalle(prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: "dall-e-3",
      prompt,
      size: "1792x1024",
      quality: "standard",
      response_format: "b64_json",
      n: 1,
    }),
  });
  if (!res.ok) throw new Error(`dall-e-3 ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return Buffer.from(json.data[0].b64_json, "base64");
}

async function generate(key) {
  const s = SUBJECTS[key];
  const prompt = `${s.prompt}\n\n${s.style ?? STYLE}`;
  let buf;
  try {
    process.stdout.write(`[${key}] gpt-image-1… `);
    buf = await genGptImage(prompt);
    console.log("ok");
  } catch (e) {
    console.log(`failed (${String(e.message).slice(0, 120)}) → dall-e-3`);
    buf = await genDalle(prompt);
  }
  const out = join(OUT_DIR, s.file);
  writeFileSync(out, buf);
  console.log(`[${key}] saved ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
}

const which = process.argv.slice(2);
const keys = which.length ? which : Object.keys(SUBJECTS);
for (const k of keys) {
  if (!SUBJECTS[k]) { console.error(`unknown subject: ${k}`); continue; }
  await generate(k);
}
console.log("done.");
