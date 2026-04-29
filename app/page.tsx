"use client";

import Link from "next/link";
import { useState } from "react";
import { CiSearch } from "react-icons/ci";
import SideNav from "@/app/components/layout/SideNav";
import TopBar from "@/app/components/layout/TopBar";
import Card from "@/app/components/ui/Card";
import { TOOLS, PINNED_HREFS } from "@/app/lib/tools";
import {
  MdMenuBook, MdCalendarMonth, MdAssignment, MdCheckBox, MdGridView,
  MdLightbulb, MdEdit, MdEmojiPeople, MdTextFields, MdFactCheck,
  MdHelp, MdDesktopMac, MdEmail, MdAccessTime, MdDateRange,
  MdVisibility, MdTrendingUp, MdSearch, MdAssignmentTurnedIn,
  MdDescription, MdPlaylistAdd, MdWarning, MdBadge, MdShowChart,
  MdNewspaper, MdGroups, MdBarChart, MdSecurity, MdTrackChanges,
  MdSummarize, MdHomeWork, MdPersonSearch, MdCopyAll, MdSchool,
} from "react-icons/md";

const TAG_COLORS: Record<string, { bg: string; icon: string }> = {
  Planning: { bg: "bg-blue-100", icon: "text-blue-600" },
  Literacy: { bg: "bg-amber-100", icon: "text-amber-600" },
  Assessment: { bg: "bg-violet-100", icon: "text-violet-600" },
  "Early Years": { bg: "bg-emerald-100", icon: "text-emerald-600" },
  SEND: { bg: "bg-emerald-100", icon: "text-emerald-600" },
  Leadership: { bg: "bg-rose-100", icon: "text-rose-600" },
};

export default function Home() {
  const [query, setQuery] = useState("");

  const q = query.toLowerCase().trim();
  const pinned = TOOLS.filter((t) => PINNED_HREFS.includes(t.href));
  const rest = TOOLS.filter((t) => !PINNED_HREFS.includes(t.href));

  const filteredPinned = pinned.filter(
    (t) => !q || t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  );
  const filteredRest = rest.filter(
    (t) => !q || t.label.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  );

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#F1EFE3" }}>
      <SideNav />
      <main className="grow flex flex-col overflow-y-auto">
        <TopBar title="Tools" />

        <div className="px-10 pb-16 space-y-4">

          {/* Hero search */}
          <Card>
            <h3 className="text-2xl font-medium mb-5">What would you like to do?</h3>
            <div className="relative">
              <CiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a tool"
                className="w-full pl-12 pr-3 py-3 border border-[#F1EFE3] font-light rounded-2xl bg-white text-sm placeholder-[#A5A5A5] focus:outline-none focus:border-line transition-all"
              />
            </div>
          </Card>

          <Card className="p-10">
            {/* Pinned */}
            {filteredPinned.length > 0 && (
              <section className="mb-5">
                <div className="flex items-center gap-4 mb-5">
                  <h4 className="text-sm text-muted shrink-0">Pinned</h4>
                  <div className="h-px bg-muted/30 w-full" />
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))" }}>
                  {filteredPinned.map((tool) => <ToolCard key={tool.href} tool={tool} />)}
                </div>
              </section>
            )}

            {/* All tools */}
            {filteredRest.length > 0 && (
              <section>
                <div className="flex items-center gap-4 mb-5">
                  <h4 className="text-sm text-muted shrink-0">All tools</h4>
                  <div className="h-px bg-muted/30 w-full" />
                </div>
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))" }}>
                  {filteredRest.map((tool) => <ToolCard key={tool.href} tool={tool} />)}
                </div>
              </section>
            )}
          </Card>

          {filteredPinned.length === 0 && filteredRest.length === 0 && (
            <p className="text-sm text-muted text-center py-16">No tools match your search.</p>
          )}
        </div>
      </main>
    </div>
  );
}

function ToolCard({ tool }: { tool: typeof TOOLS[number] }) {
  const colors = TAG_COLORS[tool.tag] ?? { bg: "bg-gray-100", icon: "text-gray-600" };
  return (
    <Link
      href={tool.href}
      className="group flex gap-4 items-start p-5 border border-line rounded-2xl cursor-pointer hover:bg-[#F1EFE3] hover:border-[#F1EFE3]"
    >
      <div className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl transition-colors bg-[#F1EFE3] group-hover:bg-white">
        <ToolIcon name={tool.icon} className={`w-5 h-5 ${colors.icon}`} />
      </div>
      <div className="min-w-0">
        <h5 className="font-semibold text-md mb-0.5">{tool.label}</h5>
        <p className="text-sm text-muted font-light line-clamp-2">{tool.description}</p>
      </div>
    </Link>
  );
}

const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "cover-lesson": MdCopyAll,
  "comprehension": MdMenuBook,
  "planner": MdCalendarMonth,
  "worksheet": MdAssignment,
  "topic": MdCheckBox,
  "medium-term": MdGridView,
  "sensory": MdLightbulb,
  "model-text": MdEdit,
  "eyfs": MdEmojiPeople,
  "phonics": MdTextFields,
  "exam": MdSchool,
  "model-answer": MdFactCheck,
  "homework": MdHomeWork,
  "intervention": MdPersonSearch,
  "quiz": MdHelp,
  "cpd-slideshow": MdDesktopMac,
  "letter-writer": MdEmail,
  "performance-management": MdAccessTime,
  "meeting-planner": MdDateRange,
  "lesson-observation": MdVisibility,
  "learning-walk": MdTrendingUp,
  "inspection-prep": MdSearch,
  "eyfs-action-plan": MdAssignmentTurnedIn,
  "ect-report": MdDescription,
  "behaviour-support-plan": MdPlaylistAdd,
  "risk-assessment": MdWarning,
  "one-page-profile": MdBadge,
  "sip": MdShowChart,
  "newsletter": MdNewspaper,
  "assembly": MdGroups,
  "pupil-premium": MdBarChart,
  "policy": MdSecurity,
  "smart-targets": MdTrackChanges,
  "report": MdSummarize,
};

function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TOOL_ICONS[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}
