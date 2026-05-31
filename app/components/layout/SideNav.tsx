"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import { BiSolidDashboard } from "react-icons/bi";
import { FaPenNib } from "react-icons/fa";
import { RiFolder6Fill } from "react-icons/ri";
import { MdAssistant } from "react-icons/md";
import { useState, useEffect } from "react";
import { TOOLS } from "@/app/lib/tools";
import ToolIcon from "@/app/components/ToolIcon";
import { TAG_COLORS } from "@/app/lib/toolRunDisplay";

const PIN_STORAGE_KEY = "jooma:pinned-tools";

const NAV = [
  { label: "Dashboard", icon: BiSolidDashboard, href: "/dashboard" },
  { label: "Tools", icon: FaPenNib, href: "/" },
  { label: "Folders", icon: RiFolder6Fill, href: "/folders" },
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

  // Pinned tools — shares the same localStorage key the Tools page writes to.
  const [pinnedHrefs, setPinnedHrefs] = useState<string[]>([]);
  useEffect(() => {
    const read = () => {
      try {
        const stored = localStorage.getItem(PIN_STORAGE_KEY);
        setPinnedHrefs(stored ? JSON.parse(stored) : []);
      } catch {
        setPinnedHrefs([]);
      }
    };
    read();
    // Reflect pin/unpin made in another tab.
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  const pinnedTools = pinnedHrefs
    .map((href) => TOOLS.find((t) => t.href === href))
    .filter((t): t is (typeof TOOLS)[number] => Boolean(t));

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
          const active = href === "/"
            ? (pathname === "/" || pathname.startsWith("/tools"))
            : (pathname === href || pathname.startsWith(`${href}/`));
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

      {/* Pinned tools — pinned from the Tools page */}
      {pinnedTools.length > 0 && (
        collapsed ? (
          <div className="mt-4 flex flex-col items-center gap-1">
            {pinnedTools.map((tool) => {
              const colors = TAG_COLORS[tool.tag] ?? { icon: "text-gray-600" };
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  title={tool.label}
                  className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <ToolIcon name={tool.icon} className={`w-4 h-4 ${colors.icon}`} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl p-4" style={{ backgroundColor: "#FAF9F5" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted">Pinned tools</span>
              <Pin className="w-3.5 h-3.5 text-muted" />
            </div>
            <div className="space-y-0.5">
              {pinnedTools.map((tool) => {
                const colors = TAG_COLORS[tool.tag] ?? { icon: "text-gray-600" };
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <ToolIcon name={tool.icon} className={`w-4 h-4 shrink-0 ${colors.icon}`} />
                    <span className="text-sm font-medium truncate">{tool.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )
      )}
    </aside>
  );
}
