import { TrendingUp } from "lucide-react";
import SchoolImprovementPlanForm from "@/app/components/forms/SchoolImprovementPlanForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function SchoolImprovementPlanPage() {
  return (
    <SchoolImprovementPlanForm
      sidebar={
        <ToolInfoPanel
          icon={<TrendingUp className="w-5 h-5 text-rose-600" />}
          heroBg="bg-rose-50"
          title="School Improvement Plans"
          description="This tool can be used to draft a SIP based on a set of areas for development. The AI will generate the SIP either as a table, or in narrative form. The AI will identify priority objectives and present a detailed actionable school improvement plan."
          steps={[
            { label: "Enter areas for development", detail: "Be specific when entering areas for development." },
            { label: "Choose output format", detail: "Select table or narrative form for your SIP." },
            { label: "Generate", detail: "Get a detailed, inspection-ready SIP with objectives, action steps, timelines, budget, and monitoring." },
          ]}
        />
      }
    />
  );
}
