import { FileText } from "lucide-react";
import WorksheetGeneratorForm from "@/app/components/forms/WorksheetGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function WorksheetGeneratorPage() {
  return (
    <WorksheetGeneratorForm
      sidebar={
        <ToolInfoPanel
          icon={<FileText className="w-5 h-5 text-violet-600" />}
          heroBg="bg-violet-50"
          title="Worksheet Generator"
          description="This tool can be used to create worksheets. Simply enter the year group, subject and learning objective you are targeting (remember to be specific) and hit generate."
          steps={[
            { label: "Enter key details", detail: "Add the year group, subject, and learning objective." },
            { label: "Choose question types", detail: "Select the types of questions to include and how many." },
            { label: "Set level and detail", detail: "Choose the ability level and how detailed the output should be.", optional: true },
            { label: "Generate", detail: "The tool creates a full worksheet with an answer key and common misconceptions." },
          ]}
        />
      }
    />
  );
}
