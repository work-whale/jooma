import { requireSection } from "../access";
import { loadFxRate } from "@/app/lib/fx";
import PlansView, { type PlanRow, type PricingRule } from "./PlansView";

export const dynamic = "force-dynamic";

export default async function AdminPlansPage() {
  const { supabase } = await requireSection("see_money");

  const [{ data: plans }, { data: rules }, fx] = await Promise.all([
    supabase.rpc("admin_plans"),
    supabase.rpc("admin_pricing_rules"),
    // Every cost figure on this page is a USD cost converted at this rate, so
    // the page says which rate and how old it is rather than presenting the
    // numbers as timeless.
    loadFxRate(),
  ]);

  return (
    <PlansView
      plans={(plans ?? []) as PlanRow[]}
      rules={(rules ?? []) as PricingRule[]}
      fx={fx}
    />
  );
}
