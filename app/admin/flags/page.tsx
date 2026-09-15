import { requireSection } from "../access";
import FlagsView, { type FlagRow, type FlagSummary } from "./FlagsView";

export const dynamic = "force-dynamic";

export default async function AdminFlagsPage() {
  const { supabase } = await requireSection("see_product");

  const [{ data: flags }, { data: summary }] = await Promise.all([
    supabase.rpc("admin_safeguarding_flags", { p_status: null }),
    supabase.rpc("admin_safeguarding_summary"),
  ]);

  return (
    <FlagsView
      rows={(flags ?? []) as FlagRow[]}
      summary={((summary ?? [])[0] ?? null) as FlagSummary | null}
    />
  );
}
