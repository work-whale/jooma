import { requireAdmin } from "@/app/lib/auth/admin";
import { typeLabel } from "@/app/lib/toolRunDisplay";
import { fmtDateTime } from "../format";

export const dynamic = "force-dynamic";

interface RunRow {
  id: string;
  email: string | null;
  tool_slug: string;
  title: string | null;
  created_at: string;
}

export default async function AdminActivityPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_recent_runs", { lim: 100 });
  const rows = (data ?? []) as RunRow[];

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1a1a1a" }}>
        Activity
      </h1>
      <p className="text-sm mb-6" style={{ color: "#8a8078" }}>
        The 100 most recent generations across all users.
      </p>

      {rows.length === 0 ? (
        <div
          className="rounded-2xl p-6 border text-sm"
          style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0", color: "#6b6055" }}
        >
          No activity yet.
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
                <th className="font-semibold px-4 py-3">Title</th>
                <th className="font-semibold px-4 py-3">User</th>
                <th className="font-semibold px-4 py-3 text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t" style={{ borderColor: "#EEECE4" }}>
                  <td className="px-4 py-3 font-medium" style={{ color: "#1a1a1a" }}>
                    {typeLabel(r.tool_slug)}
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate" style={{ color: "#6b6055" }}>
                    {r.title || "—"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "#6b6055" }}>
                    {r.email || "—"}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap" style={{ color: "#8a8078" }}>
                    {fmtDateTime(r.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
