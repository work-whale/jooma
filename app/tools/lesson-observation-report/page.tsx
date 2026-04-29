import { Eye } from "lucide-react";
import LessonObservationReportForm from "@/app/components/forms/LessonObservationReportForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function LessonObservationReportPage() {
  return (
    <LessonObservationReportForm
      sidebar={
        <ToolInfoPanel
          icon={<Eye className="w-5 h-5 text-rose-600" />}
          heroBg="bg-rose-50"
          title="Lesson Observation Report"
          description="This tool can be used to write up a lesson observation. Simply enter your notes on the details of the lesson, the strengths and areas for development, and the AI will draft a formal report."
          steps={[
            { label: "Enter your observation notes", detail: "Be specific about strengths and areas for development — the more detail, the more accurate the report." },
            { label: "Add optional elements", detail: "Include an action plan or follow-up support suggestions if needed.", optional: true },
            { label: "Generate", detail: "Get a formal lesson observation report ready to share or adapt." },
          ]}
        />
      }
    />
  );
}
