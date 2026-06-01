"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import SideNav from "@/app/components/layout/SideNav";
import TopBar from "@/app/components/layout/TopBar";

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

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // The /tools index (the tools grid) renders its own SideNav + TopBar, so let
  // it through untouched. Only the individual tool pages get the chrome below.
  if (pathname === "/tools") {
    return <>{children}</>;
  }

  const label = ROUTE_LABELS[pathname] ?? "Tools";

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "#F1EFE3" }}>
      <SideNav />
      <main className="grow flex flex-col min-h-screen">
        <TopBar title={label} />
        <div className="px-10 pb-4 shrink-0">
          <Link href="/tools" className="flex items-center gap-1.5 text-sm text-muted hover:text-gray-700 transition-colors w-fit">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to tools
          </Link>
        </div>
        <div className="grow px-10 pb-16">
          {children}
        </div>
      </main>
    </div>
  );
}
