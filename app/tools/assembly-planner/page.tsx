import { Users } from "lucide-react";
import AssemblyPlannerForm from "@/app/components/forms/AssemblyPlannerForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function AssemblyPlannerPage() {
  return (
    <AssemblyPlannerForm
      sidebar={
        <ToolInfoPanel
          icon={<Users className="w-5 h-5 text-blue-600" />}
          heroBg="bg-blue-50"
          title="Assembly Planner"
          description="This tool can be used to plan an assembly around a particular theme. Simply enter the theme, phase of education and duration. The AI will then provide a plan for an assembly, including an introduction, a story relating to the theme and questions to ask the audience."
          steps={[
            { label: "Enter the theme", detail: "Be specific when entering the theme of the assembly." },
            { label: "Set phase and duration", detail: "Specify the phase of education and how long the assembly will run." },
            { label: "Generate", detail: "Get a complete assembly plan with script, speaker notes, story, and interactive elements." },
          ]}
        />
      }
    />
  );
}
