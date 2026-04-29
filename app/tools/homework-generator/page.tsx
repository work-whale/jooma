import { BookOpen } from "lucide-react";
import HomeworkGeneratorForm from "@/app/components/forms/HomeworkGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function HomeworkGeneratorPage() {
  return (
    <HomeworkGeneratorForm
      sidebar={
        <ToolInfoPanel
          icon={<BookOpen className="w-5 h-5 text-amber-600" />}
          heroBg="bg-amber-50"
          title="Homework Generator"
          description="Generate a structured, differentiated homework task tailored to your year group, subject, and learning objective — with optional answers and a self-assessment checklist."
          steps={[
            { label: "Fill in the details", detail: "Choose your year group, subject, learning objective, homework type, and effort level." },
            { label: "Customise", detail: "Add any additional instructions or paste in your lesson plan for a homework task that closely follows your lesson." },
            { label: "Generate and export", detail: "Review the output, edit as needed, then download as a Word document ready to share with pupils." },
          ]}
        />
      }
    />
  );
}
