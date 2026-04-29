import { ClipboardList } from "lucide-react";
import EYFSActionPlanForm from "@/app/components/forms/EYFSActionPlanForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function EYFSActionPlanPage() {
  return (
    <EYFSActionPlanForm
      sidebar={
        <ToolInfoPanel
          icon={<ClipboardList className="w-5 h-5 text-emerald-600" />}
          heroBg="bg-emerald-50"
          title="EYFS Action Plan"
          description="Generate a detailed, structured action plan for any EYFS improvement objective. Covers a 4-phase implementation timeline, success criteria, responsibilities, monitoring approaches, and a full resources and staffing breakdown."
          steps={[
            { label: "Enter a focused objective", detail: "Enter a single, focused EYFS objective — the more specific, the more actionable the plan." },
            { label: "Generate", detail: "Get a 4-phase plan across 13+ weeks, with actions, responsibilities, and monitoring for each phase." },
            { label: "Refine", detail: "Use the Refine panel to adjust detail, extend timelines, or translate the plan." },
          ]}
        />
      }
    />
  );
}
