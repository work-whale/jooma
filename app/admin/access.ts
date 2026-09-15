import "server-only";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/app/lib/auth/admin";
import { landingPath } from "./sections";

// landingPath and sectionsOf live in ./sections, which imports nothing from the
// server. They are re-exported here so every page keeps importing from one
// place, while the unit runner (which cannot resolve "server-only") can still
// reach the pure loop-prevention rules.
export { landingPath, sectionsOf } from "./sections";

// Which part of the console a role may see.
//
// requireAdmin() answers "is this an admin at all", which was the whole gate
// until now. This answers the second question: which sections. The database is
// the authority (admin_console_access reads role_permissions), so changing what
// a role sees is a toggle on the Team page, not a deploy.
//
// STILL NOT THE SECURITY BOUNDARY. Hiding a page stops it being found, not
// reached. Every admin_* RPC re-checks is_admin() for itself, and the API
// routes check a permission through requireAdminRoute(). This layer is what
// makes the console coherent for someone who should only see one part of it.

export interface AdminAccess {
  role: string | null;
  permissions: string[];
  can: (permission: string) => boolean;
}

/**
 * The caller's role and permissions, in one round trip.
 *
 * Fails CLOSED: if the RPC errors, permissions come back empty and the console
 * renders an empty sidebar rather than the whole thing. The same discipline as
 * usePermissions on the client. A console that shows too little during an
 * outage is recoverable; one that shows too much is not.
 */
export async function adminAccess() {
  const { supabase, user } = await requireAdmin();

  const { data, error } = await supabase.rpc("admin_console_access");
  if (error) {
    console.error("[admin] could not read console access", error);
  }

  const row = (data ?? [])[0] as { role?: string; permissions?: string[] } | undefined;
  const permissions = row?.permissions ?? [];

  const access: AdminAccess = {
    role: row?.role ?? null,
    permissions,
    can: (permission: string) => permissions.includes(permission),
  };

  return { supabase, user, access };
}

/**
 * Gate a page on one section permission.
 *
 * Redirects to wherever this role does belong, which is never back to a page
 * they cannot see. Pages that would be the redirect TARGET (stats, no-access)
 * must not call this: they check `access.can()` and render inline instead, so
 * the only redirect edge points away from /admin and a cycle is impossible.
 */
export async function requireSection(permission: string) {
  const { supabase, user, access } = await adminAccess();
  if (!access.can(permission)) redirect(landingPath(access.permissions));
  return { supabase, user, access };
}
