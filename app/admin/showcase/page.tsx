import { requireSection } from "../access";
import ShowcaseView, { type ShowcaseRow } from "./ShowcaseView";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "rejected", "withdrawn"] as const;
type Status = (typeof STATUSES)[number];

/**
 * The "Made with Jooma" queue. Teachers opt in after a generation; nothing
 * reaches the landing page until someone here approves it. A teacher who
 * withdraws later drops off the page without anyone having to act.
 */
export default async function AdminShowcasePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { supabase } = await requireSection("see_content");
  const { status } = await searchParams;
  const current: Status = (STATUSES as readonly string[]).includes(status ?? "")
    ? (status as Status)
    : "pending";

  const { data, error } = await supabase.rpc("admin_list_showcase", { p_status: current });

  return (
    <ShowcaseView
      status={current}
      rows={(data ?? []) as ShowcaseRow[]}
      loadError={error ? error.message : null}
    />
  );
}
