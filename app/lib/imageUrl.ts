// Pure URL string transforms for Supabase Storage images.
//
// Split out of imageStorage.ts so client components can import it. That module
// creates a Supabase client at module scope; importing it from the browser to
// reach one string function would pull @supabase/supabase-js and a second
// GoTrue instance into the bundle for nothing. imageStorage now also imports
// sharp (a native module), so client code must import from here, never there.
//
// No "use client" and no imports — safe from either side.
//
// !! IMAGE TRANSFORMATION IS ON IN PRODUCTION, NOT ON STAGING.
// On staging the /render/image/ endpoint this function rewrites to answers
//   403 {"error":"FeatureNotEnabled","message":"feature not enabled for this tenant"}
// for every object, in every bucket. Verified against both `images` and
// `avatars` with real uploaded files. Production serves it (checked Oct 2026).
//
// So any <img> pointed at a transformed URL fails to load. Avatar used to do
// this and it made avatar uploads look broken: the file uploaded fine, the
// image 403'd, and the onError fallback quietly showed the initials placeholder
// — indistinguishable from "nothing happened". Avatar now uses the raw public
// URL. MiniSlide's thumbnails still call this and are presumably failing the
// same way; that predates the profile work and is untouched here.
//
// Before using this anywhere new, either enable transformations on the project
// or don't.

/** Rewrites a Supabase Storage public URL to its image-transformation
 *  endpoint at a smaller width, so thumbnails don't pull the full-size source.
 *  Non-Supabase URLs and data URLs pass through unchanged. Width is rounded to
 *  the next 100 to maximise CDN cache hits.
 *
 *  `resize=contain` is what keeps the shape. With `width` alone the endpoint
 *  falls back to `cover` and keeps the source's HEIGHT: a 1024x1024 picture
 *  asked for at width=200 came back 200x1024. MiniSlide then draws it at the
 *  picture's saved natural size, so every thumbnail was squashed sideways.
 *  `contain` with only a width scales both sides (3120x2336 -> 200x150).
 *  `fill` is worse still, and `cover` needs a height we don't have.
 *
 *  Supabase URL shape:
 *    .../storage/v1/object/public/<bucket>/<path>
 *  Transformed shape:
 *    .../storage/v1/render/image/public/<bucket>/<path>?width=N&resize=contain&quality=75
 */
export function toThumbnailUrl(src: string | undefined, targetWidth: number): string | undefined {
  if (!src) return src;
  if (!/^https?:\/\//i.test(src)) return src;
  if (!src.includes("/storage/v1/object/public/")) return src;
  const w = Math.max(100, Math.min(1280, Math.ceil(targetWidth / 100) * 100));
  const transformed = src.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
  const sep = transformed.includes("?") ? "&" : "?";
  return `${transformed}${sep}width=${w}&resize=contain&quality=75`;
}

/** The small copy of a theme background, for thumbnails.
 *
 *  Theme backgrounds are full-size PNGs in public/scenes (about 2 MB each),
 *  which the Supabase rewrite above cannot shrink because they are not in
 *  Storage. scripts/make-scene-thumbs.mjs writes a 768px WebP of each to
 *  public/scenes/thumbs, and this maps one path to the other. Anything else
 *  passes through unchanged.
 *
 *    /scenes/paper.png  ->  /scenes/thumbs/paper.webp */
export function sceneThumbUrl(src: string | undefined): string | undefined {
  if (!src) return src;
  const m = /^\/scenes\/([^/]+)\.png$/.exec(src);
  return m ? `/scenes/thumbs/${m[1]}.webp` : src;
}
