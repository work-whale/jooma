import { BookOpen } from "lucide-react";
import ComprehensionForm from "@/app/components/forms/ComprehensionForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function ComprehensionGeneratorPage() {
  return (
    <ComprehensionForm
      sidebar={
        <ToolInfoPanel
          icon={<BookOpen className="w-5 h-5 text-amber-600" />}
          heroBg="bg-amber-50"
          title="Comprehension Generator"
          description="This tool can be used to create reading comprehension activities. Select your curriculum, year group, text source and reading focuses, then hit generate."
          steps={[
            { label: "Choose your text source", detail: "Choose 'Generate for me' to create a passage from a topic, or paste your own text." },
            { label: "Select reading focuses", detail: "Select one or more reading focuses to target specific comprehension skills." },
            { label: "Generate", detail: "Create differentiated reading activities, revision tasks, or assessments." },
          ]}
        />
      }
    />
  );
}
