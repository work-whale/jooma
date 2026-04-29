import { FileEdit } from "lucide-react";
import ECTReportWriterForm from "@/app/components/forms/ECTReportWriterForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

export default function ECTReportWriterPage() {
  return (
    <ECTReportWriterForm
      sidebar={
        <ToolInfoPanel
          icon={<FileEdit className="w-5 h-5 text-rose-600" />}
          heroBg="bg-rose-50"
          title="ECT Report Writer"
          description="This tool can be used to draft evidence for ECT reports. Simply enter a list of the teacher's strengths and areas for development, and the AI will turn these into paragraphs of evidence making links to the Teacher Standards where appropriate."
          steps={[
            { label: "Enter strengths and areas for development", detail: "The more information you add, the more detailed and accurate the AI's response." },
            { label: "Generate", detail: "Get evidence-based ECT report statements aligned to Teacher Standards." },
            { label: "Review and refine", detail: "Adapt the output to accurately reflect the ECT's practice and context." },
          ]}
        />
      }
    />
  );
}
