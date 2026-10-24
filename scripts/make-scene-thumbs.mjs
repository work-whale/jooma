/*
 * Small copies of the slide theme backgrounds, for thumbnails.
 *
 *   node scripts/make-scene-thumbs.mjs
 *
 * WHY THIS EXISTS
 *
 * The theme backgrounds in public/scenes are full-size PNGs, 1.7 to 2.3 MB
 * each, drawn as a CSS background so nothing resizes them. A thumbnail drew the
 * same file: the homepage's "Made with Jooma" cards, 384px wide, downloaded
 * about 8 MB of backgrounds between them (measured Oct 2026), most of the
 * page's image weight. MiniSlide in thumbnail mode now asks for
 * public/scenes/thumbs/<name>.webp instead (see sceneThumbUrl in
 * app/lib/imageUrl.ts).
 *
 * 768px wide covers the largest thumbnail (384px) on a 2x screen. Run it again
 * after adding or changing a scene; tests/unit/scene-thumbs.spec.ts fails if a
 * scene has no thumbnail.
 */
import { readdirSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SCENES = join(process.cwd(), "public", "scenes");
const THUMBS = join(SCENES, "thumbs");
const WIDTH = 768;

mkdirSync(THUMBS, { recursive: true });

let before = 0;
let after = 0;
for (const name of readdirSync(SCENES)) {
  if (!name.endsWith(".png")) continue;
  const src = join(SCENES, name);
  const out = join(THUMBS, name.replace(/\.png$/, ".webp"));
  await sharp(src).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 72 }).toFile(out);
  before += statSync(src).size;
  after += statSync(out).size;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`Scene thumbnails: ${mb(before)} of PNG became ${mb(after)} of WebP.`);
