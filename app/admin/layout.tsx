import { adminAccess } from "./access";
import AdminSidebar from "./AdminSidebar";

// Gates the whole /admin subtree on the is_admin flag and renders the sidenav
// shell. Non-admins are redirected by requireAdmin before any child page runs.
//
// adminAccess() also reads the caller's section permissions, which decide which
// sidebar groups exist for them. One RPC rather than eight admin_can calls:
// this layout renders on every navigation in the console.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { supabase, access } = await adminAccess();

  // Live nav counts. Kept to things that represent work waiting on someone —
  // an inbox badge means "reply to these", not "here are some tickets".
  // Failures are swallowed: a missing count must never take down the shell.
  //
  // Each is skipped when the viewer cannot see the section it badges. Without
  // that, a marketing admin fires three queries on every page load to count
  // work for nav items their sidebar does not contain.
  const badges: Record<string, number> = {};

  if (access.can("see_support")) {
    const { data: support } = await supabase.rpc("admin_support_summary");
    const open = Number(support?.[0]?.open_count ?? 0);
    if (open > 0) badges["/admin/inbox"] = open;

    // Unanswered enquiries only. One that someone has already picked up is not
    // a thing the badge should keep nagging about.
    const { data: enquiries } = await supabase.rpc("admin_enquiry_summary");
    const fresh = Number(enquiries?.[0]?.new_count ?? 0);
    if (fresh > 0) badges["/admin/enquiries"] = fresh;
  }

  if (access.can("see_product")) {
    const { data: flags } = await supabase.rpc("admin_safeguarding_summary");
    const awaiting = Number(flags?.[0]?.awaiting_review ?? 0);
    if (awaiting > 0) badges["/admin/flags"] = awaiting;
  }

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#F7F5FC" }}>
      <AdminSidebar badges={badges} permissions={access.permissions} />
      <main className="flex-1 min-w-0 px-8 py-10">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
