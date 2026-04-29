import { Target } from "lucide-react";
import SmartTargetsForm from "@/app/components/forms/SmartTargetsForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function SmartTargetsPage() {
  return (
    <SmartTargetsForm
      sidebar={
        <ToolInfoPanel
          icon={<Target className="w-5 h-5 text-emerald-600" />}
          heroBg="bg-emerald-50"
          title="SMART Targets"
          description="This tool can be used to draft SMART targets for students. Simply provide the year group and the overall targets and let the AI draft the targets for you. Remember to review and adapt the output so it is fully applicable to your student."
          steps={[
            { label: "Enter your targets", detail: "Be as specific as possible — the more detail you provide, the more tailored the output." },
            { label: "Generate", detail: "Get fully structured SMART targets with specific, measurable, achievable, relevant, and time-bound criteria." },
            { label: "Review and adapt", detail: "Ensure the targets are fully applicable to your individual student." },
          ]}
        />
      }
    />
  );
}
