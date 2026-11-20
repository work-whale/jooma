// Starred tools on the Make page and in the sidebar (they replaced pins).
//
// Pure, so the rules are unit tested without a browser: see
// tests/unit/favourites.spec.ts. The store that reads and writes the profile
// is app/lib/useFavouriteTools.ts.
//
// THE NULL / EMPTY DISTINCTION carries the whole design. profiles.favourite_tools
// is null for a teacher who has never starred anything, and they get the
// defaults. Once they touch a star the list is saved, so a teacher who unstars
// all three defaults gets an empty list and the defaults never come back.

/** Starred for everyone until they change it. */
export const DEFAULT_FAVOURITES = [
  "/tools/slideshow",
  "/tools/worksheet-generator",
  "/tools/comprehension-generator",
] as const;

/** Matches the check constraint on profiles.favourite_tools. */
export const MAX_FAVOURITES = 50;

const HREF = /^\/tools\/[a-z0-9-]+$/;

/** The shape the database accepts: one /tools/<slug> link. */
export function isFavouriteHref(value: unknown): value is string {
  return typeof value === "string" && HREF.test(value);
}

function clean(list: unknown, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const href of list) {
    if (isFavouriteHref(href) && known.has(href) && !out.includes(href)) out.push(href);
  }
  return out;
}

/**
 * The stars to show.
 *
 * `stored` is the profile column (null when never set). `legacyPins` is what
 * the old browser-only pin store held: it is carried over once, after the
 * defaults, the first time an account has no list of its own. `known` is every
 * tool that still exists, so a removed tool quietly drops out.
 */
export function resolveFavourites(stored: unknown, legacyPins: unknown, known: readonly string[]): string[] {
  const knownSet = new Set(known);
  if (Array.isArray(stored)) return clean(stored, knownSet);
  return clean([...DEFAULT_FAVOURITES, ...(Array.isArray(legacyPins) ? legacyPins : [])], knownSet);
}

/** Star or unstar one tool. New stars go at the end; the input is untouched. */
export function toggleFavourite(list: readonly string[], href: string): string[] {
  if (list.includes(href)) return list.filter((h) => h !== href);
  if (!isFavouriteHref(href) || list.length >= MAX_FAVOURITES) return [...list];
  return [...list, href];
}
