import { requireSection } from "../access";
import AnnounceView, { type AnnouncementRow } from "./AnnounceView";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncePage() {
  const { supabase } = await requireSection("see_content");
  const { data } = await supabase.rpc("admin_announcements");

  return <AnnounceView rows={(data ?? []) as AnnouncementRow[]} />;
}
