import { requireSection } from "../access";
import TeamView, { type MatrixRow, type TeamMember } from "./TeamView";

export const dynamic = "force-dynamic";

export default async function AdminTeamPage() {
  const { supabase } = await requireSection("see_admin");

  const [{ data: members }, { data: matrix }, { data: can }] = await Promise.all([
    supabase.rpc("admin_team_members"),
    supabase.rpc("admin_role_matrix"),
    supabase.rpc("admin_can", { p_permission: "manage_admins" }),
  ]);

  return (
    <TeamView
      members={(members ?? []) as TeamMember[]}
      matrix={(matrix ?? []) as MatrixRow[]}
      canManage={can === true}
    />
  );
}
