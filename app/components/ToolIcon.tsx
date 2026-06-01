/* eslint-disable @next/next/no-img-element */

const TOOL_ICON_PATHS: Record<string, string> = {
  "comprehension":          "/icons/tool-comprehension-generator.svg",
  "planner":                "/icons/tool-lesson-plans.svg",
  "worksheet":              "/icons/tool-worksheets.svg",
  "cover-lesson":           "/icons/tool-cover-lesson-generator.svg",
  "topic":                  "/icons/tool-topic-overview.svg",
  "medium-term":            "/icons/tool-medium-term-planner.svg",
  "eyfs":                   "/icons/tool-eyfs-planner.svg",
  "model-text":             "/icons/tool-modelled-text.svg",
  "sensory":                "/icons/tool-sensory-activities.svg",
  "phonics":                "/icons/tool-phonics-support.svg",
  "exam":                   "/icons/tool-assessment-generator.svg",
  "model-answer":           "/icons/tool-assessment-planner.svg",
  "homework":               "/icons/tool-homework-generator.svg",
  "intervention":           "/icons/tool-intervention-planning.svg",
  "quiz":                   "/icons/tool-quiz-generator.svg",
  "report":                 "/icons/tool-report-writer.svg",
  "smart-targets":          "/icons/tool-smart-targets.svg",
  "cpd-slideshow":          "/icons/tool-cdp-slideshow.svg",
  "policy":                 "/icons/tool-policy-guide.svg",
  "one-page-profile":       "/icons/tool-one-page-profile.svg",
  "risk-assessment":        "/icons/tool-assessment-planner.svg",
  "behaviour-support-plan": "/icons/tool-individual-behaviour-plan.svg",
  "ect-report":             "/icons/tool-ect-report-writer.svg",
  "eyfs-action-plan":       "/icons/tool-eyfs-action-planner.svg",
  "inspection-prep":        "/icons/tool-inspection-preparation.svg",
  "learning-walk":          "/icons/tool-learning-walk-report.svg",
  "lesson-observation":     "/icons/tool-lesson-observation-report.svg",
  "meeting-planner":        "/icons/tool-meeting-planner.svg",
  "performance-management": "/icons/tool-appraisal-management-targets.svg",
  "letter-writer":          "/icons/tool-letter-writer.svg",
  "pupil-premium":          "/icons/tool-pupil-premium-planner.svg",
  "assembly":               "/icons/tool-meeting-planner.svg",
  "newsletter":             "/icons/tool-newsletter-writer.svg",
  "sip":                    "/icons/tool-school-improvement-plan.svg",
  "presentation":           "/icons/tool-slideshow.svg",
};

export const TOOL_ICONS = TOOL_ICON_PATHS;

export default function ToolIcon({ name, className }: { name: string; className?: string }) {
  const src = TOOL_ICON_PATHS[name];
  if (!src) return null;
  const sizeClass = (className ?? "")
    .split(" ")
    .filter((c) => !c.startsWith("text-"))
    .join(" ");
  return <img src={src} alt="" className={sizeClass} />;
}
