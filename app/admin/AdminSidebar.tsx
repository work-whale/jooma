"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Activity,
  CreditCard,
  Presentation,
  ArrowLeft,
} from "lucide-react";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/usage", label: "Usage", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/activity", label: "Activity", icon: Activity },
  { href: "/admin/revenue", label: "Revenue", icon: CreditCard },
  { href: "/admin/presentations", label: "Presentations", icon: Presentation },
] as const;

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="shrink-0 w-60 min-h-screen border-r flex flex-col"
      style={{ backgroundColor: "#FAF9F5", borderColor: "#DAD8D0" }}
    >
      <div className="px-5 py-5">
        <p className="text-lg font-bold tracking-tight" style={{ color: "#1a1a1a" }}>
          Jooma Admin
        </p>
      </div>

      <nav className="flex-1 px-3 space-y-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          // Exact match for the overview root; prefix match for the rest so a
          // sub-route still highlights its section.
          const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
              style={
                active
                  ? { backgroundColor: "#1a1a1a", color: "#fff" }
                  : { color: "#4a423a" }
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t" style={{ borderColor: "#EEECE4" }}>
        <Link
          href="/tools"
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-black/5"
          style={{ color: "#8a8078" }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to app
        </Link>
      </div>
    </aside>
  );
}
