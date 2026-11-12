import { BookOpen } from "lucide-react";
import HomeworkGeneratorForm from "@/app/components/forms/HomeworkGeneratorForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function HomeworkGeneratorPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <HomeworkGeneratorForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<BookOpen className="w-5 h-5 text-amber-600" />}

          title="Homework Generator"
          description="Generate a structured, differentiated homework task tailored to your year group, subject, and learning objective — with optional answers and a self-assessment checklist."
          steps={[
            { label: "Fill in the details", detail: "Choose your year group, subject, learning objective, homework type, and effort level." },
            { label: "Customise", detail: "Add any additional instructions or paste in your lesson plan for a homework task that closely follows your lesson." },
            { label: "Generate and export", detail: "Edit the pupil sheet on the page or ask Jo, then print or download it as a PDF or Word document, with or without the answers." },
          ]}
        />
      }
    />
  );
}
