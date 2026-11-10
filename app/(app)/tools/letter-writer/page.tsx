import { Mail } from "lucide-react";
import LetterWriterForm from "@/app/components/forms/LetterWriterForm";
import ToolInfoPanel from "@/app/components/ToolInfoPanel";

// searchParams are read here rather than with useSearchParams() in the form:
// that hook forces a client-side bailout needing a Suspense boundary around the
// whole form. Same approach as app/help/page.tsx.
export default async function LetterWriterPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; prefill?: string }>;
}) {
  const launch = await searchParams;
  return (
    <LetterWriterForm
      launch={launch}
      sidebar={
        <ToolInfoPanel
          icon={<Mail className="w-5 h-5 text-rose-600" />}

          title="Letter Writer"
          description="Letters home on designed pages. Pick the kind of letter and give the facts: the date, greeting, sign-off, trip details and consent slip are added for you, and nothing is made up."
          steps={[
            { label: "Pick the kind of letter", detail: "A trip, one child's attendance or behaviour, or anything else." },
            { label: "Give the facts", detail: "Dates, times and costs exactly as they should appear. A child's name stays in your browser." },
            { label: "Check, then print or send", detail: "Edit anything on the page, then print it, save a PDF or download it for Word." },
          ]}
        />
      }
    />
  );
}
