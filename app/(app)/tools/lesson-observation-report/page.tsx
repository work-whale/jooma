import { Eye } from "lucide-react";
import LessonObservationReportForm from "@/app/components/forms/LessonObservationReportForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function LessonObservationReportPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <LessonObservationReportForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<Eye className="w-5 h-5 text-rose-600" />}

          title="Lesson Observation Report"
          description="This tool can be used to write up a lesson observation. Simply enter your notes on the details of the lesson, the strengths and areas for development, and Jooma will draft a formal report."
          steps={[
            { label: "Enter your observation notes", detail: "Be specific about strengths and areas for development. The more detail, the more accurate the report." },
            { label: "Add optional elements", detail: "Include an action plan or follow-up support suggestions if needed.", optional: true },
            { label: "Generate", detail: "Get a formal lesson observation report ready to share or adapt." },
          ]}
        />
      }
    />
  );
}
