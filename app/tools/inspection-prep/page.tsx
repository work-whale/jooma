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
          description="Generate self-evaluation questions and preparation actions aligned to your inspection framework. For Ofsted, output reflects the current Education Inspection Framework (EIF) judgement areas (Quality of Education, Behaviour and Attitudes, Personal Development, and Leadership and Management), updated for the 2024 Big Listen changes."
          steps={[
            { label: "Enter the inspection body", detail: "Specify the inspectorate or accrediting body — e.g. Ofsted, ISI, CIS, KHDA." },
            { label: "Add a focus area", detail: "Optionally narrow the output to a specific judgement area such as safeguarding, SEND, or curriculum intent.", optional: true },
            { label: "Select additional sections", detail: "Optionally include evidence examples, success criteria, or recent policy developments.", optional: true },
            { label: "Generate", detail: "Get framework-aligned self-evaluation questions and concrete preparation actions for your senior leadership team." },
          ]}
        />
      }
    />
  );
}
