import { TriangleAlert } from "lucide-react";
import RiskAssessmentForm from "@/app/components/forms/RiskAssessmentForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function RiskAssessmentPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <RiskAssessmentForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<TriangleAlert className="w-5 h-5 text-blue-600" />}

          title="Risk Assessment"
          description="This tool can be used to help write risk assessments for a trip. Simply provide the year group, trip destination and mode of transport and Jooma will draft a risk assessment. Please always review and modify the output to ensure it is accurate and adequate for your trip."
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
