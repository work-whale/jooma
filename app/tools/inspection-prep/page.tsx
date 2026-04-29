import { Search } from "lucide-react";
import InspectionPrepForm from "@/app/components/forms/InspectionPrepForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function InspectionPrepPage() {
  return (
    <InspectionPrepForm
      sidebar={
        <ToolInfoPanel
          icon={<Search className="w-5 h-5 text-rose-600" />}
          heroBg="bg-rose-50"
          title="Inspection Prep Questions"
          description="Use this tool to begin preparation for an inspection or accreditation with a body of your choice. If there is a focus area, enter this, and select any additional elements you wish to include."
          steps={[
            { label: "Enter inspectorate and focus area", detail: "Be specific with the inspectorate/accrediting body and any focus area." },
            { label: "Add optional elements", detail: "Include evidence examples or success criteria if needed.", optional: true },
            { label: "Generate", detail: "Get self-evaluation questions and preparation actions to support your inspection readiness." },
          ]}
        />
      }
    />
  );
}
