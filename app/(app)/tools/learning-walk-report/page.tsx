import { Footprints } from "lucide-react";
import LearningWalkReportForm from "@/app/components/forms/LearningWalkReportForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function LearningWalkReportPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <LearningWalkReportForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<Footprints className="w-5 h-5 text-rose-600" />}

          title="Learning Walk Report"
          description="This tool can be used to draft a report from a learning walk. Simply enter the focus of the walk, the strengths and areas for development you observed, and Jooma will draft the report."
          steps={[
            { label: "Enter your observations", detail: "Be specific and detailed when entering notes on strengths and areas for development." },
            { label: "Add optional elements", detail: "Include professional recommendations and a next steps timeline if needed.", optional: true },
            { label: "Generate", detail: "Get a professional learning walk report ready to share or adapt." },
          ]}
        />
      }
    />
  );
}
