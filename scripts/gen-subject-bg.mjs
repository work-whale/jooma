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
  const prompt = `${s.prompt}\n\n${STYLE}`;
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
