import { LayoutList } from "lucide-react";
import MediumTermPlannerForm from "@/app/components/forms/MediumTermPlannerForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function MediumTermPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <MediumTermPlannerForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<LayoutList className="w-5 h-5 text-blue-600" />}

          title="Medium Term Topic Planner"
          description="This tool generates a medium term plan for a sequence of lessons on a given topic. Provide the subject, topic and number of lessons and Jooma will create a structured plan showing learning objectives, lesson summaries and key knowledge for each lesson."
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
