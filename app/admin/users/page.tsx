import { requireAdmin } from "@/app/lib/auth/admin";
import { nf } from "../format";
import AdminTeachersTable, { type TeacherRow } from "./AdminTeachersTable";
import AdminTeachersHeaderActions from "./AdminTeachersHeaderActions";
import PendingInvites, { type PendingInvite } from "./PendingInvites";
import IncompleteSignups, { type IncompleteSignup } from "./IncompleteSignups";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const { supabase } = await requireAdmin();
  const [{ data }, { data: invites }, { data: incomplete }] = await Promise.all([
    supabase.rpc("admin_users"),
    supabase.rpc("admin_pending_invites"),
    // Accounts that are in neither of the two lists above — signed up, never
    // finished onboarding. Normally empty. See IncompleteSignups.tsx.
    supabase.rpc("admin_incomplete_signups"),
  ]);
  const rows = (data ?? []) as TeacherRow[];

  return (
    <>
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "#1D1730" }}>
            Teachers
          </h1>
          <p className="text-sm" style={{ color: "#6D6683" }}>
            {nf.format(rows.length)} {rows.length === 1 ? "teacher" : "teachers"}. Resources reset
            monthly; AI images have no cap yet.
          </p>
        </div>
        <AdminTeachersHeaderActions />
      </div>

      <PendingInvites invites={(invites ?? []) as PendingInvite[]} />
      <IncompleteSignups rows={(incomplete ?? []) as IncompleteSignup[]} />
      <AdminTeachersTable rows={rows} />
    </>
  );
}
