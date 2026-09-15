import { requireSection } from "../access";
import ActivityView, { type RunRow } from "./ActivityView";

export const dynamic = "force-dynamic";

export default async function AdminActivityPage() {
  const { supabase } = await requireSection("see_admin");
  const { data } = await supabase.rpc("admin_recent_runs", { lim: 100 });

  return <ActivityView rows={(data ?? []) as RunRow[]} />;
}
