"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Pin } from "lucide-react";
import { useState } from "react";
import { TOOLS } from "@/app/lib/tools";
import ToolIcon from "@/app/components/ToolIcon";
import { usePinnedTools } from "@/app/lib/usePinnedTools";

const NAV = [
  { label: "Dashboard", icon: "/icons/dashboard.svg", href: "/dashboard" },
  { label: "Tools", icon: "/icons/tools.svg", href: "/tools" },
  { label: "Folders", icon: "/icons/folders.svg", href: "/folders" },
  { label: "AI assistant", icon: "/icons/ai-assistant.svg", href: "#" },
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

  // Pinned tools — shared store, kept in sync with the Tools page live.
  const pinnedHrefs = usePinnedTools();

  const pinnedTools = pinnedHrefs
    .map((href) => TOOLS.find((t) => t.href === href))
    .filter((t): t is (typeof TOOLS)[number] => Boolean(t));

  return (
    <aside
      className={`shrink-0 flex flex-col h-screen sticky top-0 py-8 transition-all duration-300 ${collapsed ? "w-18 px-3" : "w-64 px-6"}`}
      style={{ borderRight: "1px solid #DAD8D0" }}
    >
      <div className="flex items-center justify-between mb-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo/logo.svg"
          alt="Jooma"
          className="overflow-hidden transition-all duration-300 shrink-0"
          style={{ height: 32, width: "auto", maxWidth: collapsed ? "0px" : "130px", opacity: collapsed ? 0 : 1 }}
        />
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
        {NAV.map(({ label, icon, href }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          const isDisabled = href === "#";

          // CSS filter normalises any icon colour: dark bg → white, light bg → black
          const iconFilter = active
            ? "brightness(0) invert(1)"
            : "brightness(0)";

          if (isDisabled) {
            return (
              <div key={label} className="relative group/nav">
                <div className="flex items-center gap-3 px-4 py-3 text-sm font-semibold rounded-2xl text-gray-400 opacity-50 cursor-not-allowed">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={icon} alt="" width={18} height={18} className="shrink-0" style={{ filter: "brightness(0) opacity(0.4)" }} />
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={icon} alt="" width={18} height={18} className="shrink-0" style={{ filter: iconFilter }} />
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
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  title={tool.label}
                  className="hover:opacity-80 transition-opacity"
                >
                  <ToolIcon name={tool.icon} className="w-10 h-10" />
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
                return (
                  <Link
                    key={tool.href}
                    href={tool.href}
                    className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <ToolIcon name={tool.icon} className="w-8 h-8 shrink-0" />
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
