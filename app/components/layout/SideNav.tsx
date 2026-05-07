"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BiSolidDashboard } from "react-icons/bi";
import { FaPenNib } from "react-icons/fa";
import { RiFolder6Fill } from "react-icons/ri";
import { MdAssistant } from "react-icons/md";
import { useState } from "react";

const NAV = [
  { label: "Dashboard", icon: BiSolidDashboard, href: "#" },
  { label: "Tools", icon: FaPenNib, href: "/" },
  { label: "Folders", icon: RiFolder6Fill, href: "#" },
  { label: "AI assistant", icon: MdAssistant, href: "#" },
];

export default function SideNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sidenav-collapsed") === "true";
  });

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem("sidenav-collapsed", String(!c));
      return !c;
    });
  };

  return (
    <aside
      className={`shrink-0 flex flex-col h-screen sticky top-0 py-8 transition-all duration-300 ${collapsed ? "w-18 px-3" : "w-64 px-6"}`}
      style={{ borderRight: "1px solid #DAD8D0" }}
    >
      <div className="flex items-center justify-between mb-10">
        <span
          className="text-xl font-extrabold overflow-hidden whitespace-nowrap transition-all duration-300"
          style={{ color: "#4a4a4a", maxWidth: collapsed ? "0px" : "160px", opacity: collapsed ? 0 : 1 }}
        >
          Jooma
        </span>
        <button
          onClick={toggle}
          className="p-2 border border-line rounded-lg hover:bg-gray-100 transition-colors shrink-0 cursor-pointer"
        >
          {collapsed
            ? <ChevronRight className="w-4 h-4 text-muted" />
            : <ChevronLeft className="w-4 h-4 text-muted" />
          }
        </button>
      </div>

      <nav className="space-y-1 grow">
        {NAV.map(({ label, icon: Icon, href }) => {
          const active = href === "/" ? (pathname === "/" || pathname.startsWith("/tools")) : pathname === href;
          const isDisabled = href === "#";

          if (isDisabled) {
            return (
              <div key={label} className="relative group/nav">
                <div className="flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-2xl text-gray-400 opacity-50 cursor-not-allowed">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="overflow-hidden whitespace-nowrap transition-all duration-300" style={{ maxWidth: collapsed ? "0px" : "160px", opacity: collapsed ? 0 : 1 }}>{label}</span>
                </div>
                <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-xs text-white opacity-0 group-hover/nav:opacity-100 transition-opacity z-10">
                  {collapsed ? label : "Coming soon"}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-2xl transition-colors ${active ? "bg-[#1a1a1a] text-white" : "text-gray-700 hover:bg-gray-100"}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="overflow-hidden whitespace-nowrap transition-all duration-300" style={{ maxWidth: collapsed ? "0px" : "160px", opacity: collapsed ? 0 : 1 }}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
