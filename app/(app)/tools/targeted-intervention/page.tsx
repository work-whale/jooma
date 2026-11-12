import { Target } from "lucide-react";
import TargetedInterventionForm from "@/app/components/forms/TargetedInterventionForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function TargetedInterventionPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <TargetedInterventionForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<Target className="w-5 h-5 text-orange-500" />}

          title="Targeted Intervention Ideas"
          description="Generate personalised, evidence-based intervention strategies to close the gap for individual students — based on the attitudinal, aptitudinal, and attainment data you have."
          steps={[
            { label: "Describe the pupil", detail: "Give attitudes, scores and needs, never surnames or other children's names. A first name, if you add one, stays on your device." },
            { label: "Generate strategies", detail: "Get 8 to 10 practical strategies, each with steps, who runs it, how often and how you will know it is working." },
            { label: "Edit and export", detail: "Edit on the page or ask Jo, then print or download as a PDF or Word document." },
          ]}
        />
      }
    />
  );
}
