import { FileEdit } from "lucide-react";
import ECTReportWriterForm from "@/app/components/forms/ECTReportWriterForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function ECTReportWriterPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <ECTReportWriterForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<FileEdit className="w-5 h-5 text-rose-600" />}

          title="ECT Report Writer"
          description="This tool can be used to draft evidence for ECT reports. Simply enter a list of the teacher's strengths and areas for development, and Jooma will turn these into paragraphs of evidence making links to the Teacher Standards where appropriate."
          steps={[
            { label: "Enter strengths and areas for development", detail: "The more information you add, the more detailed and accurate the evidence." },
            { label: "Generate", detail: "Get evidence-based ECT report statements aligned to Teacher Standards." },
            { label: "Review and refine", detail: "Adapt the output to accurately reflect the ECT's practice and context." },
          ]}
        />
      }
    />
  );
}
