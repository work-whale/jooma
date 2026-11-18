import { ClipboardList } from "lucide-react";
import CoverLessonForm from "@/app/components/forms/CoverLessonForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function CoverLessonPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <CoverLessonForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<ClipboardList className="w-5 h-5 text-teal-600" />}

          title="Cover Lesson Generator"
          description="Generate a fully self-contained cover lesson that any non-specialist teacher can pick up and deliver confidently, with no preparation, no subject knowledge required."
          steps={[
            { label: "Enter the details", detail: "Choose the year group, subject, topic, lesson length, and what resources are available in the room." },
            { label: "Add context", detail: "Optionally describe the class or any specific instructions to make the lesson more targeted." },
            { label: "Generate and print", detail: "Review the structured lesson plan, complete with a cover teacher script, timed activities and an end-of-lesson checklist, then download or print." },
          ]}
        />
      }
    />
  );
}
