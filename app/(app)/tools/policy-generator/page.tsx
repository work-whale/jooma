import { ScrollText } from "lucide-react";
import PolicyGeneratorForm from "@/app/components/forms/PolicyGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function PolicyGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <PolicyGeneratorForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<ScrollText className="w-5 h-5 text-blue-600" />}

          title="Policy Generator"
          description="Draft a school policy with numbered sections, roles and the legislation it follows. For policies in our list, whether it is statutory, how often to review it and who approves it come from DfE guidance, not the AI, and the policy has a details box and version history for your governors."
          steps={[
            { label: "Pick or type the policy", detail: "Choose from the list, or type your own, for example \"School Uniform Policy\"." },
            { label: "Choose full draft or outline", detail: "Draft the whole policy, or an outline of sections with notes on what to write." },
            { label: "Add requirements", detail: "School-specific details, by role rather than name.", optional: true },
            { label: "Refine with Jo, then download", detail: "Ask Jo to change anything, then print it or download it as a Word file." },
          ]}
        />
      }
    />
  );
}
