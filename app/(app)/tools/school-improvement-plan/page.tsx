import { TrendingUp } from "lucide-react";
import SchoolImprovementPlanForm from "@/app/components/forms/SchoolImprovementPlanForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function SchoolImprovementPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <SchoolImprovementPlanForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<TrendingUp className="w-5 h-5 text-rose-600" />}

          title="School Improvement Plans"
          description="This tool can be used to draft a SIP based on a set of areas for development. Jooma will draft the SIP either as a table, or in narrative form. It will identify priority objectives and present a detailed actionable school improvement plan."
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
