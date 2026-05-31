import {
  MdMenuBook, MdCalendarMonth, MdAssignment, MdCheckBox, MdGridView,
  MdLightbulb, MdEdit, MdEmojiPeople, MdTextFields, MdFactCheck,
  MdHelp, MdDesktopMac, MdEmail, MdAccessTime, MdDateRange,
  MdVisibility, MdTrendingUp, MdSearch, MdAssignmentTurnedIn,
  MdDescription, MdPlaylistAdd, MdWarning, MdBadge, MdShowChart,
  MdNewspaper, MdGroups, MdBarChart, MdSecurity, MdTrackChanges,
  MdSummarize, MdHomeWork, MdPersonSearch, MdCopyAll, MdSchool, MdSlideshow,
} from "react-icons/md";

// Maps a TOOLS entry's `icon` field to a react-icons component. Shared by the
// Tools grid (app/page.tsx) and the SideNav pinned-tools panel.
export const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
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
  "lesson-slideshow": MdSlideshow,
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
  "presentation": MdSlideshow,
};

export default function ToolIcon({ name, className }: { name: string; className?: string }) {
  const Icon = TOOL_ICONS[name];
  if (!Icon) return null;
  return <Icon className={className} />;
}
