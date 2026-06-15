import { requireAdmin } from "@/app/lib/auth/admin";
import { PLANS, asPlanId } from "@/app/lib/plans";
import { nf, usd } from "../format";

export const dynamic = "force-dynamic";

interface PlanRow {
  plan: string;
  users: number;
  active_subscribers: number;
}

export default async function AdminRevenuePage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_plan_breakdown");
  const rows = (data ?? []) as PlanRow[];

  // Monthly recurring revenue estimate = active subscribers × the plan's monthly
  // price. School is custom-priced (null) so it contributes nothing here.
  const mrr = rows.reduce((sum, r) => {
    const price = PLANS[asPlanId(r.plan)].priceMonthly ?? 0;
    return sum + Number(r.active_subscribers) * price;
  }, 0);
  const totalActive = rows.reduce((s, r) => s + Number(r.active_subscribers), 0);

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1a1a1a" }}>
        Revenue
      </h1>
      <p className="text-sm mb-6" style={{ color: "#8a8078" }}>
        Subscription breakdown by plan. {nf.format(totalActive)} active{" "}
        {totalActive === 1 ? "subscriber" : "subscribers"}
        {mrr > 0 ? ` · ~${usd(mrr)} MRR (estimated)` : ""}.
      </p>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "#8a8078" }} className="text-left">
              <th className="font-semibold px-4 py-3">Plan</th>
              <th className="font-semibold px-4 py-3 text-right">Users</th>
              <th className="font-semibold px-4 py-3 text-right">Active subscribers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.plan} className="border-t" style={{ borderColor: "#EEECE4" }}>
                <td className="px-4 py-3 font-medium capitalize" style={{ color: "#1a1a1a" }}>
                  {PLANS[asPlanId(r.plan)]?.name ?? r.plan}
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                  {nf.format(Number(r.users))}
                </td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                  {nf.format(Number(r.active_subscribers))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs mt-4" style={{ color: "#8a8078" }}>
        MRR is an estimate: active subscribers × plan price. Use Stripe for authoritative revenue.
      </p>
    </>
  );
}
