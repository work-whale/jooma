// Where the three free tools live for an account with nothing in force.
import "server-only";
import { redirect } from "next/navigation";
import { trialAccount } from "./guest";
import { heroIdFor, type GuestToolSlug } from "./guest-tools";
import { decodePrefill } from "./toolPrefill";

/** The free tool's page, with any topic carried over. */
export function freeToolPath(slug: GuestToolSlug, topic?: string | null): string {
  const clean = topic?.trim().slice(0, 200);
  return `/free-tools?tool=${heroIdFor(slug)}${clean ? `&topic=${encodeURIComponent(clean)}` : ""}`;
}

/**
 * Sends a locked account from one of the three real tool pages to its free
 * version, which is the one that can generate for them.
 *
 * Not when they are reopening a saved run: a former subscriber looking at
 * something they already made belongs on the real page.
 */
export async function redirectIfLocked(
  slug: GuestToolSlug,
  launch: { run?: string; prefill?: string },
): Promise<void> {
  if (launch.run) return;
  const account = await trialAccount();
  if (!account?.locked) return;
  const fields = decodePrefill(launch.prefill)?.fields as
    | { topic?: unknown; learningObjective?: unknown }
    | undefined;
  const topic = fields?.topic ?? fields?.learningObjective;
  redirect(freeToolPath(slug, typeof topic === "string" ? topic : null));
}
