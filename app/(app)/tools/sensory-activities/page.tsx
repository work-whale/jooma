import { Sparkles } from "lucide-react";
import SensoryActivitiesForm from "@/app/components/forms/SensoryActivitiesForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function SensoryActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <SensoryActivitiesForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<Sparkles className="w-5 h-5 text-emerald-600" />}

          title="Sensory Activities"
          description="This tool can be used to generate ideas for sensory activities relating to a topic. Simply enter the year group and topic you are teaching, and Jooma will generate 5 ideas for you with the resources required and senses targeted."
          steps={[
            { label: "Enter year group and topic", detail: "Use the language as set out in your curriculum." },
            { label: "Generate activities", detail: "Get 5 sensory activity ideas with resources and senses targeted." },
            { label: "Adapt and use", detail: "Use the ideas to support multisensory teaching in your classroom." },
          ]}
        />
      }
    />
  );
}
