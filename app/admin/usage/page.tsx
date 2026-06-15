import { requireAdmin } from "@/app/lib/auth/admin";
import { typeLabel } from "@/app/lib/toolRunDisplay";
import { nf, usd } from "../format";

export const dynamic = "force-dynamic";

interface Row {
  tool_slug: string;
  generations: number;
  total_tokens: number;
  text_cost_usd: number;
  asset_cost_usd: number;
  cost_usd: number;
}

const perGen = (cost: number, gens: number) => (gens > 0 ? cost / gens : cost);

export default async function AdminUsagePage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_tool_usage_report");
  const rows = (data ?? []) as Row[];

  const totals = rows.reduce(
    (a, r) => ({
      generations: a.generations + Number(r.generations),
      cost_usd: a.cost_usd + Number(r.cost_usd),
    }),
    { generations: 0, cost_usd: 0 },
  );
  const totalEach = perGen(totals.cost_usd, totals.generations);
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1a1a1a" }}>
        Usage
      </h1>
      <p className="text-sm mb-6" style={{ color: "#8a8078" }}>
        Cost per tool across all users for {month}, with per-generation cost and 10x / 100x
        projections. Text from exact token counts; images and audio priced per unit.
      </p>

      {rows.length === 0 ? (
        <div
          className="rounded-2xl p-6 border text-sm"
          style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0", color: "#6b6055" }}
        >
          No generations yet this month.
        </div>
      ) : (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "#8a8078" }} className="text-left">
                <th className="font-semibold px-4 py-3">Tool</th>
                <th className="font-semibold px-4 py-3 text-right">Generations</th>
                <th className="font-semibold px-4 py-3 text-right">Total</th>
                <th className="font-semibold px-4 py-3 text-right">Average per gen</th>
                <th className="font-semibold px-4 py-3 text-right">Average per 10</th>
                <th className="font-semibold px-4 py-3 text-right">~100x</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const each = perGen(Number(r.cost_usd), Number(r.generations));
                return (
                  <tr key={r.tool_slug} className="border-t" style={{ borderColor: "#EEECE4" }}>
                    <td className="px-4 py-3 font-medium" style={{ color: "#1a1a1a" }}>
                      {typeLabel(r.tool_slug)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                      {nf.format(Number(r.generations))}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                      {usd(Number(r.cost_usd))}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                      {usd(each)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                      {usd(each * 10)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                      {usd(each * 100)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2" style={{ borderColor: "#DAD8D0" }}>
                <td className="px-4 py-3 font-bold" style={{ color: "#1a1a1a" }}>
                  Total
                </td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                  {nf.format(totals.generations)}
                </td>
                <td className="px-4 py-3 text-right font-bold" style={{ color: "#1a1a1a" }}>
                  {usd(totals.cost_usd)}
                </td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                  {usd(totalEach)}
                </td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                  {usd(totalEach * 10)}
                </td>
                <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                  {usd(totalEach * 100)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
