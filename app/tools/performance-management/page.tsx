import { Target } from "lucide-react";
import PerformanceManagementForm from "@/app/components/forms/PerformanceManagementForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function PerformanceManagementPage() {
  return (
    <PerformanceManagementForm
      sidebar={
        <ToolInfoPanel
          icon={<Target className="w-5 h-5 text-rose-600" />}
          heroBg="bg-rose-50"
          title="Performance Management Targets"
          description="This tool can be used to draft performance management targets for staff. Simply provide the school type, staff role, pay scale, and responsibilities and summary of targets."
          steps={[
            { label: "Enter staff details", detail: "Include the school type, staff role, and pay scale." },
            { label: "Describe responsibilities and targets", detail: "Be specific when entering responsibilities and targets." },
            { label: "Generate", detail: "Get SMART performance management targets with success criteria, evidence, actions, and review points." },
          ]}
        />
      }
    />
  );
}
