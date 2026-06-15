import { requireAdmin } from "@/app/lib/auth/admin";
import { nf, usd, fmtDate } from "../format";

export const dynamic = "force-dynamic";

interface UserRow {
  id: string;
  email: string;
  first_name: string | null;
  surname: string | null;
  plan: string | null;
  subscription_status: string | null;
  is_admin: boolean;
  created_at: string;
  generations: number;
  cost_usd: number;
}

const PLAN_STYLE: Record<string, { bg: string; color: string }> = {
  free: { bg: "#EEECE4", color: "#8a8078" },
  pro: { bg: "#DDF0E2", color: "#1f6b3b" },
  school: { bg: "#E2E8F5", color: "#2a4a8a" },
};

export default async function AdminUsersPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_users");
  const rows = (data ?? []) as UserRow[];

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1a1a1a" }}>
        Users
      </h1>
      <p className="text-sm mb-6" style={{ color: "#8a8078" }}>
        {nf.format(rows.length)} {rows.length === 1 ? "user" : "users"}. Generations and cost are
        lifetime totals.
      </p>

      <div
        className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "#8a8078" }} className="text-left">
              <th className="font-semibold px-4 py-3">User</th>
              <th className="font-semibold px-4 py-3">Plan</th>
              <th className="font-semibold px-4 py-3">Joined</th>
              <th className="font-semibold px-4 py-3 text-right">Generations</th>
              <th className="font-semibold px-4 py-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const name = [u.first_name, u.surname].filter(Boolean).join(" ");
              const plan = u.plan ?? "free";
              const ps = PLAN_STYLE[plan] ?? PLAN_STYLE.free;
              return (
                <tr key={u.id} className="border-t" style={{ borderColor: "#EEECE4" }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: "#1a1a1a" }}>
                        {name || u.email}
                      </span>
                      {u.is_admin && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "#1a1a1a", color: "#fff" }}
                        >
                          ADMIN
                        </span>
                      )}
                    </div>
                    {name && (
                      <div className="text-xs" style={{ color: "#8a8078" }}>
                        {u.email}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-full capitalize"
                      style={{ backgroundColor: ps.bg, color: ps.color }}
                    >
                      {plan}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "#6b6055" }}>
                    {fmtDate(u.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "#6b6055" }}>
                    {nf.format(Number(u.generations))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold" style={{ color: "#1a1a1a" }}>
                    {usd(Number(u.cost_usd))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
