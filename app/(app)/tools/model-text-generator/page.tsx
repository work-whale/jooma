import { PenLine } from "lucide-react";
import ModelTextGeneratorForm from "@/app/components/forms/ModelTextGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function ModelTextGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <ModelTextGeneratorForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<PenLine className="w-5 h-5 text-amber-600" />}

          title="Model Text Generator"
          description="This tool can be used to help write model texts. Simply tell it what to write, which language or grammatical features to use and how long to make it. Jooma will then write a model text matching your requirements."
          steps={[
            { label: "Describe what to write", detail: "Be specific when telling Jooma what to write and what features to use." },
            { label: "Set language features", detail: "Specify grammar or writing features you want modelled in the text." },
            { label: "Generate", detail: "Create model texts on students' interests or local content for use in English lessons." },
          ]}
        />
      }
    />
  );
}
