import { Monitor } from "lucide-react";
import PresentationGeneratorForm from "@/app/components/forms/PresentationGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function PresentationGeneratorPage() {
  return (
    <PresentationGeneratorForm
      sidebar={
        <ToolInfoPanel
          icon={<Monitor className="w-5 h-5 text-violet-600" />}
          heroBg="bg-violet-50"
          title="Presentation Generator"
          description="Generate a fully designed PowerPoint presentation with AI-created images. Enter your topic and the AI builds the slides — ready to download and edit."
          steps={[
            { label: "Enter your topic", detail: "Be specific — include the subject, year group, and any key focus areas." },
            { label: "Set slides and tone", detail: "Choose how many slides and the tone that suits your audience." },
            { label: "Download", detail: "Get a fully designed .pptx file ready to open in PowerPoint or Google Slides." },
          ]}
        />
      }
    />
  );
}
