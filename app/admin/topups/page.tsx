import { requireSection } from "../access";
import TopupsView, {
  type RecentTopup,
  type TopupPack,
  type TopupSummary,
} from "./TopupsView";
import { type PricingRule } from "../plans/PlansView";

export const dynamic = "force-dynamic";

// The top-up rules live in the same pricing_rules table as the plan rules;
// this page shows the subset that governs top-up behaviour.
const TOPUP_RULE_KEYS = [
  "topups_expire",
  "offer_topup_at_zero",
  "suggest_upgrade",
  "offer_free_images",
  "school_self_topup",
];

export default async function AdminTopupsPage() {
  const { supabase } = await requireSection("see_money");

  const [{ data: packs }, { data: summary }, { data: rules }, { data: recent }] =
    await Promise.all([
      supabase.rpc("admin_topup_packs"),
      supabase.rpc("admin_topup_summary"),
      supabase.rpc("admin_pricing_rules"),
      // Purchases as they happened, so a real payment is visible here even if it
      // never resolved to a pack.
      supabase.rpc("admin_recent_topups", { p_limit: 50 }),
    ]);

  return (
    <TopupsView
      packs={(packs ?? []) as TopupPack[]}
      summary={((summary ?? [])[0] ?? null) as TopupSummary | null}
      rules={((rules ?? []) as PricingRule[]).filter((r) => TOPUP_RULE_KEYS.includes(r.key))}
      recent={(recent ?? []) as RecentTopup[]}
    />
  );
}
