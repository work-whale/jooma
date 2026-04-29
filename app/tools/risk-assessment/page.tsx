import { TriangleAlert } from "lucide-react";
import RiskAssessmentForm from "@/app/components/forms/RiskAssessmentForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function RiskAssessmentPage() {
  return (
    <RiskAssessmentForm
      sidebar={
        <ToolInfoPanel
          icon={<TriangleAlert className="w-5 h-5 text-blue-600" />}
          heroBg="bg-blue-50"
          title="Risk Assessment"
          description="This tool can be used to help write risk assessments for a trip. Simply provide the year group, trip destination and mode of transport and the AI will draft a risk assessment. Please always review and modify the output to ensure it is accurate and adequate for your trip."
          steps={[
            { label: "Enter activity details", detail: "Be specific when describing the activity to get a better output." },
            { label: "Generate", detail: "Get a risk assessment with hazards, likelihood, severity, control measures, and further actions." },
            { label: "Review and modify", detail: "Always review and modify the output to ensure it is accurate for your specific trip." },
          ]}
        />
      }
    />
  );
}
