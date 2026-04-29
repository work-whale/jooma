import { ScrollText } from "lucide-react";
import PolicyGeneratorForm from "@/app/components/forms/PolicyGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function PolicyGeneratorPage() {
  return (
    <PolicyGeneratorForm
      sidebar={
        <ToolInfoPanel
          icon={<ScrollText className="w-5 h-5 text-blue-600" />}
          heroBg="bg-blue-50"
          title="Policy Generator"
          description="Create a draft school policy or a policy section structure. Enter the policy name and the AI will generate a complete, professional document you can customise for your setting."
          steps={[
            { label: "Enter the policy name", detail: "For example, \"Anti-Bullying Policy\" or \"Online Safety Policy\"." },
            { label: "Choose output type", detail: "Draft a full policy or a section structure you can fill in yourself." },
            { label: "Add requirements", detail: "Include specific legislation, elements, or school-specific details.", optional: true },
          ]}
        />
      }
    />
  );
}
