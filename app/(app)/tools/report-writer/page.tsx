import { FileText } from "lucide-react";
import ReportWriterForm from "@/app/components/forms/ReportWriterForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function ReportWriterPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <ReportWriterForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<FileText className="w-5 h-5 text-violet-600" />}

          title="Report Writer"
          description="Write end of term reports for your whole class at once. Fill a row for each pupil: a judgement, their effort and a short note. Pupils' names stay in your browser and are never sent."
          steps={[
            { label: "Set up the class", detail: "Choose the year group, the subjects and the scale your school reports on." },
            { label: "Fill a row per pupil", detail: "Paste names from your register, then add a judgement, effort and a specific note for each. Up to 40 pupils." },
            { label: "Check and copy", detail: "Edit any report, rewrite one, then copy each into your school's system or download them all." },
          ]}
        />
      }
    />
  );
}
