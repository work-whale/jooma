import { Target } from "lucide-react";
import SmartTargetsForm from "@/app/components/forms/SmartTargetsForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function SmartTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <SmartTargetsForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<Target className="w-5 h-5 text-emerald-600" />}

          title="SMART Targets"
          description="This tool can be used to draft SMART targets for students. Simply provide the year group and the overall targets and let the AI draft the targets for you. Remember to review and adapt the output so it is fully applicable to your student."
          steps={[
            { label: "Enter your targets", detail: "Be as specific as you can, and keep surnames and other children's names out. A first name, if you add one, stays on your device." },
            { label: "Generate", detail: "Get fully structured SMART targets with specific, measurable, achievable, relevant, and time-bound criteria." },
            { label: "Review and adapt", detail: "Ensure the targets are fully applicable to your individual student." },
          ]}
        />
      }
    />
  );
}
