"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAppShell } from "@/app/components/v2/AppShellContext";
import { JoActivityProvider } from "@/app/lib/JoActivityContext";
import JoActivityPanel from "@/app/components/assistant/JoActivityPanel";

const ROUTE_LABELS: Record<string, string> = {
  "/tools/lesson-planner": "Lesson Planner",
  "/tools/worksheet-generator": "Worksheet Generator",
  "/tools/comprehension-generator": "Comprehension Generator",
  "/tools/cover-lesson": "Cover Lesson Generator",
  "/tools/topic-overview": "Topic Overview",
  "/tools/medium-term-planner": "Medium Term Planner",
  "/tools/eyfs-planner": "EYFS Planner",
  "/tools/model-text-generator": "Model Text Generator",
  "/tools/sensory-activities": "Sensory Activities",
  "/tools/phonics-support": "Phonics Support",
  "/tools/exam-question-generator": "Exam Question Generator",
  "/tools/model-answer-generator": "Model Answer Generator",
  "/tools/homework-generator": "Homework Generator",
  "/tools/targeted-intervention": "Targeted Intervention Ideas",
  "/tools/quiz-generator": "Quiz Generator",
  "/tools/report-writer": "Report Writer",
  "/tools/smart-targets": "SMART Targets",
  "/tools/lesson-slideshow": "Lesson Slideshow Generator",
  "/tools/cpd-slideshow": "CPD Slideshow Generator",
  "/tools/policy-generator": "Policy Generator",
  "/tools/one-page-profile": "One Page Support Profile",
  "/tools/risk-assessment": "Risk Assessment",
  "/tools/behaviour-support-plan": "Individual Student Behaviour Plan",
  "/tools/ect-report-writer": "ECT Report Writer",
  "/tools/eyfs-action-plan": "EYFS Action Plan",
  "/tools/inspection-prep": "Inspection Prep Questions",
  "/tools/learning-walk-report": "Learning Walk Report",
  "/tools/lesson-observation-report": "Lesson Observation Report",
  "/tools/meeting-planner": "Meeting Planner",
  "/tools/performance-management": "Performance Management Targets",
  "/tools/letter-writer": "Letter Writer",
  "/tools/pupil-premium-planner": "Pupil Premium Planner",
  "/tools/assembly-planner": "Assembly Planner",
  "/tools/newsletter-writer": "Newsletter Writer",
  "/tools/school-improvement-plan": "School Improvement Plans",
};

/*
 * The chrome for an individual tool page.
 *
 * The shell itself lives in app/(app)/layout.tsx and is shared with every other
 * signed-in screen, so this only declares the parts that are specific to a tool
 * page: its title, its content well, and the back link.
 *
 * The /tools index is excluded because ToolsGrid declares its own title. A hook
 * cannot be called conditionally, so the branch is a separate component rather
 * than an early return.
 */
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The index sets its own chrome; only the individual tool pages get the
  // back link and the tool's name in the top bar.
  if (pathname === "/tools") {
    return <>{children}</>;
  }

  return <ToolPageChrome pathname={pathname}>{children}</ToolPageChrome>;
}

function ToolPageChrome({
  pathname,
  children,
}: {
  pathname: string;
  children: React.ReactNode;
}) {
  useAppShell({
    title: ROUTE_LABELS[pathname] ?? "Tools",
    contentClassName: "grow flex flex-col px-4 sm:px-6 lg:px-10 pb-16",
  });

  // The panel is a sibling of the content well, not part of it: it has to
  // outlive the fill and sit beside the form rather than inside its grid. The
  // provider wraps both, so useToolLaunch (inside the form) can publish to a
  // panel that is not its descendant. This layout is never remounted between
  // tool pages, so the panel survives the form remounting beneath it.
  return (
    <JoActivityProvider>
      <div className="pb-4 shrink-0">
        <Link href="/tools" className="flex items-center gap-1.5 text-sm text-muted hover:text-gray-700 transition-colors w-fit">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to tools
        </Link>
      </div>
      {/* data-jo-form marks the region the fill's interrupt listener watches.
          None of the 35 forms is a real <form> element, so without this the
          listener has nothing to scope itself to and would have to watch the
          whole document — which is exactly the bug that let one click anywhere
          in the app cancel a fill. */}
      <div className="grow" data-jo-form="">
        {children}
      </div>
      <JoActivityPanel />
    </JoActivityProvider>
  );
}
