import Link from "next/link";
import { requireAdmin } from "@/app/lib/auth/admin";
import { nf, usd } from "./format";

export const dynamic = "force-dynamic";

interface Overview {
  total_users: number;
  new_users_this_month: number;
  paid_users: number;
  generations_this_month: number;
  cost_this_month: number;
  presentations_total: number;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: "#8a8078" }}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: "#1a1a1a" }}>
        {value}
      </p>
      {hint && (
        <p className="text-xs mt-1" style={{ color: "#8a8078" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

export default async function AdminOverviewPage() {
  const { supabase } = await requireAdmin();
  const { data } = await supabase.rpc("admin_overview");
  const o = (data?.[0] ?? {}) as Partial<Overview>;
  const month = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1a1a1a" }}>
        Overview
      </h1>
      <p className="text-sm mb-6" style={{ color: "#8a8078" }}>
        Snapshot for {month}.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Stat label="Total users" value={nf.format(Number(o.total_users ?? 0))} />
        <Stat label="New this month" value={nf.format(Number(o.new_users_this_month ?? 0))} />
        <Stat label="Paid users" value={nf.format(Number(o.paid_users ?? 0))} />
        <Stat
          label="Generations this month"
          value={nf.format(Number(o.generations_this_month ?? 0))}
        />
        <Stat label="Cost this month" value={usd(Number(o.cost_this_month ?? 0))} />
        <Stat label="Presentations" value={nf.format(Number(o.presentations_total ?? 0))} />
      </div>

      <div className="flex flex-wrap gap-3 mt-6">
        <Link
          href="/admin/usage"
          className="text-sm font-semibold rounded-xl px-4 py-2 text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: "#1a1a1a" }}
        >
          View usage & cost
        </Link>
        <Link
          href="/admin/users"
          className="text-sm font-semibold rounded-xl px-4 py-2 border transition-colors hover:bg-black/5"
          style={{ borderColor: "#DAD8D0", color: "#1a1a1a" }}
        >
          Manage users
        </Link>
      </div>
    </>
  );
}
