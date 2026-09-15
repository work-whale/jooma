import { requireSection } from "../access";
import EnquiriesView, { type EnquiryRow } from "./EnquiriesView";

// Same shape as every other admin section: a server component does the fetch, a
// client component does the rendering, and the row type is exported from the
// view.
export const dynamic = "force-dynamic";

export default async function AdminEnquiriesPage({
  searchParams,
}: {
  // ?id= deep-links one enquiry, so a link pasted into Slack opens the right
  // record rather than the top of the list.
  searchParams: Promise<{ id?: string; kind?: string }>;
}) {
  const { id, kind } = await searchParams;
  const { supabase, user } = await requireSection("see_support");

  const [{ data: rows }, { data: summary }] = await Promise.all([
    supabase.rpc("admin_enquiries", {
      p_kind: kind ?? null,
      p_status: null,
      q: null,
    }),
    supabase.rpc("admin_enquiry_summary"),
  ]);

  return (
    <EnquiriesView
      initialRows={(rows ?? []) as EnquiryRow[]}
      summary={((summary ?? [])[0] ?? null) as {
        new_count: number;
        in_progress_count: number;
        school_new: number;
        contact_new: number;
      } | null}
      initialKind={kind ?? ""}
      initialOpenId={id ?? null}
      currentUserId={user.id}
    />
  );
}
