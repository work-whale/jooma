import { LayoutList } from "lucide-react";
import MediumTermPlannerForm from "@/app/components/forms/MediumTermPlannerForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function MediumTermPlannerPage() {
  return (
    <MediumTermPlannerForm
      sidebar={
        <ToolInfoPanel
          icon={<LayoutList className="w-5 h-5 text-blue-600" />}
          heroBg="bg-blue-50"
          title="Medium Term Topic Planner"
          description="This tool generates a medium term plan for a sequence of lessons on a given topic. Provide the subject, topic and number of lessons and the AI will create a structured plan showing learning objectives, lesson summaries and key knowledge for each lesson."
          steps={[
            { label: "Be specific about your topic", detail: "Get the most relevant and targeted lesson sequence." },
            { label: "Set number of lessons", detail: "Match your actual teaching schedule for this unit." },
            { label: "Align to assessment", detail: "Optionally paste in exam specification content to align the plan to assessment requirements." },
          ]}
        />
      }
    />
  );
}
