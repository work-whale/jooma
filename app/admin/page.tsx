import { redirect } from "next/navigation";
import { adminAccess, landingPath } from "./access";
import { loadTrueMrr } from "./trueMrr";
import DashboardView, {
  type CostRow,
  type DashboardStats,
  type NeedsAttentionRow,
  type SignupRow,
} from "./DashboardView";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const { supabase, access } = await adminAccess();

  // /admin is the dashboard, and not every role can see it. Marketing lands on
  // Stats instead. This is the ONLY redirect in the console that moves someone
  // between sections, and it always points away from here, never back: the
  // pages it targets check their own permission and render inline if it fails,
  // so there is no pair of pages that can bounce a request between them.
  if (!access.can("see_overview")) redirect(landingPath(access.permissions));

  const [{ data: stats }, { data: attention }, { data: signups }, { data: costs }, { data: mrrRows }] =
    await Promise.all([
      supabase.rpc("admin_dashboard"),
      supabase.rpc("admin_needs_attention"),
      supabase.rpc("admin_signups_by_month", { months: 6 }),
      supabase.rpc("admin_cost_breakdown"),
      // Which subscriptions the SQL counted as genuinely paying. The live
      // total has to be taken over exactly these, or the headline and the
      // tiles beside it describe different people — which is what made the
      // dashboard read GBP 46.95 next to "1 paying teacher".
      supabase.rpc("teacher_mrr"),
    ]);

  const payingSubIds =
    ((mrrRows ?? [])[0] as { paying_sub_ids?: string[] } | undefined)?.paying_sub_ids ?? [];

  // Never rejects: returns { gbp: null, error } when Stripe cannot be read, and
  // the view falls back to the list-price figure from SQL. Sequential because
  // it needs the ids above.
  const trueMrr = await loadTrueMrr(payingSubIds);

  return (
    <DashboardView
      stats={((stats ?? [])[0] ?? null) as DashboardStats | null}
      attention={(attention ?? []) as NeedsAttentionRow[]}
      signups={(signups ?? []) as SignupRow[]}
      costs={(costs ?? []) as CostRow[]}
      trueMrr={trueMrr}
    />
  );
}
