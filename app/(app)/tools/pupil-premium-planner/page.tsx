import { TrendingUp } from "lucide-react";
import PupilPremiumPlannerForm from "@/app/components/forms/PupilPremiumPlannerForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function PupilPremiumPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <PupilPremiumPlannerForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<TrendingUp className="w-5 h-5 text-rose-600" />}

          title="Pupil Premium Planner"
          description="This tool can be used to suggest Tier 1, 2, and 3 (as defined in the DfE Pupil Premium Guidance) strategies to support disadvantaged students receiving funding. Simply enter the challenge(s), up to 3, you are aiming to tackle."
          steps={[
            { label: "Enter your challenges", detail: "Be specific. Provide important additional context about the challenges your students face." },
            { label: "Generate strategies", detail: "Get evidence-based Tier 1, 2, and 3 strategies aligned with DfE guidance and EEF research." },
            { label: "Review and apply", detail: "Use the strategies to inform your Pupil Premium funding decisions." },
          ]}
        />
      }
    />
  );
}
