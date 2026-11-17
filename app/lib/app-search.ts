import type { V2Tool } from "./tools";

/*
 * The top bar's search, the pure half: which tools match, and the escaped
 * pattern for the library title lookup.
 */

const MAX_TOOLS = 5;

/** Tools whose name, old name or description contains the query. Name matches
 *  first, then the rest; at most five; tools hidden for this teacher dropped. */
export function matchTools(
  query: string,
  tools: readonly V2Tool[],
  isHidden: (slug: string) => boolean,
): V2Tool[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const byName: V2Tool[] = [];
  const byRest: V2Tool[] = [];
  for (const tool of tools) {
    if (isHidden(tool.href.replace("/tools/", ""))) continue;
    const names = [tool.name, ...tool.synonyms].map((n) => n.toLowerCase());
    if (names.some((n) => n.includes(q))) byName.push(tool);
    else if (tool.description.toLowerCase().includes(q) || tool.tag.toLowerCase().includes(q)) byRest.push(tool);
  }
  return [...byName, ...byRest].slice(0, MAX_TOOLS);
}

/** "%text%" for an ILIKE, with %, _ and the escape character itself escaped.
 *  Null for a blank query, so nothing is fetched. */
export function ilikeContains(query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
