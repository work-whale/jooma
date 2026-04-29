import { PenLine } from "lucide-react";
import ModelTextGeneratorForm from "@/app/components/forms/ModelTextGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function ModelTextGeneratorPage() {
  return (
    <ModelTextGeneratorForm
      sidebar={
        <ToolInfoPanel
          icon={<PenLine className="w-5 h-5 text-amber-600" />}
          heroBg="bg-amber-50"
          title="Model Text Generator"
          description="This tool can be used to help write model texts. Simply tell it what to write, which language or grammatical features to use and how long to make it. The AI will then write a model text matching your requirements."
          steps={[
            { label: "Describe what to write", detail: "Be specific when instructing the AI what to write and what features to use." },
            { label: "Set language features", detail: "Specify grammar or writing features you want modelled in the text." },
            { label: "Generate", detail: "Create model texts on students' interests or local content for use in English lessons." },
          ]}
        />
      }
    />
  );
}
