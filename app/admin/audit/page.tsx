import { requireSection } from "../access";
import AuditTable, { type AuditRow, type ActorRow } from "./AuditTable";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const { supabase } = await requireSection("see_admin");

  const [{ data: rows }, { data: actors }] = await Promise.all([
    supabase.rpc("admin_audit_log_list", { q: null, actor: null, p_type: null, lim: 100, off: 0 }),
    supabase.rpc("admin_audit_actors"),
  ]);

  return (
    <AuditTable
      initialRows={(rows ?? []) as AuditRow[]}
      actors={(actors ?? []) as ActorRow[]}
    />
  );
}
