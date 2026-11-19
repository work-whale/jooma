import { ClipboardList } from "lucide-react";
import BehaviourSupportPlanForm from "@/app/components/forms/BehaviourSupportPlanForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function BehaviourSupportPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <BehaviourSupportPlanForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<ClipboardList className="w-5 h-5 text-emerald-600" />}

          title="Individual Student Behaviour Plan"
          description="Create a comprehensive Individual Student Behaviour Plan. Enter details about the student's behaviours, triggers, and strengths and Jooma will generate a full plan with strategies, targets, and monitoring guidance."
          steps={[
            { label: "Describe the behaviour", detail: "Detail what it looks like, how often it occurs, and its impact." },
            { label: "Identify triggers and strengths", detail: "Include as many triggers as possible, plus the student's strengths and interests for a positive, strengths-based approach." },
            { label: "Generate", detail: "Get a full plan with strategies, targets, de-escalation guidance, and monitoring tools." },
          ]}
        />
      }
    />
  );
}
