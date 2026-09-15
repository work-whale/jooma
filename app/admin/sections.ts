import { SECTION_PERMISSIONS } from "@/app/lib/adminRoles";

// The pure half of the console's section logic.
//
// Deliberately free of "server-only", next/navigation and Supabase, so the unit
// runner can import it. access.ts holds everything that touches a request and
// re-exports these, which keeps the import site unchanged for pages while the
// loop-prevention rules stay testable without a browser or a database.

/** Landing order when someone cannot see the dashboard. First match wins, so
 *  this doubles as the priority order for "where does this role belong". */
const LANDING: { perm: string; path: string }[] = [
  { perm: "see_stats", path: "/admin/stats" },
  { perm: "see_people", path: "/admin/users" },
  { perm: "see_money", path: "/admin/plans" },
  { perm: "see_support", path: "/admin/inbox" },
  { perm: "see_product", path: "/admin/usage" },
  { perm: "see_content", path: "/admin/copy" },
  { perm: "see_admin", path: "/admin/team" },
];

/**
 * Where to send an admin who cannot see the page they asked for.
 *
 * Returns /admin/no-access rather than /admin when nothing matches: bouncing
 * someone to a page they also cannot see is the loop this exists to prevent.
 */
export function landingPath(permissions: string[]): string {
  const allowed = new Set(permissions);
  if (allowed.has("see_overview")) return "/admin";
  for (const { perm, path } of LANDING) {
    if (allowed.has(perm)) return path;
  }
  return "/admin/no-access";
}

/** Only the section permissions, in sidebar order. `see_teachers` and
 *  `see_deletions` are ACTION permissions that happen to start with `see_`, so
 *  filtering by prefix would quietly grant two sections that do not exist. */
export function sectionsOf(permissions: string[]): string[] {
  const allowed = new Set(permissions);
  return SECTION_PERMISSIONS.filter((p) => allowed.has(p));
}
