import { FileText } from "lucide-react";
import WorksheetGeneratorForm from "@/app/components/forms/WorksheetGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";
import { redirectIfLocked } from "@/app/lib/free-tools";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function WorksheetGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  await redirectIfLocked("worksheet-generator", launch);
  return (
    <WorksheetGeneratorForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<FileText className="w-5 h-5 text-violet-600" />}

          title="Worksheet Generator"
          description="This tool can be used to create worksheets. Simply enter the year group, subject and learning objective you are targeting (remember to be specific) and hit generate."
          steps={[
            { label: "Enter key details", detail: "Add the year group, subject, and learning objective." },
            { label: "Choose question types", detail: "Select the types of questions to include and how many." },
            { label: "Set level and detail", detail: "Choose the ability level and how detailed the output should be.", optional: true },
            { label: "Generate", detail: "The tool creates a full worksheet with an answer key and common misconceptions." },
          ]}
        />
      }
    />
  );
}
