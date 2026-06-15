import { requireAdmin } from "@/app/lib/auth/admin";
import AdminSidebar from "./AdminSidebar";

// Gates the whole /admin subtree on the is_admin flag and renders the sidenav
// shell. Non-admins are redirected by requireAdmin before any child page runs.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#F1EFE3" }}>
      <AdminSidebar />
      <main className="flex-1 min-w-0 px-8 py-10">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
