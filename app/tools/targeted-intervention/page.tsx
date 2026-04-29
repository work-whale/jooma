import { Target } from "lucide-react";
import TargetedInterventionForm from "@/app/components/forms/TargetedInterventionForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function TargetedInterventionPage() {
  return (
    <TargetedInterventionForm
      sidebar={
        <ToolInfoPanel
          icon={<Target className="w-5 h-5 text-orange-500" />}
          heroBg="bg-orange-50"
          title="Targeted Intervention Ideas"
          description="Generate personalised, evidence-based intervention strategies to close the gap for individual students — based on the attitudinal, aptitudinal, and attainment data you have."
          steps={[
            { label: "Enter student data", detail: "Be specific and detailed — the more data the AI has, the more personalised the strategies will be." },
            { label: "Generate strategies", detail: "The AI will analyse the full profile and produce 8–10 targeted interventions with research-backed rationale." },
            { label: "Refine and export", detail: "Edit the results, use the refine panel to adjust focus, then download as a Word document." },
          ]}
        />
      }
    />
  );
}
