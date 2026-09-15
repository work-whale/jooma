import { requireSection } from "../access";
import InboxView, { type CannedReply, type SupportSummary, type ThreadRow } from "./InboxView";

export const dynamic = "force-dynamic";

export default async function AdminInboxPage({
  searchParams,
}: {
  // ?thread= lets other pages deep-link to one conversation — the Teachers
  // drawer's "Open inbox" points here at that teacher's newest thread.
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread } = await searchParams;
  const { supabase, user } = await requireSection("see_support");

  const [{ data: threads }, { data: canned }, { data: summary }] = await Promise.all([
    supabase.rpc("admin_threads", { p_status: null, p_filter: null, q: null }),
    supabase.rpc("admin_canned_replies"),
    supabase.rpc("admin_support_summary"),
  ]);

  return (
    <InboxView
      initialThreads={(threads ?? []) as ThreadRow[]}
      canned={(canned ?? []) as CannedReply[]}
      summary={((summary ?? [])[0] ?? null) as SupportSummary | null}
      currentUserId={user.id}
      initialOpenId={thread ?? null}
    />
  );
}
