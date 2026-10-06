// Offering a resource for the landing page's "Made with Jooma" row, from
// anywhere a teacher has it: the prompt after a generation, and the Library.
//
// Every write goes through set_showcase_consent(), which checks ownership and
// reads the card's title, subject and year from the resource itself. Nothing
// the client sends reaches the landing page except the yes or no.
import { createClient } from "@/app/lib/auth/client";
import type { ToolRun } from "@/app/lib/toolRuns";

export type ShowcaseKind = "slides" | "comprehension" | "worksheet";
export type ShowcaseStatus =
  "pending" | "approved" | "rejected" | "withdrawn" | "declined";

/** The tools the row can show, by the slug a Library row carries. */
const KIND_BY_SLUG: Record<string, ShowcaseKind> = {
  slideshow: "slides",
  "comprehension-generator": "comprehension",
  "worksheet-generator": "worksheet",
};

/**
 * What to offer for a Library row, or null when it cannot go on the homepage.
 *
 * A deck is shared by its presentation, not its run: the run is only the
 * Library's pointer to it, and the presentation is what /made renders. An old
 * deck run with no presentation id has nothing to point at.
 */
export function showcaseTarget(
  run: Pick<ToolRun, "id" | "tool_slug" | "input">,
): { kind: ShowcaseKind; resourceId: string } | null {
  const kind = KIND_BY_SLUG[run.tool_slug];
  if (!kind) return null;
  if (kind !== "slides") return { kind, resourceId: run.id };
  const presentationId = run.input?.presentationId;
  return typeof presentationId === "string" && presentationId
    ? { kind, resourceId: presentationId }
    : null;
}

/** The teacher's own answers so far, keyed by presentation or run id. Their
 *  own rows only, by the "showcase own read" policy. */
export async function myShowcaseStatuses(): Promise<
  Map<string, ShowcaseStatus>
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("showcase_items")
    .select("presentation_id, tool_run_id, status");
  if (error) throw error;
  const out = new Map<string, ShowcaseStatus>();
  for (const row of data ?? []) {
    const id = (row.presentation_id ?? row.tool_run_id) as string | null;
    if (id) out.set(id, row.status as ShowcaseStatus);
  }
  return out;
}

/** Yes queues it for review; no withdraws it from wherever it got to. */
export async function setShowcaseConsent(
  kind: ShowcaseKind,
  resourceId: string,
  consent: boolean,
): Promise<ShowcaseStatus> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("set_showcase_consent", {
    p_kind: kind,
    p_resource_id: resourceId,
    p_consent: consent,
  });
  if (error) throw error;
  return data as ShowcaseStatus;
}
