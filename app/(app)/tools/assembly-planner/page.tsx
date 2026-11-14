import { Users } from "lucide-react";
import AssemblyPlannerForm from "@/app/components/forms/AssemblyPlannerForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function AssemblyPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <AssemblyPlannerForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<Users className="w-5 h-5 text-blue-600" />}

          title="Assembly Planner"
          description="This tool can be used to plan an assembly around a particular theme. Simply enter the theme, phase of education and duration. The AI will then provide a plan for an assembly, including an introduction, a story relating to the theme and questions to ask the audience."
          steps={[
            { label: "Enter the theme", detail: "Be specific when entering the theme of the assembly." },
            { label: "Set phase and duration", detail: "Specify the phase of education and how long the assembly will run." },
            { label: "Choose the closing", detail: "A quiet reflection, collective worship of a broadly Christian character, or your faith school's prayer." },
            { label: "Generate, then make the slides", detail: "Get a running order that adds up to your time and a script for each part. Press Make assembly slides for a deck with speaker notes." },
          ]}
        />
      }
    />
  );
}
